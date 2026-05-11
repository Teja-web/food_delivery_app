-- CRUD Triggers for Recruit
-- Fires on INSERT/UPDATE/DELETE → pgmq message to recruit_events queue.
-- Each message contains: entityType, operation, entityId, organizationId, oldData, newData.

-- Ensure queue exists
SELECT pgmq.create_non_partitioned('recruit_events');

-- Generic trigger function
CREATE OR REPLACE FUNCTION dilliznt.emit_crud_event()
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
  -- Derive entity type from table name
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
    -- Use jsonb lookup so tables without audit columns don't error
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

  -- Send to pgmq (worker consumption)
  PERFORM pgmq.send(
    'recruit_events',
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

  -- Notify for SSE (lightweight, no payload bloat)
  PERFORM pg_notify('recruit_crud_events', jsonb_build_object(
    'entityType', entity_type,
    'operation', op,
    'entityId', entity_id,
    'organizationId', org_id
  )::text);

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Apply triggers to all dilliznt entity tables
DO $$
DECLARE
  tbl RECORD;
  trigger_name TEXT;
BEGIN
  FOR tbl IN
    SELECT * FROM (VALUES
      ('candidates', 'candidate'),
      ('roles', 'role'),
      ('applications', 'application'),
      ('interviews', 'interview'),
      ('interview_scorecards', 'scorecard'),
      ('offers', 'offer'),
      ('pools', 'pool'),
      ('pool_members', 'pool_member'),
      ('assessments', 'assessment'),
      ('assessment_attempts', 'assessmentAttempt'),
      ('engagements', 'engagement'),
      ('triage_items', 'triageItem'),
      ('matches', 'match'),
      ('interview_intelligence', 'interviewIntelligence'),
      ('entity_notes', 'entityNote')
    ) AS t(table_name, entity_type)
  LOOP
    trigger_name := 'trg_crud_' || tbl.table_name;

    EXECUTE format(
      'DROP TRIGGER IF EXISTS %I ON dilliznt.%I',
      trigger_name, tbl.table_name
    );

    EXECUTE format(
      'CREATE TRIGGER %I
       AFTER INSERT OR UPDATE OR DELETE ON dilliznt.%I
       FOR EACH ROW EXECUTE FUNCTION dilliznt.emit_crud_event(%L)',
      trigger_name, tbl.table_name, tbl.entity_type
    );
  END LOOP;
END $$;
