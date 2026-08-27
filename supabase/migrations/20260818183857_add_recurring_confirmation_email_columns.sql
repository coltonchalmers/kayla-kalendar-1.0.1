/*
# Add recurring confirmation email columns

1. New Columns on `admin_settings`
- `email_recurring_confirmation_enabled` (boolean, default true) — toggle for the consolidated recurring-series confirmation email
- `email_recurring_confirmation_template` (text, nullable) — custom template body for the recurring confirmation email
- `email_recurring_confirmation_elements` (jsonb, nullable) — per-type element overrides (company_info, zoom, phone, google_calendar)

2. Notes
- All three columns are additive and nullable/defaulted so existing rows are unaffected.
- No new tables, no RLS changes.
*/

ALTER TABLE admin_settings
  ADD COLUMN IF NOT EXISTS email_recurring_confirmation_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_recurring_confirmation_template text,
  ADD COLUMN IF NOT EXISTS email_recurring_confirmation_elements jsonb;
