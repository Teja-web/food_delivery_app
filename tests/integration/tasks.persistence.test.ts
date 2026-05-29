import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { app } from "../../src/app";
import { db } from "../../src/db";
import { tasks } from "../../src/db/schema/tasks";
import { resetTasks } from "../support/test-db";

describe("Task persistence integration", () => {
  beforeEach(async () => {
    await resetTasks();
  });

  it("persists created tasks through Drizzle and PostgreSQL", async () => {
    const response = await request(app)
      .post("/tasks")
      .send({
        title: "Persisted task",
        description: "Verify database row",
        priority: "high",
        dueDate: "2026-06-30",
      })
      .expect(201);

    const rows = await db.select().from(tasks);
    const row = rows.find((task) => task.id === response.body.id);

    expect(row).toMatchObject({
      id: response.body.id,
      title: "Persisted task",
      description: "Verify database row",
      status: "todo",
      priority: "high",
    });
    expect(row?.dueDate?.toISOString().slice(0, 10)).toBe("2026-06-30");
  });

  it("stores status and dueDate values used by the composite index", async () => {
    await request(app)
      .post("/tasks")
      .send({ title: "Todo indexed", priority: "low", dueDate: "2026-06-01" })
      .expect(201);
    const inProgress = await request(app)
      .post("/tasks")
      .send({
        title: "Progress indexed",
        priority: "medium",
        dueDate: "2026-06-02",
      })
      .expect(201);
    await request(app)
      .patch(`/tasks/${inProgress.body.id}`)
      .set("Content-Type", "application/merge-patch+json")
      .send({ status: "in_progress" })
      .expect(200);

    const response = await request(app)
      .get("/tasks")
      .query({ status: "in_progress" })
      .expect(200);

    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({
      id: inProgress.body.id,
      status: "in_progress",
      dueDate: "2026-06-02",
    });
  });

  it("removes deleted tasks from persistent storage", async () => {
    const created = await request(app)
      .post("/tasks")
      .send({ title: "Remove from DB", priority: "low" })
      .expect(201);

    await request(app).delete(`/tasks/${created.body.id}`).expect(204);

    const rows = await db.select().from(tasks);
    expect(rows.find((task) => task.id === created.body.id)).toBeUndefined();
  });
});
