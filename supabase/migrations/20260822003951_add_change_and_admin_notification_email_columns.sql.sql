/*
# Add Change Email and Admin Change Notification Email Columns

## Purpose
Adds new columns to `admin_settings` to support:
1. A "Booking Changed" email type — sent to clients when an admin edits their booking details (Zoom link, notes, etc.) instead of sending a generic confirmation.
2. An "Admin Change Notification" email type — sent to the admin when a client reschedules or cancels their own booking.

## New Columns on `admin_settings`
- `email_change_enabled` (boolean, default true) — toggle for the client-facing "booking changed" email
- `email_change_template` (text, nullable) — custom template for the change email
- `email_change_elements` (jsonb, nullable) — per-email element overrides (company_info, zoom, phone, google_calendar)
- `email_admin_change_enabled` (boolean, default true) — toggle for admin notifications when clients make changes
- `email_admin_change_template` (text, nullable) — custom template for the admin change notification email

## Security
No new tables. No RLS changes. Only adds nullable columns with defaults to an existing table.

## Notes
- All columns are nullable or have safe defaults so existing rows are unaffected.
- The migration is idempotent — uses DO $$ blocks to check column existence before adding.
*/

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'admin_settings' AND column_name = 'email_change_enabled') THEN
    ALTER TABLE admin_settings ADD COLUMN email_change_enabled boolean NOT NULL DEFAULT true;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'admin_settings' AND column_name = 'email_change_template') THEN
    ALTER TABLE admin_settings ADD COLUMN email_change_template text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'admin_settings' AND column_name = 'email_change_elements') THEN
    ALTER TABLE admin_settings ADD COLUMN email_change_elements jsonb;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'admin_settings' AND column_name = 'email_admin_change_enabled') THEN
    ALTER TABLE admin_settings ADD COLUMN email_admin_change_enabled boolean NOT NULL DEFAULT true;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'admin_settings' AND column_name = 'email_admin_change_template') THEN
    ALTER TABLE admin_settings ADD COLUMN email_admin_change_template text;
  END IF;
END $$;