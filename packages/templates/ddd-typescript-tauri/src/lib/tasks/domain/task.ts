import { err, ok, type Result } from "../../shared/types/result.js";
import type { TaskCompleted, TaskCreated } from "./events.js";
import type { TaskId } from "./task-id.js";
import type { TaskTitle } from "./task-title.js";

export interface Task {
  readonly id: TaskId;
  readonly title: TaskTitle;
  readonly completed: boolean;
}

export class TaskStateError extends Error {
  override readonly name = "TaskStateError";
}

export interface CommandResult<TState, TEvent> {
  readonly state: TState;
  readonly events: readonly TEvent[];
}

export function createTask(
  id: TaskId,
  title: TaskTitle,
  now: () => Date = () => new Date(),
): CommandResult<Task, TaskCreated> {
  const state: Task = { id, title, completed: false };
  const event: TaskCreated = {
    name: "TaskCreated",
    occurredAt: now(),
    payload: { id, title },
  };
  return { state, events: [event] };
}

export function completeTask(
  state: Task,
  now: () => Date = () => new Date(),
): Result<CommandResult<Task, TaskCompleted>, TaskStateError> {
  if (state.completed) {
    return err(new TaskStateError(`task ${state.id} already completed`));
  }
  const next: Task = { ...state, completed: true };
  const event: TaskCompleted = {
    name: "TaskCompleted",
    occurredAt: now(),
    payload: { id: state.id },
  };
  return ok({ state: next, events: [event] });
}
