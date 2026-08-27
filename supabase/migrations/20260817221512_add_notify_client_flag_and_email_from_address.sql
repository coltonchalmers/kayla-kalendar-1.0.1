/*
# Add missing notify_client_on_admin_change column and email_from_address column

## Summary
1. Adds `notify_client_on_admin_change` (boolean) to admin_settings. This column
   is already referenced by the frontend (SettingsPage, BookingDetailsModal) and
   types.ts but was never created in the database, causing every settings update
   to fail silently — which is why the contact email and other fields go blank
   after switching tabs.
2. Adds `email_from_address` (text) to admin_settings so the admin can configure
   the "from" email address used for outgoing booking emails, adjustable from
   the Settings page. Defaults to 'lindsey@jungosolutions.com' for existing rows.

## New Columns
- admin_settings.notify_client_on_admin_change (boolean, default false): controls
  whether clients are notified by default when an admin edits their booking.
- admin_settings.email_from_address (text, nullable): the email address outgoing
  booking emails are sent from.

## Security
- No RLS policy changes.

## Important Notes
1. Both columns use IF NOT EXISTS guards so the migration is safe to re-run.
2. The email_from_address is backfilled with a default for the existing row so
   the email function has a valid sender immediately.
*/

DO $$ BEGIN
  ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS notify_client_on_admin_change boolean NOT NULL DEFAULT false;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS email_from_address text;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

UPDATE admin_settings
SET email_from_address = COALESCE(email_from_address, 'lindsey@jungosolutions.com')
WHERE email_from_address IS NULL;