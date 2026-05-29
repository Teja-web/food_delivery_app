import { Router } from "express";
import { ZodError } from "zod";
import { sendProblem } from "../http/problem";
import {
  createTask,
  deleteTask,
  getTask,
  listTasks,
  patchTask,
} from "../services/tasks.service";
import {
  createTaskSchema,
  listTasksQuerySchema,
  patchTaskSchema,
  taskIdSchema,
} from "../validation/task.schemas";

export const tasksRouter = Router();

function validationDetail(error: ZodError) {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "request"}: ${issue.message}`)
    .join("; ");
}

function parseTaskId(id: string) {
  const parsed = taskIdSchema.safeParse(id);
  return parsed.success ? parsed.data : null;
}

tasksRouter.post("/", async (request, response, next) => {
  try {
    const parsed = createTaskSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendProblem(
        response,
        400,
        "Invalid task payload",
        validationDetail(parsed.error),
      );
    }

    const task = await createTask(parsed.data);
    return response.status(201).json(task);
  } catch (error) {
    return next(error);
  }
});

tasksRouter.get("/", async (request, response, next) => {
  try {
    const parsed = listTasksQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return sendProblem(
        response,
        400,
        "Invalid task query",
        validationDetail(parsed.error),
      );
    }

    const tasks = await listTasks(parsed.data.status);
    return response.status(200).json(tasks);
  } catch (error) {
    return next(error);
  }
});

tasksRouter.get("/:id", async (request, response, next) => {
  try {
    const id = parseTaskId(request.params.id);
    if (!id) {
      return sendProblem(response, 404, "Task not found", "Task was not found.");
    }

    const task = await getTask(id);
    if (!task) {
      return sendProblem(response, 404, "Task not found", "Task was not found.");
    }

    return response.status(200).json(task);
  } catch (error) {
    return next(error);
  }
});

tasksRouter.patch("/:id", async (request, response, next) => {
  try {
    const id = parseTaskId(request.params.id);
    if (!id) {
      return sendProblem(response, 404, "Task not found", "Task was not found.");
    }

    const parsed = patchTaskSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendProblem(
        response,
        400,
        "Invalid task patch",
        validationDetail(parsed.error),
      );
    }

    const task = await patchTask(id, parsed.data);
    if (!task) {
      return sendProblem(response, 404, "Task not found", "Task was not found.");
    }

    return response.status(200).json(task);
  } catch (error) {
    return next(error);
  }
});

tasksRouter.delete("/:id", async (request, response, next) => {
  try {
    const id = parseTaskId(request.params.id);
    if (!id) {
      return sendProblem(response, 404, "Task not found", "Task was not found.");
    }

    const deleted = await deleteTask(id);
    if (!deleted) {
      return sendProblem(response, 404, "Task not found", "Task was not found.");
    }

    return response.status(204).send();
  } catch (error) {
    return next(error);
  }
});
