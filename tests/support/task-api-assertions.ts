import { expect } from "vitest";

export const NON_EXISTENT_TASK_ID = "00000000-0000-0000-0000-000000000000";

export function expectProblemJson(
  response: {
    headers: Record<string, string | string[] | undefined>;
    body: Record<string, unknown>;
  },
  status: number,
) {
  expect(response.headers["content-type"]).toMatch(
    /application\/problem\+json/,
  );
  expect(response.body).toMatchObject({
    type: expect.any(String),
    title: expect.any(String),
    status,
    detail: expect.any(String),
  });
}

export function expectTaskShape(task: Record<string, unknown>) {
  expect(task).toMatchObject({
    id: expect.any(String),
    title: expect.any(String),
    status: expect.stringMatching(/^(todo|in_progress|done)$/),
    priority: expect.stringMatching(/^(low|medium|high)$/),
    createdAt: expect.any(String),
    updatedAt: expect.any(String),
  });
  expect(Object.prototype.hasOwnProperty.call(task, "description")).toBe(true);
  expect(Object.prototype.hasOwnProperty.call(task, "dueDate")).toBe(true);
}
