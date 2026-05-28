// ui-page: tasks — top-level screen composing widgets.
//
// Pages own routing and layout; slice-internal logic is reached via slice
// public APIs (or through ui-widget composition).
//   ui-page -> [ui-widget, shared, domain]

import {
  completeTaskInList,
  CompleteTaskActionError,
  renderTaskList,
  type CompleteTaskOutcome,
  type TaskListState,
} from "../../ui-widget/task-list/index.js";

export interface TasksPageState {
  readonly title: string;
  readonly list: TaskListState;
}

export function renderTasksPage(state: TasksPageState): string {
  const heading = state.title;
  const rule = "-".repeat(heading.length);
  return `${heading}\n${rule}\n${renderTaskList(state.list)}`;
}

export { completeTaskInList, CompleteTaskActionError };
export type { TaskListState, CompleteTaskOutcome };
