import type { Request, Response } from "express";
import { app } from "../src/app";
import { initializeDatabase } from "../src/db";

const databaseReady = initializeDatabase();

export default async function handler(
  request: Request,
  response: Response,
) {
  await databaseReady;
  return app(request, response);
}
