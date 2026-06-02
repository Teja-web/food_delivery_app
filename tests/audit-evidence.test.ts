/**
 * Receipt-math tests for the audit evidence packet.
 *
 * The full `buildEvidencePacket` path hits the DB and the chain verifier
 * (covered by `scripts/smoke-audit-chain.ts`). These tests pin the
 * verifyEvidencePacket math: receipt = sha256(canonical(header) || "\n"
 * || canonical(body)).
 */

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  EVIDENCE_PACKET_VERSION,
  verifyEvidencePacket,
  type EvidencePacket,
} from "@/operations/audit/audit-evidence";

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

function basePacket(): EvidencePacket {
  const header: EvidencePacket["header"] = {
    packetType: EVIDENCE_PACKET_VERSION,
    generatedAt: "2026-05-14T12:00:00.000Z",
    generatedBy: { organizationId: "org-1", actorId: "u-1", actorName: "alice" },
    app: { version: "0.1.0-test", exporter: "audit-evidence@1" },
    query: {
      scope: "all",
      from: "2026-05-07T12:00:00.000Z",
      to: "2026-05-14T12:00:00.000Z",
      actorType: null,
      limit: 10_000,
    },
    chainHead: {
      rowHash: "abc123",
      createdAt: "2026-05-14T11:59:00.000Z",
      rowCount: 42,
    },
    chainVerification: {
      ok: true,
      checked: 42,
      firstAt: new Date("2026-04-01T00:00:00.000Z"),
      lastAt: new Date("2026-05-14T11:59:00.000Z"),
    } as never,
    rowCount: 2,
  };
  const body = {
    rows: [
      {
        id: "row-1",
        occurredAt: "2026-05-13T10:00:00.000Z",
        source: "audit_log" as const,
        actorType: "user" as never,
        actorName: "alice",
        action: "plan.approved",
        entityType: "plan",
        entityId: "pl-1",
        entityLabel: "Add 2FA",
        projectId: "p-1",
        projectName: "auth",
        summary: "in_review → approved",
        severity: null,
        verdict: null,
        signature: "deadbeefca",
      },
    ],
  };
  const receiptInput = `${JSON.stringify(header)}\n${JSON.stringify(body)}`;
  return {
    header,
    body,
    receipt: { algorithm: "sha256", hash: sha256(receiptInput) },
  };
}

describe("verifyEvidencePacket", () => {
  it("accepts a well-formed packet", () => {
    const packet = basePacket();
    const r = verifyEvidencePacket(packet);
    expect(r.ok).toBe(true);
    expect(r.actual).toBe(r.expected);
  });

  it("rejects a packet where the header has been edited", () => {
    const packet = basePacket();
    packet.header.generatedBy.actorName = "mallory"; // tamper
    const r = verifyEvidencePacket(packet);
    expect(r.ok).toBe(false);
    expect(r.actual).not.toBe(r.expected);
  });

  it("rejects a packet where a row has been edited", () => {
    const packet = basePacket();
    packet.body.rows[0].action = "plan.rejected"; // tamper
    const r = verifyEvidencePacket(packet);
    expect(r.ok).toBe(false);
  });

  it("rejects a packet where the receipt itself has been edited", () => {
    const packet = basePacket();
    packet.receipt.hash = sha256("totally not the right input");
    const r = verifyEvidencePacket(packet);
    expect(r.ok).toBe(false);
  });

  it("rejects a packet with an extra row appended", () => {
    const packet = basePacket();
    packet.body.rows.push({ ...packet.body.rows[0], id: "row-2" });
    const r = verifyEvidencePacket(packet);
    expect(r.ok).toBe(false);
  });
});
