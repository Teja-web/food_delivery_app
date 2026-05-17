# Audit Evidence Packet

*Purpose: v1 packet shape and hash-chain verification for the audit-log export consumed by SOC 2 / ISO 27001 reviewers.*

Identifier: `coznt.audit.evidence.v1`

A tamper-evident JSON export of the audit log over a chosen window. Used during SOC 2 / ISO 27001 review when the auditor asks "what happened in production between dates X and Y, and prove the export wasn't edited."

## Shape

```jsonc
{
  "header": {
    "packetType": "coznt.audit.evidence.v1",
    "generatedAt": "<ISO-8601>",
    "generatedBy": {
      "organizationId": "<org-id>",
      "actorId": "<user-id or null>",
      "actorName": "<display name or null>"
    },
    "app": {
      "version": "<COZNT_APP_VERSION>",
      "exporter": "audit-evidence@1"
    },
    "query": {
      "scope": "all | skills | plans | projects | approvals | deployments",
      "from": "<ISO-8601>",
      "to": "<ISO-8601>",
      "actorType": "user | system | integration | api | null",
      "limit": 10000
    },
    "chainHead": {
      "rowHash": "<sha256 hex of the most recent audit_log row at export time>",
      "createdAt": "<ISO-8601>",
      "rowCount": <integer>
    },
    "chainVerification": {
      "ok": true,
      "checked": <integer>,
      "firstAt": "<ISO-8601>",
      "lastAt": "<ISO-8601>"
    },
    "rowCount": <integer>
  },
  "body": {
    "rows": [
      {
        "id": "<row id>",
        "occurredAt": "<ISO-8601>",
        "source": "audit_log | skill_outcome",
        "actorType": "user | system | integration | api | skill",
        "actorName": "<display name or null>",
        "action": "<dotted action verb>",
        "entityType": "<table or domain noun>",
        "entityId": "<entity id>",
        "entityLabel": "<human label or null>",
        "projectId": "<project id or null>",
        "projectName": "<project name or null>",
        "summary": "<one-line summary or null>",
        "severity": "low | high | critical | null",
        "verdict": "success | rolled_back | incident | null",
        "signature": "<row_hash[0..12] for audit_log rows; fallback short hash for skill_outcomes>"
      }
    ]
  },
  "receipt": {
    "algorithm": "sha256",
    "hash": "<sha256 hex of JSON.stringify(header) + \"\\n\" + JSON.stringify(body)>"
  }
}
```

## Verification

The packet is verifiable two ways. A reviewer should run both:

### 1. Self-check (offline)

Recompute the receipt:

```
input  = JSON.stringify(header) + "\n" + JSON.stringify(body)
expect = sha256(input).hex
```

If `expect != receipt.hash`, the packet has been edited after export. Reject.

```bash
pnpm tsx scripts/verify-evidence-packet.ts < path/to/packet.json
```

### 2. Chain-walk against the live ledger (online)

The packet's `header.chainHead.rowHash` is the row_hash of the most recent audit_log row at export time. To prove no historical rows have been tampered with since export:

```
POST /api/v1/audit/verify?upTo=<header.chainHead.rowHash>
```

A clean response (`{ ok: true }`) means every row up to and including the export's chain head still hashes to the same value. Rows inserted *after* export are legitimate new history — they don't affect the verification of the exported window.

If `header.chainVerification.ok` was `false` at export time, the auditor was warned: the chain was already drifted when the packet was generated. That packet may still be useful (you can see *where* the drift began from `chainVerification.drift`), but the rows around the drift point are untrustworthy.

## What the packet does NOT do

- **Cryptographic signing.** The receipt is a hash of the packet content; anyone with write access to the file can recompute it. The chain itself is the load-bearing tamper signal. A reviewer who only inspects the receipt and skips the live chain walk can be fooled.
- **Wrap external evidence.** Source-of-record links (GitHub PRs, Jira tickets, deploy logs) carry their own attestations. The packet is the coznt-side ledger only.
- **Encode the full row payload.** `before` / `after` JSON columns from `audit_logs` are intentionally omitted to keep packets compact; the live ledger has them if a reviewer needs to drill in.

A future v2 packet will add per-row DSSE signatures against a customer-held keypair — see [`../product/architecture.md`](../product/architecture.md) §9 decision #1.
