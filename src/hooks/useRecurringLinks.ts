import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { RecurringLink, TimeRestriction, MeetingLocationType } from '@/lib/types';

export function useRecurringLinks() {
  const [links, setLinks] = useState<RecurringLink[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLinks = useCallback(async () => {
    const { data, error } = await supabase
      .from('recurring_links')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) console.error('Error fetching links:', error);
    else setLinks(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchLinks();
  }, [fetchLinks]);

  const createLink = useCallback(async (input: {
    client_name: string;
    client_email: string;
    label?: string;
    frequency?: string | null;
    occurrences?: number | null;
    end_date?: string | null;
    allow_client_frequency?: boolean;
    allow_client_end_date?: boolean;
    meeting_type_id?: string | null;
    is_ongoing?: boolean;
    scheduling_mode?: 'strict' | 'flexible';
    time_restrictions?: TimeRestriction[] | null;
    allow_full_availability?: boolean;
    notes_to_client?: string | null;
    internal_notes?: string | null;
    expires_at?: string | null;
    meeting_location_type?: MeetingLocationType | null;
  }) => {
    const { data, error } = await supabase
      .from('recurring_links')
      .insert(input)
      .select()
      .single();

    if (error) throw error;
    setLinks(prev => [data, ...prev]);
    return data;
  }, []);

  const toggleLink = useCallback(async (id: string, is_active: boolean) => {
    const { data, error } = await supabase
      .from('recurring_links')
      .update({ is_active })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    setLinks(prev => prev.map(l => l.id === id ? data : l));
  }, []);

  const updateRecurringLink = useCallback(async (id: string, updates: {
    client_name?: string;
    client_email?: string;
    label?: string | null;
    frequency?: string | null;
    occurrences?: number | null;
    end_date?: string | null;
    allow_client_frequency?: boolean;
    allow_client_end_date?: boolean;
    meeting_type_id?: string | null;
    is_ongoing?: boolean;
    scheduling_mode?: 'strict' | 'flexible';
    time_restrictions?: TimeRestriction[] | null;
    allow_full_availability?: boolean;
    notes_to_client?: string | null;
    internal_notes?: string | null;
    expires_at?: string | null;
    meeting_location_type?: MeetingLocationType | null;
  }) => {
    const { data, error } = await supabase
      .from('recurring_links')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    setLinks(prev => prev.map(l => l.id === id ? data : l));
    return data;
  }, []);

  const deleteLink = useCallback(async (id: string) => {
    const { error } = await supabase
      .from('recurring_links')
      .delete()
      .eq('id', id);

    if (error) throw error;
    setLinks(prev => prev.filter(l => l.id !== id));
  }, []);

  const fetchLinkByToken = useCallback(async (token: string) => {
    const { data, error } = await supabase
      .from('recurring_links')
      .select('*')
      .eq('token', token)
      .eq('is_active', true)
      .maybeSingle();

    if (error) throw error;
    return data;
  }, []);

  const markLinkAsUsed = useCallback(async (id: string) => {
    const { error } = await supabase
      .from('recurring_links')
      .update({ is_used: true })
      .eq('id', id);
    if (error) console.error('Error marking link as used:', error);
    setLinks(prev => prev.map(l => l.id === id ? { ...l, is_used: true } : l));
  }, []);

  return { links, loading, createLink, toggleLink, updateRecurringLink, deleteLink, fetchLinkByToken, markLinkAsUsed, refresh: fetchLinks };
}
