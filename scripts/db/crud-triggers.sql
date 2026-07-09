-- CRUD Triggers for coznt
-- Fires on INSERT/UPDATE/DELETE → pgmq message to coznt_events queue.
-- Each message contains: entityType, operation, entityId, organizationId, oldData, newData.

-- Ensure queue exists
SELECT pgmq.create_non_partitioned('coznt_events');

-- Generic trigger function
CREATE OR REPLACE FUNCTION coznt.emit_crud_event()
RETURNS TRIGGER AS $$
DECLARE
  entity_type TEXT;
  op TEXT;
  entity_id TEXT;
  org_id TEXT;
  old_data JSONB;
  new_data JSONB;
  user_id TEXT;
  user_name TEXT;
BEGIN
  entity_type := TG_ARGV[0];
  op := lower(TG_OP);

  IF op = 'delete' THEN
    entity_id := OLD.id;
    org_id := OLD.organization_id;
    old_data := to_jsonb(OLD);
    new_data := NULL;
    user_id := NULL;
    user_name := NULL;
  ELSIF op = 'insert' THEN
    entity_id := NEW.id;
    org_id := NEW.organization_id;
    old_data := NULL;
    new_data := to_jsonb(NEW);
    user_id := new_data->>'created_by_id';
    user_name := new_data->>'created_by_name';
  ELSE -- update
    entity_id := NEW.id;
    org_id := NEW.organization_id;
    old_data := to_jsonb(OLD);
    new_data := to_jsonb(NEW);
    user_id := new_data->>'updated_by_id';
    user_name := new_data->>'updated_by_name';
  END IF;

  PERFORM pgmq.send(
    'coznt_events',
    jsonb_build_object(
      'entityType', entity_type,
      'operation', op,
      'entityId', entity_id,
      'organizationId', org_id,
      'userId', user_id,
      'userName', user_name,
      'oldData', old_data,
      'newData', new_data
    )
  );

  PERFORM pg_notify('coznt_crud_events', jsonb_build_object(
    'entityType', entity_type,
    'operation', op,
    'entityId', entity_id,
    'organizationId', org_id
  )::text);

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Apply triggers to coznt entity tables.
-- Populate as SDLC entities land in src/db/schema/.
DO $$
DECLARE
  tbl RECORD;
  trigger_name TEXT;
BEGIN
  FOR tbl IN
    SELECT * FROM (VALUES
      ('project_learnings', 'projectLearning'),
      ('webhook_events', 'webhook_event'),
      ('work_items', 'work_item'),
      ('skill_outcomes', 'skill_outcome')
    ) AS t(table_name, entity_type)
  LOOP
    -- Skip tables that haven't been created yet (migration pending).
    -- Keeps the loop resilient as SDLC entities land in src/db/schema/.
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'coznt' AND c.relname = tbl.table_name AND c.relkind = 'r'
    ) THEN
      RAISE NOTICE 'Skipping CRUD trigger for missing table coznt.%', tbl.table_name;
      CONTINUE;
    END IF;

    trigger_name := 'trg_crud_' || tbl.table_name;

    EXECUTE format(
      'DROP TRIGGER IF EXISTS %I ON coznt.%I',
      trigger_name, tbl.table_name
    );

    EXECUTE format(
      'CREATE TRIGGER %I
       AFTER INSERT OR UPDATE OR DELETE ON coznt.%I
       FOR EACH ROW EXECUTE FUNCTION coznt.emit_crud_event(%L)',
      trigger_name, tbl.table_name, tbl.entity_type
    );
  END LOOP;
END $$;

-- ===================================================================
-- audit_logs hash chain — Milestone B
-- ===================================================================
-- BEFORE INSERT trigger that links each row to the previous row in its
-- org's chain. Concurrent inserts within an org serialize on a per-org
-- advisory lock so the chain remains linear; cross-org inserts run
-- independently.
--
-- Hash function:  row_hash := encode(digest(coalesce(prev_hash, '') ||
--                              canonical_field_concat, 'sha256'), 'hex')
--
-- Requires the `pgcrypto` extension (already installed by db-setup.ts
-- alongside vector and pgmq).

CREATE OR REPLACE FUNCTION coznt.audit_log_chain()
RETURNS TRIGGER AS $$
DECLARE
  prev TEXT;
  body TEXT;
BEGIN
  -- Per-org advisory lock; released at txn end. Keeps concurrent inserts
  -- within an org strictly serialized so the chain stays linear, while
  -- letting different orgs proceed in parallel.
  PERFORM pg_advisory_xact_lock(hashtext('audit_chain:' || NEW.organization_id));

  SELECT row_hash INTO prev
  FROM coznt.audit_logs
  WHERE organization_id = NEW.organization_id
    AND row_hash IS NOT NULL
  ORDER BY created_at DESC, id DESC
  LIMIT 1;

  -- Canonical concat — keep this stable; changing it invalidates every
  -- existing chain. Fields in alphabetical order, null → empty string,
  -- jsonb serialized via jsonb_strip_nulls + ::text for determinism.
  body := concat_ws('|',
    NEW.id,
    NEW.organization_id,
    NEW.actor_type,
    coalesce(NEW.actor_id, ''),
    coalesce(NEW.actor_name, ''),
    NEW.action,
    NEW.entity_type,
    NEW.entity_id,
    coalesce(NEW.summary, ''),
    coalesce((jsonb_strip_nulls(NEW.before))::text, ''),
    coalesce((jsonb_strip_nulls(NEW.after))::text, ''),
    coalesce(NEW.invoked_via, ''),
    -- created_at goes last; the trigger fires BEFORE INSERT so NEW.created_at
    -- has already been populated by the column default.
    NEW.created_at::text
  );

  NEW.prev_hash := prev;
  NEW.row_hash := encode(digest(coalesce(prev, '') || body, 'sha256'), 'hex');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_log_chain ON coznt.audit_logs;
CREATE TRIGGER trg_audit_log_chain
  BEFORE INSERT ON coznt.audit_logs
  FOR EACH ROW EXECUTE FUNCTION coznt.audit_log_chain();

-- One-time backfill: populate row_hash/prev_hash for rows inserted before
-- the trigger landed. Walks each org's history in created_at order.
DO $$
DECLARE
  r RECORD;
  prev TEXT;
  current_org TEXT := '';
  body TEXT;
  computed TEXT;
BEGIN
  FOR r IN
    SELECT * FROM coznt.audit_logs
    WHERE row_hash IS NULL
    ORDER BY organization_id, created_at, id
  LOOP
    IF r.organization_id <> current_org THEN
      current_org := r.organization_id;
      -- Pick up any already-hashed tail from the same org so the chain
      -- continues if a partial backfill ran before.
      SELECT row_hash INTO prev
      FROM coznt.audit_logs
      WHERE organization_id = current_org AND row_hash IS NOT NULL
      ORDER BY created_at DESC, id DESC
      LIMIT 1;
    END IF;

    body := concat_ws('|',
      r.id,
      r.organization_id,
      r.actor_type,
      coalesce(r.actor_id, ''),
      coalesce(r.actor_name, ''),
      r.action,
      r.entity_type,
      r.entity_id,
      coalesce(r.summary, ''),
      coalesce((jsonb_strip_nulls(r.before))::text, ''),
      coalesce((jsonb_strip_nulls(r.after))::text, ''),
      r.created_at::text
    );
    computed := encode(digest(coalesce(prev, '') || body, 'sha256'), 'hex');

    UPDATE coznt.audit_logs SET row_hash = computed, prev_hash = prev WHERE id = r.id;
    prev := computed;
  END LOOP;
END $$;
