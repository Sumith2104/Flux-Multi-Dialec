-- Run this on your AWS RDS Database

CREATE OR REPLACE FUNCTION notify_realtime_event() 
RETURNS TRIGGER AS $$
DECLARE
  payload JSON;
BEGIN
  -- Build a robust JSON envelope containing the impacted table name, operation, and full row body
  payload = json_build_object(
    'table', TG_TABLE_NAME,
    'action', TG_OP,
    'record', row_to_json(NEW)
  );

  -- Broadcast it to the global 'flux_realtime' Postgres tunnel
  PERFORM PG_NOTIFY('flux_realtime', payload::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach the trigger to your primary targets where Realtime matters
DROP TRIGGER IF EXISTS trigger_agent_memories_notify ON fluxbase_global.agent_memories;
CREATE TRIGGER trigger_agent_memories_notify
AFTER INSERT OR UPDATE ON fluxbase_global.agent_memories
FOR EACH ROW EXECUTE FUNCTION notify_realtime_event();

DROP TRIGGER IF EXISTS trigger_agent_sessions_notify ON fluxbase_global.agent_sessions;
CREATE TRIGGER trigger_agent_sessions_notify
AFTER INSERT OR UPDATE ON fluxbase_global.agent_sessions
FOR EACH ROW EXECUTE FUNCTION notify_realtime_event();

DROP TRIGGER IF EXISTS trigger_agent_plans_notify ON fluxbase_global.agent_plans;
CREATE TRIGGER trigger_agent_plans_notify
AFTER INSERT OR UPDATE ON fluxbase_global.agent_plans
FOR EACH ROW EXECUTE FUNCTION notify_realtime_event();
