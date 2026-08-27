/*
# Add link expiry, single-use flags, and reschedule proposals

## Purpose
1. Optional expiration date on recurring invite links (mirrors proposal links).
2. Single-use enforcement on both recurring and proposal links.
3. New reschedule_proposals + reschedule_proposal_slots tables for admin-initiated reschedule requests.

## New Columns
### recurring_links
- expires_at (timestamptz, nullable) — optional expiration date.
- is_used (boolean, default false) — true once a booking is created through this link.
### proposal_links
- is_used (boolean, default false) — true once a slot is claimed.

## New Tables
### reschedule_proposals
- id, user_id (owner), booking_id (FK), token (unique), client_email, client_name, message, is_active, is_claimed, claimed_slot_id, created_at
### reschedule_proposal_slots
- id, reschedule_proposal_id (FK CASCADE), date, start_time, is_claimed, created_at

## Security
- RLS on both new tables.
- Authenticated owner: full CRUD.
- Anon: SELECT active proposals/slots, UPDATE to claim.

## Notes
- Idempotent. No data loss.
*/

-- 1. recurring_links: expires_at + is_used
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'recurring_links' AND column_name = 'expires_at') THEN
    ALTER TABLE recurring_links ADD COLUMN expires_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'recurring_links' AND column_name = 'is_used') THEN
    ALTER TABLE recurring_links ADD COLUMN is_used boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- 2. proposal_links: is_used
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'proposal_links' AND column_name = 'is_used') THEN
    ALTER TABLE proposal_links ADD COLUMN is_used boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- 3. reschedule_proposals
CREATE TABLE IF NOT EXISTS reschedule_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  token text UNIQUE NOT NULL,
  client_email text NOT NULL,
  client_name text NOT NULL,
  message text,
  is_active boolean NOT NULL DEFAULT true,
  is_claimed boolean NOT NULL DEFAULT false,
  claimed_slot_id uuid,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE reschedule_proposals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_reschedule_proposals" ON reschedule_proposals;
CREATE POLICY "auth_select_reschedule_proposals" ON reschedule_proposals FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "auth_insert_reschedule_proposals" ON reschedule_proposals;
CREATE POLICY "auth_insert_reschedule_proposals" ON reschedule_proposals FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "auth_update_reschedule_proposals" ON reschedule_proposals;
CREATE POLICY "auth_update_reschedule_proposals" ON reschedule_proposals FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "auth_delete_reschedule_proposals" ON reschedule_proposals;
CREATE POLICY "auth_delete_reschedule_proposals" ON reschedule_proposals FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "anon_select_active_reschedule_proposals" ON reschedule_proposals;
CREATE POLICY "anon_select_active_reschedule_proposals" ON reschedule_proposals FOR SELECT
  TO anon, authenticated USING (is_active = true);

DROP POLICY IF EXISTS "anon_claim_reschedule_proposal" ON reschedule_proposals;
CREATE POLICY "anon_claim_reschedule_proposal" ON reschedule_proposals FOR UPDATE
  TO anon, authenticated USING (is_active = true) WITH CHECK (true);

-- 4. reschedule_proposal_slots
CREATE TABLE IF NOT EXISTS reschedule_proposal_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reschedule_proposal_id uuid NOT NULL REFERENCES reschedule_proposals(id) ON DELETE CASCADE,
  date text NOT NULL,
  start_time text NOT NULL,
  is_claimed boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE reschedule_proposal_slots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_reschedule_slots" ON reschedule_proposal_slots;
CREATE POLICY "auth_select_reschedule_slots" ON reschedule_proposal_slots FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM reschedule_proposals rp WHERE rp.id = reschedule_proposal_slots.reschedule_proposal_id AND rp.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "auth_insert_reschedule_slots" ON reschedule_proposal_slots;
CREATE POLICY "auth_insert_reschedule_slots" ON reschedule_proposal_slots FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM reschedule_proposals rp WHERE rp.id = reschedule_proposal_slots.reschedule_proposal_id AND rp.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "auth_update_reschedule_slots" ON reschedule_proposal_slots;
CREATE POLICY "auth_update_reschedule_slots" ON reschedule_proposal_slots FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM reschedule_proposals rp WHERE rp.id = reschedule_proposal_slots.reschedule_proposal_id AND rp.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM reschedule_proposals rp WHERE rp.id = reschedule_proposal_slots.reschedule_proposal_id AND rp.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "auth_delete_reschedule_slots" ON reschedule_proposal_slots;
CREATE POLICY "auth_delete_reschedule_slots" ON reschedule_proposal_slots FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM reschedule_proposals rp WHERE rp.id = reschedule_proposal_slots.reschedule_proposal_id AND rp.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "anon_select_active_reschedule_slots" ON reschedule_proposal_slots;
CREATE POLICY "anon_select_active_reschedule_slots" ON reschedule_proposal_slots FOR SELECT
  TO anon, authenticated USING (
    EXISTS (SELECT 1 FROM reschedule_proposals rp WHERE rp.id = reschedule_proposal_slots.reschedule_proposal_id AND rp.is_active = true)
  );

DROP POLICY IF EXISTS "anon_claim_reschedule_slot" ON reschedule_proposal_slots;
CREATE POLICY "anon_claim_reschedule_slot" ON reschedule_proposal_slots FOR UPDATE
  TO anon, authenticated USING (
    EXISTS (SELECT 1 FROM reschedule_proposals rp WHERE rp.id = reschedule_proposal_slots.reschedule_proposal_id AND rp.is_active = true)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM reschedule_proposals rp WHERE rp.id = reschedule_proposal_slots.reschedule_proposal_id AND rp.is_active = true)
  );

-- 5. FK from reschedule_proposals.claimed_slot_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'reschedule_proposals_claimed_slot_id_fkey'
  ) THEN
    ALTER TABLE reschedule_proposals
      ADD CONSTRAINT reschedule_proposals_claimed_slot_id_fkey
      FOREIGN KEY (claimed_slot_id) REFERENCES reschedule_proposal_slots(id) ON DELETE SET NULL;
  END IF;
END $$;