# Strip plan: recruit-specific code

Generated before stripping recruit's domain so the deletions are reviewable. Everything classified `delete` is gone after the strip commit; everything in `keep` survives.

## src/db/schema/ — 27 files

**keep (infrastructure):** `auth.ts`, `automation-log.ts`, `documents.ts`, `entity-notes.ts`, `index.ts` (edit), `integrations.ts`, `intelligence.ts`, `organization.ts`, `rate-limits.ts`, `relations.ts` (edit), `schema.ts`

**delete (recruit business):** `applications.ts`, `assessments.ts`, `campus.ts`, `candidate-nudges.ts`, `candidates.ts`, `engagements.ts`, `interviews.ts`, `matches.ts`, `mock-sessions.ts`, `offers.ts`, `pools.ts`, `referrals.ts`, `roles.ts`, `tours.ts`, `triage-items.ts`, `vendor.ts`, `voice.ts`

## src/operations/ — 19 files

**keep:** `intelligence.ts`, `organization.ts`, `schemas.ts` (audit later), `entity-activity.ts`

**delete:** `applications.ts`, `assessments.ts`, `campus.ts`, `candidates.ts`, `career-paths.ts`, `insights.ts`, `interviews.ts`, `livekit.ts`, `offers.ts`, `pools.ts`, `portal.ts`, `public.ts`, `referrals.ts`, `roles.ts`, `triage-items.ts`, `vendor-partnerships.ts`

## src/actions/ — 27 files

**keep:** `auth.ts`, `entity-notes.ts`, `integrations.ts`, `members.ts`, `org-identity.ts`, `org-public-profile.ts`, `search.ts`, `team.ts`

**delete:** `assessments.ts`, `calendar.ts`, `campus.ts`, `candidates.ts`, `compare.ts`, `departments.ts`, `insights.ts`, `interviews.ts`, `leads.ts`, `livekit.ts`, `offers.ts`, `pipeline.ts`, `pools.ts`, `portal.ts`, `referrals.ts`, `roles.ts`, `tours.ts`, `triage.ts`, `vendor-partnerships.ts`

## src/automations/

**delete entirely:** `analyzers/`, `tasks/`, `agents/definitions/`, `agents/prompts/` (33 files)

Dirs themselves remain (placeholders for SDLC tasks/agents).

## src/domain/

**delete entire tree:** `portal/`, `search/`, `scoring/` (recruit-specific)

## src/lib/

**keep:** `ai/`, `anonymize/`, `auth/`, `auth-client.ts`, `constants.ts` (audit later), `crud.ts`, `db-errors.ts`, `email/`, `embedding.ts`, `error-notifier.ts`, `events/`, `execution-log.ts`, `integrations/`, `logger.ts`, `markitdown.ts`, `org-context.ts`, `queue.ts`, `rate-limit.ts`, `rules.ts`, `safe-revalidate.ts`, `search/`, `sql/`, `storage.ts`, `utils.ts`, `worker.ts`

**delete:** `format-compensation.ts`, `pipeline-stage.ts`, `vendor/`, `yjs-livekit-provider.ts`

## src/components/

**keep:** `ui/` (shadcn), `shared/`, `empty-state.tsx`

**delete:** `assessments/`, `emails/` (recruit email templates — rebuild later), `livekit/`, `portal/`, `tours/`, `TriageItem.tsx`

## src/app/

**keep:** `layout.tsx`, `globals.css`, `robots.ts`, `sitemap.ts`, `auth/`, `accept-invitation/`, `storage/`, `api/auth/`, `api/events/`

**delete:** `(livekit)/`, `(marketing)/`, `(portal)/`, `campus/`, `opportunities/`, `portal/`, `r/`, `recruit/`, `vendor/`, `api/hris/`, `api/calendar/`, `api/opportunities/`, `api/campus/`, `api/coach/`, `api/public/`, `api/voice/`, `api/ai/` (rebuild), `api/ats/`, `api/interviews/`, `api/transcribe/`, `api/email/`

## src/hooks/, src/workers/, src/tours/

**keep:** `src/hooks/use-entity-event.tsx` (SSE listener — generic), `src/workers/` (audit later)

**delete:** `src/tours/` (recruit-specific tour content)

## tests/, e2e/

**delete:** all of `tests/anonymize-*.test.ts`, all of `e2e/tests/*` (recruit flows). Keep `e2e/auth.setup.ts`, `e2e/global-setup.ts`, `e2e/fixtures/`, `e2e/helpers/`, `e2e/tsconfig.json`, `e2e/COVERAGE.md` (audit).

## docs/

**keep:** `architecture.md`, `strip-plan.md` (this file)

**delete:** `assessment-exercises.md`, `candidate-flow-and-future-modules.md`, `migrations/`, `presentation/`, `PRODUCT_STORY.md`, `reviews/`, `validation-28feaee.md`
