/**
 * Verify an audit evidence packet offline.
 *
 * Reads a JSON packet from stdin (or a path argv[2]), recomputes the
 * receipt, and prints whether it matches.
 *
 *   pnpm tsx scripts/verify-evidence-packet.ts < packet.json
 *   pnpm tsx scripts/verify-evidence-packet.ts ./packet.json
 *
 * Exit codes:
 *   0 — receipt matches
 *   1 — receipt mismatch (packet edited)
 *   2 — packet shape invalid or read error
 */

import { readFileSync } from "node:fs";

import { verifyEvidencePacket } from "../src/operations/audit-evidence";

function readStdin(): string {
  const chunks: Buffer[] = [];
  let chunk: Buffer | null;
  while ((chunk = process.stdin.read()) !== null) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function readStdinAsync(): Promise<string> {
  return new Promise((resolve, reject) => {
    let acc = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (d) => (acc += d));
    process.stdin.on("end", () => resolve(acc));
    process.stdin.on("error", reject);
  });
}

async function main() {
  const path = process.argv[2];
  let raw: string;
  try {
    raw = path ? readFileSync(path, "utf8") : await readStdinAsync();
  } catch (err) {
    console.error("error reading packet:", err);
    process.exit(2);
  }

  let packet: unknown;
  try {
    packet = JSON.parse(raw);
  } catch (err) {
    console.error("invalid JSON:", err);
    process.exit(2);
  }

  const looksLikePacket =
    packet &&
    typeof packet === "object" &&
    "header" in packet &&
    "body" in packet &&
    "receipt" in packet;
  if (!looksLikePacket) {
    console.error("not an evidence packet — missing header/body/receipt");
    process.exit(2);
  }

  const result = verifyEvidencePacket(packet as never);
  if (result.ok) {
    console.log("✓ packet receipt verified");
    console.log(`  hash: ${result.actual}`);
    process.exit(0);
  } else {
    console.error("✗ packet receipt MISMATCH");
    console.error(`  expected: ${result.expected}`);
    console.error(`  actual:   ${result.actual}`);
    console.error("\nThis packet has been edited after export. Reject.");
    process.exit(1);
  }
}

void readStdin; // kept for future sync path

main();
