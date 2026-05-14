// Public API for the `tasks` feature.
//
// Anything not re-exported here is feature-internal; cross-feature imports
// must go through this file (enforced by eslint-plugin-boundaries via the
// architecture adapter).

export type { Task } from "./domain/task.js";
export { createTask, completeTask, TaskStateError } from "./domain/task.js";

export type { TaskId } from "./domain/task-id.js";
export { taskId, TaskIdError } from "./domain/task-id.js";

export type { TaskTitle } from "./domain/task-title.js";
export { taskTitle, TaskTitleError } from "./domain/task-title.js";

export type { TaskCompleted, TaskCreated, TaskEvent } from "./domain/events.js";
