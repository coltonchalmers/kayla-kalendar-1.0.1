import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { AvailabilityRule, AvailabilityOverride } from '@/lib/types';

export function useAvailability(userId?: string) {
  const [rules, setRules] = useState<AvailabilityRule[]>([]);
  const [overrides, setOverrides] = useState<AvailabilityOverride[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRules = useCallback(async () => {
    let query = supabase
      .from('availability_rules')
      .select('*');
    if (userId) {
      query = query.eq('user_id', userId);
    }
    const { data, error } = await query
      .order('day_of_week')
      .order('start_time');

    if (error) console.error('Error fetching rules:', error);
    else setRules(data || []);
  }, []);

  const fetchOverrides = useCallback(async () => {
    let query = supabase
      .from('availability_overrides')
      .select('*');
    if (userId) {
      query = query.eq('user_id', userId);
    }
    const { data, error } = await query
      .gte('date', new Date().toISOString().split('T')[0])
      .order('date');

    if (error) console.error('Error fetching overrides:', error);
    else setOverrides(data || []);
  }, []);

  useEffect(() => {
    Promise.all([fetchRules(), fetchOverrides()]).then(() => setLoading(false));
  }, [fetchRules, fetchOverrides, userId]);

  const addRule = useCallback(async (rule: { day_of_week: number; start_time: string; end_time: string }) => {
    const { data, error } = await supabase
      .from('availability_rules')
      .insert(rule)
      .select()
      .single();

    if (error) throw error;
    setRules(prev => [...prev, data]);
    return data;
  }, []);

  const updateRule = useCallback(async (id: string, updates: Partial<AvailabilityRule>) => {
    const { data, error } = await supabase
      .from('availability_rules')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    setRules(prev => prev.map(r => r.id === id ? data : r));
    return data;
  }, []);

  const deleteRule = useCallback(async (id: string) => {
    const { error } = await supabase
      .from('availability_rules')
      .delete()
      .eq('id', id);

    if (error) throw error;
    setRules(prev => prev.filter(r => r.id !== id));
  }, []);

  const addOverride = useCallback(async (override: {
    date: string;
    is_blocked: boolean;
    start_time?: string;
    end_time?: string;
    reason?: string;
  }) => {
    const { data, error } = await supabase
      .from('availability_overrides')
      .insert(override)
      .select()
      .single();

    if (error) throw error;
    setOverrides(prev => [...prev, data]);
    return data;
  }, []);

  const deleteOverride = useCallback(async (id: string) => {
    const { error } = await supabase
      .from('availability_overrides')
      .delete()
      .eq('id', id);

    if (error) throw error;
    setOverrides(prev => prev.filter(o => o.id !== id));
  }, []);

  return {
    rules,
    overrides,
    loading,
    addRule,
    updateRule,
    deleteRule,
    addOverride,
    deleteOverride,
    refresh: () => Promise.all([fetchRules(), fetchOverrides()]),
  };
}
