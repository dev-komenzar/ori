// ui-feature: complete-task — bridges the UI with the `tasks` domain feature.
//
// This is the only UI layer permitted to import a domain feature's public
// API (`lib/tasks/index.js`). Higher layers (ui-widget, ui-page) consume the
// view models produced here and never reach into `lib/` themselves.
//
// In the Tauri variant, a sibling `complete-task-remote` ui-feature can call
// the Rust-backed `completeTaskCmd` from `lib/shared/ipc/` instead of the
// in-process aggregate. The two share the same view-model shape so the
// widget/page layers don't notice the difference.

import { isOk } from "../../lib/shared/index.js";
import {
  completeTask,
  type Task,
  type TaskCompleted,
} from "../../lib/tasks/index.js";
import type { TaskCardProps } from "../../ui-entity/task-card/index.js";

export interface CompleteTaskOutcome {
  readonly nextProps: TaskCardProps;
  readonly nextTask: Task;
  readonly events: readonly TaskCompleted[];
}

export class CompleteTaskActionError extends Error {
  override readonly name = "CompleteTaskActionError";
}

export function toTaskCardProps(task: Task): TaskCardProps {
  return { id: task.id, title: task.title, completed: task.completed };
}

export function completeTaskAction(
  task: Task,
  now?: () => Date,
): CompleteTaskOutcome | CompleteTaskActionError {
  const r = completeTask(task, now);
  if (!isOk(r)) {
    return new CompleteTaskActionError(r.error.message);
  }
  return {
    nextTask: r.value.state,
    nextProps: toTaskCardProps(r.value.state),
    events: r.value.events,
  };
}

export type { Task, TaskCompleted };
