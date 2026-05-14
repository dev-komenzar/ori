// Use-case orchestration for the `tasks` feature.
//
// Composes domain primitives + infrastructure ports into transactional
// operations. Kept separate from `commands.rs` so the use case is
// independently testable without a Tauri runtime.
//
// NOTE: feature-internal references use the absolute `crate::features::tasks::*`
// path rather than `super::*`. The Rust arch adapter's super-prefix resolution
// would otherwise mis-classify intra-feature siblings as cross-feature.

use crate::features::shared::AppError;
use crate::features::tasks::domain::{complete, Task, TaskId};
use crate::features::tasks::infrastructure::TaskRepository;

pub fn complete_task_usecase(
    repo: &dyn TaskRepository,
    id: &TaskId,
) -> Result<Task, AppError> {
    let task = repo
        .find(id)
        .ok_or_else(|| AppError::NotFound(format!("task {} not found", id.0)))?;
    let next = complete(task)?;
    repo.save(next.clone());
    Ok(next)
}
