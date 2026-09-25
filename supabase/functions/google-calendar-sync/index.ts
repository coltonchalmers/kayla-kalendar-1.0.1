import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
].join(" ");

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getEnv(key: string): string {
  const val = Deno.env.get(key);
  if (!val) throw new Error(`Missing env var: ${key}`);
  return val;
}

function getClientId(): string | null {
  return Deno.env.get("GOOGLE_CLIENT_ID") || null;
}

function getClientSecret(): string | null {
  return Deno.env.get("GOOGLE_CLIENT_SECRET") || null;
}

function getRedirectUri(): string {
  const siteUrl = Deno.env.get("PUBLIC_SITE_URL") || "";
  return `${siteUrl.replace(/\/$/, "")}/google-calendar/callback`;
}

function createSupabaseAdmin() {
  return createClient(
    getEnv("SUPABASE_URL"),
    getEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } }
  );
}

// ============================================================
// OAuth helpers
// ============================================================

async function exchangeCodeForTokens(code: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
}> {
  const clientId = getClientId();
  const clientSecret = getClientSecret();
  if (!clientId || !clientSecret) throw new Error("Google OAuth not configured");

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: getRedirectUri(),
      grant_type: "authorization_code",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token exchange failed: ${err}`);
  }

  return await res.json();
}

async function refreshAccessToken(refreshToken: string): Promise<{
  access_token: string;
  expires_in: number;
}> {
  const clientId = getClientId();
  const clientSecret = getClientSecret();
  if (!clientId || !clientSecret) throw new Error("Google OAuth not configured");

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token refresh failed: ${err}`);
  }

  return await res.json();
}

async function getGoogleUserInfo(accessToken: string): Promise<string> {
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return "unknown";
  const data = await res.json();
  return data.email || "unknown";
}

async function getValidAccessToken(supabase: ReturnType<typeof createClient>, connection: {
  id: string;
  access_token: string | null;
  refresh_token: string | null;
  token_expiry: string | null;
}): Promise<string> {
  if (!connection.refresh_token) throw new Error("No refresh token");

  const now = new Date();
  const expiry = connection.token_expiry ? new Date(connection.token_expiry) : null;

  // If access token is still valid (with 5 min buffer), use it
  if (connection.access_token && expiry && expiry.getTime() > now.getTime() + 5 * 60 * 1000) {
    return connection.access_token;
  }

  // Refresh the token
  const refreshed = await refreshAccessToken(connection.refresh_token);
  const newExpiry = new Date(now.getTime() + refreshed.expires_in * 1000).toISOString();

  await supabase
    .from("google_calendar_connections")
    .update({
      access_token: refreshed.access_token,
      token_expiry: newExpiry,
      updated_at: now.toISOString(),
    })
    .eq("id", connection.id);

  return refreshed.access_token;
}

// ============================================================
// Calendar event helpers
// ============================================================

function buildEventBody(booking: Record<string, unknown>, settings: Record<string, unknown>): Record<string, unknown> {
  const date = booking.date as string;
  const startTime = booking.start_time as string;
  const duration = booking.duration_minutes as number;
  const timezone = (settings.timezone as string) || "America/New_York";

  // Build naive datetime strings directly from the booking's date and time.
  // Google's API interprets a dateTime without a UTC suffix as being in the
  // timeZone field we provide, so we must NOT convert through Date objects
  // (which would shift the time to UTC and produce the wrong wall-clock time).
  const [startH, startM] = startTime.split(":").map(Number);
  const startHHMM = `${String(startH).padStart(2, "0")}:${String(startM).padStart(2, "0")}`;
  const totalMinutes = startH * 60 + startM + duration;
  const endH = Math.floor(totalMinutes / 60) % 24;
  const endM = totalMinutes % 60;
  // Handle overnight wrap (end time past midnight)
  let endDate = date;
  if (totalMinutes >= 24 * 60) {
    const [y, mo, d] = date.split("-").map(Number);
    const jsDate = new Date(y, mo - 1, d);
    jsDate.setDate(jsDate.getDate() + Math.floor(totalMinutes / (24 * 60)));
    endDate = `${jsDate.getFullYear()}-${String(jsDate.getMonth() + 1).padStart(2, "0")}-${String(jsDate.getDate()).padStart(2, "0")}`;
  }

  const startDateTime = `${date}T${startHHMM}:00`;
  const endDateTime = `${endDate}T${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}:00`;

  const firstName = booking.first_name as string;
  const lastName = booking.last_name as string;
  const clientName = `${firstName} ${lastName}`.trim();
  const clientEmail = booking.client_email as string;
  const zoomLink = booking.zoom_link as string | null;
  const meetingLocation = booking.meeting_location_type as string;
  const clientNotes = booking.client_notes as string | null;
  const notesToClient = booking.notes_to_client as string | null;
  const businessName = (settings.business_name as string) || "Meeting";

  const descriptionParts: string[] = [];
  descriptionParts.push(`Client: ${clientName} (${clientEmail})`);
  if (booking.client_phone) descriptionParts.push(`Phone: ${booking.client_phone}`);
  if (zoomLink) descriptionParts.push(`Meeting Link: ${zoomLink}`);
  if (meetingLocation === "phone" && booking.client_phone) {
    descriptionParts.push(`This is a phone meeting — call the client at ${booking.client_phone}`);
  }
  if (clientNotes) descriptionParts.push(`Client Notes: ${clientNotes}`);
  if (notesToClient) descriptionParts.push(`Notes: ${notesToClient}`);

  return {
    summary: `${clientName} — ${businessName}`,
    description: descriptionParts.join("\n"),
    start: { dateTime: startDateTime, timeZone: timezone },
    end: { dateTime: endDateTime, timeZone: timezone },
    attendees: [{ email: clientEmail }],
  };
}

async function createCalendarEvent(accessToken: string, eventBody: Record<string, unknown>): Promise<string> {
  const res = await fetch(`${GOOGLE_CALENDAR_API}/calendars/primary/events`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(eventBody),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Create event failed: ${err}`);
  }

  const data = await res.json();
  return data.id as string;
}

async function updateCalendarEvent(accessToken: string, eventId: string, eventBody: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${GOOGLE_CALENDAR_API}/calendars/primary/events/${eventId}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(eventBody),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Update event failed: ${err}`);
  }
}

async function deleteCalendarEvent(accessToken: string, eventId: string): Promise<void> {
  const res = await fetch(`${GOOGLE_CALENDAR_API}/calendars/primary/events/${eventId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok && res.status !== 404) {
    const err = await res.text();
    throw new Error(`Delete event failed: ${err}`);
  }
}

// ============================================================
// Sync logic
// ============================================================

async function syncBooking(
  supabase: ReturnType<typeof createClient>,
  bookingId: string
): Promise<{ synced: boolean; error?: string }> {
  // Fetch booking
  const { data: booking, error: bookingErr } = await supabase
    .from("bookings")
    .select("*")
    .eq("id", bookingId)
    .maybeSingle();

  if (bookingErr || !booking) {
    return { synced: false, error: "Booking not found" };
  }

  const userId = booking.user_id;
  if (!userId) return { synced: false, error: "No user_id on booking" };

  // Check if auto-sync is enabled
  const { data: settings } = await supabase
    .from("admin_settings")
    .select("google_calendar_auto_sync, business_name, timezone")
    .eq("user_id", userId)
    .maybeSingle();

  if (!settings?.google_calendar_auto_sync) {
    await supabase
      .from("bookings")
      .update({ google_sync_status: "not_connected" })
      .eq("id", bookingId);
    return { synced: false, error: "Auto-sync disabled" };
  }

  // Get the admin's active connection
  const { data: connection, error: connErr } = await supabase
    .from("google_calendar_connections")
    .select("*")
    .eq("user_id", userId)
    .is("disconnected_at", null)
    .maybeSingle();

  if (connErr || !connection) {
    await supabase
      .from("bookings")
      .update({ google_sync_status: "not_connected" })
      .eq("id", bookingId);
    return { synced: false, error: "No active Google connection" };
  }

  try {
    const accessToken = await getValidAccessToken(supabase, connection);
    const eventBody = buildEventBody(booking, settings);

    if (booking.status === "cancelled") {
      // Delete the event if it exists
      if (booking.google_event_id) {
        await deleteCalendarEvent(accessToken, booking.google_event_id);
      }
      await supabase
        .from("bookings")
        .update({
          google_sync_status: "synced",
          google_event_id: null,
        })
        .eq("id", bookingId);
    } else if (booking.google_event_id) {
      // Update existing event
      await updateCalendarEvent(accessToken, booking.google_event_id, eventBody);
      await supabase
        .from("bookings")
        .update({ google_sync_status: "synced" })
        .eq("id", bookingId);
    } else {
      // Create new event
      const eventId = await createCalendarEvent(accessToken, eventBody);
      await supabase
        .from("bookings")
        .update({
          google_sync_status: "synced",
          google_event_id: eventId,
        })
        .eq("id", bookingId);
    }

    // Update connection last_sync_at
    await supabase
      .from("google_calendar_connections")
      .update({ last_sync_at: new Date().toISOString(), last_error: null })
      .eq("id", connection.id);

    return { synced: true };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);

    // Check if it's a permanent auth failure (revoked token)
    const isAuthError = errMsg.includes("invalid_grant") || errMsg.includes("Token refresh failed");

    if (isAuthError) {
      // Mark connection as having a permanent error
      await supabase
        .from("google_calendar_connections")
        .update({ last_error: errMsg, updated_at: new Date().toISOString() })
        .eq("id", connection.id);
      await supabase
        .from("bookings")
        .update({ google_sync_status: "not_connected" })
        .eq("id", bookingId);
    } else {
      // Temporary failure — mark for retry
      await supabase
        .from("google_calendar_connections")
        .update({ last_error: errMsg, updated_at: new Date().toISOString() })
        .eq("id", connection.id);
      await supabase
        .from("bookings")
        .update({ google_sync_status: "failed" })
        .eq("id", bookingId);
    }

    return { synced: false, error: errMsg };
  }
}

async function sweepSync(supabase: ReturnType<typeof createClient>): Promise<{ processed: number; synced: number; failed: number }> {
  // Find all bookings needing sync
  const { data: pendingBookings, error } = await supabase
    .from("bookings")
    .select("id")
    .in("google_sync_status", ["pending", "failed"])
    .limit(50);

  if (error || !pendingBookings) {
    return { processed: 0, synced: 0, failed: 0 };
  }

  let synced = 0;
  let failed = 0;

  for (const b of pendingBookings) {
    const result = await syncBooking(supabase, b.id);
    if (result.synced) synced++;
    else failed++;
  }

  return { processed: pendingBookings.length, synced, failed };
}

// ============================================================
// Main handler
// ============================================================

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const supabase = createSupabaseAdmin();

    // ---- OAuth callback ----
    if (url.searchParams.has("code")) {
      const code = url.searchParams.get("code")!;
      const state = url.searchParams.get("state");

      if (!state) return jsonResponse({ error: "Missing state" }, 400);

      // Verify the user via state (we pass user_id as state)
      const userId = state;

      const tokens = await exchangeCodeForTokens(code);
      const googleEmail = await getGoogleUserInfo(tokens.access_token);

      // Deactivate any existing active connection for this user
      await supabase
        .from("google_calendar_connections")
        .update({ disconnected_at: new Date().toISOString() })
        .eq("user_id", userId)
        .is("disconnected_at", null);

      // Insert new connection
      const expiryDate = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
      await supabase.from("google_calendar_connections").insert({
        user_id: userId,
        google_email: googleEmail,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_expiry: expiryDate,
        connected_at: new Date().toISOString(),
      });

      // Mark all this admin's confirmed bookings as pending for sync
      await supabase
        .from("bookings")
        .update({ google_sync_status: "pending" })
        .eq("user_id", userId)
        .eq("status", "confirmed")
        .neq("google_sync_status", "synced");

      return jsonResponse({ connected: true, email: googleEmail });
    }

    // ---- Body-based requests ----
    const body = await req.json().catch(() => ({}));
    const mode = body.mode as string | undefined;

    // ---- Get auth URL ----
    if (mode === "auth-url") {
      const clientId = getClientId();
      if (!clientId) return jsonResponse({ error: "Google OAuth not configured" }, 500);

      const userId = body.userId as string;
      if (!userId) return jsonResponse({ error: "Missing userId" }, 400);

      const authUrl = new URL(GOOGLE_AUTH_URL);
      authUrl.searchParams.set("client_id", clientId);
      authUrl.searchParams.set("redirect_uri", getRedirectUri());
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("scope", SCOPES);
      authUrl.searchParams.set("access_type", "offline");
      authUrl.searchParams.set("prompt", "consent");
      authUrl.searchParams.set("state", userId);

      return jsonResponse({ url: authUrl.toString() });
    }

    // ---- Disconnect ----
    if (mode === "disconnect") {
      const userId = body.userId as string;
      if (!userId) return jsonResponse({ error: "Missing userId" }, 400);

      await supabase
        .from("google_calendar_connections")
        .update({
          disconnected_at: new Date().toISOString(),
          access_token: null,
          refresh_token: null,
        })
        .eq("user_id", userId)
        .is("disconnected_at", null);

      // Mark this admin's bookings as not_connected
      await supabase
        .from("bookings")
        .update({ google_sync_status: "not_connected" })
        .eq("user_id", userId)
        .eq("status", "confirmed");

      return jsonResponse({ disconnected: true });
    }

    // ---- Sync single booking ----
    if (mode === "sync") {
      const bookingId = body.bookingId as string;
      if (!bookingId) return jsonResponse({ error: "Missing bookingId" }, 400);

      const result = await syncBooking(supabase, bookingId);
      return jsonResponse(result, result.synced ? 200 : 500);
    }

    // ---- Sweep (cron-triggered) ----
    if (mode === "sweep") {
      const result = await sweepSync(supabase);
      return jsonResponse(result);
    }

    return jsonResponse({ error: "Unknown mode" }, 400);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: msg }, 500);
  }
});
