import type { Response } from "express";

export type Problem = {
  type: string;
  title: string;
  status: number;
  detail: string;
};

export class HttpProblem extends Error {
  readonly status: number;
  readonly type: string;
  readonly title: string;

  constructor(status: number, title: string, detail: string, type = "about:blank") {
    super(detail);
    this.status = status;
    this.title = title;
    this.type = type;
  }
}

export function sendProblem(
  response: Response,
  status: number,
  title: string,
  detail: string,
  type = "about:blank",
) {
  const problem: Problem = { type, title, status, detail };
  return response
    .status(status)
    .type("application/problem+json")
    .json(problem);
}
