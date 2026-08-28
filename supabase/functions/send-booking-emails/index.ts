import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface EmailElements {
  company_info: boolean;
  zoom: boolean;
  phone: boolean;
  google_calendar: boolean;
}

interface AdminSettings {
  business_name: string;
  contact_email: string;
  contact_phone: string;
  email_from_name: string;
  email_from_address: string;
  email_invite_enabled: boolean;
  email_confirmation_enabled: boolean;
  email_notification_enabled: boolean;
  email_cancellation_enabled: boolean;
  email_reschedule_enabled: boolean;
  email_recurring_confirmation_enabled: boolean;
  email_change_enabled: boolean;
  email_admin_change_enabled: boolean;
  email_invite_template: string | null;
  email_confirmation_template: string | null;
  email_cancellation_template: string | null;
  email_reschedule_template: string | null;
  email_recurring_confirmation_template: string | null;
  email_change_template: string | null;
  email_admin_change_template: string | null;
  email_invite_elements: EmailElements | null;
  email_confirmation_elements: EmailElements | null;
  email_cancellation_elements: EmailElements | null;
  email_reschedule_elements: EmailElements | null;
  email_recurring_confirmation_elements: EmailElements | null;
  email_change_elements: EmailElements | null;
  email_notification_template: string | null;
  email_notification_elements: EmailElements | null;
  booking_lead_hours: number;
  client_reminder_lead_hours: number;
  notification_enabled: boolean;
  notification_lead_hours: number;
  notification_email: string;
  admin_reminder_mode: "individual" | "daily";
  zoom_default_link: string | null;
  timezone: string;
}

interface Booking {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  client_email: string;
  client_phone: string | null;
  date: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  status: string;
  zoom_link: string | null;
  booking_token: string | null;
  meeting_type_id: string | null;
  recurrence_group_id: string | null;
  client_notes: string | null;
  internal_notes: string | null;
  notes_to_client: string | null;
  source: string | null;
  client_timezone: string | null;
}

interface MeetingType {
  id: string;
  name: string;
  zoom_link: string | null;
}

interface TriggerOptions {
  emailType?: string;
  inviteLink?: string;
  inviteClientName?: string;
  inviteClientEmail?: string;
  inviteNotesToClient?: string;
  oldDate?: string;
  oldTime?: string;
  newDate?: string;
  newTime?: string;
  siteUrl?: string;
  bookingIds?: string[];
  forceResend?: boolean;
  dummyMode?: boolean;
  dummyRecipient?: string;
  adminDailySummary?: boolean;
  changeType?: string;
  internalNotes?: string;
  clientNotes?: string;
  userId?: string;
}

const TEST_SUBJECT_PREFIX = "[TEST] ";

const DEFAULT_TEMPLATES: Record<string, string> = {
  invite: `Hi {{client_name}},

You're invited to book a meeting with {{business_name}}.

Use this link to choose a time: {{booking_link}}

{{notes_to_client}}

We look forward to seeing you there.`,
  confirmation: `Hi {{client_name}},

Your meeting with {{business_name}} has been confirmed.

Date: {{date}}
Time: {{time}}
Duration: {{duration}} minutes

{{notes_to_client}}

Need to cancel or reschedule? Use the links below.`,
  cancellation: `Hi {{client_name}},

Your meeting with {{business_name}} scheduled for {{date}} at {{time}} has been cancelled.

{{notes_to_client}}

If you believe this is an error, please contact us.`,
  reschedule: `Hi {{client_name}},

Your meeting with {{business_name}} has been rescheduled.

Old date: {{old_date}}
Old time: {{old_time}}

New date: {{new_date}}
New time: {{new_time}}
Duration: {{duration}} minutes

{{notes_to_client}}

Need to make another change? Use the links below.`,
  change: `Hi {{client_name}},

Your meeting details with {{business_name}} have been updated.

Date: {{date}}
Time: {{time}}
Duration: {{duration}} minutes

{{notes_to_client}}

Need to cancel or reschedule? Use the links below.`,
  recurring_confirmation: `Hi {{client_name}},

Your recurring meeting series with {{business_name}} has been confirmed.

Here are your scheduled sessions:

{{session_list}}

Each session is {{duration}} minutes long.

{{notes_to_client}}

Need to cancel or reschedule a session? Use the link below.`,
  notification: `Hi {{client_name}},

This is a reminder for your upcoming meeting with {{business_name}}.

Date: {{date}}
Time: {{time}}
Duration: {{duration}} minutes

{{notes_to_client}}

See you soon!`,
  admin_change_notification: `A client has made a change to their booking.

Client: {{client_name}}
Email: {{client_email}}
Change type: {{change_type}}

{{change_details}}

Client notes: {{client_notes}}`,
};

function formatTime(time: string): string {
  const [h, m] = time.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${displayHour}:${m} ${ampm}`;
}

function formatDisplayDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function fillTemplate(
  template: string,
  vars: Record<string, string>
): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value || "");
  }
  // Clean up extra blank lines left by empty placeholders
  result = result.replace(/\n{3,}/g, "\n\n").trim();
  return result;
}

function buildManageLink(bookingToken: string, publicSiteUrl: string): string {
  return `${publicSiteUrl}/manage/${bookingToken}?action=reschedule`;
}

function buildManageSection(bookingToken: string | null, publicSiteUrl: string, leadHours: number): string {
  if (!bookingToken) return "";
  const manageLink = buildManageLink(bookingToken, publicSiteUrl);
  return `<div style="margin-top:20px;">
    <p style="margin:0;color:#6b7280;font-size:14px;">Need to cancel or reschedule?</p>
    <p style="margin:4px 0 0 0;"><a href="${manageLink}" style="color:#15803d;">Manage your booking here</a></p>
    <p style="margin:8px 0 0 0;color:#9ca3af;font-size:13px;">Please note: meetings cannot be rescheduled or cancelled within ${leadHours} hour${leadHours !== 1 ? "s" : ""} of the start time. For last-minute changes, please contact us directly.</p>
  </div>`;
}

function buildGoogleCalendarLink(booking: Booking, settings: AdminSettings): string {
  if (!booking.date || !booking.start_time) return "";
  const [y, m, d] = booking.date.split("-").map(Number);
  const [sh, sm] = booking.start_time.split(":").map(Number);
  // Interpret the wall-clock time in the admin's timezone, then convert to UTC for the calendar link
  const tz = settings.timezone || "America/New_York";
  const start = new Date(Date.UTC(y, m - 1, d, sh, sm));
  // Adjust for the admin timezone offset at that instant
  const offsetMs = getTzOffsetMs(start, tz);
  const utcStart = new Date(start.getTime() - offsetMs);
  const utcEnd = new Date(utcStart.getTime() + booking.duration_minutes * 60 * 1000);

  const fmt = (dt: Date) => {
    return dt.getUTCFullYear().toString() +
      String(dt.getUTCMonth() + 1).padStart(2, "0") +
      String(dt.getUTCDate()).padStart(2, "0") + "T" +
      String(dt.getUTCHours()).padStart(2, "0") +
      String(dt.getUTCMinutes()).padStart(2, "0") + "00";
  };

  const title = encodeURIComponent(`Meeting with ${settings.business_name}`);
  const details = encodeURIComponent(
    `Meeting with ${settings.business_name}\nDuration: ${booking.duration_minutes} minutes` +
    (booking.zoom_link ? `\nZoom: ${booking.zoom_link}` : "") +
    (booking.zoom_passcode ? `\nPasscode: ${booking.zoom_passcode}` : "")
  );
  const dates = `${fmt(utcStart)}/${fmt(utcEnd)}`;

  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${dates}&details=${details}`;
}

function getTzOffsetMs(date: Date, tz: string): number {
  // Returns the offset of tz from UTC at the given instant, in milliseconds
  // e.g. America/New_York at UTC-5 in winter = -5*60*60*1000 = -18000000
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
  const parts = dtf.formatToParts(date);
  const p: Record<string, string> = {};
  parts.forEach(part => { p[part.type] = part.value; });
  const asUtc = Date.UTC(
    parseInt(p.year), parseInt(p.month) - 1, parseInt(p.day),
    parseInt(p.hour) === 24 ? 0 : parseInt(p.hour), parseInt(p.minute), parseInt(p.second)
  );
  return asUtc - date.getTime();
}

function getMeetingInstantUTC(dateStr: string, timeStr: string, tz: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [sh, sm] = timeStr.split(":").map(Number);
  const wallClock = new Date(Date.UTC(y, m - 1, d, sh, sm));
  const offsetMs = getTzOffsetMs(wallClock, tz);
  return new Date(wallClock.getTime() - offsetMs);
}

function convertToTimezone(dateStr: string, timeStr: string, fromTz: string, toTz: string): { date: string; time: string } {
  if (fromTz === toTz) return { date: dateStr, time: timeStr };
  try {
    const utcInstant = getMeetingInstantUTC(dateStr, timeStr, fromTz);
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: toTz,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(utcInstant);
    const p: Record<string, string> = {};
    parts.forEach(part => { p[part.type] = part.value; });
    return {
      date: `${p.year}-${p.month}-${p.day}`,
      time: `${p.hour.padStart(2, "0")}:${p.minute}`,
    };
  } catch {
    return { date: dateStr, time: timeStr };
  }
}

function getDisplayTimezone(booking: Booking, adminTz: string): string {
  return booking.client_timezone && booking.client_timezone !== adminTz
    ? booking.client_timezone
    : adminTz;
}

function formatBookingDate(booking: Booking, adminTz: string): string {
  const displayTz = getDisplayTimezone(booking, adminTz);
  if (displayTz === adminTz) return formatDisplayDate(booking.date);
  const converted = convertToTimezone(booking.date, booking.start_time, adminTz, displayTz);
  return formatDisplayDate(converted.date);
}

function formatBookingTime(booking: Booking, adminTz: string): string {
  const displayTz = getDisplayTimezone(booking, adminTz);
  if (displayTz === adminTz) return formatTime(booking.start_time);
  const converted = convertToTimezone(booking.date, booking.start_time, adminTz, displayTz);
  return formatTime(converted.time);
}

function buildEmailHtml(textBody: string, elements: EmailElements, booking: Booking, settings: AdminSettings, publicSiteUrl: string): string {
  const sections: string[] = [];

  sections.push(`<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1f2937;white-space:pre-wrap;">${textBody.replace(/</g, "&lt;").replace(/\n/g, "<br>")}</div>`);

  // Prominent Zoom section
  if (elements.zoom && booking.zoom_link) {
    sections.push(`<div style="margin-top:20px;padding:16px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;">
      <p style="margin:0;font-weight:600;color:#166534;">Zoom Meeting</p>
      <p style="margin:8px 0 0 0;"><a href="${booking.zoom_link}" style="color:#15803d;word-break:break-all;">${booking.zoom_link}</a></p>
      ${booking.zoom_passcode ? `<p style="margin:4px 0 0 0;color:#166534;">Passcode: ${booking.zoom_passcode}</p>` : ""}
    </div>`);
  }

  // Prominent phone section (separate from company info)
  if (elements.phone && settings.contact_phone) {
    sections.push(`<div style="margin-top:12px;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;">
      <p style="margin:0;font-weight:600;color:#374151;">Phone</p>
      <p style="margin:4px 0 0 0;color:#6b7280;font-size:14px;">${settings.contact_phone}</p>
    </div>`);
  }

  // Google Calendar link
  if (elements.google_calendar && booking.date && booking.start_time) {
    const calLink = buildGoogleCalendarLink(booking, settings);
    sections.push(`<div style="margin-top:12px;">
      <a href="${calLink}" style="display:inline-block;padding:8px 16px;background:#1a73e8;color:#fff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:500;">Add to Google Calendar</a>
    </div>`);
  }

  sections.push(buildManageSection(booking.booking_token, publicSiteUrl, settings.booking_lead_hours ?? 2));

  if (elements.company_info) {
    sections.push(`<div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;">
      <p style="margin:0;font-weight:600;color:#374151;">${settings.business_name}</p>
      ${settings.contact_email ? `<p style="margin:4px 0 0 0;color:#6b7280;font-size:14px;">${settings.contact_email}</p>` : ""}
    </div>`);
  }

  return `<div style="max-width:600px;margin:0 auto;padding:24px;">${sections.join("")}</div>`;
}

function buildRecurringEmailHtml(textBody: string, elements: EmailElements, firstBooking: Booking, settings: AdminSettings, publicSiteUrl: string): string {
  const sections: string[] = [];

  sections.push(`<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1f2937;white-space:pre-wrap;">${textBody.replace(/</g, "&lt;").replace(/\n/g, "<br>")}</div>`);

  if (elements.zoom && firstBooking.zoom_link) {
    sections.push(`<div style="margin-top:20px;padding:16px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;">
      <p style="margin:0;font-weight:600;color:#166534;">Zoom Meeting</p>
      <p style="margin:8px 0 0 0;"><a href="${firstBooking.zoom_link}" style="color:#15803d;word-break:break-all;">${firstBooking.zoom_link}</a></p>
      ${firstBooking.zoom_passcode ? `<p style="margin:4px 0 0 0;color:#166534;">Passcode: ${firstBooking.zoom_passcode}</p>` : ""}
    </div>`);
  }

  if (elements.phone && settings.contact_phone) {
    sections.push(`<div style="margin-top:12px;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;">
      <p style="margin:0;font-weight:600;color:#374151;">Phone</p>
      <p style="margin:4px 0 0 0;color:#6b7280;font-size:14px;">${settings.contact_phone}</p>
    </div>`);
  }

  if (elements.google_calendar && firstBooking.date && firstBooking.start_time) {
    const calLink = buildGoogleCalendarLink(firstBooking, settings);
    sections.push(`<div style="margin-top:12px;">
      <a href="${calLink}" style="display:inline-block;padding:8px 16px;background:#1a73e8;color:#fff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:500;">Add to Google Calendar</a>
    </div>`);
  }

  sections.push(buildManageSection(firstBooking.booking_token, publicSiteUrl, settings.booking_lead_hours ?? 2));

  if (elements.company_info) {
    sections.push(`<div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;">
      <p style="margin:0;font-weight:600;color:#374151;">${settings.business_name}</p>
      ${settings.contact_email ? `<p style="margin:4px 0 0 0;color:#6b7280;font-size:14px;">${settings.contact_email}</p>` : ""}
    </div>`);
  }

  return `<div style="max-width:600px;margin:0 auto;padding:24px;">${sections.join("")}</div>`;
}

async function sendEmail(
  resendApiKey: string,
  fromName: string,
  fromEmail: string,
  toEmail: string,
  subject: string,
  html: string
): Promise<boolean> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `${fromName} <${fromEmail}>`,
      to: [toEmail],
      subject,
      html,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Resend API error (${response.status}):`, errorText);
    return false;
  }

  return true;
}

async function sendImmediateReminderIfNeeded(
  supabase: ReturnType<typeof createClient>,
  booking: Booking,
  settings: AdminSettings,
  resendApiKey: string,
  fromName: string,
  fromEmail: string,
  effectiveSiteUrl: string
): Promise<void> {
  const leadHours = settings.client_reminder_lead_hours ?? 24;
  const adminTz = settings.timezone || "America/New_York";
  const meetingStart = getMeetingInstantUTC(booking.date, booking.start_time, adminTz);
  const now = new Date();
  const leadMs = leadHours * 60 * 60 * 1000;

  if (meetingStart.getTime() - now.getTime() > leadMs) return;

  const { data: existingLog } = await supabase
    .from("notification_log")
    .select("id")
    .eq("booking_id", booking.id)
    .eq("type", "email")
    .eq("payload->>emailType", "reminder_immediate")
    .maybeSingle();

  if (existingLog) return;

  const template = settings.email_notification_template || DEFAULT_TEMPLATES.notification;
  const elements = settings.email_notification_elements || { company_info: true, zoom: true, phone: true, google_calendar: true };

  const textBody = fillTemplate(template, {
    client_name: `${booking.first_name} ${booking.last_name}`,
    business_name: settings.business_name,
    date: formatBookingDate(booking, adminTz),
    time: formatBookingTime(booking, adminTz),
    duration: booking.duration_minutes.toString(),
    notes_to_client: booking.notes_to_client || "",
  });

  const html = buildEmailHtml(textBody, elements, booking, settings, effectiveSiteUrl);
  const subject = `${TEST_SUBJECT_PREFIX}Reminder: Your meeting with ${settings.business_name}`;

  const sent = await sendEmail(resendApiKey, fromName, fromEmail, booking.client_email, subject, html);

  await supabase.from("notification_log").insert({
    booking_id: booking.id,
    user_id: booking.user_id,
    type: "email",
    status: sent ? "sent" : "failed",
    payload: { emailType: "reminder_immediate", recipient: booking.client_email },
  });
}

async function fetchSettingsForUser(supabase: ReturnType<typeof createClient>, userId?: string): Promise<AdminSettings | null> {
  let query = supabase.from("admin_settings").select("*");
  if (userId) {
    query = query.eq("user_id", userId);
  }
  const { data } = await query.limit(1).maybeSingle() as { data: AdminSettings | null };
  return data;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      return new Response(
        JSON.stringify({ error: "RESEND_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const publicSiteUrl = Deno.env.get("PUBLIC_SITE_URL") || "https://etqmkgomwbfxdwjoqjei.supabase.co";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body: { bookingId?: string } & TriggerOptions = await req.json();
    const { emailType, bookingId, inviteLink, inviteClientName, inviteClientEmail, inviteNotesToClient, oldDate, oldTime, newDate, newTime, siteUrl, bookingIds, forceResend, dummyMode, dummyRecipient, adminDailySummary, changeType, internalNotes, clientNotes } = body;

    const effectiveSiteUrl = siteUrl || publicSiteUrl;

    let settings: AdminSettings | null = null;
    let fromName = "";
    let fromEmail = "";

    // Handle admin daily summary trigger (manual)
    if (adminDailySummary) {
      settings = await fetchSettingsForUser(supabase, body.userId);
      if (!settings) { return new Response(JSON.stringify({ error: "No admin settings found" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
      fromName = settings.email_from_name || settings.business_name;
      fromEmail = settings.email_from_address || "noreply@jungosolutions.com";
      const adminEmail = settings.notification_email || settings.contact_email;
      if (!adminEmail) {
        return new Response(JSON.stringify({ error: "No admin notification email configured. Set one in Settings." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const adminTz = settings.timezone || "America/New_York";
      const today = new Date().toLocaleDateString("en-CA", { timeZone: adminTz });
      const { data: todayBookings } = await supabase
        .from("bookings")
        .select("*")
        .eq("status", "confirmed")
        .eq("date", today)
        .order("start_time", { ascending: true }) as { data: Booking[] | null };

      if (!todayBookings || todayBookings.length === 0) {
        return new Response(JSON.stringify({ sent: false, skipped: true, reason: "No confirmed bookings for today." }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const summaryLines = todayBookings.map(b =>
        `• ${formatDisplayDate(b.date)} at ${formatTime(b.start_time)} — ${b.first_name} ${b.last_name} (${b.duration_minutes} min)`
      ).join("\n");

      const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1f2937;max-width:600px;margin:0 auto;padding:24px;">
        <h2 style="color:#1f2937;">Daily Meeting Summary — ${formatDisplayDate(today)}</h2>
        <p>You have ${todayBookings.length} meeting${todayBookings.length !== 1 ? "s" : ""} scheduled:</p>
        <div style="white-space:pre-wrap;padding:16px;background:#f9fafb;border-radius:8px;">${summaryLines}</div>
        <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;font-weight:600;color:#374151;">${settings.business_name}</p>
        </div>
      </div>`;

      const sent = await sendEmail(resendApiKey, fromName, fromEmail, adminEmail, `${TEST_SUBJECT_PREFIX}Daily Meeting Summary — ${formatDisplayDate(today)}`, html);

      if (sent) {
        await supabase.from("notification_log").insert({
          booking_id: todayBookings[0].id,
          user_id: todayBookings[0].user_id,
          type: "email",
          status: "sent",
          payload: { emailType: `daily_summary_${today}_manual`, recipient: adminEmail },
        });
      }

      return new Response(JSON.stringify({ sent }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Handle dummy mode (send test email with placeholder data)
    if (dummyMode) {
      settings = await fetchSettingsForUser(supabase, body.userId);
      if (!settings) { return new Response(JSON.stringify({ error: "No admin settings found" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
      fromName = settings.email_from_name || settings.business_name;
      fromEmail = settings.email_from_address || "noreply@jungosolutions.com";
      const recipient = dummyRecipient || "";
      if (!recipient) {
        return new Response(JSON.stringify({ error: "No recipient email provided for dummy email." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const type = emailType || "confirmation";

      const dummyBooking: Booking = {
        id: "dummy", user_id: "", first_name: "Test", last_name: "Client", client_email: recipient,
        client_phone: null, date: new Date().toISOString().slice(0, 10),
        start_time: "10:00:00", end_time: "10:30:00", duration_minutes: 30,
        status: "confirmed", zoom_link: "https://zoom.us/j/1234567890",
        zoom_passcode: "test123", booking_token: "dummy-token-test",
        meeting_type_id: null, recurrence_group_id: null,
        internal_notes: null, notes_to_client: "This is a test note to the client.", source: null,
      };

      const templateMap: Record<string, string | null> = {
        confirmation: settings.email_confirmation_template,
        cancellation: settings.email_cancellation_template,
        reschedule: settings.email_reschedule_template,
        change: settings.email_change_template,
        reminder: settings.email_notification_template,
        recurring_confirmation: settings.email_recurring_confirmation_template,
      };

      const elementsMap: Record<string, EmailElements | null> = {
        confirmation: settings.email_confirmation_elements,
        cancellation: settings.email_cancellation_elements,
        reschedule: settings.email_reschedule_elements,
        change: settings.email_change_elements,
        reminder: settings.email_notification_elements,
        recurring_confirmation: settings.email_recurring_confirmation_elements,
      };

      const subjectMap: Record<string, string> = {
        confirmation: `${TEST_SUBJECT_PREFIX}[DUMMY] Meeting Confirmed with ${settings.business_name}`,
        cancellation: `${TEST_SUBJECT_PREFIX}[DUMMY] Meeting Cancelled with ${settings.business_name}`,
        reschedule: `${TEST_SUBJECT_PREFIX}[DUMMY] Meeting Rescheduled with ${settings.business_name}`,
        change: `${TEST_SUBJECT_PREFIX}[DUMMY] Meeting Details Updated with ${settings.business_name}`,
        reminder: `${TEST_SUBJECT_PREFIX}[DUMMY] Reminder: Your meeting with ${settings.business_name}`,
        recurring_confirmation: `${TEST_SUBJECT_PREFIX}[DUMMY] Your Recurring Meeting Series with ${settings.business_name}`,
      };

      const template = templateMap[type] || DEFAULT_TEMPLATES[type] || DEFAULT_TEMPLATES.confirmation;
      const elements = elementsMap[type] || { company_info: true, zoom: true, phone: true, google_calendar: true };
      const subject = subjectMap[type] || subjectMap.confirmation;

      const templateVars: Record<string, string> = {
        client_name: "Test Client",
        business_name: settings.business_name,
        date: formatDisplayDate(dummyBooking.date),
        time: formatTime(dummyBooking.start_time),
        duration: "30",
        client_notes: "This is a test note from the client.",
        notes_to_client: "This is a test note to the client.",
      };

      if (type === "reschedule") {
        templateVars.old_date = formatDisplayDate(dummyBooking.date);
        templateVars.old_time = "09:00 AM";
        templateVars.new_date = formatDisplayDate(dummyBooking.date);
        templateVars.new_time = formatTime(dummyBooking.start_time);
      }

      if (type === "recurring_confirmation") {
        templateVars.session_list = "1. " + formatDisplayDate(dummyBooking.date) + " at " + formatTime(dummyBooking.start_time) + "\n2. " + formatDisplayDate(dummyBooking.date) + " at " + formatTime(dummyBooking.start_time);
      }

      const textBody = fillTemplate(template, templateVars);
      const html = buildEmailHtml(textBody, elements, dummyBooking, settings, effectiveSiteUrl);

      const sent = await sendEmail(resendApiKey, fromName, fromEmail, recipient, subject, html);

      return new Response(JSON.stringify({ sent }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Handle invite email (no booking record yet)
    if (emailType === "invite") {
      settings = await fetchSettingsForUser(supabase, body.userId);
      if (!settings) { return new Response(JSON.stringify({ error: "No admin settings found" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
      fromName = settings.email_from_name || settings.business_name;
      fromEmail = settings.email_from_address || "noreply@jungosolutions.com";
      if (!settings.email_invite_enabled) {
        return new Response(JSON.stringify({ skipped: true, reason: "invite disabled" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const clientName = inviteClientName || "there";
      const clientEmail = inviteClientEmail || "";
      if (!clientEmail) {
        return new Response(JSON.stringify({ error: "No recipient email for invite" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const template = settings.email_invite_template || DEFAULT_TEMPLATES.invite;
      const elements = settings.email_invite_elements || { company_info: true, zoom: true, phone: true, google_calendar: true };

      const textBody = fillTemplate(template, {
        client_name: clientName,
        business_name: settings.business_name,
        booking_link: inviteLink || "",
        notes_to_client: inviteNotesToClient || "",
      });

      const dummyBooking: Booking = {
        id: "", user_id: "", first_name: clientName, last_name: "", client_email: clientEmail,
        client_phone: null, date: "", start_time: "", end_time: "",
        duration_minutes: 0, status: "confirmed", zoom_link: null,
        zoom_passcode: null, booking_token: null, meeting_type_id: null,
        recurrence_group_id: null, internal_notes: null, notes_to_client: null, source: null,
      };

      const html = buildEmailHtml(textBody, elements, dummyBooking, settings, effectiveSiteUrl);
      const subject = `${TEST_SUBJECT_PREFIX}You're invited to book a meeting with ${settings.business_name}`;

      const sent = await sendEmail(resendApiKey, fromName, fromEmail, clientEmail, subject, html);
      return new Response(JSON.stringify({ sent }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Handle recurring confirmation email (multiple bookings)
    if (emailType === "recurring_confirmation") {
      if (!bookingIds || bookingIds.length === 0) {
        return new Response(JSON.stringify({ error: "No bookingIds provided" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: bookings } = await supabase
        .from("bookings")
        .select("*")
        .in("id", bookingIds)
        .order("date", { ascending: true })
        .order("start_time", { ascending: true }) as { data: Booking[] | null };

      if (!bookings || bookings.length === 0) {
        return new Response(JSON.stringify({ error: "No bookings found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const firstBooking = bookings[0];

      settings = await fetchSettingsForUser(supabase, firstBooking.user_id);
      if (!settings) { return new Response(JSON.stringify({ error: "No admin settings found" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
      if (!settings.email_recurring_confirmation_enabled) {
        return new Response(JSON.stringify({ skipped: true, reason: "recurring_confirmation disabled" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      fromName = settings.email_from_name || settings.business_name;
      fromEmail = settings.email_from_address || "noreply@jungosolutions.com";

      // Fetch meeting type for zoom link override
      let meetingType: MeetingType | null = null;
      if (firstBooking.meeting_type_id) {
        const { data: mt } = await supabase
          .from("meeting_types")
          .select("id, name, zoom_link")
          .eq("id", firstBooking.meeting_type_id)
          .maybeSingle() as { data: MeetingType | null };
        meetingType = mt;
      }

      const effectiveZoomLink = firstBooking.zoom_link || meetingType?.zoom_link || settings.zoom_default_link || null;
      const bookingWithZoom = { ...firstBooking, zoom_link: effectiveZoomLink };

      const clientName = `${firstBooking.first_name} ${firstBooking.last_name}`;

      // Build session list
      const adminTz = settings.timezone || "America/New_York";
      const displayTz = getDisplayTimezone(firstBooking, adminTz);
      const sessionLines = bookings.map((b, i) => {
        if (displayTz === adminTz) {
          return `${i + 1}. ${formatDisplayDate(b.date)} at ${formatTime(b.start_time)}`;
        }
        const converted = convertToTimezone(b.date, b.start_time, adminTz, displayTz);
        return `${i + 1}. ${formatDisplayDate(converted.date)} at ${formatTime(converted.time)}`;
      }).join("\n");

      const template = settings.email_recurring_confirmation_template || DEFAULT_TEMPLATES.recurring_confirmation;
      const elements = settings.email_recurring_confirmation_elements || { company_info: true, zoom: true, phone: true, google_calendar: true };

      const textBody = fillTemplate(template, {
        client_name: clientName,
        business_name: settings.business_name,
        session_list: sessionLines,
        duration: firstBooking.duration_minutes.toString(),
        notes_to_client: firstBooking.notes_to_client || "",
      });

      const html = buildRecurringEmailHtml(textBody, elements, bookingWithZoom, settings, effectiveSiteUrl);
      const subject = `${TEST_SUBJECT_PREFIX}Your Recurring Meeting Series with ${settings.business_name}`;

      const sent = await sendEmail(resendApiKey, fromName, fromEmail, firstBooking.client_email, subject, html);

      // Log for all bookings in the series
      for (const b of bookings) {
        await supabase.from("notification_log").insert({
          booking_id: b.id,
          user_id: b.user_id,
          type: "email",
          status: sent ? "sent" : "failed",
          payload: { emailType: "recurring_confirmation", recipient: firstBooking.client_email },
        });
      }

      // Send consolidated admin notification if admin reminders are enabled and in individual mode
      if (settings.notification_enabled) {
        const adminEmail = settings.notification_email || settings.contact_email;
        if (adminEmail) {
          const adminHtml = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1f2937;max-width:600px;margin:0 auto;padding:24px;">
            <h2 style="color:#1f2937;">New Recurring Meeting Series</h2>
            <p><strong>${clientName}</strong> has booked a recurring series (${bookings.length} sessions):</p>
            <div style="white-space:pre-wrap;padding:16px;background:#f9fafb;border-radius:8px;">${sessionLines}</div>
            <p style="margin-top:12px;">Duration: ${firstBooking.duration_minutes} minutes each</p>
            <p style="margin-top:8px;">Client email: ${firstBooking.client_email}</p>
            ${firstBooking.client_notes ? `<p style="margin-top:8px;">Client notes: ${firstBooking.client_notes}</p>` : ""}
            <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;font-weight:600;color:#374151;">${settings.business_name}</p>
            </div>
          </div>`;

          const adminSent = await sendEmail(resendApiKey, fromName, fromEmail, adminEmail, `${TEST_SUBJECT_PREFIX}New Recurring Series from ${clientName}`, adminHtml);
          if (adminSent) {
            await supabase.from("notification_log").insert({
              booking_id: firstBooking.id,
              user_id: firstBooking.user_id,
              type: "email",
              status: "sent",
              payload: { emailType: "admin_recurring_confirmation", recipient: adminEmail },
            });
          }
        }
      }

      // Check for short-notice immediate reminder on first booking
      await sendImmediateReminderIfNeeded(supabase, firstBooking, settings, resendApiKey, fromName, fromEmail, effectiveSiteUrl);

      return new Response(JSON.stringify({ sent }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Handle admin change notification (sent to admin when client reschedules/cancels)
    if (emailType === "admin_change_notification") {
      if (!bookingId) {
        return new Response(JSON.stringify({ error: "No bookingId provided" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: booking } = await supabase
        .from("bookings")
        .select("*")
        .eq("id", bookingId)
        .maybeSingle() as { data: Booking | null };

      if (!booking) {
        return new Response(JSON.stringify({ error: "Booking not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      settings = await fetchSettingsForUser(supabase, booking.user_id);
      if (!settings) { return new Response(JSON.stringify({ error: "No admin settings found" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
      if (!settings.email_admin_change_enabled) {
        return new Response(JSON.stringify({ skipped: true, reason: "admin_change_notification disabled" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      fromName = settings.email_from_name || settings.business_name;
      fromEmail = settings.email_from_address || "noreply@jungosolutions.com";
      const adminEmail = settings.notification_email || settings.contact_email;
      if (!adminEmail) {
        return new Response(JSON.stringify({ skipped: true, reason: "No admin email configured" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const clientName = `${booking.first_name} ${booking.last_name}`;
      const cType = changeType || "updated";

      let changeDetails = "";
      if (cType === "rescheduled") {
        const oldDateStr = oldDate ? formatDisplayDate(oldDate) : "";
        const oldTimeStr = oldTime ? formatTime(oldTime) : "";
        const newDateStr = newDate ? formatDisplayDate(newDate) : formatDisplayDate(booking.date);
        const newTimeStr = newTime ? formatTime(newTime) : formatTime(booking.start_time);
        changeDetails = `Previous: ${oldDateStr} at ${oldTimeStr}\nNew: ${newDateStr} at ${newTimeStr}`;
      } else if (cType === "cancelled") {
        changeDetails = `The booking on ${formatDisplayDate(booking.date)} at ${formatTime(booking.start_time)} has been cancelled by the client.`;
      } else {
        changeDetails = `Date: ${formatDisplayDate(booking.date)} at ${formatTime(booking.start_time)} (${booking.duration_minutes} min)`;
      }

      const template = settings.email_admin_change_template || DEFAULT_TEMPLATES.admin_change_notification;

      const textBody = fillTemplate(template, {
        client_name: clientName,
        client_email: booking.client_email,
        change_type: cType,
        change_details: changeDetails,
        client_notes: booking.client_notes || clientNotes || "",
      });

      const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1f2937;max-width:600px;margin:0 auto;padding:24px;">
        <h2 style="color:#1f2937;">Booking ${cType === "cancelled" ? "Cancelled" : cType === "rescheduled" ? "Rescheduled" : "Updated"} by Client</h2>
        <p><strong>${clientName}</strong> (${booking.client_email})</p>
        <div style="white-space:pre-wrap;padding:16px;background:#f9fafb;border-radius:8px;margin-top:12px;">${textBody.replace(/</g, "&lt;").replace(/\n/g, "<br>")}</div>
        <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;font-weight:600;color:#374151;">${settings.business_name}</p>
        </div>
      </div>`;

      const subject = `${TEST_SUBJECT_PREFIX}Client ${cType === "cancelled" ? "Cancelled" : cType === "rescheduled" ? "Rescheduled" : "Updated"}: ${clientName}`;
      const sent = await sendEmail(resendApiKey, fromName, fromEmail, adminEmail, subject, html);

      await supabase.from("notification_log").insert({
        booking_id: bookingId,
        user_id: booking.user_id,
        type: "email",
        status: sent ? "sent" : "failed",
        payload: { emailType: "admin_change_notification", changeType: cType, recipient: adminEmail },
      });

      return new Response(JSON.stringify({ sent }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // All other email types need a booking record
    if (!bookingId) {
      return new Response(JSON.stringify({ error: "No bookingId provided" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: booking } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", bookingId)
      .maybeSingle() as { data: Booking | null };

    if (!booking) {
      return new Response(JSON.stringify({ error: "Booking not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    settings = await fetchSettingsForUser(supabase, booking.user_id);
    if (!settings) { return new Response(JSON.stringify({ error: "No admin settings found" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
    fromName = settings.email_from_name || settings.business_name;
    fromEmail = settings.email_from_address || "noreply@jungosolutions.com";

    // Fetch meeting type if linked (for zoom link override)
    let meetingType: MeetingType | null = null;
    if (booking.meeting_type_id) {
      const { data: mt } = await supabase
        .from("meeting_types")
        .select("id, name, zoom_link")
        .eq("id", booking.meeting_type_id)
        .maybeSingle() as { data: MeetingType | null };
      meetingType = mt;
    }

    // Determine effective zoom link: booking > meeting type > settings default
    const effectiveZoomLink = booking.zoom_link || meetingType?.zoom_link || settings.zoom_default_link || null;
    const bookingWithZoom = { ...booking, zoom_link: effectiveZoomLink };

    const clientName = `${booking.first_name} ${booking.last_name}`;
    const adminTz = settings.timezone || "America/New_York";
    const dateDisplay = booking.date ? formatBookingDate(booking, adminTz) : "";
    const timeDisplay = booking.start_time ? formatBookingTime(booking, adminTz) : "";

    const type = emailType || "confirmation";

    // Check if this email type is enabled (skip check when forceResend is true)
    const enabledMap: Record<string, boolean | undefined> = {
      confirmation: settings.email_confirmation_enabled,
      cancellation: settings.email_cancellation_enabled,
      reschedule: settings.email_reschedule_enabled,
      change: settings.email_change_enabled,
    };

    if (!forceResend && enabledMap[type] === false) {
      return new Response(JSON.stringify({ skipped: true, reason: `${type} disabled` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Handle reminder resend (uses reminder template)
    if (forceResend && type === "reminder") {
      const template = settings.email_notification_template || DEFAULT_TEMPLATES.notification;
      const elements = settings.email_notification_elements || { company_info: true, zoom: true, phone: true, google_calendar: true };

      const textBody = fillTemplate(template, {
        client_name: clientName,
        business_name: settings.business_name,
        date: dateDisplay,
        time: timeDisplay,
        duration: booking.duration_minutes.toString(),
        notes_to_client: booking.notes_to_client || "",
      });

      const html = buildEmailHtml(textBody, elements, bookingWithZoom, settings, effectiveSiteUrl);
      const subject = `${TEST_SUBJECT_PREFIX}Reminder: Your meeting with ${settings.business_name}`;

      const sent = await sendEmail(resendApiKey, fromName, fromEmail, booking.client_email, subject, html);

      await supabase.from("notification_log").insert({
        booking_id: bookingId,
        user_id: booking.user_id,
        type: "email",
        status: sent ? "sent" : "failed",
        payload: { emailType: "reminder_manual", recipient: booking.client_email },
      });

      return new Response(JSON.stringify({ sent }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Handle recurring_confirmation resend (needs all bookings in the group)
    if (forceResend && type === "recurring_confirmation" && booking.recurrence_group_id) {
      const { data: groupBookings } = await supabase
        .from("bookings")
        .select("*")
        .eq("recurrence_group_id", booking.recurrence_group_id)
        .neq("status", "cancelled")
        .order("date", { ascending: true }) as { data: Booking[] | null };

      if (groupBookings && groupBookings.length > 0) {
        const displayTz = getDisplayTimezone(booking, adminTz);
        const sessionLines = groupBookings.map((b, i) => {
          if (displayTz === adminTz) {
            return `${i + 1}. ${formatDisplayDate(b.date)} at ${formatTime(b.start_time)}`;
          }
          const converted = convertToTimezone(b.date, b.start_time, adminTz, displayTz);
          return `${i + 1}. ${formatDisplayDate(converted.date)} at ${formatTime(converted.time)}`;
        }).join("\n");

        const template = settings.email_recurring_confirmation_template || DEFAULT_TEMPLATES.recurring_confirmation;
        const elements = settings.email_recurring_confirmation_elements || { company_info: true, zoom: true, phone: true, google_calendar: true };

        const textBody = fillTemplate(template, {
          client_name: clientName,
          business_name: settings.business_name,
          session_list: sessionLines,
          duration: booking.duration_minutes.toString(),
          notes_to_client: booking.notes_to_client || "",
        });

        const html = buildRecurringEmailHtml(textBody, elements, bookingWithZoom, settings, effectiveSiteUrl);
        const subject = `${TEST_SUBJECT_PREFIX}Your Recurring Meeting Series with ${settings.business_name}`;

        const sent = await sendEmail(resendApiKey, fromName, fromEmail, booking.client_email, subject, html);

        for (const b of groupBookings) {
          await supabase.from("notification_log").insert({
            booking_id: b.id,
            user_id: b.user_id,
            type: "email",
            status: sent ? "sent" : "failed",
            payload: { emailType: "recurring_confirmation_manual", recipient: booking.client_email },
          });
        }

        return new Response(JSON.stringify({ sent }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const templateMap: Record<string, string | null> = {
      confirmation: settings.email_confirmation_template,
      cancellation: settings.email_cancellation_template,
      reschedule: settings.email_reschedule_template,
      change: settings.email_change_template,
    };

    const elementsMap: Record<string, EmailElements | null> = {
      confirmation: settings.email_confirmation_elements,
      cancellation: settings.email_cancellation_elements,
      reschedule: settings.email_reschedule_elements,
      change: settings.email_change_elements,
    };

    const subjectMap: Record<string, string> = {
      confirmation: `${TEST_SUBJECT_PREFIX}Meeting Confirmed with ${settings.business_name}`,
      cancellation: `${TEST_SUBJECT_PREFIX}Meeting Cancelled with ${settings.business_name}`,
      reschedule: `${TEST_SUBJECT_PREFIX}Meeting Rescheduled with ${settings.business_name}`,
      change: `${TEST_SUBJECT_PREFIX}Meeting Details Updated with ${settings.business_name}`,
    };

    const template = templateMap[type] || DEFAULT_TEMPLATES[type] || DEFAULT_TEMPLATES.confirmation;
    const elements = elementsMap[type] || { company_info: true, zoom: true, phone: true, google_calendar: true };
    const subject = subjectMap[type] || subjectMap.confirmation;

    const templateVars: Record<string, string> = {
      client_name: clientName,
      business_name: settings.business_name,
      date: dateDisplay,
      time: timeDisplay,
      duration: booking.duration_minutes.toString(),
      client_notes: booking.client_notes || "",
      notes_to_client: booking.notes_to_client || "",
    };

    if (type === "reschedule") {
      const displayTz = getDisplayTimezone(booking, adminTz);
      if (oldDate && oldTime) {
        if (displayTz === adminTz) {
          templateVars.old_date = formatDisplayDate(oldDate);
          templateVars.old_time = formatTime(oldTime);
        } else {
          const oldConverted = convertToTimezone(oldDate, oldTime, adminTz, displayTz);
          templateVars.old_date = formatDisplayDate(oldConverted.date);
          templateVars.old_time = formatTime(oldConverted.time);
        }
      }
      if (newDate && newTime) {
        if (displayTz === adminTz) {
          templateVars.new_date = formatDisplayDate(newDate);
          templateVars.new_time = formatTime(newTime);
        } else {
          const newConverted = convertToTimezone(newDate, newTime, adminTz, displayTz);
          templateVars.new_date = formatDisplayDate(newConverted.date);
          templateVars.new_time = formatTime(newConverted.time);
        }
      } else {
        templateVars.new_date = dateDisplay;
        templateVars.new_time = timeDisplay;
      }
    }

    const textBody = fillTemplate(template, templateVars);
    const html = buildEmailHtml(textBody, elements, bookingWithZoom, settings, effectiveSiteUrl);

    const sent = await sendEmail(resendApiKey, fromName, fromEmail, booking.client_email, subject, html);

    // Log the notification
    await supabase.from("notification_log").insert({
      booking_id: bookingId,
      user_id: booking.user_id,
      type: "email",
      status: sent ? "sent" : "failed",
      payload: { emailType: type, recipient: booking.client_email },
    });

    // For confirmation emails, check if we need an immediate short-notice reminder
    // (skip when forceResend to avoid duplicate sends during manual resend)
    if (type === "confirmation" && !forceResend) {
      await sendImmediateReminderIfNeeded(supabase, booking, settings, resendApiKey, fromName, fromEmail, effectiveSiteUrl);
    }

    return new Response(JSON.stringify({ sent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-booking-emails error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
