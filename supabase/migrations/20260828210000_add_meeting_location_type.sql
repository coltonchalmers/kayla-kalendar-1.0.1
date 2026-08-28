-- Add the meeting_location_type column to the tables.
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS meeting_location_type TEXT;
ALTER TABLE public.meeting_types ADD COLUMN IF NOT EXISTS meeting_location_type TEXT;
ALTER TABLE public.recurring_links ADD COLUMN IF NOT EXISTS meeting_location_type TEXT;
ALTER TABLE public.proposal_links ADD COLUMN IF NOT EXISTS proposal_links_meeting_location_type_check TEXT;
