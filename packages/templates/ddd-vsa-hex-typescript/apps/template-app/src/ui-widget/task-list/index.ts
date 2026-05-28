// ui-widget: task-list — composes the complete-task slice into a list view.
//
// Allowed imports (ddd-vsa-hex-ts cross-layer rules):
//   ui-widget -> [shared, domain]
// "domain" here refers to slices (kind: slice) via their public index.ts —
// reaching into slice internals is forbidden by boundaries/no-private.

import {
  completeTaskAction,
  CompleteTaskActionError,
  renderTaskCard,
  toTaskCardProps,
  type Task,
  type TaskCardProps,
  type TaskCompleted,
} from "../../task-management/slices/complete-task/index.js";

export interface TaskListState {
  readonly tasks: readonly Task[];
}

export interface CompleteTaskOutcome {
  readonly nextTask: Task;
  readonly nextProps: TaskCardProps;
  readonly events: readonly TaskCompleted[];
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
  const result = completeTaskAction(target, now);
  if (result instanceof CompleteTaskActionError) {
    return result;
  }
  return {
    nextTask: result.nextTask,
    nextProps: toTaskCardProps(result.nextTask),
    events: result.events,
  };
}

export { CompleteTaskActionError };
export type { Task, TaskCardProps };
