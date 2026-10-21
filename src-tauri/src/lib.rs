#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    #[cfg(target_os = "android")]
    let builder = builder.plugin(mobile_files::init());
    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![outputs::pick_output, outputs::local_output_ids, outputs::open_output, outputs::read_output, outputs::cache_output, outputs::cache_mobile_output, outputs::copy_output_scope, outputs::save_output, outputs::pick_backup])
        .run(tauri::generate_context!())
        .expect("无法启动日序");
}
mod outputs;
#[cfg(target_os = "android")]
mod mobile_files;
