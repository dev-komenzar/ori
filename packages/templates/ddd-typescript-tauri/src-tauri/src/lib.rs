// Crate root for the Tauri backend.
//
// Mirrors the TypeScript FSD layout: each feature folder under `features/`
// owns its pipeline (domain → application → infrastructure → commands) and
// re-exports its public API through `mod.rs`. Cross-feature direct imports
// are prohibited; collaborate via `features/shared/`.
//
// Architecture rules are declared once in `.ori/architecture.md` and
// compiled into `tests/arch.rs` by `ori arch export --adapter=rust --root=rs`.

pub mod features;

use specta_typescript::Typescript;
use tauri_specta::{collect_commands, Builder};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = Builder::<tauri::Wry>::new().commands(collect_commands![
        features::tasks::complete_task_cmd
    ]);

    // Regenerate TS bindings on each debug build. The output lands in
    // `src/lib/shared/ipc/bindings.ts` — see the cross_root entry in
    // .ori/architecture.md.
    #[cfg(debug_assertions)]
    builder
        .export(
            Typescript::default(),
            "../src/lib/shared/ipc/bindings.ts",
        )
        .expect("failed to export typescript bindings");

    tauri::Builder::default()
        .invoke_handler(builder.invoke_handler())
        .setup(move |app| {
            builder.mount_events(app);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
