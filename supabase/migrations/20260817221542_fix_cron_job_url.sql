/*
# Fix cron job URL to point to the correct Supabase project

## Summary
The existing ping-send-reminders cron job was pointing at a different Supabase
project URL (fddcjmvhzqyiyolthplp.supabase.co) with that project's anon key.
This updates it to the correct project URL (etqmkgomwbfxdwjoqjei.supabase.co)
with this project's anon key so scheduled reminders actually reach the
send-reminders edge function deployed on this project.

## Security
- No RLS policy changes.
- The cron job uses the anon key, which is safe because the reminder function
  only reads data and sends emails (idempotent, dedupes via notification_log).

## Important Notes
1. The job is unscheduled and rescheduled to ensure the URL and key are updated.
2. Schedule remains every 15 minutes.
*/

DO $$
BEGIN
  PERFORM cron.unschedule('ping-send-reminders');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'ping-send-reminders',
  '*/15 * * * *',
  $$
    SELECT net.http_post(
      url := 'https://etqmkgomwbfxdwjoqjei.supabase.co/functions/v1/send-reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV0cW1rZ29td2JmeGR3am9xamVpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5OTA0NzAsImV4cCI6MjEwMjU2NjQ3MH0.ocn0uaoLtY6vNN1xnodsYrF11gNPXSvRr5x6JagtkTM'
      ),
      body := '{}'::jsonb
    );
  $$
);