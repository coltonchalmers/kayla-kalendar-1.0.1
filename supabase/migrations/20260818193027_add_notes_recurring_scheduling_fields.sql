/*
# Add three-tier notes to bookings + scheduling controls to recurring_links

## bookings
- Rename `notes` -> `client_notes` (notes the client enters on the intake form)
- Add `internal_notes` (text, nullable) — admin-only, never shown to clients
- Add `notes_to_client` (text, nullable) — admin-to-client notes, shown in emails + manage page

## recurring_links
- Add `scheduling_mode` (text: 'strict' | 'flexible', default 'strict')
- Add `allowed_days` (integer[], nullable) — day-of-week numbers the client can book (0=Sun..6=Sat)
- Add `allowed_time_start` (time, nullable) — earliest time the client can book
- Add `allowed_time_end` (time, nullable) — latest time the client can book
- Add `notes_to_client` (text, nullable) — carried into each booking + invite email
- Extend frequency CHECK to include 'daily'
*/

-- Rename notes -> client_notes on bookings
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'notes'
  ) THEN
    ALTER TABLE bookings RENAME COLUMN notes TO client_notes;
  END IF;
END $$;

-- Add internal_notes and notes_to_client to bookings
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'internal_notes'
  ) THEN
    ALTER TABLE bookings ADD COLUMN internal_notes text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'notes_to_client'
  ) THEN
    ALTER TABLE bookings ADD COLUMN notes_to_client text;
  END IF;
END $$;

-- Add scheduling_mode to recurring_links
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'recurring_links' AND column_name = 'scheduling_mode'
  ) THEN
    ALTER TABLE recurring_links ADD COLUMN scheduling_mode text NOT NULL DEFAULT 'strict'
      CHECK (scheduling_mode IN ('strict', 'flexible'));
  END IF;
END $$;

-- Add allowed_days to recurring_links
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'recurring_links' AND column_name = 'allowed_days'
  ) THEN
    ALTER TABLE recurring_links ADD COLUMN allowed_days integer[];
  END IF;
END $$;

-- Add allowed_time_start / allowed_time_end to recurring_links
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'recurring_links' AND column_name = 'allowed_time_start'
  ) THEN
    ALTER TABLE recurring_links ADD COLUMN allowed_time_start time;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'recurring_links' AND column_name = 'allowed_time_end'
  ) THEN
    ALTER TABLE recurring_links ADD COLUMN allowed_time_end time;
  END IF;
END $$;

-- Add notes_to_client to recurring_links
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'recurring_links' AND column_name = 'notes_to_client'
  ) THEN
    ALTER TABLE recurring_links ADD COLUMN notes_to_client text;
  END IF;
END $$;

-- Extend frequency CHECK constraint to include 'daily'
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'recurring_links_frequency_check'
  ) THEN
    ALTER TABLE recurring_links DROP CONSTRAINT recurring_links_frequency_check;
  END IF;
END $$;

ALTER TABLE recurring_links ADD CONSTRAINT recurring_links_frequency_check
  CHECK (frequency IS NULL OR frequency IN ('daily', 'weekly', 'biweekly', 'monthly'));
