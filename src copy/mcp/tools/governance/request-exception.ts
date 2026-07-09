/**
 * MCP tool: request_exception
 *
 * Open a pending `exception` governance record that supersedes a failing
 * one. Per spec §4 — exceptions carry their own approver requirement and
 * expire on the supplied date.
 */

import { z } from "zod";

import { CozntClient } from "../../client";
import { bumpToolCall } from "../../session";

export const requestExceptionInput = z.object({
  governanceRecordId: z
    .string()
    .min(1)
    .describe("Id of the failing or pending governance_record the exception supersedes."),
  reason: z
    .string()
    .min(1)
    .describe("Why an exception is being requested."),
  expiresAt: z
    .string()
    .describe("ISO-8601 timestamp at which the exception expires."),
});

export type RequestExceptionInput = z.infer<typeof requestExceptionInput>;

export async function runRequestException(client: CozntClient, input: RequestExceptionInput) {
  bumpToolCall();
  return client.post<unknown>("/api/v1/mcp/governance/request-exception", input);
}
