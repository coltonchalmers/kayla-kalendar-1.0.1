import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { RescheduleProposal, RescheduleProposalSlot } from '@/lib/types';

export interface RescheduleProposalWithSlots extends RescheduleProposal {
  slots: RescheduleProposalSlot[];
}

export function useRescheduleProposals() {
  const [proposals, setProposals] = useState<RescheduleProposalWithSlots[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchProposals = useCallback(async () => {
    const { data, error } = await supabase
      .from('reschedule_proposals')
      .select(`
        *,
        slots:reschedule_proposal_slots(*)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching reschedule proposals:', error);
    } else {
      setProposals(data as RescheduleProposalWithSlots[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchProposals();
  }, [fetchProposals]);

  const createProposal = useCallback(async (input: {
    booking_id: string;
    client_email: string;
    client_name: string;
    message?: string | null;
    allow_full_availability?: boolean;
    slots: { date: string; start_time: string }[];
  }) => {
    const token = crypto.randomUUID();
    const { slots, ...linkData } = input;

    const { data: link, error: linkError } = await supabase
      .from('reschedule_proposals')
      .insert({
        ...linkData,
        token,
        message: linkData.message || null,
        allow_full_availability: linkData.allow_full_availability ?? true,
      })
      .select()
      .single();

    if (linkError) throw linkError;

    const slotRows = slots.map(s => ({
      reschedule_proposal_id: link.id,
      date: s.date,
      start_time: s.start_time,
    }));

    if (slotRows.length > 0) {
      const { error: slotsError } = await supabase
        .from('reschedule_proposal_slots')
        .insert(slotRows);
      if (slotsError) throw slotsError;
    }

    const { data: fullSlots } = await supabase
      .from('reschedule_proposal_slots')
      .select('*')
      .eq('reschedule_proposal_id', link.id)
      .order('date', { ascending: true })
      .order('start_time', { ascending: true });

    const result: RescheduleProposalWithSlots = { ...link, slots: fullSlots || [] };
    setProposals(prev => [result, ...prev]);
    return result;
  }, []);

  const deleteProposal = useCallback(async (id: string) => {
    const { error } = await supabase
      .from('reschedule_proposals')
      .delete()
      .eq('id', id);

    if (error) throw error;
    setProposals(prev => prev.filter(p => p.id !== id));
  }, []);

  const fetchByToken = useCallback(async (token: string) => {
    const { data: link, error: linkError } = await supabase
      .from('reschedule_proposals')
      .select('*')
      .eq('token', token)
      .eq('is_active', true)
      .maybeSingle();

    if (linkError) throw linkError;
    if (!link) return null;

    const { data: slots, error: slotsError } = await supabase
      .from('reschedule_proposal_slots')
      .select('*')
      .eq('reschedule_proposal_id', link.id)
      .order('date', { ascending: true })
      .order('start_time', { ascending: true });

    if (slotsError) throw slotsError;

    return { ...link, slots: slots || [] } as RescheduleProposalWithSlots;
  }, []);

  const claimSlot = useCallback(async (
    proposalId: string,
    slotId: string
  ) => {
    const { data: slot, error: slotError } = await supabase
      .from('reschedule_proposal_slots')
      .update({ is_claimed: true })
      .eq('id', slotId)
      .eq('is_claimed', false)
      .select()
      .single();

    if (slotError) throw slotError;

    const { error: proposalError } = await supabase
      .from('reschedule_proposals')
      .update({ is_active: false, is_claimed: true, claimed_slot_id: slotId })
      .eq('id', proposalId);

    if (proposalError) throw proposalError;

    return slot;
  }, []);

  return {
    proposals,
    loading,
    createProposal,
    deleteProposal,
    fetchByToken,
    claimSlot,
    refresh: fetchProposals,
  };
}
