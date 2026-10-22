//! Network UTC + a sleep-inclusive monotonic counter. Never reads the PC wall clock.
use serde::{Deserialize, Serialize};
use std::{
    ffi::c_void,
    ptr::{null, null_mut},
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    time::Duration,
};
use tauri::{AppHandle, Emitter, Manager, State};

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Anchor {
    epoch_ms: i64,
    tick_ms: u64,
    source: String,
}
impl Anchor {
    fn at(&self, tick: u64) -> Option<i64> {
        tick.checked_sub(self.tick_ms)
            .and_then(|d| self.epoch_ms.checked_add(d as i64))
    }
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    epoch_ms: Option<i64>,
    source: String,
    age_ms: Option<u64>,
}
pub struct Clock {
    anchor: Mutex<Option<Anchor>>,
    refresh: AtomicBool,
    testing: AtomicBool,
}
fn tick() -> u64 {
    unsafe { GetTickCount64() }
}
pub fn now(app: &AppHandle) -> Option<i64> {
    app.state::<Clock>()
        .anchor
        .lock()
        .ok()?
        .as_ref()?
        .at(tick())
}
#[tauri::command]
pub fn time_snapshot(state: State<Clock>) -> Snapshot {
    let tick = tick();
    let anchor = state.anchor.lock().unwrap_or_else(|p| p.into_inner());
    Snapshot {
        epoch_ms: anchor.as_ref().and_then(|a| a.at(tick)),
        source: anchor
            .as_ref()
            .map(|a| a.source.clone())
            .unwrap_or_default(),
        age_ms: anchor.as_ref().and_then(|a| tick.checked_sub(a.tick_ms)),
    }
}
#[tauri::command]
pub fn time_refresh(state: State<Clock>) {
    state.refresh.store(true, Ordering::Relaxed);
}
// Only the isolated native test launcher can inject time. No normal UI can set it.
#[tauri::command]
pub fn time_test_set(state: State<Clock>, epoch_ms: Option<i64>) -> Result<(), String> {
    if std::env::var("DAYWEAVE_NATIVE_TEST").as_deref() != Ok("1")
        || std::env::var("WEBVIEW2_USER_DATA_FOLDER").is_err()
    {
        return Err("仅供隔离测试".into());
    }
    state.testing.store(epoch_ms.is_some(), Ordering::Relaxed);
    if let Some(epoch_ms) = epoch_ms {
        if !(1577836800000..4102444800000).contains(&epoch_ms) {
            return Err("测试时间无效".into());
        }
        *state.anchor.lock().map_err(|e| e.to_string())? = Some(Anchor {
            epoch_ms,
            tick_ms: tick(),
            source: "isolated-test".into(),
        });
    } else {
        state.refresh.store(true, Ordering::Relaxed);
    }
    Ok(())
}
pub fn setup(app: &AppHandle) {
    let anchor = read_cache().filter(|a| a.at(tick()).is_some());
    app.manage(Clock {
        anchor: Mutex::new(anchor),
        refresh: AtomicBool::new(true),
        testing: AtomicBool::new(false),
    });
    let app = app.clone();
    std::thread::spawn(move || {
        let mut next = 0;
        let mut last_attempt = None::<u64>;
        let mut previous = tick();
        loop {
            let current = tick();
            let clock = app.state::<Clock>();
            let refresh = clock.refresh.swap(false, Ordering::Relaxed);
            if !clock.testing.load(Ordering::Relaxed)
                && (current >= next
                    || (refresh
                        && last_attempt.is_none_or(|last| current.saturating_sub(last) >= 30000))
                    || current.saturating_sub(previous) > 60000)
            {
                last_attempt = Some(current);
                // Gateway Date is UTC, needs no account, and contains no user data.
                // The second host is a fallback when the cloud project is unreachable.
                let offline_test = std::env::var("DAYWEAVE_NATIVE_TEST").as_deref() == Ok("1")
                    && std::env::var("DAYWEAVE_CLOCK_OFFLINE").as_deref() == Ok("1");
                let result = if offline_test {
                    None
                } else {
                    network_time("gacbkkhanzgbvrfwycji.supabase.co")
                        .or_else(|| network_time("www.baidu.com"))
                };
                if let Some(anchor) = result {
                    if !clock.testing.load(Ordering::Relaxed) {
                        write_cache(&anchor);
                        *clock.anchor.lock().unwrap_or_else(|p| p.into_inner()) = Some(anchor);
                        let _ = app.emit("dayweave-time", ());
                    }
                    next = tick() + 600000;
                } else {
                    next = tick() + 30000;
                }
            }
            previous = tick();
            std::thread::sleep(Duration::from_secs(1));
        }
    });
}

type Handle = *mut c_void;
struct Http(Handle);
impl Http {
    fn new(h: Handle) -> Option<Self> {
        if h.is_null() {
            None
        } else {
            Some(Self(h))
        }
    }
}
impl Drop for Http {
    fn drop(&mut self) {
        unsafe {
            WinHttpCloseHandle(self.0);
        }
    }
}
fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(Some(0)).collect()
}
#[repr(C)]
#[derive(Default)]
struct SystemTime {
    year: u16,
    month: u16,
    weekday: u16,
    day: u16,
    hour: u16,
    minute: u16,
    second: u16,
    millis: u16,
}
#[repr(C)]
#[derive(Default)]
struct FileTime {
    low: u32,
    high: u32,
}
fn network_time(host: &str) -> Option<Anchor> {
    unsafe {
        let session = Http::new(WinHttpOpen(
            wide("DayWeave/0.7.1").as_ptr(),
            4,
            null(),
            null(),
            0,
        ))?;
        if WinHttpSetTimeouts(session.0, 2000, 2000, 2000, 2000) == 0 {
            return None;
        }
        let conn = Http::new(WinHttpConnect(session.0, wide(host).as_ptr(), 443, 0))?;
        let path = format!("/?dayweave-clock={}", tick());
        let req = Http::new(WinHttpOpenRequest(
            conn.0,
            wide("HEAD").as_ptr(),
            wide(&path).as_ptr(),
            null(),
            null(),
            null(),
            0x00800000 | 0x00000100,
        ))?;
        // Never disable TLS certificate validation, even if the PC clock is wrong.
        let start = tick();
        let headers = wide("Cache-Control: no-cache, no-store\r\nPragma: no-cache\r\n");
        if WinHttpSendRequest(req.0, headers.as_ptr(), u32::MAX, null_mut(), 0, 0, 0) == 0
            || WinHttpReceiveResponse(req.0, null_mut()) == 0
        {
            return None;
        }
        let end = tick();
        let rtt = end.checked_sub(start)?;
        if rtt > 4000 {
            return None;
        }
        let mut date = SystemTime::default();
        let mut len = std::mem::size_of::<SystemTime>() as u32;
        // WINHTTP_QUERY_DATE | WINHTTP_QUERY_FLAG_SYSTEMTIME
        if WinHttpQueryHeaders(
            req.0,
            9 | 0x40000000,
            null(),
            &mut date as *mut _ as Handle,
            &mut len,
            null_mut(),
        ) == 0
        {
            return None;
        }
        if !(2020..2100).contains(&date.year) {
            return None;
        }
        let mut age = 0u32;
        let mut age_len = 4;
        // Reject a cached response (Age > 0). Missing Age is normal.
        if WinHttpQueryHeaders(
            req.0,
            48 | 0x20000000,
            null(),
            &mut age as *mut _ as Handle,
            &mut age_len,
            null_mut(),
        ) != 0
            && age > 0
        {
            return None;
        }
        let mut file = FileTime::default();
        if SystemTimeToFileTime(&date, &mut file) == 0 {
            return None;
        }
        let utc =
            (((file.high as u64) << 32) | file.low as u64).checked_sub(116444736000000000)? / 10000;
        // HTTP Date has second precision; centre that second and compensate RTT.
        Some(Anchor {
            epoch_ms: utc as i64 + 500 + rtt as i64 / 2,
            tick_ms: end,
            source: format!("https://{host}"),
        })
    }
}

// A volatile key is discarded on full shutdown/logoff; unlike a disk timestamp,
// it cannot silently reuse a previous boot's uptime anchor after restarting Windows.
struct Key(Handle);
impl Drop for Key {
    fn drop(&mut self) {
        unsafe {
            RegCloseKey(self.0);
        }
    }
}
fn cache_key() -> Option<Key> {
    let testing = std::env::var("DAYWEAVE_NATIVE_TEST").as_deref() == Ok("1");
    let path = if testing {
        use std::hash::{Hash, Hasher};
        let mut hash = std::collections::hash_map::DefaultHasher::new();
        std::env::var("WEBVIEW2_USER_DATA_FOLDER")
            .unwrap_or_default()
            .hash(&mut hash);
        format!(
            "Volatile Environment\\DayWeaveClockTest-{:x}",
            hash.finish()
        )
    } else {
        "Volatile Environment\\DayWeaveClock".into()
    };
    let path = wide(&path);
    let mut h = null_mut();
    let status = unsafe {
        RegCreateKeyExW(
            0x80000001u32 as i32 as isize as Handle,
            path.as_ptr(),
            0,
            null_mut(),
            1,
            3,
            null(),
            &mut h,
            null_mut(),
        )
    };
    if status == 0 {
        Some(Key(h))
    } else {
        None
    }
}
fn read_cache() -> Option<Anchor> {
    let key = cache_key()?;
    let mut bytes = [0u8; 1024];
    let mut len = bytes.len() as u32;
    let mut kind = 0;
    let ok = unsafe {
        RegQueryValueExW(
            key.0,
            wide("Anchor").as_ptr(),
            null_mut(),
            &mut kind,
            bytes.as_mut_ptr(),
            &mut len,
        )
    };
    if ok != 0 || kind != 3 || len as usize > bytes.len() {
        return None;
    }
    let anchor: Anchor = serde_json::from_slice(&bytes[..len as usize]).ok()?;
    if !(1577836800000..4102444800000).contains(&anchor.epoch_ms)
        || !anchor.source.starts_with("https://")
    {
        return None;
    }
    Some(anchor)
}
fn write_cache(anchor: &Anchor) {
    if let (Some(key), Ok(bytes)) = (cache_key(), serde_json::to_vec(anchor)) {
        unsafe {
            RegSetValueExW(
                key.0,
                wide("Anchor").as_ptr(),
                0,
                3,
                bytes.as_ptr(),
                bytes.len() as u32,
            );
        }
    }
}
#[link(name = "kernel32")]
extern "system" {
    fn GetTickCount64() -> u64;
    fn SystemTimeToFileTime(input: *const SystemTime, output: *mut FileTime) -> i32;
}
#[link(name = "advapi32")]
extern "system" {
    fn RegCreateKeyExW(
        key: Handle,
        path: *const u16,
        reserved: u32,
        class: *mut u16,
        options: u32,
        access: u32,
        security: *const c_void,
        result: *mut Handle,
        disposition: *mut u32,
    ) -> i32;
    fn RegQueryValueExW(
        key: Handle,
        name: *const u16,
        reserved: *mut u32,
        kind: *mut u32,
        data: *mut u8,
        len: *mut u32,
    ) -> i32;
    fn RegSetValueExW(
        key: Handle,
        name: *const u16,
        reserved: u32,
        kind: u32,
        data: *const u8,
        len: u32,
    ) -> i32;
    fn RegCloseKey(key: Handle) -> i32;
}
#[link(name = "winhttp")]
extern "system" {
    fn WinHttpOpen(
        agent: *const u16,
        access: u32,
        proxy: *const u16,
        bypass: *const u16,
        flags: u32,
    ) -> Handle;
    fn WinHttpSetTimeouts(
        session: Handle,
        resolve: i32,
        connect: i32,
        send: i32,
        receive: i32,
    ) -> i32;
    fn WinHttpConnect(session: Handle, server: *const u16, port: u16, reserved: u32) -> Handle;
    fn WinHttpOpenRequest(
        conn: Handle,
        verb: *const u16,
        path: *const u16,
        version: *const u16,
        referer: *const u16,
        accept: *const *const u16,
        flags: u32,
    ) -> Handle;
    fn WinHttpSendRequest(
        req: Handle,
        headers: *const u16,
        len: u32,
        data: Handle,
        data_len: u32,
        total: u32,
        context: usize,
    ) -> i32;
    fn WinHttpReceiveResponse(req: Handle, reserved: Handle) -> i32;
    fn WinHttpQueryHeaders(
        req: Handle,
        level: u32,
        name: *const u16,
        buffer: Handle,
        len: *mut u32,
        index: *mut u32,
    ) -> i32;
    fn WinHttpCloseHandle(handle: Handle) -> i32;
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn elapsed_time_including_sleep_never_uses_wall_clock() {
        let a = Anchor {
            epoch_ms: 1792598400000,
            tick_ms: 100,
            source: "test".into(),
        };
        assert_eq!(a.at(60100), Some(1792598460000));
        assert_eq!(a.at(86400100), Some(1792684800000));
        assert_eq!(a.at(99), None); // Counter reset: do not accept another boot.
    }
}
