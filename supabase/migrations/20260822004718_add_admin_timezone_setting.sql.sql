/*
# Add Admin Timezone Setting

## Purpose
Adds a `timezone` column to `admin_settings` so the admin can explicitly set
their timezone. This is used by:
- Public booking pages to convert availability slots from admin time to client time
- Edge functions to format email times correctly and compute reminder timing
- The admin dashboard to display booking times in the admin's timezone

## New Columns on `admin_settings`
- `timezone` (text, default 'America/New_York') — IANA timezone string (e.g. 'America/New_York', 'Europe/London')

## Security
No new tables. No RLS changes. Only adds one column with a safe default.

## Notes
- The column defaults to 'America/New_York' so existing rows get a sensible value.
- The migration is idempotent — checks column existence before adding.
*/

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'admin_settings' AND column_name = 'timezone') THEN
    ALTER TABLE admin_settings ADD COLUMN timezone text NOT NULL DEFAULT 'America/New_York';
  END IF;
END $$;