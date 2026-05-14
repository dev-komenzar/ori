// ui-widget: task-list — composes ui-features and ui-entities into a list view.
//
// Allowed imports: ui-feature, ui-entity, shared. Importing a sibling widget
// (same layer) or a domain feature is forbidden by the architecture rules.

import {
  renderTaskCard,
  type TaskCardProps,
} from "../../ui-entity/task-card/index.js";
import {
  completeTaskAction,
  CompleteTaskActionError,
  toTaskCardProps,
  type CompleteTaskOutcome,
  type Task,
} from "../../ui-feature/complete-task/index.js";

export interface TaskListState {
  readonly tasks: readonly Task[];
}

export function renderTaskList(state: TaskListState): string {
  return state.tasks
    .map((t) => renderTaskCard(toTaskCardProps(t)))
    .join("\n");
}

export function completeTaskInList(
  state: TaskListState,
  taskId: string,
  now?: () => Date,
): CompleteTaskOutcome | CompleteTaskActionError {
  const target = state.tasks.find((t) => t.id === taskId);
  if (!target) {
    return new CompleteTaskActionError(`task ${taskId} not found in list`);
  }
  return completeTaskAction(target, now);
}

export type { TaskCardProps, Task, CompleteTaskOutcome };
export { CompleteTaskActionError };
