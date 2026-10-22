use serde::{Deserialize, Serialize};
use std::{collections::HashMap, fs, path::PathBuf, sync::Mutex, time::Duration};
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_autostart::ManagerExt;

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub close_to_tray: bool,
    pub start_hidden: bool,
    pub rail_count: usize,
    pub sound: bool,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            close_to_tray: true,
            start_hidden: false,
            rail_count: 1,
            sound: true,
        }
    }
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    pub key: String,
    pub task_id: String,
    pub title: String,
    pub at: i64,
    pub due: i64,
    pub alarm: bool,
}
#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Response {
    dismissed: bool,
    snooze_until: Option<i64>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Complete {
    scope: String,
    task_id: String,
    key: String,
}
#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct Disk {
    settings: Settings,
    scope: String,
    responses: HashMap<String, Response>,
    pending: Vec<Complete>,
}
pub struct Desktop {
    path: PathBuf,
    inner: Mutex<Runtime>,
}
struct Runtime {
    disk: Disk,
    items: Vec<Item>,
    ready: bool,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    settings: Settings,
    autostart: bool,
    active: Vec<Item>,
    pending: Vec<Complete>,
}
fn save(state: &Desktop, runtime: &Runtime) -> Result<(), String> {
    fs::create_dir_all(state.path.parent().ok_or("提醒目录无效")?).map_err(|e| e.to_string())?;
    let tmp = state.path.with_extension("tmp");
    fs::write(
        &tmp,
        serde_json::to_vec(&runtime.disk).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    fs::rename(tmp, &state.path).map_err(|e| e.to_string())
}
fn active(runtime: &Runtime, at: i64) -> Vec<Item> {
    let mut items: Vec<_> = runtime
        .items
        .iter()
        .filter(|item| {
            let response = runtime.disk.responses.get(&item.key);
            item.at <= at
                && !response.is_some_and(|r| r.dismissed)
                && response.and_then(|r| r.snooze_until).unwrap_or(0) <= at
        })
        .cloned()
        .collect();
    items.sort_by_key(|item| item.at);
    items
}
fn valid_id(id: &str) -> bool {
    id.len() == 36
        && id.bytes().enumerate().all(|(i, c)| {
            if [8, 13, 18, 23].contains(&i) {
                c == b'-'
            } else {
                c.is_ascii_hexdigit()
            }
        })
}
pub fn show(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
        let _ = app.emit_to("main", "dayweave-show", ());
    }
}
fn popup(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("reminder") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_always_on_top(true);
        let _ = win.set_focus();
    } else {
        let _ = WebviewWindowBuilder::new(app, "reminder", WebviewUrl::App("index.html".into()))
            .initialization_script("window.__DAYWEAVE_REMINDER__=true;")
            .title("日序 · 时间到了")
            .inner_size(460., 420.)
            .min_inner_size(320., 260.)
            .decorations(false)
            .always_on_top(true)
            .center()
            .build();
    }
}
#[tauri::command]
pub fn desktop_snapshot(app: AppHandle, state: State<Desktop>) -> Result<Snapshot, String> {
    let r = state.inner.lock().map_err(|e| e.to_string())?;
    Ok(Snapshot {
        settings: r.disk.settings.clone(),
        autostart: app.autolaunch().is_enabled().map_err(|e| e.to_string())?,
        active: crate::clock::now(&app)
            .map(|at| active(&r, at))
            .unwrap_or_default(),
        pending: r.disk.pending.clone(),
    })
}
#[tauri::command]
pub fn desktop_settings(
    app: AppHandle,
    window: tauri::WebviewWindow,
    state: State<Desktop>,
    settings: Settings,
    autostart: Option<bool>,
) -> Result<(), String> {
    if window.label() != "main" || !(1..=5).contains(&settings.rail_count) {
        return Err("设置无效".into());
    }
    if let Some(enabled) = autostart {
        let manager = app.autolaunch();
        if enabled {
            manager.enable()
        } else {
            manager.disable()
        }
        .map_err(|e| e.to_string())?;
    }
    let mut r = state.inner.lock().map_err(|e| e.to_string())?;
    r.disk.settings = settings;
    save(&state, &r)?;
    drop(r);
    let _ = app.emit("dayweave-reminders-changed", ());
    Ok(())
}
#[tauri::command]
pub fn reminders_sync(
    window: tauri::WebviewWindow,
    app: AppHandle,
    state: State<Desktop>,
    scope: String,
    items: Vec<Item>,
) -> Result<(), String> {
    if window.label() != "main"
        || (scope != "guest" && !valid_id(&scope))
        || items.len() > 10000
        || items.iter().any(|i| {
            !valid_id(&i.task_id)
                || i.key != format!("{}:{}:{}", scope, i.task_id, i.at)
                || i.title.is_empty()
                || i.title.chars().count() > 300
                || i.at < 0
                || i.due < i.at
                || i.due > 253402300799999
        })
    {
        return Err("提醒计划无效".into());
    }
    let mut r = state.inner.lock().map_err(|e| e.to_string())?;
    let switched = r.disk.scope != scope;
    r.disk.scope = scope;
    r.items = items;
    r.ready = true;
    if switched {
        save(&state, &r)?;
        if let Some(win) = app.get_webview_window("reminder") {
            let _ = win.hide();
        }
    }
    // Keep local acknowledgements bounded, preserving other account namespaces.
    if r.disk.responses.len() > 20000 {
        let prefix = format!("{}:", r.disk.scope);
        let keys: Vec<_> = r.items.iter().map(|i| i.key.clone()).collect();
        r.disk
            .responses
            .retain(|k, _| !k.starts_with(&prefix) || keys.contains(k));
        save(&state, &r)?;
    }
    drop(r);
    let _ = app.emit("dayweave-reminders-changed", ());
    Ok(())
}
#[tauri::command]
pub fn reminder_action(
    app: AppHandle,
    state: State<Desktop>,
    key: String,
    action: String,
) -> Result<(), String> {
    let mut r = state.inner.lock().map_err(|e| e.to_string())?;
    let item = r
        .items
        .iter()
        .find(|i| i.key == key)
        .cloned()
        .ok_or("提醒已修改或已取消")?;
    let response = r.disk.responses.entry(key.clone()).or_default();
    match action.as_str() {
        "snooze" => {
            response.snooze_until =
                Some(crate::clock::now(&app).ok_or("北京时间尚未校准")? + 300000);
            response.dismissed = false;
        }
        "dismiss" | "complete" => response.dismissed = true,
        _ => return Err("提醒操作无效".into()),
    }
    if action == "complete" && !r.disk.pending.iter().any(|p| p.key == key) {
        let scope = r.disk.scope.clone();
        r.disk.pending.push(Complete {
            scope,
            task_id: item.task_id,
            key,
        });
    }
    save(&state, &r)?;
    let empty = crate::clock::now(&app)
        .map(|at| active(&r, at).is_empty())
        .unwrap_or(true);
    drop(r);
    if empty {
        if let Some(win) = app.get_webview_window("reminder") {
            let _ = win.hide();
        }
    }
    let _ = app.emit("dayweave-reminders-changed", ());
    Ok(())
}
#[tauri::command]
pub fn reminder_complete_saved(
    window: tauri::WebviewWindow,
    state: State<Desktop>,
    key: String,
) -> Result<(), String> {
    if window.label() != "main" {
        return Err("不支持的窗口".into());
    }
    let mut r = state.inner.lock().map_err(|e| e.to_string())?;
    r.disk.pending.retain(|p| p.key != key);
    save(&state, &r)
}
#[tauri::command]
pub fn desktop_action(app: AppHandle, state: State<Desktop>, action: String) -> Result<(), String> {
    match action.as_str() {
        "show" => show(&app),
        "quick" => {
            show(&app);
            let _ = app.emit_to("main", "dayweave-quick-alarm", ());
        }
        "hide" => {
            if let Some(win) = app.get_webview_window("main") {
                win.hide().map_err(|e| e.to_string())?;
            }
        }
        "close" => {
            let hide = state
                .inner
                .lock()
                .map_err(|e| e.to_string())?
                .disk
                .settings
                .close_to_tray;
            if hide {
                if let Some(win) = app.get_webview_window("main") {
                    win.hide().map_err(|e| e.to_string())?;
                }
            } else {
                app.exit(0)
            }
        }
        "quit" => app.exit(0),
        "alerts" => popup(&app),
        "mute" => {
            let mut r = state.inner.lock().map_err(|e| e.to_string())?;
            r.disk.settings.sound = !r.disk.settings.sound;
            save(&state, &r)?;
            drop(r);
            let _ = app.emit("dayweave-reminders-changed", ());
        }
        _ => return Err("窗口操作无效".into()),
    }
    Ok(())
}
pub fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    use tauri::{
        menu::{Menu, MenuItem},
        tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    };
    let testing = std::env::var("DAYWEAVE_NATIVE_TEST").as_deref() == Ok("1");
    let base = if testing {
        PathBuf::from(std::env::var("WEBVIEW2_USER_DATA_FOLDER")?)
    } else {
        app.path().app_local_data_dir()?
    };
    let path = base.join("desktop-reminders.json");
    let disk: Disk = if path.exists() {
        serde_json::from_slice(&fs::read(&path)?)?
    } else {
        Disk::default()
    };
    let hidden = disk.settings.start_hidden;
    crate::clock::setup(app.handle());
    app.manage(Desktop {
        path,
        inner: Mutex::new(Runtime {
            disk,
            items: vec![],
            ready: false,
        }),
    });
    let show_item = MenuItem::with_id(app, "show", "显示日序", true, None::<&str>)?;
    let quick = MenuItem::with_id(app, "quick", "快捷闹钟", true, None::<&str>)?;
    let alerts = MenuItem::with_id(app, "alerts", "查看到期提醒", true, None::<&str>)?;
    let mute = MenuItem::with_id(app, "mute", "切换提醒声音", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出日序", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_item, &quick, &alerts, &mute, &quit])?;
    TrayIconBuilder::with_id("dayweave")
        .icon(app.default_window_icon().ok_or("缺少托盘图标")?.clone())
        .tooltip("日序 DayWeave · 提醒运行中")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| {
            let _ = desktop_action(
                app.clone(),
                app.state::<Desktop>(),
                event.id.as_ref().into(),
            );
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show(tray.app_handle());
            }
        })
        .build(app)?;
    if !hidden {
        show(app.handle());
    } else if let Some(win) = app.get_webview_window("main") {
        let _ = win.hide();
    }
    let handle = app.handle().clone();
    std::thread::spawn(move || {
        let mut previous = Vec::<String>::new();
        loop {
            std::thread::sleep(Duration::from_secs(1));
            let state = handle.state::<Desktop>();
            let Ok(r) = state.inner.lock() else { continue };
            if !r.ready {
                continue;
            }
            let Some(at) = crate::clock::now(&handle) else {
                continue;
            };
            let due = active(&r, at);
            let keys: Vec<_> = due.iter().map(|i| i.key.clone()).collect();
            let sound = r.disk.settings.sound;
            drop(r);
            if keys != previous {
                let changed = !keys.is_empty() && keys.iter().any(|k| !previous.contains(k));
                previous = keys;
                if changed {
                    let a = handle.clone();
                    let _ = handle.run_on_main_thread(move || {
                        popup(&a);
                        let _ = a.emit("dayweave-reminders-changed", ());
                        if sound {
                            unsafe {
                                MessageBeep(0x40);
                            }
                        }
                    });
                } else {
                    let _ = handle.emit("dayweave-reminders-changed", ());
                    if due.is_empty() {
                        if let Some(win) = handle.get_webview_window("reminder") {
                            let _ = win.hide();
                        }
                    }
                }
            }
        }
    });
    Ok(())
}
#[link(name = "user32")]
extern "system" {
    fn MessageBeep(kind: u32) -> i32;
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn due_snooze_ack_and_resume() {
        let mut r = Runtime {
            disk: Disk::default(),
            items: vec![Item {
                key: "a".into(),
                task_id: "task".into(),
                title: "提醒".into(),
                at: 100,
                due: 100,
                alarm: true,
            }],
            ready: true,
        };
        assert!(active(&r, 99).is_empty());
        assert_eq!(active(&r, 100).len(), 1);
        r.disk.responses.insert(
            "a".into(),
            Response {
                dismissed: false,
                snooze_until: Some(400),
            },
        );
        assert!(active(&r, 399).is_empty());
        assert_eq!(active(&r, 400).len(), 1);
        r.disk.responses.get_mut("a").unwrap().dismissed = true;
        assert!(active(&r, 9999999).is_empty());
        r.disk.responses.clear();
        assert_eq!(active(&r, 9999999).len(), 1);
        r.items.clear();
        assert!(active(&r, 9999999).is_empty());
    }
}
