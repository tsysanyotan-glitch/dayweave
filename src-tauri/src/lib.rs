#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    #[cfg(windows)]
    let builder = {
        let testing = std::env::var("DAYWEAVE_NATIVE_TEST").as_deref() == Ok("1");
        let builder = if testing {
            builder
        } else {
            builder.plugin(tauri_plugin_single_instance::init(|app, _, _| {
                desktop::show(app)
            }))
        };
        builder
            .plugin(
                tauri_plugin_autostart::Builder::new()
                    .app_name(if testing {
                        "DayWeave Native Test"
                    } else {
                        "DayWeave"
                    })
                    .arg("--autostart")
                    .build(),
            )
            .setup(desktop::setup)
            .on_window_event(|win, event| {
                if win.label() == "reminder" {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = win.hide();
                    }
                }
            })
    };
    #[cfg(target_os = "android")]
    let builder = builder.plugin(mobile_files::init());
    let builder = builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init());
    #[cfg(not(windows))]
    let builder = builder.invoke_handler(tauri::generate_handler![
        outputs::pick_output,
        outputs::local_output_ids,
        outputs::open_output,
        outputs::read_output,
        outputs::cache_output,
        outputs::cache_mobile_output,
        outputs::copy_output_scope,
        outputs::save_output,
        outputs::pick_backup
    ]);
    #[cfg(windows)]
    let builder = builder.invoke_handler(tauri::generate_handler![
        outputs::pick_output,
        outputs::local_output_ids,
        outputs::open_output,
        outputs::read_output,
        outputs::cache_output,
        outputs::cache_mobile_output,
        outputs::copy_output_scope,
        outputs::save_output,
        outputs::pick_backup,
        desktop::desktop_snapshot,
        desktop::desktop_settings,
        desktop::desktop_action,
        desktop::reminders_sync,
        desktop::reminder_action,
        desktop::reminder_complete_saved,
        clock::time_snapshot,
        clock::time_refresh,
        clock::time_test_set
    ]);
    builder
        .run(tauri::generate_context!())
        .expect("无法启动日序");
}
#[cfg(windows)]
mod clock;
#[cfg(windows)]
mod desktop;
#[cfg(target_os = "android")]
mod mobile_files;
mod outputs;
