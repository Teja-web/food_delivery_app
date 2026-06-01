import type { Request, Response } from "express";
import { app } from "../src/app.js";
import { initializeDatabase } from "../src/db/index.js";

const databaseReady = initializeDatabase();

export default async function handler(
  request: Request,
  response: Response,
) {
  await databaseReady;
  return app(request, response);
}
