//! Android's document picker supplies content URIs, not filesystem paths.
use serde::{Deserialize, Serialize};
use tauri::{plugin::{Builder, PluginHandle, TauriPlugin}, AppHandle, Manager, Wry};

pub struct MobileFiles(pub PluginHandle<Wry>);
#[derive(Deserialize)]
pub struct Picked { pub uri: String, pub name: String }
#[derive(Deserialize)]
pub struct PickResult { pub file: Option<Picked> }
#[derive(Serialize)]
pub struct OpenFile { pub path: String }

pub fn init() -> TauriPlugin<Wry> {
    Builder::new("mobile-files").setup(|app, api| {
        app.manage(MobileFiles(api.register_android_plugin("app.dayweave.personal", "MobileFilesPlugin")?));
        Ok(())
    }).build()
}
pub fn pick(app: &AppHandle) -> Result<PickResult, String> {
    app.state::<MobileFiles>().0.run_mobile_plugin("pick", ()).map_err(|e| e.to_string())
}
pub fn open(app: &AppHandle, path: String) -> Result<(), String> {
    app.state::<MobileFiles>().0.run_mobile_plugin::<()>("open", OpenFile { path }).map_err(|e| e.to_string())
}
