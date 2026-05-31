import request from "supertest";
import { beforeEach, describe, it } from "vitest";
import { app } from "../../src/app";
import {
  NON_EXISTENT_TASK_ID,
  expectProblemJson,
} from "../support/task-api-assertions";
import { resetTasks } from "../support/test-db";

describe("Task validation and edge cases", () => {
  beforeEach(async () => {
    await resetTasks();
  });

  it.each([
    ["missing title", { dueDate: "2026-06-01" }],
    ["blank title", { title: "", dueDate: "2026-06-01" }],
    ["whitespace title", { title: "   ", dueDate: "2026-06-01" }],
  ])("POST /tasks rejects %s", async (_caseName, payload) => {
    const response = await request(app).post("/tasks").send(payload).expect(400);
    expectProblemJson(response, 400);
  });

  it.each(["blocked", "archived", "DONE", "", null])(
    "POST /tasks rejects invalid status value %s",
    async (status) => {
      const response = await request(app)
        .post("/tasks")
        .send({ title: "Invalid status", status, priority: "med", dueDate: "2026-06-01" })
        .expect(400);

      expectProblemJson(response, 400);
    },
  );

  it.each(["urgent", "none", "HIGH", "", null])(
    "POST /tasks rejects invalid priority value %s",
    async (priority) => {
      const response = await request(app)
        .post("/tasks")
        .send({ title: "Invalid priority", priority, dueDate: "2026-06-01" })
        .expect(400);

      expectProblemJson(response, 400);
    },
  );

  it.each(["blocked", "archived", "DONE", "", null])(
    "GET /tasks?status rejects invalid status filter %s",
    async (status) => {
      const response = await request(app)
        .get("/tasks")
        .query({ status })
        .expect(400);

      expectProblemJson(response, 400);
    },
  );

  it("PATCH /tasks/:id accepts transition to in_progress", async () => {
    const created = await request(app)
      .post("/tasks")
      .send({ title: "Start work", priority: "med", dueDate: "2026-06-01" })
      .expect(201);

    await request(app)
      .patch(`/tasks/${created.body.id}`)
      .set("Content-Type", "application/merge-patch+json")
      .send({ status: "in_progress" })
      .expect(200);
  });

  it("PATCH /tasks/:id accepts transition to done", async () => {
    const created = await request(app)
      .post("/tasks")
      .send({ title: "Finish work", priority: "med", dueDate: "2026-06-01" })
      .expect(201);

    await request(app)
      .patch(`/tasks/${created.body.id}`)
      .set("Content-Type", "application/merge-patch+json")
      .send({ status: "done" })
      .expect(200);
  });

  it("PATCH /tasks/:id rejects an empty merge patch", async () => {
    const created = await request(app)
      .post("/tasks")
      .send({ title: "Empty patch", priority: "med", dueDate: "2026-06-01" })
      .expect(201);

    const response = await request(app)
      .patch(`/tasks/${created.body.id}`)
      .set("Content-Type", "application/merge-patch+json")
      .send({})
      .expect(400);

    expectProblemJson(response, 400);
  });

  it("PATCH /tasks/:id rejects unknown fields", async () => {
    const created = await request(app)
      .post("/tasks")
      .send({ title: "Unknown field", priority: "med", dueDate: "2026-06-01" })
      .expect(201);

    const response = await request(app)
      .patch(`/tasks/${created.body.id}`)
      .set("Content-Type", "application/merge-patch+json")
      .send({ ownerId: "not-in-v1" })
      .expect(400);

    expectProblemJson(response, 400);
  });

  it("DELETE /tasks/:id is explicit about missing ids", async () => {
    const response = await request(app)
      .delete(`/tasks/${NON_EXISTENT_TASK_ID}`)
      .expect(404);

    expectProblemJson(response, 404);
  });
});
