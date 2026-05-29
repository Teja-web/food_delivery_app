import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { app } from "../../src/app";
import {
  NON_EXISTENT_TASK_ID,
  expectProblemJson,
  expectTaskShape,
} from "../support/task-api-assertions";
import { resetTasks } from "../support/test-db";

describe("Task API contract", () => {
  beforeEach(async () => {
    await resetTasks();
  });

  it("POST /tasks creates a task with title, description, priority, and dueDate", async () => {
    const response = await request(app)
      .post("/tasks")
      .send({
        title: "Draft API contract",
        description: "Write contract tests before implementation",
        priority: "high",
        dueDate: "2026-06-15",
      })
      .expect(201);

    expect(response.headers["content-type"]).toMatch(/application\/json/);
    expectTaskShape(response.body);
    expect(response.body).toMatchObject({
      title: "Draft API contract",
      description: "Write contract tests before implementation",
      status: "todo",
      priority: "high",
      dueDate: "2026-06-15",
    });
  });

  it("POST /tasks rejects a missing title with RFC 7807 problem details", async () => {
    const response = await request(app)
      .post("/tasks")
      .send({ priority: "medium" })
      .expect(400);

    expectProblemJson(response, 400);
  });

  it("POST /tasks rejects invalid priority with RFC 7807 problem details", async () => {
    const response = await request(app)
      .post("/tasks")
      .send({ title: "Bad priority", priority: "urgent" })
      .expect(400);

    expectProblemJson(response, 400);
  });

  it("GET /tasks returns all tasks as a JSON array", async () => {
    const first = await request(app)
      .post("/tasks")
      .send({ title: "First", priority: "low" })
      .expect(201);
    const second = await request(app)
      .post("/tasks")
      .send({ title: "Second", priority: "medium" })
      .expect(201);

    const response = await request(app).get("/tasks").expect(200);

    expect(response.headers["content-type"]).toMatch(/application\/json/);
    expect(response.body).toEqual(expect.any(Array));
    expect(response.body.map((task: { id: string }) => task.id)).toEqual(
      expect.arrayContaining([first.body.id, second.body.id]),
    );
    response.body.forEach(expectTaskShape);
  });

  it("GET /tasks?status=:status filters tasks by status", async () => {
    const todo = await request(app)
      .post("/tasks")
      .send({ title: "Todo task", priority: "low" })
      .expect(201);
    const done = await request(app)
      .post("/tasks")
      .send({ title: "Done task", priority: "medium" })
      .expect(201);
    await request(app)
      .patch(`/tasks/${done.body.id}`)
      .set("Content-Type", "application/merge-patch+json")
      .send({ status: "done" })
      .expect(200);

    const response = await request(app)
      .get("/tasks")
      .query({ status: "todo" })
      .expect(200);

    expect(response.body).toEqual(expect.any(Array));
    expect(response.body.map((task: { id: string }) => task.id)).toContain(
      todo.body.id,
    );
    expect(response.body.map((task: { id: string }) => task.id)).not.toContain(
      done.body.id,
    );
    response.body.forEach((task: { status: string }) => {
      expect(task.status).toBe("todo");
    });
  });

  it("GET /tasks?status=:status rejects invalid status with RFC 7807 problem details", async () => {
    const response = await request(app)
      .get("/tasks")
      .query({ status: "blocked" })
      .expect(400);

    expectProblemJson(response, 400);
  });

  it("GET /tasks/:id returns one task by id", async () => {
    const created = await request(app)
      .post("/tasks")
      .send({ title: "Find by id", priority: "medium" })
      .expect(201);

    const response = await request(app)
      .get(`/tasks/${created.body.id}`)
      .expect(200);

    expectTaskShape(response.body);
    expect(response.body).toMatchObject({
      id: created.body.id,
      title: "Find by id",
    });
  });

  it("GET /tasks/:id returns 404 problem details for a missing task", async () => {
    const response = await request(app)
      .get(`/tasks/${NON_EXISTENT_TASK_ID}`)
      .expect(404);

    expectProblemJson(response, 404);
  });

  it("PATCH /tasks/:id applies RFC 7396 merge-patch updates", async () => {
    const created = await request(app)
      .post("/tasks")
      .send({
        title: "Patch me",
        description: "Original",
        priority: "low",
        dueDate: "2026-06-01",
      })
      .expect(201);

    const response = await request(app)
      .patch(`/tasks/${created.body.id}`)
      .set("Content-Type", "application/merge-patch+json")
      .send({
        title: "Patched",
        description: null,
        status: "in_progress",
        priority: "high",
        dueDate: "2026-07-01",
      })
      .expect(200);

    expectTaskShape(response.body);
    expect(response.body).toMatchObject({
      id: created.body.id,
      title: "Patched",
      description: null,
      status: "in_progress",
      priority: "high",
      dueDate: "2026-07-01",
    });
  });

  it("PATCH /tasks/:id is idempotent for repeated merge-patch payloads", async () => {
    const created = await request(app)
      .post("/tasks")
      .send({ title: "Idempotent patch", priority: "medium" })
      .expect(201);
    const patch = { status: "done", priority: "high" };

    const first = await request(app)
      .patch(`/tasks/${created.body.id}`)
      .set("Content-Type", "application/merge-patch+json")
      .send(patch)
      .expect(200);
    const second = await request(app)
      .patch(`/tasks/${created.body.id}`)
      .set("Content-Type", "application/merge-patch+json")
      .send(patch)
      .expect(200);

    expect(second.body).toMatchObject({
      id: first.body.id,
      title: first.body.title,
      description: first.body.description,
      status: "done",
      priority: "high",
      dueDate: first.body.dueDate,
    });
  });

  it("PATCH /tasks/:id rejects invalid status with RFC 7807 problem details", async () => {
    const created = await request(app)
      .post("/tasks")
      .send({ title: "Bad status", priority: "medium" })
      .expect(201);

    const response = await request(app)
      .patch(`/tasks/${created.body.id}`)
      .set("Content-Type", "application/merge-patch+json")
      .send({ status: "blocked" })
      .expect(400);

    expectProblemJson(response, 400);
  });

  it("PATCH /tasks/:id rejects invalid priority with RFC 7807 problem details", async () => {
    const created = await request(app)
      .post("/tasks")
      .send({ title: "Bad priority", priority: "medium" })
      .expect(201);

    const response = await request(app)
      .patch(`/tasks/${created.body.id}`)
      .set("Content-Type", "application/merge-patch+json")
      .send({ priority: "urgent" })
      .expect(400);

    expectProblemJson(response, 400);
  });

  it("PATCH /tasks/:id returns 404 problem details for a missing task", async () => {
    const response = await request(app)
      .patch(`/tasks/${NON_EXISTENT_TASK_ID}`)
      .set("Content-Type", "application/merge-patch+json")
      .send({ status: "done" })
      .expect(404);

    expectProblemJson(response, 404);
  });

  it("DELETE /tasks/:id deletes a task", async () => {
    const created = await request(app)
      .post("/tasks")
      .send({ title: "Delete me", priority: "low" })
      .expect(201);

    await request(app).delete(`/tasks/${created.body.id}`).expect(204);

    const response = await request(app)
      .get(`/tasks/${created.body.id}`)
      .expect(404);
    expectProblemJson(response, 404);
  });

  it("DELETE /tasks/:id returns 404 problem details for a missing task", async () => {
    const response = await request(app)
      .delete(`/tasks/${NON_EXISTENT_TASK_ID}`)
      .expect(404);

    expectProblemJson(response, 404);
  });
});
