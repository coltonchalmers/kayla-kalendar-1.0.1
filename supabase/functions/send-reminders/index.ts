import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface AdminSettings {
  user_id: string;
  business_name: string;
  contact_email: string;
  contact_phone: string;
  email_from_name: string;
  email_from_address: string;
  notification_enabled: boolean;
  notification_lead_hours: number;
  notification_email: string;
  client_reminder_lead_hours: number;
  admin_reminder_mode: "individual" | "daily";
  admin_daily_summary_time: string;
  admin_daily_summary_night_before: boolean;
  email_notification_enabled: boolean;
  email_notification_template: string | null;
  email_notification_elements: {
    company_info: boolean;
    zoom: boolean;
    phone: boolean;
    google_calendar: boolean;
  } | null;
  booking_lead_hours: number;
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
  zoom_passcode: string | null;
  booking_token: string | null;
  meeting_type_id: string | null;
  client_timezone: string | null;
}

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

function fillTemplate(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value || "");
  }
  return result;
}

const TEST_SUBJECT_PREFIX = "[TEST] ";

function getTzOffsetMs(date: Date, tz: string): number {
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

function getTodayInTz(tz: string): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: tz });
}

const DEFAULT_REMINDER_TEMPLATE = `Hi {{client_name}},

This is a reminder for your upcoming meeting with {{business_name}}.

Date: {{date}}
Time: {{time}}
Duration: {{duration}} minutes

See you soon!`;

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

function buildReminderHtml(textBody: string, booking: Booking, settings: AdminSettings, siteUrl: string): string {
  const sections: string[] = [];
  sections.push(`<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1f2937;white-space:pre-wrap;">${textBody.replace(/</g, "&lt;").replace(/\n/g, "<br>")}</div>`);

  const elements = settings.email_notification_elements || { company_info: true, zoom: true, phone: true, google_calendar: true };

  if (elements.zoom && booking.zoom_link) {
    sections.push(`<div style="margin-top:20px;padding:16px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;">
      <p style="margin:0;font-weight:600;color:#166534;">Zoom Meeting</p>
      <p style="margin:8px 0 0 0;"><a href="${booking.zoom_link}" style="color:#15803d;word-break:break-all;">${booking.zoom_link}</a></p>
      ${booking.zoom_passcode ? `<p style="margin:4px 0 0 0;color:#166534;">Passcode: ${booking.zoom_passcode}</p>` : ""}
    </div>`);
  }

  if (booking.booking_token) {
    const manageLink = `${siteUrl}/manage/${booking.booking_token}?action=reschedule`;
    const leadHours = (settings as Record<string, unknown>).booking_lead_hours as number ?? 2;
    sections.push(`<div style="margin-top:20px;">
      <p style="margin:0;color:#6b7280;font-size:14px;">Need to cancel or reschedule?</p>
      <p style="margin:4px 0 0 0;"><a href="${manageLink}" style="color:#15803d;">Manage your booking here</a></p>
      <p style="margin:8px 0 0 0;color:#9ca3af;font-size:13px;">Please note: meetings cannot be rescheduled or cancelled within ${leadHours} hour${leadHours !== 1 ? "s" : ""} of the start time. For last-minute changes, please contact us directly.</p>
    </div>`);
  }

  if (elements.company_info) {
    sections.push(`<div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;">
      <p style="margin:0;font-weight:600;color:#374151;">${settings.business_name}</p>
      ${settings.contact_email ? `<p style="margin:4px 0 0 0;color:#6b7280;font-size:14px;">${settings.contact_email}</p>` : ""}
      ${elements.phone && settings.contact_phone ? `<p style="margin:4px 0 0 0;color:#6b7280;font-size:14px;">${settings.contact_phone}</p>` : ""}
    </div>`);
  }

  return `<div style="max-width:600px;margin:0 auto;padding:24px;">${sections.join("")}</div>`;
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

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let reqBody: { siteUrl?: string } = {};
    try { reqBody = await req.json(); } catch { /* empty body is fine */ }
    const publicSiteUrl = Deno.env.get("PUBLIC_SITE_URL") || "https://etqmkgomwbfxdwjoqjei.supabase.co";
    const effectiveSiteUrl = reqBody.siteUrl || publicSiteUrl;

    // Fetch all admin settings rows (one per user)
    const { data: allSettings } = await supabase
      .from("admin_settings")
      .select("*")
      .order("created_at", { ascending: true }) as { data: AdminSettings[] | null };

    if (!allSettings || allSettings.length === 0) {
      return new Response(JSON.stringify({ error: "No settings" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date();
    let totalEmailsSent = 0;

    for (const settings of allSettings) {
      const fromName = settings.email_from_name || settings.business_name;
      const fromEmail = settings.email_from_address || "noreply@jungosolutions.com";
      const adminTz = settings.timezone || "America/New_York";
      const today = getTodayInTz(adminTz);

      // --- Client reminders ---
      if (settings.email_notification_enabled) {
        const leadHours = settings.client_reminder_lead_hours ?? 24;
        const leadMs = leadHours * 60 * 60 * 1000;
        const reminderCutoff = new Date(now.getTime() + leadMs);
        const reminderStart = new Date(now.getTime());

        const { data: upcomingBookings } = await supabase
          .from("bookings")
          .select("*")
          .eq("status", "confirmed")
          .eq("user_id", settings.user_id)
          .gte("date", today)
          .order("date", { ascending: true })
          .order("start_time", { ascending: true }) as { data: Booking[] | null };

        if (upcomingBookings) {
          for (const booking of upcomingBookings) {
            const meetingStart = getMeetingInstantUTC(booking.date, booking.start_time, adminTz);
            if (meetingStart > reminderStart && meetingStart <= reminderCutoff) {
              const { data: existingLog } = await supabase
                .from("notification_log")
                .select("id")
                .eq("booking_id", booking.id)
                .eq("type", "email")
                .in("payload->>emailType", ["reminder", "reminder_immediate"])
                .maybeSingle();

              if (existingLog) continue;

              const template = settings.email_notification_template || DEFAULT_REMINDER_TEMPLATE;
              const textBody = fillTemplate(template, {
                client_name: `${booking.first_name} ${booking.last_name}`,
                business_name: settings.business_name,
                date: formatBookingDate(booking, adminTz),
                time: formatBookingTime(booking, adminTz),
                duration: booking.duration_minutes.toString(),
              });

              const html = buildReminderHtml(textBody, booking, settings, effectiveSiteUrl);
              const subject = `${TEST_SUBJECT_PREFIX}Reminder: Your meeting with ${settings.business_name}`;

              const sent = await sendEmail(resendApiKey, fromName, fromEmail, booking.client_email, subject, html);
              if (sent) totalEmailsSent++;

              await supabase.from("notification_log").insert({
                booking_id: booking.id,
                user_id: booking.user_id,
                type: "email",
                status: sent ? "sent" : "failed",
                payload: { emailType: "reminder", recipient: booking.client_email },
              });
            }
          }
        }
      }

      // --- Admin reminders ---
      if (settings.notification_enabled) {
        const adminEmail = settings.notification_email || settings.contact_email;
        if (adminEmail) {
          if (settings.admin_reminder_mode === "daily") {
            const targetDate = settings.admin_daily_summary_night_before
              ? new Date(now.getTime() + 24 * 60 * 60 * 1000).toLocaleDateString("en-CA", { timeZone: adminTz })
              : today;

            const { data: todayBookings } = await supabase
              .from("bookings")
              .select("*")
              .eq("status", "confirmed")
              .eq("user_id", settings.user_id)
              .eq("date", targetDate)
              .order("start_time", { ascending: true }) as { data: Booking[] | null };

            if (todayBookings && todayBookings.length > 0) {
              const logKey = `daily_summary_${targetDate}_${settings.user_id}`;
              const { data: existingLog } = await supabase
                .from("notification_log")
                .select("id")
                .eq("type", "email")
                .eq("payload->>emailType", logKey)
                .maybeSingle();

              if (!existingLog) {
                const summaryLines = todayBookings.map(b =>
                  `• ${formatDisplayDate(b.date)} at ${formatTime(b.start_time)} — ${b.first_name} ${b.last_name} (${b.duration_minutes} min)`
                ).join("\n");

                const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1f2937;max-width:600px;margin:0 auto;padding:24px;">
                  <h2 style="color:#1f2937;">Daily Meeting Summary — ${formatDisplayDate(targetDate)}</h2>
                  <p>You have ${todayBookings.length} meeting${todayBookings.length !== 1 ? "s" : ""} scheduled:</p>
                  <div style="white-space:pre-wrap;padding:16px;background:#f9fafb;border-radius:8px;">${summaryLines}</div>
                  <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;">
                    <p style="margin:0;font-weight:600;color:#374151;">${settings.business_name}</p>
                  </div>
                </div>`;

                const sent = await sendEmail(resendApiKey, fromName, fromEmail, adminEmail, `${TEST_SUBJECT_PREFIX}Daily Meeting Summary — ${formatDisplayDate(targetDate)}`, html);
                if (sent) totalEmailsSent++;

                await supabase.from("notification_log").insert({
                  booking_id: todayBookings[0].id,
                  user_id: settings.user_id,
                  type: "email",
                  status: sent ? "sent" : "failed",
                  payload: { emailType: logKey, recipient: adminEmail },
                });
              }
            }
          } else {
            const leadHours = settings.notification_lead_hours ?? 24;
            const leadMs = leadHours * 60 * 60 * 1000;
            const reminderCutoff = new Date(now.getTime() + leadMs);
            const reminderStart = new Date(now.getTime());

            const { data: upcomingBookings } = await supabase
              .from("bookings")
              .select("*")
              .eq("status", "confirmed")
              .eq("user_id", settings.user_id)
              .gte("date", today)
              .order("date", { ascending: true }) as { data: Booking[] | null };

            if (upcomingBookings) {
              for (const booking of upcomingBookings) {
                const meetingStart = getMeetingInstantUTC(booking.date, booking.start_time, adminTz);
                if (meetingStart > reminderStart && meetingStart <= reminderCutoff) {
                  const logKey = `admin_reminder_${booking.id}`;
                  const { data: existingLog } = await supabase
                    .from("notification_log")
                    .select("id")
                    .eq("type", "email")
                    .eq("payload->>emailType", logKey)
                    .maybeSingle();

                  if (existingLog) continue;

                  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1f2937;max-width:600px;margin:0 auto;padding:24px;">
                    <h2 style="color:#1f2937;">Upcoming Meeting Reminder</h2>
                    <p>You have an upcoming meeting:</p>
                    <div style="padding:16px;background:#f9fafb;border-radius:8px;">
                      <p style="margin:0;"><strong>${booking.first_name} ${booking.last_name}</strong></p>
                      <p style="margin:4px 0 0 0;">${formatDisplayDate(booking.date)} at ${formatTime(booking.start_time)}</p>
                      <p style="margin:4px 0 0 0;">Duration: ${booking.duration_minutes} minutes</p>
                      <p style="margin:4px 0 0 0;">Email: ${booking.client_email}</p>
                    </div>
                    <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;">
                      <p style="margin:0;font-weight:600;color:#374151;">${settings.business_name}</p>
                    </div>
                  </div>`;

                  const sent = await sendEmail(resendApiKey, fromName, fromEmail, adminEmail, `${TEST_SUBJECT_PREFIX}Reminder: Meeting with ${booking.first_name} ${booking.last_name}`, html);
                  if (sent) totalEmailsSent++;

                  await supabase.from("notification_log").insert({
                    booking_id: booking.id,
                    user_id: booking.user_id,
                    type: "email",
                    status: sent ? "sent" : "failed",
                    payload: { emailType: logKey, recipient: adminEmail },
                  });
                }
              }
            }
          }
        }
      }
    }

    return new Response(JSON.stringify({ sent: totalEmailsSent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-reminders error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
