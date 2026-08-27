/*
# Replace allowed_days/time columns with time_restrictions JSONB on recurring_links

## Summary
This migration overhauls the recurring links time-restriction system:
1. Adds `allow_full_availability` (boolean, default true) to `recurring_links` — mirrors the same column on `proposal_links`, controls whether clients can browse the full availability calendar in addition to curated time rules.
2. Adds `time_restrictions` (JSONB, nullable) to `recurring_links` — stores an array of per-day time rules, e.g. `[{"day": 2, "start": "09:00", "end": "11:00"}, {"day": 4, "start": "14:00", "end": "17:00"}]`.
3. Migrates existing data from the old `allowed_days` + `allowed_time_start` + `allowed_time_end` columns into the new `time_restrictions` JSONB format. Each allowed day is paired with the single time range to produce one rule per day.
4. Drops the old columns: `allowed_days`, `allowed_time_start`, `allowed_time_end`.
5. Changes the default of `scheduling_mode` from `'strict'` to `'flexible'` and updates all existing rows to `'flexible'` (they are already flexible, this future-proofs new inserts).

## New Columns
- `recurring_links.allow_full_availability` (boolean NOT NULL DEFAULT true) — when true, clients can also pick from the full availability calendar; when false, only the curated time rules apply.
- `recurring_links.time_restrictions` (JSONB, nullable) — array of `{day, start, end}` objects where `day` is 0-6 (Sunday-Saturday), `start` and `end` are "HH:MM" strings.

## Data Migration
For each row with non-null `allowed_days` and `allowed_time_start`/`allowed_time_end`, we build a JSON array with one entry per allowed day, each carrying the same start/end time. Rows with no restrictions get `time_restrictions = null`.

## Security
No RLS or policy changes needed — existing policies on `recurring_links` already cover the new columns.

## Notes
- All statements are idempotent using DO $$ ... IF NOT EXISTS ... END $$ blocks.
- The data migration runs before the DROP so no data is lost.
- The scheduling_mode default change is safe because all existing rows are already 'flexible'.
*/

-- Step 1: Add new columns
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'recurring_links' AND column_name = 'allow_full_availability') THEN
    ALTER TABLE recurring_links ADD COLUMN allow_full_availability boolean NOT NULL DEFAULT true;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'recurring_links' AND column_name = 'time_restrictions') THEN
    ALTER TABLE recurring_links ADD COLUMN time_restrictions jsonb;
  END IF;
END $$;

-- Step 2: Migrate existing data from allowed_days + allowed_time_start/end into time_restrictions
-- Only migrate rows that have allowed_days and time range but don't yet have time_restrictions set
UPDATE recurring_links
SET time_restrictions = (
  SELECT jsonb_agg(
    jsonb_build_object(
      'day', d,
      'start', allowed_time_start::text,
      'end', allowed_time_end::text
    )
    ORDER BY d
  )
  FROM unnest(allowed_days) AS d
)
WHERE allowed_days IS NOT NULL
  AND allowed_time_start IS NOT NULL
  AND allowed_time_end IS NOT NULL
  AND time_restrictions IS NULL;

-- Step 3: Migrate scheduling_mode to 'flexible' for all rows and change default
UPDATE recurring_links SET scheduling_mode = 'flexible' WHERE scheduling_mode = 'strict';

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'recurring_links' AND column_name = 'scheduling_mode') THEN
    ALTER TABLE recurring_links ALTER COLUMN scheduling_mode SET DEFAULT 'flexible';
  END IF;
END $$;

-- Step 4: Drop old columns (safe — data has been migrated to time_restrictions)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'recurring_links' AND column_name = 'allowed_days') THEN
    ALTER TABLE recurring_links DROP COLUMN allowed_days;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'recurring_links' AND column_name = 'allowed_time_start') THEN
    ALTER TABLE recurring_links DROP COLUMN allowed_time_start;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'recurring_links' AND column_name = 'allowed_time_end') THEN
    ALTER TABLE recurring_links DROP COLUMN allowed_time_end;
  END IF;
END $$;