/*
# Add internal notes and full-availability toggle to link tables

## Summary
This migration adds two new columns across three tables:
1. `internal_notes` (text, nullable) on `proposal_links` and `recurring_links` — admin-only notes not visible to clients.
2. `allow_full_availability` (boolean, default true) on `proposal_links` and `reschedule_proposals` — controls whether the client can browse the full availability calendar in addition to curated slots.

## New Columns
- `proposal_links.internal_notes` (text, nullable) — private admin notes for proposal links.
- `proposal_links.allow_full_availability` (boolean, default true) — when true, clients can also pick from the full availability calendar; when false, only curated slots are offered.
- `recurring_links.internal_notes` (text, nullable) — private admin notes for recurring links.
- `reschedule_proposals.allow_full_availability` (boolean, default true) — when true, clients can also pick from the full availability calendar; when false, only curated reschedule slots are offered.

## Security
No RLS or policy changes needed — existing policies on these tables already cover the new columns.

## Notes
- All statements are idempotent using DO $$ ... IF NOT EXISTS ... END $$ blocks.
- Defaults are chosen so existing rows behave as before (full availability allowed, no internal notes).
*/

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'proposal_links' AND column_name = 'internal_notes') THEN
    ALTER TABLE proposal_links ADD COLUMN internal_notes text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'proposal_links' AND column_name = 'allow_full_availability') THEN
    ALTER TABLE proposal_links ADD COLUMN allow_full_availability boolean NOT NULL DEFAULT true;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'recurring_links' AND column_name = 'internal_notes') THEN
    ALTER TABLE recurring_links ADD COLUMN internal_notes text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'reschedule_proposals' AND column_name = 'allow_full_availability') THEN
    ALTER TABLE reschedule_proposals ADD COLUMN allow_full_availability boolean NOT NULL DEFAULT true;
  END IF;
END $$;