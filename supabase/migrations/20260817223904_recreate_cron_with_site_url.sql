/*
# Recreate ping-send-reminders cron job with site_url in request body

1. Changes
- Unschedule the old ping-send-reminders job (already removed).
- Recreate it with the same schedule (every 15 minutes).
- The request body now includes a `siteUrl` field populated from
  `admin_settings.site_url`, so the send-reminders edge function can
  build correct "Manage your booking" links in reminder emails.
- Falls back to the PUBLIC_SITE_URL env var inside the edge function
  if site_url is null.
2. Security
- No RLS changes. Uses the anon key JWT already used by the previous job.
*/

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
    body := (SELECT COALESCE(
      jsonb_build_object('siteUrl', site_url),
      '{}'::jsonb
    ) FROM admin_settings LIMIT 1)
  );
  $$
);
