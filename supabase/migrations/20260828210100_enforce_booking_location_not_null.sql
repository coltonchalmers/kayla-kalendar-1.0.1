-- Enforce that all new bookings MUST have a meeting_location_type.
ALTER TABLE public.bookings ALTER COLUMN meeting_location_type SET NOT NULL;
