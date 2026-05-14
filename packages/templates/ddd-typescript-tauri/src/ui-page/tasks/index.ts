// ui-page: tasks — top-level screen composing widgets.
//
// Pages own routing and layout; business logic stays in ui-feature. A page
// may import from any lower UI layer plus shared, but never from `lib/`.

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
