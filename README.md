# Jungo Solutions Scheduling App

A production-grade appointment scheduling platform (internally "Kayla Kalendar"). Clients book meetings through shareable tokenized links; an admin manages availability, bookings, meeting types, recurring links, proposal links, reschedule proposals, and a fully customizable automated email and reminder system.

## Tech Stack

- **Frontend:** React 18 + TypeScript, Vite, Tailwind CSS, react-router-dom 7, lucide-react
- **Backend:** Supabase (PostgreSQL, Auth, Edge Functions, pg_cron)
- **Email:** Resend API (transactional email delivery)
- **Path alias:** `@/` maps to `src/` (configured in both `vite.config.ts` and `tsconfig.app.json` — keep in sync)
- **Theme:** Custom Tailwind colors `jungo-green` and `jungo-brown` (see `tailwind.config.js`). Never use purple/indigo/violet hues.

## Multi-User Architecture

The app supports per-admin data isolation. Each authenticated admin user sees only their own bookings, availability, meeting types, links, proposals, settings, and notification logs.

- **Auth flow:** Login page at `/admin/login` (email/password via Supabase Auth). `ProtectedRoute` wraps all admin pages and redirects to login if no session. Session state managed by `useAuth` hook (`src/hooks/useAuth.ts`) using `onAuthStateChange`.
- **Per-user scoping:** All tables have a `user_id` column (uuid, `DEFAULT auth.uid()`). RLS policies scope authenticated access to `auth.uid() = user_id`. Public booking pages (anon role) read data by filtering on the link owner's `user_id`.
- **Edge functions:** `fetchSettingsForUser(supabase, userId)` in `send-booking-emails` fetches the correct admin's settings by `user_id` from the booking record or request body — not as a global singleton.
- **Backfill:** Existing bookings, booking_changes, and notification_log rows were backfilled to the first admin user (`c036fd1e-...`, lindsey@jungosolutions.com) so no data was lost during the per-user migration.

## Project Structure

```
src/
  App.tsx                      # Route definitions
  components/
    layout/                    # AdminLayout, PublicLayout, ProtectedRoute, AdminHeader
    ui/                        # Button, Card, Input, Select, Modal, Badge, Textarea, LoadingSpinner,
                               # Dropdown, ProgressIndicator
    booking/                   # BookingConfirmation, BookingDetailsModal, IntakeForm, NoteIndicators,
                               # DashboardCalendar
    calendar/                  # CalendarGrid, TimeSlotPicker
  hooks/                       # useAuth, useSettings, useAvailability, useBookings, useMeetingTypes,
                               # useRecurringLinks, useProposalLinks, useRescheduleProposals
  lib/
    supabase.ts                # Supabase client (reads VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)
    types.ts                   # All TypeScript interfaces
    utils.ts                   # Time slot generation, date formatting, timezone conversion helpers
    validation.ts              # Email/phone validators
    bookingEmails.ts           # Triggers send-booking-emails edge function
    errors.ts                  # Error parsing utilities
  pages/
    admin/                     # Dashboard, Availability, Bookings, ManualBooking, MeetingTypes,
                               # RecurringLinks, Proposals, Settings, Login
    public/                    # MeetingTypeBooking, RecurringBooking, ProposalBooking,
                               # ManageBooking, RescheduleProposal
supabase/
  migrations/                  # 26 SQL migrations (schema built incrementally)
  functions/
    send-booking-emails/       # Edge function: all transactional emails
    send-reminders/            # Edge function: scheduled reminders (pg_cron)
public/                        # Jungo logo assets
```

## Routes

**Public** (wrapped in `PublicLayout`):
- `/m/:token` — Book via a meeting-type link
- `/book/:token` — Book via a recurring link
- `/p/:token` — Claim a proposed time slot
- `/manage/:token` — Cancel or reschedule an existing booking (token is the booking's `booking_token`)
- `/reschedule/:token` — Client claims a reschedule slot proposed by admin

**Admin** (wrapped in `ProtectedRoute` + `AdminLayout`):
- `/admin` — Dashboard (upcoming meetings, calendar view, quick stats)
- `/admin/availability` — Weekly recurring hours + date-specific overrides
- `/admin/bookings` — All bookings with filter, search, and detail modal
- `/admin/bookings/new` — Manual booking creation
- `/admin/meeting-types` — Create/edit meeting types with custom duration, buffer, Zoom link
- `/admin/recurring-links` — Generate recurring booking links (strict or flexible scheduling)
- `/admin/proposals` — Generate proposal links with specific time slots
- `/admin/settings` — Business profile, email templates, Zoom, reminders, timezone

## Feature Catalog

### Public Booking Flows

1. **Meeting Type Booking** (`/m/:token`): Client picks a date and time from available slots based on the admin's availability. Supports custom intake form fields, timezone auto-detection, and optional guest invitations.

2. **Recurring Booking** (`/book/:token`): Client books a series of meetings. Admin controls frequency (daily, weekly, biweekly, monthly), occurrence count, end date, or ongoing mode. Two scheduling modes:
   - **Strict**: Admin predefines allowed days and time windows.
   - **Flexible**: Client chooses their own times within availability rules.

3. **Proposal Booking** (`/p/:token`): Admin proposes specific time slots to a client. Client picks one slot from the list. Single-use — once claimed, the link deactivates. Supports optional expiry date. If `allow_full_availability` is true, the client can also browse the full availability calendar in addition to curated slots.

4. **Manage Booking** (`/manage/:token`): Self-service page where clients can cancel or reschedule their booking. Protected by `booking_lead_hours` — changes are blocked within that window of the meeting start time. For recurring bookings, only the individual session is affected.

5. **Reschedule Proposal** (`/reschedule/:token`): Admin-initiated reschedule flow. Admin creates a proposal with alternative time slots and sends a link to the client. Client claims one slot, which atomically updates the booking and deactivates the proposal. If `allow_full_availability` is true, the client can also browse the full availability calendar.

### Admin Tools

1. **Dashboard**: Overview of upcoming meetings, a month calendar with booking indicators, and quick navigation to other admin pages.

2. **Availability Management**: Weekly recurring availability rules (per day-of-week with start/end times) plus date-specific overrides (block a day or set custom hours with a reason note).

3. **Bookings Management**: Full booking list with status filtering, search by client name/email, and a detail modal showing all booking info, notes, change history, and email resend actions.

4. **Manual Booking**: Admin can create bookings directly, bypassing the public flow. Useful for phone-in or walk-in appointments.

5. **Meeting Types**: Create reusable meeting types with custom name, description, duration, buffer time, optional Zoom link override, and contact info overrides. Each type generates a shareable tokenized link.

6. **Recurring Link Builder**: Generate links for recurring booking series with full control over frequency, scheduling mode, allowed days/times, notes to client, internal notes, and expiry.

7. **Proposal Link Builder**: Create proposal links with hand-picked time slots. Add/remove slots individually. Send invite email directly from the builder. Supports internal notes, notes to client, and full-availability toggle.

8. **Settings**: Central configuration for:
   - Business profile (name, contact email, phone, timezone)
   - Booking rules (meeting lengths, lead hours, booking window, buffer minutes, slot increment)
   - Email customization (per-type templates, element toggles, from-name/address)
   - Zoom integration (default link, default passcode, auto-create toggle)
   - Reminder settings (client reminder lead time, admin reminder mode and timing)

### Email System

The app sends 9 distinct email types, each independently enabled/disabled and fully customizable:

| Email Type | Trigger | Recipient |
|-----------|---------|-----------|
| `confirmation` | New booking confirmed | Client |
| `recurring_confirmation` | Recurring series booked | Client (lists all sessions) |
| `cancellation` | Booking cancelled | Client |
| `reschedule` | Booking rescheduled by admin | Client (shows old/new times) |
| `change` | Booking details updated | Client |
| `invite` | Admin sends proposal/recurring link | Client (contains booking link) |
| `notification` (reminder) | Lead time before meeting | Client |
| `admin_change_notification` | Client reschedules/cancels | Admin |
| `admin_daily_summary` | Scheduled daily (or manual) | Admin (lists today's meetings) |

**Template system**: Each email type has its own text template using `{{placeholder}}` syntax. Supported placeholders: `client_name`, `business_name`, `date`, `time`, `duration`, `booking_link`, `notes_to_client`, `client_notes`, `session_list` (recurring only), `old_date`, `old_time`, `new_date`, `new_time` (reschedule only), `change_type`, `change_details`, `client_email` (admin notifications only).

**Element toggles**: Each email type can independently include/exclude: Zoom section, phone section, Google Calendar "Add to Calendar" button, and company info footer. Per-email-type overrides fall back to global defaults when null.

**Email HTML rendering**: Text templates are converted to styled HTML with prominent Zoom blocks (green accent), phone blocks, Google Calendar links, manage-booking links, and company footer.

**Test prefix**: All emails currently include `[TEST]` in the subject line for safety during pre-launch testing. Remove `TEST_SUBJECT_PREFIX` in the edge function when ready for production.

**Dummy mode**: Settings page can send test emails with placeholder data to verify template rendering without affecting real bookings.

### Reminder System

Powered by a pg_cron job that calls the `send-reminders` edge function every 15 minutes.

**Client reminders**: Sent `client_reminder_lead_hours` before the meeting. Deduplicated via `notification_log` — each booking gets at most one reminder (cron or immediate). Short-notice bookings (booked within the reminder window) trigger an immediate reminder at confirmation time.

**Admin reminders**: Two modes:
- **Individual**: Sends a separate email for each upcoming meeting, `notification_lead_hours` before start.
- **Daily summary**: Sends one email listing all meetings for the day (or next day if `admin_daily_summary_night_before` is enabled).

All reminders are idempotent — the `notification_log` table prevents duplicate sends across cron runs.

### Timezone Handling

The app correctly handles timezone conversion between admin and client:

- **Admin timezone**: Set in Settings, stored in `admin_settings.timezone`. All availability rules and booking times are interpreted in this timezone.
- **Client timezone**: Auto-detected via `Intl.DateTimeFormat().resolvedOptions().timeZone` and stored per-booking in `client_timezone`.
- **Slot generation**: `generateTimeSlots` in `src/lib/utils.ts` uses `getMeetingInstantUTC()` to convert admin wall-clock times to UTC instants for lead-time cutoff checks, ensuring slots are filtered correctly regardless of the browser's local timezone.
- **Display conversion**: `convertTimeSlotWithDate()` converts times between timezones for display, so clients see times in their local timezone while the admin sees times in their own.
- **Email rendering**: Edge functions use the same `getMeetingInstantUTC()` and `getTzOffsetMs()` helpers to build Google Calendar links with correct UTC timestamps.

### Zoom Integration

Three-level Zoom link resolution with fallback chain:
1. Booking-level `zoom_link` (set per booking)
2. Meeting-type `zoom_link` (set per meeting type)
3. `admin_settings.zoom_default_link` (global default)
4. Auto-create via Zoom API if `zoom_enabled` is true (requires Zoom Server-to-Server OAuth credentials)

Zoom passcodes: `zoom_default_passcode` applies to auto-created meetings. `zoom_passcode_random` flag indicates a randomly generated passcode was used.

### Notes System

Three types of notes per booking:
- **Client notes** (`client_notes`): Written by the client during booking (intake form).
- **Internal notes** (`internal_notes`): Private admin-only notes, not shown to clients.
- **Notes to client** (`notes_to_client`): Admin-written notes included in emails and visible on the manage page.

## Database Schema

All tables have RLS enabled. See `supabase/migrations/` for full DDL (26 migrations, schema built incrementally).

| Table | Purpose |
|-------|---------|
| `admin_settings` | Per-admin singleton (UNIQUE on `user_id`). Business name, timezone, meeting lengths, lead hours, booking window, buffer, contact info, email templates/element toggles per type, Zoom defaults, reminder settings, slot increment. `user_id` defaults to `auth.uid()`. |
| `availability_rules` | Weekly recurring availability windows (day_of_week 0–6, start/end times, is_active). Scoped by `user_id`. |
| `availability_overrides` | Date-specific blocks or custom hours with optional reason. Scoped by `user_id`. |
| `meeting_types` | Tokenized meeting types with duration, buffer, optional Zoom link and contact overrides. Scoped by `user_id`. |
| `bookings` | All appointments. `source`: public/admin/recurring_link/proposal_link. `status`: confirmed/cancelled/completed. Includes `user_id`, `booking_token`, `zoom_link`, `zoom_passcode`, `client_timezone`, `recurrence_group_id`, `meeting_type_id`, `proposal_link_id`, `internal_notes`, `notes_to_client`. |
| `recurring_links` | Tokenized links for recurring flows. Supports weekly/biweekly/monthly, occurrence counts, end dates, `is_ongoing` flag, strict/flexible scheduling mode, allowed days/times, notes to client, internal notes, expiry. Scoped by `user_id`. |
| `proposal_links` | Tokenized links where admin proposes specific slots. Supports expiry, `is_used` flag, `internal_notes`, `notes_to_client`, `allow_full_availability`. Scoped by `user_id`. |
| `proposal_slots` | Individual time slots attached to a proposal link. `is_claimed` boolean for atomic claiming. |
| `reschedule_proposals` | Admin-initiated reschedule proposals linked to a specific booking. Tokenized, with message, `is_claimed`/`claimed_slot_id` tracking, `allow_full_availability`. Scoped by `user_id`. |
| `reschedule_proposal_slots` | Alternative time slots offered in a reschedule proposal. |
| `booking_changes` | Append-only audit trail of reschedules, cancellations, completions. Scoped by `user_id`. Never update or delete rows. |
| `notification_log` | Tracks email/calendar/zoom notification attempts. Deduplicates reminder sends via `payload->>emailType` checks. Scoped by `user_id`. |

### RLS Summary

- **anon:** Read access to `admin_settings`, `availability_rules`, `availability_overrides`, active `recurring_links`, `meeting_types`, `proposal_links`, `proposal_slots`, `reschedule_proposals`, `reschedule_proposal_slots`, and confirmed `bookings` (for conflict checking). Insert access to `bookings` and `notification_log`. Public pages read data by filtering on the link owner's `user_id`.
- **authenticated:** Full CRUD on own data across all tables, scoped by `auth.uid() = user_id`. Each admin sees only their own bookings, settings, availability, links, proposals, and notification logs.

## Edge Functions

### send-booking-emails

Triggered by `src/lib/bookingEmails.ts` via HTTP POST. Handles all transactional emails:

- **Confirmation/cancellation/reschedule/change**: Fetches booking by ID, resolves the admin's settings via `fetchSettingsForUser(supabase, booking.user_id)`, resolves Zoom link via fallback chain, fills template, renders HTML, sends via Resend, logs to `notification_log` with `user_id`.
- **Recurring confirmation**: Fetches all bookings in a recurrence group, builds a session list, sends one email covering the whole series. Settings fetched via `fetchSettingsForUser(supabase, firstBooking.user_id)`.
- **Invite**: Sends a link-based invite (no booking record yet) with a booking link. Settings fetched via `fetchSettingsForUser(supabase, body.userId)`.
- **Admin change notification**: Notifies admin when a client reschedules or cancels, including change details. Settings fetched via `fetchSettingsForUser(supabase, booking.user_id)`.
- **Daily summary**: Gathers all confirmed bookings for today and sends a summary email to admin. Settings fetched via `fetchSettingsForUser(supabase, body.userId)`.
- **Dummy mode**: Sends test emails with placeholder data for template preview.
- **Immediate reminder**: If a booking is confirmed within the reminder lead window, sends a reminder immediately (deduplicated via `notification_log`).

Reads templates and element toggles from `admin_settings`. Builds manage links using `PUBLIC_SITE_URL` env var or the `siteUrl` passed in the request body.

### send-reminders

Triggered every 15 minutes by a pg_cron job (migration `20260817191919`). Idempotent — deduplicates via `notification_log`.

- **Client reminders**: Finds confirmed bookings within the reminder window, checks `notification_log` for prior sends, sends reminder email, logs the send.
- **Admin reminders (individual mode)**: Sends per-booking reminder emails to admin.
- **Admin reminders (daily summary mode)**: Sends one summary email listing all confirmed bookings for the target date (today or tomorrow if `night_before` is enabled).

### Required Secrets (Supabase Dashboard)

- `RESEND_API_KEY` — Resend API key for outgoing email
- `PUBLIC_SITE_URL` — Public URL for email links (e.g., `https://your-domain.com`)
- `SUPABASE_URL` — Supabase project URL (auto-configured)
- `SUPABASE_SERVICE_ROLE_KEY` — Service role key for edge function DB access (auto-configured)
- Zoom Server-to-Server OAuth credentials (if auto-creation enabled)

## Environment Variables

`.env` (frontend):
- `VITE_SUPABASE_URL` — Supabase project URL
- `VITE_SUPABASE_ANON_KEY` — Supabase anon public key

## Development

```bash
npm install        # Install dependencies
npm run dev        # Start dev server (Vite)
npm run build      # Production build
npm run typecheck  # TypeScript type checking
npm run lint       # ESLint
npm run preview    # Preview production build
```

## Critical Design Decisions (do not undo)

1. **The app is multi-user with per-admin data isolation.** All tables have a `user_id` column with `DEFAULT auth.uid()`. RLS policies scope authenticated access to `auth.uid() = user_id`. Public booking pages (anon role) read data by filtering on the link owner's `user_id`. The edge function `fetchSettingsForUser(supabase, userId)` fetches settings by `user_id` from the booking record or request body — never as a global singleton.

2. **admin_settings is a per-user singleton.** A UNIQUE constraint on `user_id` prevents duplicates (migration `20260813215449` fixed a prior bug with 258 duplicate rows). Use `upsert` or `update`, never blind `insert`. The `user_id` column defaults to `auth.uid()`.

3. **booking_token is generated client-side** via `crypto.randomUUID()` in `useBookings.createBooking` and stored on every booking. It is the only way clients access `/manage/:token`. Never create a booking without one.

4. **booking_lead_hours does double duty.** It controls both minimum booking lead time AND blocks clients from cancelling/rescheduling within that window. The manage page enforces this via `isWithinLeadTime()`.

5. **Client reschedule from the manage page is per-session only.** Even for recurring bookings, the client only moves that single session. The page shows a notice about this. Admin-side `cancelRecurringGroup` and `rescheduleRecurringGroup` in `useBookings` operate on the whole group — keep these separate.

6. **Zoom link resolution has a three-level fallback:** booking-level `zoom_link` → meeting-type `zoom_link` → `admin_settings.zoom_default_link` → auto-create if `zoom_enabled`. The `zoom_default_passcode` only applies to auto-created meetings.

7. **Time slot generation is client-side** in `src/lib/utils.ts` `generateTimeSlots`. The anon role can read confirmed bookings specifically so this conflict checking works. Do not move this server-side without updating RLS. Slot generation uses `getMeetingInstantUTC()` with the admin timezone to correctly enforce lead-time cutoffs regardless of the browser's local timezone.

8. **Email templates use `{{placeholder}}` syntax.** Supported placeholders: `client_name`, `date`, `time`, `duration`, `business_name`, `booking_link`, `notes_to_client`, `client_notes`, `session_list`, `old_date`, `old_time`, `new_date`, `new_time`, `change_type`, `change_details`, `client_email`. Default templates are hardcoded in the edge function as fallbacks.

9. **Per-email-type element overrides fall back to global defaults.** Each email type has its own `EmailElements` JSONB in `admin_settings`. If null, the global defaults (`email_include_*` columns) are used.

10. **The pg_cron job has the project URL and anon key hardcoded in SQL** (migration `20260817191919`). If either changes, update the cron job.

11. **The `source` field CHECK constraint must be updated** if adding a new booking source type. It currently allows `public`, `admin`, `recurring_link`, `proposal_link`.

12. **`is_ongoing` on recurring_links** means the series has no end date or occurrence cap. Do not treat null `end_date` + null `occurrences` as an error without checking this flag first.

13. **booking_changes is append-only.** Never update or delete rows. The admin views history via `fetchBookingChanges`.

14. **All imports use `@/` path alias**, not relative paths. Maintain this convention.

15. **Proposal slot claiming is atomic.** `claimSlot` in `useProposalLinks` and `useRescheduleProposals` updates with `eq('is_claimed', false)` to prevent race conditions. Two clients cannot claim the same slot.

16. **Reschedule proposals are linked to a specific booking.** Unlike proposal links (which create a new booking), reschedule proposals update an existing booking's date/time when a slot is claimed. The proposal deactivates after claiming.

17. **All emails are prefixed with `[TEST]`** via `TEST_SUBJECT_PREFIX` in both edge functions. This is a safety measure during pre-launch testing. Remove the prefix constant when going to production.

18. **`allow_full_availability` on proposal_links and reschedule_proposals** controls whether the client can browse the full availability calendar in addition to curated slots. Defaults to true for backward compatibility.

## Recent Fixes

- **Per-user data isolation (migration `20260825182310`)**: Added `user_id` columns to `bookings`, `booking_changes`, and `notification_log` with `DEFAULT auth.uid()`. Backfilled existing rows to the first admin user. Rescoped all RLS policies so authenticated admins see only their own data, while anon retains read access for public booking pages. Added `DEFAULT auth.uid()` to `admin_settings.user_id`.

- **Edge function crash — duplicate variable (Aug 2026)**: The `sendImmediateReminderIfNeeded` function in `send-booking-emails` had a duplicate `adminTz` variable declaration (declared twice in the same scope), which caused a compilation error that crashed the entire edge function. No emails could be sent at all. Removed the duplicate declaration.

- **Edge function crash — settings referenced before fetch (Aug 2026)**: The `recurring_confirmation` and `admin_change_notification` email paths checked `settings.email_*_enabled` before `settings` was fetched (settings was still null at that point), causing a null dereference crash. Reordered both code paths to fetch settings first via `fetchSettingsForUser`, then check the enabled flag.

- **Edge function — missing user_id in notification_log inserts (Aug 2026)**: Two `notification_log` inserts in the edge function (daily summary and admin recurring confirmation) were missing the `user_id` field, which would fail the `NOT NULL` constraint. Added `user_id` from the booking record to both inserts.

- **Proposal creation failure — missing database column (Aug 2026)**: The `proposal_links` table was missing the `notes_to_client` column that the app code and TypeScript types already expected. Every proposal creation failed with a database error. Added the column via migration `20260825211353`.

- **Timezone conversion bug**: Fixed `generateTimeSlots` and lead-time checks that were using browser-local time instead of the admin's configured timezone, causing slots to appear at wrong times and lead-time cutoffs to be incorrect. Now uses `getMeetingInstantUTC()` with `adminTimezone` parameter throughout.

- **Variable ordering crash**: Fixed a crash in `MeetingTypeBookingPage` where `adminTimezone` was referenced before its `const` declaration, causing a temporal dead zone error. Moved the declaration above its first usage in `loadSlots`.
