import { useState } from 'react';
import Textarea from '@/components/ui/Textarea';
import { CalendarClock, Plus, Copy, Check, Trash2, ToggleLeft, ToggleRight, X, Clock, CalendarRange, AlertTriangle, Edit3, Lock, Mail } from 'lucide-react';
import { useProposalLinks } from '@/hooks/useProposalLinks';
import { useMeetingTypes } from '@/hooks/useMeetingTypes';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Modal from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { formatTime, formatDisplayDate, classNames, timeToMinutes, minutesToTime } from '@/lib/utils';
import { triggerInviteEmail } from '@/lib/bookingEmails';
import type { ProposalLinkWithSlots } from '@/hooks/useProposalLinks';

interface SlotDraft {
  date: string;
  start_time: string;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function splitName(fullName: string): { first: string; last: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 0) return { first: '', last: '' };
  if (parts.length === 1) return { first: parts[0], last: '' };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

export default function ProposalLinksPage() {
  const { proposals, loading, createProposal, toggleProposal, updateProposal, deleteProposal, deleteSlot, addSlot } = useProposalLinks();
  const { meetingTypes, loading: mtLoading } = useMeetingTypes();

  const [showCreate, setShowCreate] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [label, setLabel] = useState('');
  const [meetingTypeId, setMeetingTypeId] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [slotDrafts, setSlotDrafts] = useState<SlotDraft[]>([]);
  const [draftDate, setDraftDate] = useState('');
  const [draftTime, setDraftTime] = useState('');
  const [slotMode, setSlotMode] = useState<'single' | 'range'>('single');
  const [rangeDate, setRangeDate] = useState('');
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');
  const [rangeInterval, setRangeInterval] = useState('30');
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [addSlotDate, setAddSlotDate] = useState('');
  const [addSlotTime, setAddSlotTime] = useState('');
  const [addSlotForId, setAddSlotForId] = useState<string | null>(null);
  const [emailError, setEmailError] = useState('');
  const [notesToClient, setNotesToClient] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [allowFullAvailability, setAllowFullAvailability] = useState(true);

  // Edit modal state
  const [editTarget, setEditTarget] = useState<ProposalLinkWithSlots | null>(null);
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editLabel, setEditLabel] = useState('');
  const [editMeetingTypeId, setEditMeetingTypeId] = useState('');
  const [editExpiresAt, setEditExpiresAt] = useState('');
  const [editNotesToClient, setEditNotesToClient] = useState('');
  const [editInternalNotes, setEditInternalNotes] = useState('');
  const [editAllowFullAvailability, setEditAllowFullAvailability] = useState(true);
  const [editSlotDrafts, setEditSlotDrafts] = useState<SlotDraft[]>([]);
  const [editDraftDate, setEditDraftDate] = useState('');
  const [editDraftTime, setEditDraftTime] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const meetingTypeName = (id: string | null) => {
    if (!id) return null;
    return meetingTypes.find(mt => mt.id === id)?.name || null;
  };

  const addDraftSlot = () => {
    if (!draftDate || !draftTime) return;
    setSlotDrafts(prev => [...prev, { date: draftDate, start_time: draftTime }].sort((a, b) =>
      a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time)
    ));
    setDraftDate('');
    setDraftTime('');
  };

  const addRangeSlots = () => {
    if (!rangeDate || !rangeStart || !rangeEnd) return;
    const startMin = timeToMinutes(rangeStart);
    const endMin = timeToMinutes(rangeEnd);
    const interval = parseInt(rangeInterval) || 30;
    if (startMin >= endMin) return;
    const newSlots: SlotDraft[] = [];
    for (let m = startMin; m + interval <= endMin; m += interval) {
      newSlots.push({ date: rangeDate, start_time: minutesToTime(m) });
    }
    setSlotDrafts(prev => {
      const existing = new Map(prev.map(s => [`${s.date}|${s.start_time}`, s]));
      for (const s of newSlots) {
        existing.set(`${s.date}|${s.start_time}`, s);
      }
      return Array.from(existing.values()).sort((a, b) =>
        a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time)
      );
    });
    setRangeStart('');
    setRangeEnd('');
  };

  const removeDraftSlot = (index: number) => {
    setSlotDrafts(prev => prev.filter((_, i) => i !== index));
  };

  const resetForm = () => {
    setFirstName('');
    setLastName('');
    setClientEmail('');
    setLabel('');
    setMeetingTypeId('');
    setExpiresAt('');
    setSlotDrafts([]);
    setDraftDate('');
    setDraftTime('');
    setRangeDate('');
    setRangeStart('');
    setRangeEnd('');
    setRangeInterval('30');
    setSlotMode('single');
    setNotesToClient('');
    setInternalNotes('');
    setAllowFullAvailability(true);
  };

  const handleCreate = async () => {
    if (!firstName.trim() || !lastName.trim() || !clientEmail.trim() || !meetingTypeId || slotDrafts.length === 0) return;
    if (!isValidEmail(clientEmail.trim())) {
      setEmailError('Please enter a valid email address');
      return;
    }
    setEmailError('');
    setCreating(true);
    try {
      const clientName = `${firstName.trim()} ${lastName.trim()}`;
      const proposal = await createProposal({
        client_name: clientName,
        client_email: clientEmail.trim(),
        label: label.trim() || undefined,
        meeting_type_id: meetingTypeId || null,
        meeting_location_type: meetingLocationType || null,
        expires_at: expiresAt ? new Date(expiresAt + 'T23:59:59').toISOString() : null,
        internal_notes: internalNotes.trim() || null,
        notes_to_client: notesToClient.trim() || null,
        allow_full_availability: allowFullAvailability,
        slots: slotDrafts,
      });

      const inviteUrl = `${window.location.origin}/p/${proposal.token}`;
      await triggerInviteEmail(clientName, clientEmail.trim(), inviteUrl, notesToClient.trim() || undefined);

      setShowCreate(false);
      resetForm();
    } catch (err) {
      console.error(err);
      alert('Failed to create proposal. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  const copyLink = (token: string, id: string) => {
    const url = `${window.location.origin}/p/${token}`;
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleToggle = async (id: string, active: boolean) => {
    try { await toggleProposal(id, !active); } catch (err) { console.error(err); }
  };

  const handleDelete = async (id: string) => {
    try { await deleteProposal(id); } catch (err) { console.error(err); }
    setDeleteTarget(null);
  };

  const handleDeleteSlot = async (slotId: string, proposalId: string) => {
    try { await deleteSlot(slotId, proposalId); } catch (err) { console.error(err); }
  };

  const handleAddSlot = async (proposalId: string) => {
    if (!addSlotDate || !addSlotTime) return;
    try {
      await addSlot(proposalId, addSlotDate, addSlotTime);
      setAddSlotDate('');
      setAddSlotTime('');
      setAddSlotForId(null);
    } catch (err) { console.error(err); }
  };

  const openEditModal = (proposal: ProposalLinkWithSlots) => {
    const { first, last } = splitName(proposal.client_name);
    setEditTarget(proposal);
    setEditFirstName(first);
    setEditLastName(last);
    setEditEmail(proposal.client_email);
    setEditLabel(proposal.label || '');
    setEditMeetingTypeId(proposal.meeting_type_id || '');
    setMeetingLocationType(mt.meeting_location_type || '');
    setEditExpiresAt(proposal.expires_at ? new Date(proposal.expires_at).toISOString().slice(0, 10) : '');
    setEditNotesToClient(proposal.notes_to_client || '');
    setEditInternalNotes(proposal.internal_notes || '');
    setEditAllowFullAvailability(proposal.allow_full_availability ?? true);
    setEditSlotDrafts(proposal.slots.map(s => ({ date: s.date, start_time: s.start_time })));
    setEditDraftDate('');
    setEditDraftTime('');
    setEditError('');
  };

  const addEditDraftSlot = () => {
    if (!editDraftDate || !editDraftTime) return;
    setEditSlotDrafts(prev => [...prev, { date: editDraftDate, start_time: editDraftTime }].sort((a, b) =>
      a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time)
    ));
    setEditDraftDate('');
    setEditDraftTime('');
  };

  const removeEditDraftSlot = (index: number) => {
    setEditSlotDrafts(prev => prev.filter((_, i) => i !== index));
  };

  const handleSaveEdit = async () => {
    if (!editTarget) return;
    if (!editFirstName.trim() || !editLastName.trim() || !editEmail.trim() || !editMeetingTypeId) {
      setEditError('First name, last name, email, and meeting type are required.');
      return;
    }
    if (!isValidEmail(editEmail.trim())) {
      setEditError('Please enter a valid email address.');
      return;
    }
    setEditSaving(true);
    setEditError('');
    try {
      const clientName = `${editFirstName.trim()} ${editLastName.trim()}`;
      await updateProposal(editTarget.id, {
        client_name: clientName,
        client_email: editEmail.trim(),
        label: editLabel.trim() || null,
        meeting_type_id: editMeetingTypeId || null,
        expires_at: editExpiresAt ? new Date(editExpiresAt + 'T23:59:59').toISOString() : null,
        notes_to_client: editNotesToClient.trim() || null,
        internal_notes: editInternalNotes.trim() || null,
        allow_full_availability: editAllowFullAvailability,
      });

      // Sync slot changes: remove slots that are no longer in the draft, add new ones
      const existingSlotIds = editTarget.slots.map(s => s.id);
      const draftKeys = new Set(editSlotDrafts.map(s => `${s.date}|${s.start_time}`));
      const existingKeys = new Set(editTarget.slots.map(s => `${s.date}|${s.start_time}`));

      for (const slot of editTarget.slots) {
        if (!draftKeys.has(`${slot.date}|${slot.start_time}`) && !slot.is_claimed) {
          await deleteSlot(slot.id, editTarget.id);
        }
      }
      for (const draft of editSlotDrafts) {
        if (!existingKeys.has(`${draft.date}|${draft.start_time}`)) {
          await addSlot(editTarget.id, draft.date, draft.start_time);
        }
      }

      setEditTarget(null);
    } catch (err) {
      console.error(err);
      setEditError('Failed to save changes. Please try again.');
    } finally {
      setEditSaving(false);
    }
  };

  const isExpired = (expiresAt: string | null) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  if (loading || mtLoading) {
    return <div className="flex justify-center py-20"><LoadingSpinner size="lg" /></div>;
  }

  const availableCount = (slots: ProposalLinkWithSlots['slots']) =>
    slots.filter(s => !s.is_claimed).length;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Proposal Links</h1>
          <p className="text-gray-500 mt-1">Send clients a curated list of date/time options to choose from.</p>
        </div>
        <Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowCreate(true)}>
          Create Proposal
        </Button>
      </div>

      {proposals.length === 0 ? (
        <Card className="text-center py-16">
          <CalendarClock className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No proposal links yet.</p>
          <p className="text-sm text-gray-400 mt-1">Create a proposal to send a client specific date/time options.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {proposals.map(proposal => {
            const mtName = meetingTypeName(proposal.meeting_type_id);
            const available = availableCount(proposal.slots);
            const expired = isExpired(proposal.expires_at);
            const isExpanded = expandedId === proposal.id;
            const canEdit = !proposal.is_used;

            return (
              <Card key={proposal.id} padding="sm">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-gray-900 truncate">{proposal.client_name}</p>
                      <Badge variant={proposal.is_active && !expired ? 'success' : 'neutral'}>
                        {expired ? 'Expired' : proposal.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                      {proposal.is_used && <Badge variant="neutral">Used</Badge>}
                    </div>
                    <p className="text-sm text-gray-500 truncate">{proposal.client_email}</p>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      {mtName && <span className="text-xs text-jungo-green-600">{mtName}</span>}
                      <span className="text-xs text-gray-400">
                        {available} of {proposal.slots.length} slots available
                      </span>
                      {proposal.label && <span className="text-xs text-gray-400">{proposal.label}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={copiedId === proposal.id ? <Check className="w-4 h-4 text-jungo-green-500" /> : <Copy className="w-4 h-4" />}
                      onClick={() => copyLink(proposal.token, proposal.id)}
                    >
                      {copiedId === proposal.id ? 'Copied' : 'Copy'}
                    </Button>
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : proposal.id)}
                      className="px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      {isExpanded ? 'Hide' : 'Details'}
                    </button>
                    {canEdit && (
                      <button
                        onClick={() => openEditModal(proposal)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-jungo-green-600 hover:bg-jungo-green-50 transition-colors"
                        title="Edit"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => handleToggle(proposal.id, proposal.is_active)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                      title={proposal.is_active ? 'Deactivate' : 'Activate'}
                    >
                      {proposal.is_active ? <ToggleRight className="w-5 h-5 text-jungo-green-500" /> : <ToggleLeft className="w-5 h-5" />}
                    </button>
                    <button
                      onClick={() => setDeleteTarget(proposal.id)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
                    {/* Slot list */}
                    <div className="space-y-2">
                      {proposal.slots.length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-2">No slots in this proposal.</p>
                      ) : (
                        proposal.slots.map(slot => (
                          <div key={slot.id} className="flex items-center justify-between gap-3 bg-gray-50 rounded-lg px-3 py-2">
                            <div className="flex items-center gap-3">
                              <Clock className="w-4 h-4 text-gray-400" />
                              <span className="text-sm text-gray-700">{formatDisplayDate(slot.date)}</span>
                              <span className="text-sm text-gray-500">at {formatTime(slot.start_time)}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              {slot.is_claimed ? (
                                <Badge variant="neutral">Booked</Badge>
                              ) : (
                                <Badge variant="success">Available</Badge>
                              )}
                              {!slot.is_claimed && canEdit && (
                                <button
                                  onClick={() => handleDeleteSlot(slot.id, proposal.id)}
                                  className="p-1 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        ))
                      )}

                      {canEdit && (addSlotForId === proposal.id ? (
                        <div className="flex items-center gap-2 mt-2">
                          <input
                            type="date"
                            value={addSlotDate}
                            onChange={e => setAddSlotDate(e.target.value)}
                            className="rounded-lg border border-gray-300 text-sm px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-jungo-green-200"
                          />
                          <input
                            type="time"
                            value={addSlotTime}
                            onChange={e => setAddSlotTime(e.target.value)}
                            className="rounded-lg border border-gray-300 text-sm px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-jungo-green-200"
                          />
                          <Button size="sm" onClick={() => handleAddSlot(proposal.id)} disabled={!addSlotDate || !addSlotTime}>
                            Add
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => { setAddSlotForId(null); setAddSlotDate(''); setAddSlotTime(''); }}>
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setAddSlotForId(proposal.id)}
                          className="flex items-center gap-1.5 text-sm text-jungo-green-600 hover:text-jungo-green-700 mt-2 transition-colors"
                        >
                          <Plus className="w-4 h-4" />
                          Add slot
                        </button>
                      ))}
                    </div>

                    {/* Metadata details */}
                    <div className="space-y-2 pt-3 border-t border-gray-100">
                      {proposal.label && (
                        <div className="flex items-start gap-2">
                          <span className="text-xs font-medium text-gray-400 w-20 flex-shrink-0">Label</span>
                          <span className="text-sm text-gray-700">{proposal.label}</span>
                        </div>
                      )}
                      {proposal.expires_at && (
                        <div className="flex items-start gap-2">
                          <span className="text-xs font-medium text-gray-400 w-20 flex-shrink-0">Expires</span>
                          <span className="text-sm text-gray-700">{new Date(proposal.expires_at).toLocaleDateString()}</span>
                        </div>
                      )}
                      <div className="flex items-start gap-2">
                        <span className="text-xs font-medium text-gray-400 w-20 flex-shrink-0">Full Cal</span>
                        <span className="text-sm text-gray-700">{proposal.allow_full_availability ? 'Allowed' : 'Not allowed'}</span>
                      </div>
                      {proposal.notes_to_client && (
                        <div className="flex items-start gap-2">
                          <Mail className="w-3.5 h-3.5 text-emerald-500 mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="text-xs font-medium text-emerald-600">Notes to Client</p>
                            <p className="text-sm text-gray-700 whitespace-pre-wrap">{proposal.notes_to_client}</p>
                          </div>
                        </div>
                      )}
                      {proposal.internal_notes && (
                        <div className="flex items-start gap-2">
                          <Lock className="w-3.5 h-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="text-xs font-medium text-amber-600">Internal Notes</p>
                            <p className="text-sm text-gray-700 whitespace-pre-wrap">{proposal.internal_notes}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Proposal Link" maxWidth="md">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="First Name" required value={firstName} onChange={e => setFirstName(e.target.value)} />
            <Input label="Last Name" required value={lastName} onChange={e => setLastName(e.target.value)} />
          </div>
          <Input label="Client Email" type="email" required value={clientEmail} onChange={e => setClientEmail(e.target.value)} error={emailError} />

          <Select
            label="Meeting Type"
            required
            value={meetingTypeId}
            onChange={e => setMeetingTypeId(e.target.value)}
            options={[
              { value: '', label: 'Select...' },
              ...meetingTypes.map(mt => ({ value: mt.id, label: `${mt.name} (${mt.duration_minutes} min)` })),
            ]}
          />
          <Select
            label="Meeting Location"
            value={meetingLocationType}
            onChange={e => setMeetingLocationType(e.target.value)}  options={[
              { value: '', label: 'Let Client Choose' },
              { value: 'zoom', label: 'Zoom' },
              { value: 'phone', label: 'Phone' },
            ]}
            hint="Choose a location or let the client decide when they book."
            />


          <Input label="Label (internal note)" value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g., Follow-up options" />

          <Input
            label="Expires (optional)"
            type="date"
            value={expiresAt}
            onChange={e => setExpiresAt(e.target.value)}
          />

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">Offered Slots</label>
              <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
                <button
                  type="button"
                  onClick={() => setSlotMode('single')}
                  className={classNames(
                    'px-3 py-1.5 font-medium transition-colors',
                    slotMode === 'single' ? 'bg-jungo-green-500 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
                  )}
                >
                  Single Slot
                </button>
                <button
                  type="button"
                  onClick={() => setSlotMode('range')}
                  className={classNames(
                    'px-3 py-1.5 font-medium transition-colors flex items-center gap-1',
                    slotMode === 'range' ? 'bg-jungo-green-500 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
                  )}
                >
                  <CalendarRange className="w-3.5 h-3.5" />
                  Time Range
                </button>
              </div>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              {slotMode === 'single'
                ? 'Add specific date/time options one at a time. These bypass normal availability.'
                : 'Pick a date and time range — slots will be generated automatically at the selected interval.'}
            </p>

            {slotMode === 'single' ? (
              <div className="flex gap-2 mb-3">
                <input
                  type="date"
                  value={draftDate}
                  onChange={e => setDraftDate(e.target.value)}
                  className="flex-1 rounded-lg border border-gray-300 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-jungo-green-200 focus:border-jungo-green-500"
                />
                <input
                  type="time"
                  value={draftTime}
                  onChange={e => setDraftTime(e.target.value)}
                  className="flex-1 rounded-lg border border-gray-300 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-jungo-green-200 focus:border-jungo-green-500"
                />
                <Button type="button" variant="outline" onClick={addDraftSlot} disabled={!draftDate || !draftTime} icon={<Plus className="w-4 h-4" />}>
                  Add
                </Button>
              </div>
            ) : (
              <div className="space-y-3 mb-3">
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={rangeDate}
                    onChange={e => setRangeDate(e.target.value)}
                    className="flex-1 rounded-lg border border-gray-300 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-jungo-green-200 focus:border-jungo-green-500"
                  />
                  <input
                    type="time"
                    value={rangeStart}
                    onChange={e => setRangeStart(e.target.value)}
                    className="flex-1 rounded-lg border border-gray-300 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-jungo-green-200 focus:border-jungo-green-500"
                    placeholder="Start"
                  />
                  <input
                    type="time"
                    value={rangeEnd}
                    onChange={e => setRangeEnd(e.target.value)}
                    className="flex-1 rounded-lg border border-gray-300 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-jungo-green-200 focus:border-jungo-green-500"
                    placeholder="End"
                  />
                </div>
                <div className="flex gap-2 items-center">
                  <label className="text-xs text-gray-500 whitespace-nowrap">Interval:</label>
                  <Select
                    value={rangeInterval}
                    onChange={e => setRangeInterval(e.target.value)}
                    options={[
                      { value: '15', label: '15 min' },
                      { value: '30', label: '30 min' },
                      { value: '60', label: '60 min' },
                    ]}
                  />
                  <Button type="button" variant="outline" onClick={addRangeSlots} disabled={!rangeDate || !rangeStart || !rangeEnd} icon={<Plus className="w-4 h-4" />}>
                    Generate Slots
                  </Button>
                </div>
                {rangeDate && rangeStart && rangeEnd && (() => {
                  const startMin = timeToMinutes(rangeStart);
                  const endMin = timeToMinutes(rangeEnd);
                  const interval = parseInt(rangeInterval) || 30;
                  const count = Math.max(0, Math.floor((endMin - startMin) / interval));
                  return count > 0 ? (
                    <p className="text-xs text-jungo-green-600">This will generate {count} slot{count !== 1 ? 's' : ''} on {formatDisplayDate(rangeDate)}.</p>
                  ) : (
                    <p className="text-xs text-red-500">End time must be at least one interval after start time.</p>
                  );
                })()}
              </div>
            )}

            {slotDrafts.length > 0 ? (
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {slotDrafts.map((slot, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 bg-gray-50 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-3">
                      <Clock className="w-4 h-4 text-gray-400" />
                      <span className="text-sm text-gray-700">{formatDisplayDate(slot.date)}</span>
                      <span className="text-sm text-gray-500">at {formatTime(slot.start_time)}</span>
                    </div>
                    <button
                      onClick={() => removeDraftSlot(i)}
                      className="p-1 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400 text-center py-3 bg-gray-50 rounded-lg">No slots added yet.</p>
            )}
          </div>

          <Textarea
            label="Notes to Client (optional)"
            value={notesToClient}
            onChange={e => setNotesToClient(e.target.value)}
            rows={2}
            placeholder="Notes included in the invite email..."
          />

          <Textarea
            label="Internal Notes (admin only)"
            value={internalNotes}
            onChange={e => setInternalNotes(e.target.value)}
            rows={2}
            placeholder="Private notes not visible to the client..."
          />

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={allowFullAvailability}
              onChange={e => setAllowFullAvailability(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-jungo-green-500 focus:ring-jungo-green-500"
            />
            <span className="text-sm font-medium text-gray-700">Allow client to also choose from regular availability</span>
          </label>
          <p className="text-xs text-gray-400 -mt-2 ml-7">
            When checked, the client sees your proposed times first, with an option to browse the full availability calendar. When unchecked, only the proposed times are offered.
          </p>

          <p className="text-xs text-gray-500">
            An invite email with the booking link will be sent to the client automatically when you create this proposal.
          </p>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button
              onClick={handleCreate}
              loading={creating}
              disabled={!firstName.trim() || !lastName.trim() || !clientEmail.trim() || !meetingTypeId || slotDrafts.length === 0}
            >
              Create Proposal
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal open={!!editTarget} onClose={() => setEditTarget(null)} title="Edit Proposal Link" maxWidth="md">
        <div className="space-y-4">
          {editError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-700">{editError}</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <Input label="First Name" required value={editFirstName} onChange={e => setEditFirstName(e.target.value)} />
            <Input label="Last Name" required value={editLastName} onChange={e => setEditLastName(e.target.value)} />
          </div>
          <Input label="Client Email" type="email" required value={editEmail} onChange={e => setEditEmail(e.target.value)} />

          <Select
            label="Meeting Type"
            required
            value={editMeetingTypeId}
            onChange={e => setEditMeetingTypeId(e.target.value)}
            options={[
              { value: '', label: 'Select...' },
              ...meetingTypes.map(mt => ({ value: mt.id, label: `${mt.name} (${mt.duration_minutes} min)` })),
            ]}
          />
          <Select
            label="Meeting Location"
            value={meetingLocationType}
            onChange={e => setMeetingLocationType(e.target.value)}  options={[
              { value: '', label: 'Let Client Choose' },
              { value: 'zoom', label: 'Zoom' },
              { value: 'phone', label: 'Phone' },
            ]}
            hint="Choose a location or let the client decide when they book."
            />

          <Input label="Label (internal note)" value={editLabel} onChange={e => setEditLabel(e.target.value)} placeholder="e.g., Follow-up options" />

          <Input
            label="Expires (optional)"
            type="date"
            value={editExpiresAt}
            onChange={e => setEditExpiresAt(e.target.value)}
          />

          {/* Slot editing */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Offered Slots</label>
            <div className="flex gap-2 mb-3">
              <input
                type="date"
                value={editDraftDate}
                onChange={e => setEditDraftDate(e.target.value)}
                className="flex-1 rounded-lg border border-gray-300 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-jungo-green-200 focus:border-jungo-green-500"
              />
              <input
                type="time"
                value={editDraftTime}
                onChange={e => setEditDraftTime(e.target.value)}
                className="flex-1 rounded-lg border border-gray-300 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-jungo-green-200 focus:border-jungo-green-500"
              />
              <Button type="button" variant="outline" onClick={addEditDraftSlot} disabled={!editDraftDate || !editDraftTime} icon={<Plus className="w-4 h-4" />}>
                Add
              </Button>
            </div>
            {editSlotDrafts.length > 0 ? (
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {editSlotDrafts.map((slot, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 bg-gray-50 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-3">
                      <Clock className="w-4 h-4 text-gray-400" />
                      <span className="text-sm text-gray-700">{formatDisplayDate(slot.date)}</span>
                      <span className="text-sm text-gray-500">at {formatTime(slot.start_time)}</span>
                    </div>
                    <button
                      onClick={() => removeEditDraftSlot(i)}
                      className="p-1 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400 text-center py-3 bg-gray-50 rounded-lg">No slots.</p>
            )}
          </div>

          <Textarea
            label="Notes to Client (optional)"
            value={editNotesToClient}
            onChange={e => setEditNotesToClient(e.target.value)}
            rows={2}
            placeholder="Notes included in the invite email..."
          />

          <Textarea
            label="Internal Notes (admin only)"
            value={editInternalNotes}
            onChange={e => setEditInternalNotes(e.target.value)}
            rows={2}
            placeholder="Private notes not visible to the client..."
          />

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={editAllowFullAvailability}
              onChange={e => setEditAllowFullAvailability(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-jungo-green-500 focus:ring-jungo-green-500"
            />
            <span className="text-sm font-medium text-gray-700">Allow client to also choose from regular availability</span>
          </label>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button onClick={handleSaveEdit} loading={editSaving} icon={<Edit3 className="w-4 h-4" />}>Save Changes</Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete Proposal Link" maxWidth="sm">
        <div className="space-y-4">
          <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg p-4">
            <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-red-800">This will permanently delete this proposal and all its slots.</p>
              <p className="text-sm text-red-700 mt-1">
                Existing bookings made through this proposal will not be affected.
                This action cannot be undone.
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => deleteTarget && handleDelete(deleteTarget)} icon={<Trash2 className="w-4 h-4" />}>Yes, Delete</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
