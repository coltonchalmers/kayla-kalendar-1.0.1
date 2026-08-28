import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { AdminSettings } from '@/lib/types';

export function useSettings(userId?: string) {
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSettings = useCallback(async () => {
    let query = supabase.from('admin_settings').select('*');
    if (userId) {
      query = query.eq('user_id', userId);
    }
    const { data, error } = await query.maybeSingle();

    if (error) {
      console.error('Error fetching settings:', error);
    } else {
      setSettings(data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings, userId]);

  const ensureSettings = useCallback(async (userId: string) => {
    if (settings) return settings;

    const { data: existing } = await supabase
      .from('admin_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (existing) {
      setSettings(existing);
      return existing;
    }

    const { data: created, error } = await supabase
      .from('admin_settings')
      .upsert({ user_id: userId })
      .select()
      .single();

    if (error) {
      console.error('Error creating settings:', error);
      return null;
    }

    setSettings(created);
    return created;
  }, [settings]);

  const updateSettings = useCallback(async (updates: Partial<AdminSettings>) => {
    if (!settings) return;

    const { data, error } = await supabase
      .from('admin_settings')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', settings.id)
      .select()
      .single();

    if (error) {
      console.error('Error updating settings:', error);
      throw error;
    }

    setSettings(data);
    return data;
  }, [settings]);

  const resetSettings = useCallback(async () => {
    if (!settings) return;

    const defaults = {
      business_name: '',
      contact_email: '',
      contact_phone: '',
      booking_lead_hours: 2,
      booking_window_days: 90,
      buffer_minutes: 15,
      slot_increment_minutes: 15,
      notification_enabled: false,
      notification_lead_hours: 24,
      notification_email: '',
      client_reminder_lead_hours: 24,
      admin_reminder_mode: 'individual',
      admin_daily_summary_time: '07:00',
      admin_daily_summary_night_before: false,
      email_invite_enabled: true,
      email_confirmation_enabled: true,
      email_notification_enabled: true,
      email_announcement_enabled: true,
      email_cancellation_enabled: true,
      email_reschedule_enabled: true,
      email_recurring_confirmation_enabled: true,
      email_change_enabled: true,
      email_include_company_info: true,
      email_include_zoom: true,
      email_include_phone: true,
      email_include_google_calendar: true,
      email_invite_elements: { company_info: true, zoom: true, phone: true, google_calendar: true },
      email_confirmation_elements: { company_info: true, zoom: true, phone: true, google_calendar: true },
      email_notification_elements: { company_info: true, zoom: true, phone: true, google_calendar: true },
      email_announcement_elements: { company_info: true, zoom: true, phone: true, google_calendar: true },
      email_cancellation_elements: { company_info: true, zoom: true, phone: true, google_calendar: true },
      email_reschedule_elements: { company_info: true, zoom: true, phone: true, google_calendar: true },
      email_recurring_confirmation_elements: { company_info: true, zoom: true, phone: true, google_calendar: true },
      email_change_elements: { company_info: true, zoom: true, phone: true, google_calendar: true },
      email_invite_template: null,
      email_confirmation_template: null,
      email_notification_template: null,
      email_announcement_template: null,
      email_cancellation_template: null,
      email_reschedule_template: null,
      email_recurring_confirmation_template: null,
      email_change_template: null,
      email_from_name: '',
      email_from_address: '',
      zoom_enabled: false,
      zoom_default_link: null,
      site_url: null,
      timezone: 'America/New_York',
    };

    const { data, error } = await supabase
      .from('admin_settings')
      .update({ ...defaults, updated_at: new Date().toISOString() })
      .eq('id', settings.id)
      .select()
      .single();

    if (error) {
      console.error('Error resetting settings:', error);
      throw error;
    }

    setSettings(data);
    return data;
  }, [settings]);

  return { settings, loading, fetchSettings, ensureSettings, updateSettings, resetSettings };
}
