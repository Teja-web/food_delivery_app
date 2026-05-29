import express, { type ErrorRequestHandler } from "express";
import { sendProblem } from "./http/problem";
import { tasksRouter } from "./routes/tasks.routes";

export const app = express();

app.disable("x-powered-by");
app.use(express.json({ type: ["application/json", "application/merge-patch+json"] }));

app.use("/tasks", tasksRouter);

const errorHandler: ErrorRequestHandler = (_error, _request, response, _next) => {
  return sendProblem(
    response,
    500,
    "Internal Server Error",
    "An unexpected error occurred.",
  );
};

app.use(errorHandler);
