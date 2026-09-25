import { supabase } from '@/lib/supabase';

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-calendar-sync`;

const headers = () => ({
  Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
});

export async function getGoogleAuthUrl(userId: string): Promise<string> {
  const res = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ mode: 'auth-url', userId }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to get auth URL');
  }
  const data = await res.json();
  return data.url as string;
}

export async function disconnectGoogleCalendar(userId: string): Promise<void> {
  const res = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ mode: 'disconnect', userId }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to disconnect');
  }
}

export async function triggerGoogleCalendarSync(bookingId: string): Promise<void> {
  try {
    await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ mode: 'sync', bookingId }),
    });
  } catch (err) {
    console.error('Google Calendar sync trigger failed:', err);
  }
}

export async function getConnection(userId: string) {
  const { data, error } = await supabase
    .from('google_calendar_connections')
    .select('id, google_email, connected_at, disconnected_at, last_sync_at, last_error')
    .eq('user_id', userId)
    .is('disconnected_at', null)
    .maybeSingle();

  if (error) {
    console.error('Error fetching Google Calendar connection:', error);
    return null;
  }
  return data;
}
