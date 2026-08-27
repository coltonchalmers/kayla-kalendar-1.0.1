/*
# Add slot increment setting

1. Modified Tables
- `admin_settings`
  - Add `slot_increment_minutes` (integer, default 15) — controls how far apart
    time slots are spaced on the client-facing booking calendar.
    Common values: 5, 10, 15, 20, 30, 60.

2. Security
- No changes to RLS or policies. The existing anon SELECT policy on
  admin_settings already allows the public booking page to read this value.
*/

ALTER TABLE admin_settings
ADD COLUMN IF NOT EXISTS slot_increment_minutes integer NOT NULL DEFAULT 15;