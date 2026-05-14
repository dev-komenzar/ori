// End-to-end demo: ui-page → ui-widget → ui-feature → lib/tasks (domain).
//
// Located outside any FSD layer (`src/__tests__/`) so the boundaries rule
// (same-layer prohibited) doesn't catch a test importing through the
// public API of a slice that lives in the same UI layer.

import { describe, expect, it } from "vitest";
import { isOk } from "../lib/shared/index.js";
import {
  createTask,
  taskId,
  taskTitle,
  type Task,
} from "../lib/tasks/index.js";
import {
  CompleteTaskActionError,
  completeTaskInList,
  renderTasksPage,
} from "../ui-page/tasks/index.js";

const FIXED_NOW = () => new Date("2026-05-14T00:00:00.000Z");
const SAMPLE_ID = "1f8b2a02-1111-4222-8333-444455556666";

function seedTask(): Task {
  const id = taskId(SAMPLE_ID);
  const title = taskTitle("buy milk");
  if (!isOk(id) || !isOk(title)) throw new Error("VO smoke failed");
  return createTask(id.value, title.value, FIXED_NOW).state;
}

describe("FSD UI flow: page → widget → feature → domain", () => {
  it("renders the page from a list of tasks via the widget", () => {
    const task = seedTask();
    const output = renderTasksPage({
      title: "Tasks",
      list: { tasks: [task] },
    });
    expect(output).toContain("Tasks");
    expect(output).toContain("[ ] buy milk");
  });

  it("invokes the domain feature through ui-feature and emits an event", () => {
    const task = seedTask();
    const outcome = completeTaskInList(
      { tasks: [task] },
      task.id,
      FIXED_NOW,
    );
    expect(outcome).not.toBeInstanceOf(CompleteTaskActionError);
    if (outcome instanceof CompleteTaskActionError) return;
    expect(outcome.nextProps.completed).toBe(true);
    expect(outcome.events).toHaveLength(1);
    expect(outcome.events[0]?.name).toBe("TaskCompleted");
  });

  it("returns an action error for a missing task without throwing", () => {
    const outcome = completeTaskInList({ tasks: [] }, SAMPLE_ID);
    expect(outcome).toBeInstanceOf(CompleteTaskActionError);
  });
});
