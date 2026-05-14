// Tauri command surface for the `tasks` feature.
//
// Commands marked with `#[tauri::command]` + `#[specta::specta]` are picked
// up by `tauri-specta` and re-exported to TypeScript at
// `src/lib/shared/ipc/bindings.ts` (see .ori/architecture.md cross_root).

use crate::features::shared::AppError;
use crate::features::tasks::application::complete_task_usecase;
use crate::features::tasks::domain::{Task, TaskId};
use crate::features::tasks::infrastructure::MemoryRepo;

#[tauri::command]
#[specta::specta]
pub fn complete_task_cmd(id: String) -> Result<Task, AppError> {
    let parsed = TaskId::parse(&id)?;
    let repo = MemoryRepo::default();
    complete_task_usecase(&repo, &parsed)
}
