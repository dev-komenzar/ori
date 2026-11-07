// tauri-scenario-smoke fixture: ui/index.html を表示するだけの最小 tauri v2 app
fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
