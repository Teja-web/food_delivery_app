-- Phase 1 of vendor-and-attribution-plan.md
-- Backfill org_candidates from candidates.organization_id so that
-- org_candidates becomes the single source of truth for "who can see this person."
--
-- Idempotent: relies on the existing UNIQUE (organization_id, candidate_id)
-- constraint to no-op rows that already exist.
--
-- MUST run BEFORE the code switch deploys. The verification SELECT at the
-- bottom must return 0 rows. If non-zero, re-run before deploy.
--
-- Excludes:
--   - Rows where candidates.organization_id IS NULL (portal-only candidates,
--     correct after the column-nullable change).
--   - Rows where candidates.organization_id = 'platform' (the PLATFORM_ORG_ID
--     sentinel — those candidates intentionally have no owning org yet; they
--     will be adopted in Phase 2 when promotion is removed).

INSERT INTO dilliznt.org_candidates (id, organization_id, candidate_id, added_at, added_by_id, added_by_name, added_by_org_id, source, status)
SELECT
  -- 21-char nanoid-shaped id; collision-safe enough for a one-time backfill.
  -- If the project's nanoid alphabet matters, regenerate via a script instead.
  substr(replace(gen_random_uuid()::text, '-', ''), 1, 21),
  c.organization_id,
  c.id,
  c.created_at,
  c.created_by_id,
  c.created_by_name,
  NULL,                  -- backfilled rows are "internal / unknown" by definition
  c.source,              -- carry forward the original channel as the pool source
  'active'
FROM dilliznt.candidates c
WHERE c.organization_id IS NOT NULL
  AND c.organization_id <> 'platform'
ON CONFLICT (organization_id, candidate_id) DO NOTHING;

-- Verification gate. Must return missing = 0.
SELECT COUNT(*) AS missing
FROM dilliznt.candidates c
WHERE c.organization_id IS NOT NULL
  AND c.organization_id <> 'platform'
  AND NOT EXISTS (
    SELECT 1
    FROM dilliznt.org_candidates oc
    WHERE oc.candidate_id = c.id
      AND oc.organization_id = c.organization_id
  );
