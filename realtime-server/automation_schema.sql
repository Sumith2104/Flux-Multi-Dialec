-- 1. Create a template function that we can copy into new schemas
CREATE OR REPLACE FUNCTION public.install_realtime_logic(target_schema TEXT)
RETURNS VOID AS $$
BEGIN
    EXECUTE format('
        CREATE OR REPLACE FUNCTION %I.notify_realtime_event()
        RETURNS trigger AS $inner$
        DECLARE
          payload JSON;
          row_data RECORD;
        BEGIN
          IF TG_OP = ''DELETE'' THEN
            row_data := OLD;
          ELSE
            row_data := NEW;
          END IF;

          payload := json_build_object(
            ''table'', TG_TABLE_NAME,
            ''project_id'', (CASE WHEN %L = ''fluxbase_global'' THEN ''global'' ELSE REPLACE(%L, ''project_'', '''') END),
            ''action'', TG_OP,
            ''record'', row_to_json(row_data)
          );

          PERFORM pg_notify(''flux_realtime'', payload::text);
          RETURN row_data;
        END;
        $inner$ LANGUAGE plpgsql;', target_schema, target_schema, target_schema);
END;
$$ LANGUAGE plpgsql;

-- 2. The Watchdog that fires when a table is created
CREATE OR REPLACE FUNCTION public.auto_retrofit_realtime()
RETURNS event_trigger AS $$
DECLARE
    obj record;
    target_table text;
    target_schema text;
BEGIN
    FOR obj IN SELECT * FROM pg_event_trigger_ddl_commands() WHERE command_tag = 'CREATE TABLE'
    LOOP
        -- Retrieve the table name accurately using its OID
        target_table := (SELECT relname FROM pg_class WHERE oid = obj.objid);
        target_schema := obj.schema_name;

        -- Only target project schemas or global AI schema
        IF target_schema LIKE 'project_%' OR target_schema = 'fluxbase_global' THEN
            -- Ensure the RT function exists in this schema
            PERFORM public.install_realtime_logic(target_schema);

            -- Attach the trigger to the NEW table
            EXECUTE format('
                DROP TRIGGER IF EXISTS %I_ws_trigger ON %I.%I;
                CREATE TRIGGER %I_ws_trigger
                AFTER INSERT OR UPDATE OR DELETE
                ON %I.%I
                FOR EACH ROW
                EXECUTE FUNCTION %I.notify_realtime_event();',
                target_table, target_schema, target_table, 
                target_table, target_schema, target_table, 
                target_schema
            );
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 3. Register the event trigger
DROP EVENT TRIGGER IF EXISTS register_realtime_watchdog;
CREATE EVENT TRIGGER register_realtime_watchdog
ON ddl_command_end
WHEN TAG IN ('CREATE TABLE')
EXECUTE FUNCTION public.auto_retrofit_realtime();
