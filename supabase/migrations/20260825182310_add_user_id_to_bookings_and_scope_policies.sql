/*
# Separate all admin portal sections per user

## What this migration does

This migration adds per-user isolation to the bookings, booking_changes, and
notification_log tables, and fixes the RLS policies on admin_settings,
availability_rules, availability_overrides, bookings, booking_changes, and
notification_log so each authenticated admin user only sees and manages their
own data. Public (anon) access is preserved for the public booking pages.

## Changes

### 1. New columns

- `bookings.user_id` (uuid, NOT NULL, DEFAULT auth.uid()) — links each booking
  to the admin who owns it. Existing bookings are backfilled to the first admin
  user (lindsey@jungosolutions.com) so no data is lost.
- `booking_changes.user_id` (uuid, NOT NULL, DEFAULT auth.uid()) — links each
  audit record to the booking's owner. Existing records are backfilled to the
  first admin user.
- `notification_log.user_id` (uuid, NOT NULL, DEFAULT auth.uid()) — links each
  email/notification log entry to the booking's owner. Existing records are
  backfilled to the first admin user.
- `admin_settings.user_id` — add DEFAULT auth.uid() so new settings rows are
  automatically owned by the logged-in user (the column already exists but has
  no default).

### 2. Backfill

All existing bookings, booking_changes, and notification_log rows get
user_id = 'c036fd1e-875a-4c67-8469-ccb2575331d5' (lindsey@jungosolutions.com,
the first admin user), so current data is preserved and visible to the
original admin.

### 3. Indexes

- `idx_bookings_user_id` on bookings(user_id) for faster per-user queries.
- `idx_booking_changes_user_id` on booking_changes(user_id).
- `idx_notification_log_user_id` on notification_log(user_id).

### 4. RLS policy changes

**admin_settings:**
- SELECT for anon/authenticated: now scoped to `user_id = auth.uid()` for
  authenticated users, but anon still gets all rows (public booking pages need
  to read settings by user_id via a filter).
- Actually, to support public booking pages, anon SELECT remains `USING (true)`
  but authenticated SELECT is scoped to own row.
- INSERT/UPDATE/DELETE already scoped to auth.uid() = user_id — unchanged.

**availability_rules & availability_overrides:**
- SELECT for anon remains `USING (true)` (public pages need to read
  availability by user_id).
- SELECT for authenticated is now scoped to `auth.uid() = user_id`.
- INSERT/UPDATE/DELETE already scoped — unchanged.

**bookings:**
- SELECT for anon: `USING (status = 'confirmed')` — unchanged (public pages
  need to see confirmed bookings for slot generation).
- SELECT for authenticated: `USING (auth.uid() = user_id)` — each admin sees
  only their own bookings.
- INSERT for anon: `WITH CHECK (true)` — unchanged (public bookings create
  rows; user_id defaults to the meeting_type/link owner via the frontend).
- INSERT for authenticated: `WITH CHECK (auth.uid() = user_id)`.
- UPDATE for authenticated: `USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)`.
- DELETE for authenticated: `USING (auth.uid() = user_id)`.

**booking_changes:**
- SELECT for authenticated: `USING (auth.uid() = user_id)` — each admin sees
  only their own booking history.
- INSERT: `WITH CHECK (auth.uid() = user_id)` — ensures audit records are
  created by the owner.

**notification_log:**
- SELECT for authenticated: `USING (auth.uid() = user_id)`.
- INSERT for anon: `WITH CHECK (true)` — unchanged (edge function inserts
  using service role key which bypasses RLS).
- DELETE for authenticated: `USING (auth.uid() = user_id)`.
- UPDATE for authenticated: `USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)`.
*/

-- ============================================================
-- Step 1: Add user_id columns with DEFAULT auth.uid()
-- ============================================================

-- bookings.user_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE bookings ADD COLUMN user_id uuid;
  END IF;
END $$;

-- Backfill existing bookings to the first admin user
UPDATE bookings SET user_id = 'c036fd1e-875a-4c67-8469-ccb2575331d5' WHERE user_id IS NULL;

-- Now set NOT NULL and default
ALTER TABLE bookings ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE bookings ALTER COLUMN user_id SET DEFAULT auth.uid();

-- booking_changes.user_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'booking_changes' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE booking_changes ADD COLUMN user_id uuid;
  END IF;
END $$;

-- Backfill existing booking_changes to the first admin user
UPDATE booking_changes SET user_id = 'c036fd1e-875a-4c67-8469-ccb2575331d5' WHERE user_id IS NULL;

ALTER TABLE booking_changes ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE booking_changes ALTER COLUMN user_id SET DEFAULT auth.uid();

-- notification_log.user_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'notification_log' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE notification_log ADD COLUMN user_id uuid;
  END IF;
END $$;

-- Backfill existing notification_log to the first admin user
UPDATE notification_log SET user_id = 'c036fd1e-875a-4c67-8469-ccb2575331d5' WHERE user_id IS NULL;

ALTER TABLE notification_log ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE notification_log ALTER COLUMN user_id SET DEFAULT auth.uid();

-- admin_settings.user_id: add default
ALTER TABLE admin_settings ALTER COLUMN user_id SET DEFAULT auth.uid();

-- ============================================================
-- Step 2: Add indexes for per-user queries
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_booking_changes_user_id ON booking_changes(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_log_user_id ON notification_log(user_id);

-- ============================================================
-- Step 3: Fix RLS policies
-- ============================================================

-- ---- admin_settings ----
-- Anon SELECT stays open (public booking pages read settings by user_id filter)
-- Authenticated SELECT now scoped to own row
DROP POLICY IF EXISTS "anon_select_settings" ON admin_settings;
DROP POLICY IF EXISTS "auth_select_settings" ON admin_settings;
CREATE POLICY "anon_select_settings" ON admin_settings FOR SELECT
  TO anon USING (true);
CREATE POLICY "auth_select_settings" ON admin_settings FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

-- ---- availability_rules ----
-- Anon SELECT stays open (public booking pages read availability by user_id filter)
-- Authenticated SELECT now scoped to own rows
DROP POLICY IF EXISTS "anon_select_availability" ON availability_rules;
DROP POLICY IF EXISTS "auth_select_availability" ON availability_rules;
CREATE POLICY "anon_select_availability" ON availability_rules FOR SELECT
  TO anon USING (true);
CREATE POLICY "auth_select_availability" ON availability_rules FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

-- ---- availability_overrides ----
DROP POLICY IF EXISTS "anon_select_overrides" ON availability_overrides;
DROP POLICY IF EXISTS "auth_select_overrides" ON availability_overrides;
CREATE POLICY "anon_select_overrides" ON availability_overrides FOR SELECT
  TO anon USING (true);
CREATE POLICY "auth_select_overrides" ON availability_overrides FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

-- ---- bookings ----
-- Drop all existing policies and recreate with proper scoping
DROP POLICY IF EXISTS "anon_select_bookings_for_slots" ON bookings;
DROP POLICY IF EXISTS "auth_select_bookings" ON bookings;
DROP POLICY IF EXISTS "anon_insert_bookings" ON bookings;
DROP POLICY IF EXISTS "auth_update_bookings" ON bookings;
DROP POLICY IF EXISTS "auth_delete_bookings" ON bookings;

-- Anon can see confirmed bookings (for slot generation on public pages)
CREATE POLICY "anon_select_bookings_for_slots" ON bookings FOR SELECT
  TO anon USING (status = 'confirmed');

-- Authenticated users see only their own bookings
CREATE POLICY "auth_select_bookings" ON bookings FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

-- Anon can insert (public bookings; user_id is set by the frontend to the link owner)
CREATE POLICY "anon_insert_bookings" ON bookings FOR INSERT
  TO anon WITH CHECK (true);

-- Authenticated users can insert their own bookings
CREATE POLICY "auth_insert_bookings" ON bookings FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

-- Authenticated users can update only their own bookings
CREATE POLICY "auth_update_bookings" ON bookings FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Authenticated users can delete only their own bookings
CREATE POLICY "auth_delete_bookings" ON bookings FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ---- booking_changes ----
DROP POLICY IF EXISTS "auth_select_booking_changes" ON booking_changes;
DROP POLICY IF EXISTS "auth_insert_booking_changes" ON booking_changes;

-- Authenticated users see only their own booking changes
CREATE POLICY "auth_select_booking_changes" ON booking_changes FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

-- Authenticated users can insert booking changes for their own bookings
CREATE POLICY "auth_insert_booking_changes" ON booking_changes FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

-- ---- notification_log ----
DROP POLICY IF EXISTS "auth_select_notifications" ON notification_log;
DROP POLICY IF EXISTS "auth_delete_notifications" ON notification_log;
DROP POLICY IF EXISTS "auth_update_notifications" ON notification_log;
DROP POLICY IF EXISTS "anon_insert_notifications" ON notification_log;

-- Anon can insert notification log entries (edge function uses service role, but keep for safety)
CREATE POLICY "anon_insert_notifications" ON notification_log FOR INSERT
  TO anon WITH CHECK (true);

-- Authenticated users see only their own notification logs
CREATE POLICY "auth_select_notifications" ON notification_log FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

-- Authenticated users can update only their own notification logs
CREATE POLICY "auth_update_notifications" ON notification_log FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Authenticated users can delete only their own notification logs
CREATE POLICY "auth_delete_notifications" ON notification_log FOR DELETE
  TO authenticated USING (auth.uid() = user_id);
