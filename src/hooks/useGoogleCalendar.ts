import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import {
  getGoogleAuthUrl,
  disconnectGoogleCalendar,
  getConnection,
} from '@/lib/googleCalendarSync';
import type { GoogleCalendarConnection } from '@/lib/types';
import { useAuth } from '@/hooks/useAuth';

export function useGoogleCalendar() {
  const { user } = useAuth();
  const [connection, setConnection] = useState<GoogleCalendarConnection | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchConnection = useCallback(async () => {
    if (!user?.id) {
      setConnection(null);
      setLoading(false);
      return;
    }
    const data = await getConnection(user.id);
    setConnection(data as GoogleCalendarConnection | null);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    fetchConnection();
  }, [fetchConnection]);

  const connect = useCallback(async () => {
    if (!user?.id) return;
    setConnecting(true);
    setError(null);
    try {
      const url = await getGoogleAuthUrl(user.id);
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect');
      setConnecting(false);
    }
  }, [user?.id]);

  const disconnect = useCallback(async () => {
    if (!user?.id) return;
    setError(null);
    try {
      await disconnectGoogleCalendar(user.id);
      setConnection(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect');
    }
  }, [user?.id]);

  return { connection, loading, connecting, error, connect, disconnect, refresh: fetchConnection };
}
