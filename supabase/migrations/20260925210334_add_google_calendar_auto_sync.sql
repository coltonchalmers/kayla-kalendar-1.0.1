/*
# Google Calendar Auto-Sync

## What this migration does

Adds automatic Google Calendar event creation for every confirmed booking.
Each admin independently connects their own Google account via OAuth and
toggles auto-sync on/off. Bookings are synced to the admin's Google Calendar
as real events. Reschedules update the event, cancellations delete it.
A cron-based sweep retries failed syncs (e.g. when Google was temporarily
down) without creating duplicate events or duplicate reminder emails.

## 1. New Table: google_calendar_connections

Stores per-admin Google OAuth tokens and connection state.

- `id` (uuid, primary key)
- `user_id` (uuid, NOT NULL, DEFAULT auth.uid()) — the admin who owns this connection
- `google_email` (text) — the connected Google account's email address
- `access_token` (text) — short-lived Google access token
- `refresh_token` (text) — long-lived token used to obtain new access tokens
- `token_expiry` (timestamptz) — when the access token expires
- `connected_at` (timestamptz) — when the admin first connected
- `disconnected_at` (timestamptz) — when the admin disconnected (null if still active)
- `last_sync_at` (timestamptz) — last time a sync was attempted for this connection
- `last_error` (text) — last sync error message (null if no error)
- `created_at` (timestamptz, default now)
- `updated_at` (timestamptz, default now)

Only one active connection per admin (enforced by partial unique index on
user_id WHERE disconnected_at IS NULL).

## 2. New Columns on bookings

- `google_event_id` (text) — the Google Calendar event ID for this booking.
  Null when no event has been created yet.
- `google_sync_status` (text, default 'pending') — one of:
  'pending' (needs sync), 'synced' (event created/updated), 'failed' (sync
  attempted but errored), 'not_connected' (admin has no active Google
  connection or auto-sync is off).

## 3. New Column on admin_settings

- `google_calendar_auto_sync` (boolean, default false) — per-admin toggle
  for automatic event creation on their Google Calendar.

## 4. Security (RLS)

- google_calendar_connections: owner-scoped CRUD (authenticated only).
  Each admin can only see and manage their own connection row.
  The edge function uses the service role key which bypasses RLS.

## 5. Cron Job

- `ping-google-calendar-sync` runs every 15 minutes, calling the
  google-calendar-sync edge function in sweep mode to retry any bookings
  with google_sync_status = 'pending' or 'failed'. This catches bookings
  that could not be synced immediately (e.g. Google temporarily down)
  without creating duplicates (sweep only creates events when
  google_event_id IS NULL and only updates/deletes when it is non-null).

## Important Notes

- This migration does NOT modify the existing email-based Google Calendar
  link feature. The "Include Google Calendar link in emails" toggle remains
  independent of the new auto-sync toggle.
- Calendar sync writes only to google_sync_status and google_event_id on
  the bookings table. It does NOT insert into notification_log with email
  types, so there is zero risk of duplicate reminder emails.
- If an admin's refresh token is permanently invalid (revoked access),
  their bookings are marked 'not_connected' and a reconnect warning is
  surfaced — no retry loop, no spam.
*/

-- ============================================================
-- 1. google_calendar_connections table
-- ============================================================

CREATE TABLE IF NOT EXISTS google_calendar_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  google_email text,
  access_token text,
  refresh_token text,
  token_expiry timestamptz,
  connected_at timestamptz DEFAULT now(),
  disconnected_at timestamptz,
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE google_calendar_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_gcal_connection" ON google_calendar_connections;
CREATE POLICY "select_own_gcal_connection" ON google_calendar_connections
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_gcal_connection" ON google_calendar_connections;
CREATE POLICY "insert_own_gcal_connection" ON google_calendar_connections
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_gcal_connection" ON google_calendar_connections;
CREATE POLICY "update_own_gcal_connection" ON google_calendar_connections
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_gcal_connection" ON google_calendar_connections;
CREATE POLICY "delete_own_gcal_connection" ON google_calendar_connections
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_gcal_conn_active_per_user
  ON google_calendar_connections(user_id)
  WHERE disconnected_at IS NULL;

-- ============================================================
-- 2. Booking columns for Google Calendar sync
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'google_event_id'
  ) THEN
    ALTER TABLE bookings ADD COLUMN google_event_id text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'google_sync_status'
  ) THEN
    ALTER TABLE bookings ADD COLUMN google_sync_status text NOT NULL DEFAULT 'pending';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_bookings_google_sync_status ON bookings(google_sync_status)
  WHERE google_sync_status IN ('pending', 'failed');

-- ============================================================
-- 3. admin_settings column for auto-sync toggle
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'admin_settings' AND column_name = 'google_calendar_auto_sync'
  ) THEN
    ALTER TABLE admin_settings ADD COLUMN google_calendar_auto_sync boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- ============================================================
-- 4. Cron job for sweep retry (every 15 minutes)
-- ============================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ping-google-calendar-sync') THEN
    PERFORM cron.unschedule('ping-google-calendar-sync');
  END IF;
END $$;

SELECT cron.schedule(
  'ping-google-calendar-sync',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://etqmkgomwbfxdwjoqjei.supabase.co/functions/v1/google-calendar-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV0cW1rZ29td2JmeGR3am9xamVpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5OTA0NzAsImV4cCI6MjEwMjU2NjQ3MH0.ocn0uaoLtY6vNN1xnodsYFf11gNPXSvRr5x6JagtkTM'
    ),
    body := jsonb_build_object('mode', 'sweep')
  );
  $$
);
