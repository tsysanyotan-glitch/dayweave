use base64::Engine;
use serde::{Deserialize, Serialize};
use std::{fs, io::{Cursor, Read, Write}, path::{Path, PathBuf}, sync::Mutex};
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

const LIMIT: u64 = 25 * 1024 * 1024;
static REGISTRY_LOCK: Mutex<()> = Mutex::new(());
#[derive(Clone, Serialize, Deserialize)]
pub struct Output { id: String, name: String, kind: String, size: Option<u64> }
#[derive(Clone, Serialize, Deserialize)]
struct Entry { scope: String, output: Output, path: PathBuf }
#[derive(Deserialize)]
struct CacheMeta { scope: String, id: String, name: String }
fn valid_id(id: &str) -> bool { id.len() == 36 && id.bytes().enumerate().all(|(i,c)| if [8,13,18,23].contains(&i) { c == b'-' } else { c.is_ascii_hexdigit() }) }
fn validate(scope: &str, id: &str) -> Result<(), String> {
    if (scope == "guest" || valid_id(scope)) && valid_id(id) { Ok(()) } else { Err("无效的本机文件标识".into()) }
}
fn registry(app: &AppHandle) -> Result<PathBuf, String> { Ok(app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("output-links.json")) }
fn load(path: &Path) -> Result<Vec<Entry>, String> {
    if !path.exists() { return Ok(vec![]) }
    serde_json::from_slice(&fs::read(path).map_err(|e| e.to_string())?).map_err(|e| format!("无法读取本机附件记录：{e}"))
}
fn save(path: &Path, entries: &[Entry]) -> Result<(), String> {
    fs::create_dir_all(path.parent().ok_or("无效的附件记录目录")?).map_err(|e| e.to_string())?;
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, serde_json::to_vec(entries).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    fs::rename(tmp, path).map_err(|e| e.to_string())
}
fn remember(path: &Path, entry: Entry) -> Result<Output, String> {
    let _lock = REGISTRY_LOCK.lock().map_err(|e| e.to_string())?;
    let mut entries = load(path)?;
    entries.retain(|e| e.scope != entry.scope || e.output.id != entry.output.id);
    let output = entry.output.clone(); entries.push(entry); save(path, &entries)?; Ok(output)
}
fn entry(app: &AppHandle, scope: &str, id: &str) -> Result<Entry, String> {
    validate(scope, id)?;
    let _lock = REGISTRY_LOCK.lock().map_err(|e| e.to_string())?;
    load(&registry(app)?)?.into_iter().find(|e| e.scope == scope && e.output.id == id).ok_or_else(|| "文件仅在原电脑。请在原电脑上传，或重新关联。".into())
}
#[tauri::command]
pub async fn pick_output(app: AppHandle, scope: String, id: String, folder: bool) -> Result<Option<Output>, String> {
    validate(&scope, &id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let picker = app.dialog().file().set_title(if folder { "关联本机项目文件夹（不会上传）" } else { "关联本机产出文件（不会上传）" });
        let selected = if folder { picker.blocking_pick_folder() } else { picker.blocking_pick_file() };
        let Some(selected) = selected else { return Ok(None) };
        let path = selected.into_path().map_err(|e| e.to_string())?.canonicalize().map_err(|e| e.to_string())?;
        let meta = fs::metadata(&path).map_err(|e| e.to_string())?;
        if meta.is_dir() != folder { return Err("所选文件类型不符".into()) }
        let name = path.file_name().ok_or("请选择具体文件夹")?.to_string_lossy().to_string();
        let output = Output { id, name, kind: if folder { "folder" } else { "file" }.into(), size: if folder { None } else { Some(meta.len()) } };
        remember(&registry(&app)?, Entry { scope, output, path }).map(Some)
    }).await.map_err(|e| e.to_string())?
}
#[tauri::command]
pub fn local_output_ids(app: AppHandle, scope: String) -> Result<Vec<String>, String> {
    validate(&scope, "00000000-0000-0000-0000-000000000000")?;
    let _lock = REGISTRY_LOCK.lock().map_err(|e| e.to_string())?;
    Ok(load(&registry(&app)?)?.into_iter().filter(|e| e.scope == scope && e.path.exists()).map(|e| e.output.id).collect())
}
#[tauri::command]
pub async fn open_output(app: AppHandle, scope: String, id: String) -> Result<(), String> {
    let e = entry(&app, &scope, &id)?;
    if !e.path.exists() { return Err("原文件已移动或删除，请重新关联".into()) }
    app.opener().open_path(e.path.to_string_lossy().into_owned(), None::<&str>).map_err(|e| e.to_string())
}
fn read_limited(path: &Path) -> Result<Vec<u8>, String> {
    let f = fs::File::open(path).map_err(|e| e.to_string())?;
    if f.metadata().map_err(|e| e.to_string())?.len() > LIMIT { return Err("云端副本最多 25 MB；原文件仍可在本机打开".into()) }
    let mut bytes = Vec::new(); f.take(LIMIT + 1).read_to_end(&mut bytes).map_err(|e| e.to_string())?;
    if bytes.len() as u64 > LIMIT { return Err("文件超过 25 MB".into()) } Ok(bytes)
}
fn folder_zip(root: &Path) -> Result<Vec<u8>, String> {
    fn walk(root: &Path, current: &Path, zip: &mut zip::ZipWriter<Cursor<Vec<u8>>>, count: &mut usize, total: &mut u64) -> Result<(), String> {
        let mut entries = fs::read_dir(current).map_err(|e| e.to_string())?.collect::<Result<Vec<_>,_>>().map_err(|e| e.to_string())?;
        entries.sort_by_key(|e| e.file_name());
        for e in entries {
            let path = e.path(); let kind = e.file_type().map_err(|e| e.to_string())?;
            if kind.is_symlink() { return Err("文件夹包含符号链接；请另选具体文件后上传".into()) }
            *count += 1; if *count > 2000 { return Err("文件夹超过 2000 项，请选择较小文件夹或自行打包".into()) }
            let relative = path.strip_prefix(root).map_err(|e| e.to_string())?.to_string_lossy().replace('\\', "/");
            let options = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
            if kind.is_dir() { zip.add_directory(format!("{relative}/"), options).map_err(|e| e.to_string())?; walk(root, &path, zip, count, total)?; }
            else if kind.is_file() { let bytes = read_limited(&path)?; *total += bytes.len() as u64; if *total > LIMIT { return Err("文件夹超过 25 MB，请选择具体产出文件上传".into()) } zip.start_file(relative, options).map_err(|e| e.to_string())?; zip.write_all(&bytes).map_err(|e| e.to_string())?; }
            else { return Err("文件夹包含不支持的文件类型".into()) }
        } Ok(())
    }
    let mut zip = zip::ZipWriter::new(Cursor::new(Vec::new())); walk(root, root, &mut zip, &mut 0, &mut 0)?;
    let bytes = zip.finish().map_err(|e| e.to_string())?.into_inner();
    if bytes.len() as u64 > LIMIT { return Err("打包结果超过 25 MB".into()) } Ok(bytes)
}
#[tauri::command]
pub async fn read_output(app: AppHandle, scope: String, id: String) -> Result<tauri::ipc::Response, String> {
    let e = entry(&app, &scope, &id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let bytes = if e.path.is_dir() { folder_zip(&e.path)? } else { read_limited(&e.path)? };
        Ok(tauri::ipc::Response::new(bytes))
    }).await.map_err(|e| e.to_string())?
}
#[tauri::command]
pub fn cache_output(app: AppHandle, request: tauri::ipc::Request<'_>) -> Result<Output, String> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else { return Err("需要文件内容".into()) };
    if bytes.len() as u64 > LIMIT { return Err("文件超过 25 MB".into()) }
    let header = request.headers().get("x-output-meta").ok_or("缺少文件信息")?.to_str().map_err(|e| e.to_string())?;
    let decoded = base64::engine::general_purpose::STANDARD.decode(header).map_err(|e| e.to_string())?;
    let meta: CacheMeta = serde_json::from_slice(&decoded).map_err(|e| e.to_string())?; validate(&meta.scope, &meta.id)?;
    let name = meta.name.chars().map(|c| if c.is_control() || "<>:\"/\\|?*".contains(c) { '_' } else { c }).collect::<String>();
    let name = name.trim_matches([' ', '.']); if name.is_empty() || name.len() > 240 { return Err("文件名无效或过长".into()) }
    let dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("outputs").join(&meta.scope).join(&meta.id);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?; let path = dir.join(name); fs::write(&path, bytes).map_err(|e| e.to_string())?;
    let output = Output { id: meta.id, name: name.into(), kind: "file".into(), size: Some(bytes.len() as u64) };
    remember(&registry(&app)?, Entry { scope: meta.scope, output, path })
}
#[tauri::command]
pub fn copy_output_scope(app: AppHandle, from: String, to: String, ids: Vec<String>) -> Result<(), String> {
    validate(&from, "00000000-0000-0000-0000-000000000000")?; validate(&to, "00000000-0000-0000-0000-000000000000")?;
    let _lock = REGISTRY_LOCK.lock().map_err(|e| e.to_string())?; let path = registry(&app)?; let mut entries = load(&path)?;
    let copies: Vec<_> = entries.iter().filter(|e| e.scope == from && ids.contains(&e.output.id) && !entries.iter().any(|other| other.scope == to && other.output.id == e.output.id)).map(|e| Entry { scope: to.clone(), ..e.clone() }).collect();
    entries.extend(copies); save(&path, &entries)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn local_registry_and_zip_keep_paths_out_of_metadata() {
        let root = std::env::temp_dir().join(format!("dayweave-output-test-{}", std::process::id()));
        fs::create_dir_all(root.join("project/sub")).unwrap(); fs::write(root.join("project/sub/结果.txt"), "output-data").unwrap();
        let bytes = folder_zip(&root.join("project")).unwrap(); let mut archive = zip::ZipArchive::new(Cursor::new(bytes)).unwrap();
        let mut text = String::new(); archive.by_name("sub/结果.txt").unwrap().read_to_string(&mut text).unwrap(); assert_eq!(text, "output-data");
        let output = Output { id: "00000000-0000-0000-0000-000000000001".into(), name: "project".into(), kind: "folder".into(), size: None };
        assert!(!serde_json::to_string(&output).unwrap().contains("path"));
        let path = root.join("links.json"); remember(&path, Entry { scope: "guest".into(), output, path: root.join("project") }).unwrap(); assert_eq!(load(&path).unwrap().len(), 1);
        assert!(!valid_id("../../arbitrary")); assert!(validate("other-account", "00000000-0000-0000-0000-000000000001").is_err());
        // Only this test's resolved, explicitly created temporary directory is removed.
        assert!(root.starts_with(std::env::temp_dir()) && root.file_name().unwrap().to_string_lossy().starts_with("dayweave-output-test-")); fs::remove_dir_all(root).unwrap();
    }
}
