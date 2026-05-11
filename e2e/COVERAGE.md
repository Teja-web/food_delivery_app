# E2E Test Coverage Matrix

## Phase A–C fix-plan additions (2026-05-10)

| Spec | Project | Verifies |
|------|---------|----------|
| `cross-cutting/csrf-claim-routes.spec.ts` | `cross-csrf` | GET→POST migration on `/api/opportunities/claim` + `/api/campus/claim`; cross-Origin POSTs return 403 |
| `cross-cutting/rate-limit.spec.ts` | `cross-rate-limit` | `/api/public/opportunities` returns 429 past the per-IP threshold (proxy enforcement) |
| `cross-cutting/referral-race.spec.ts` | `cross-referral-race` | (fixme) atomic single-use referral claim under concurrent races |
| `team-track/08-public-visibility.spec.ts` | `team-08-visibility` | k-anonymity gate UI surfaces; Anonymized button disabled without org public profile |
| `candidate-track/09-public-funnel.spec.ts` | `candidate-09-public` | Anonymous /opportunities renders; consent-page bounce preserves callbackUrl shape |
| `vendor-track/02-referral-abuse.spec.ts` | `vendor-02-referral` | (smoke + fixme) `/refer` action surface gated; deeper vendor-cross-org case deferred |

Helper added: `e2e/helpers/concurrent.ts` (fireConcurrent for race specs).

The two `fixme` specs need vendor-session + private-role fixtures the harness doesn't yet seed; they're tracked so we can fill them in when the fixture work lands.

## Structure

```
e2e/
├── auth.setup.ts                  — Admin login → e2e/.auth/admin.json
├── global-setup.ts                — db:reset before suite
├── helpers/
│   ├── auth.ts                   — Login helper (used by setup only)
│   ├── lifecycle.ts              — Shared helpers (feedback, polling, automation)
│   └── tours.ts                  — Dismiss onboarding tour overlay
├── fixtures/
│   ├── resumes/                  — Resume files for candidate upload
│   └── jds/                      — JD files for role creation
├── tests/
│   ├── talent/
│   │   └── lifecycle.spec.ts     — Serial recruiter journey (all data flows)
│   ├── platform/
│   │   ├── platform.spec.ts      — Insights, schedule, today dashboard
│   │   ├── command-palette.spec.ts — Cmd+K search, navigation, AI query
│   │   ├── panel-synthesis.spec.ts — Panel health, feedback synthesis, AI prep
│   │   ├── livekit-features.spec.ts — Join button, room page, recording, proctoring
│   │   ├── in-interview-assessments.spec.ts — Assessment from pipeline
│   │   └── production-readiness.spec.ts — Smoke tests (no 500s, endpoints respond)
│   ├── settings/
│   │   └── settings.spec.ts      — Identity, departments, team
│   ├── portal/
│   │   ├── portal-journeys.spec.ts — Candidate portal navigation, coach, pipeline
│   │   └── interview-prep.spec.ts — Practice, mock interview, rapid fire modes
│   └── isolation/
│       └── multi-tenant.spec.ts  — Org scoping, cross-tenant leak prevention
```

## Playwright Config: 6 Projects

```
auth ─────────────┬── talent-lifecycle ──┬── platform
                  │                      ├── features
                  │                      └── isolation
                  ├── settings
                  └── production-readiness
portal-auth ──────┴── portal
```

## Coverage by Area

### Talent Lifecycle (1 spec, ~15 serial tests)

Single flow that creates all data and verifies all data flows:

| Phase | What it tests |
|---|---|
| 1. Open role | Create role → edit → intelligence populated → re-intake on edit |
| 2. Source candidates | Resume upload → profiling DAG → scores/predictions → pool creation |
| 3. Application & triage | Matching → add to pipeline → analysis/scores/stage badges |
| 4. Assessment | Create → verify appears in list |
| 5. Interview | Schedule → feedback → decision persists |
| 6. Offer & cascades | Create offer → verify in offers list |
| 7. Close & analytics | Close role → insights dashboard loads |
| 8. Dashboard & search | Today triage → candidate search |

### Platform (1 spec, ~3 tests)

| Area | Tests |
|---|---|
| Insights | Dashboard loads, analytics sections |
| Schedule | Page loads |
| Today | Dashboard loads, no errors |

### Settings (1 spec, ~3 tests)

| Area | Tests |
|---|---|
| Identity | Settings page loads |
| Departments | Department management |
| Team | Members list, invite button |

### Isolation (1 spec, ~5 tests)

| Test | What it verifies |
|---|---|
| List page scoping | All 6 entity pages load without cross-org errors |
| Org context | Nav shows org context |
| Detail pages | Maintain org context, no permission errors |
| Settings scoping | Members org-scoped |
| Insights | Dashboard org-scoped |

### Features (4 specs, ~16 tests)

| Spec | Tests | Covers videos |
|---|---|---|
| `command-palette.spec.ts` | 4 | #23 Ask AI / Cmd+K |
| `panel-synthesis.spec.ts` | 3 | #21 Panel Synthesis |
| `livekit-features.spec.ts` | 4 | #8-9, #11, #13-14 LiveKit/Proctoring |
| `in-interview-assessments.spec.ts` | 4 | #22 In-Interview Assessments |

### Portal Interview Prep (1 spec, ~5 tests)

| Test | Covers |
|---|---|
| Mode selector loads | Video #15-17 prep UI |
| Practice questions | Video #15 |
| Mock interview mode | Video #16 |
| Rapid fire mode | Video #17 |
| Past sessions | Session history |

### Production Readiness (1 spec, 5 tests)

Smoke tests: root redirect, auth API, critical talent pages, settings pages, console error check.

## Test Counts

| Area | Files | Tests | Type |
|---|---|---|---|
| Talent lifecycle | 1 | ~15 | Data flow (serial) |
| Platform | 1 | ~3 | Page load + data |
| Features | 4 | ~16 | Feature coverage |
| Portal interview prep | 1 | ~5 | Candidate prep flows |
| Settings | 1 | ~3 | Page load + interaction |
| Isolation | 1 | ~5 | Security/scoping |
| Production readiness | 1 | 5 | Smoke |
| **Total** | **10** | **~52** | |
