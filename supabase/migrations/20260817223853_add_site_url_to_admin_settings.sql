/*
# Add site_url column to admin_settings

1. Changes
- Adds `site_url` (text, nullable) to `admin_settings`.
- This stores the public-facing URL of the app (e.g. https://myapp.bolt.host)
  so that server-side processes like the pg_cron reminder job can build
  correct "Manage your booking" links without a browser context.
- The frontend always sends its own window.location.origin in email
  trigger requests, which takes priority. This column is the fallback
  for server-side-only triggers (cron jobs).
2. Security
- No RLS changes. admin_settings already has existing policies.
*/

ALTER TABLE admin_settings
  ADD COLUMN IF NOT EXISTS site_url text;
