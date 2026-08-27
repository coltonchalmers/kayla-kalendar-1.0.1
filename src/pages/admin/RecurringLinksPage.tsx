import { useState, useMemo } from 'react';
import { Link2, Plus, Copy, Check, Trash2, ToggleLeft, ToggleRight, Infinity as InfinityIcon, AlertTriangle, Clock, Edit3, Lock, Mail } from 'lucide-react';
import { useRecurringLinks } from '@/hooks/useRecurringLinks';
import { useMeetingTypes } from '@/hooks/useMeetingTypes';
import { useAvailability } from '@/hooks/useAvailability';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import Modal from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { triggerInviteEmail } from '@/lib/bookingEmails';
import { DAY_NAMES, type RecurringLink } from '@/lib/types';
import { formatTime, timeToMinutes } from '@/lib/utils';

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function splitName(fullName: string): { first: string; last: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 0) return { first: '', last: '' };
  if (parts.length === 1) return { first: parts[0], last: '' };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

export default function RecurringLinksPage() {
  const { links, loading, createLink, toggleLink, updateRecurringLink, deleteLink } = useRecurringLinks();
  const { meetingTypes, loading: mtLoading } = useMeetingTypes();
  const { rules } = useAvailability();

  const [showCreate, setShowCreate] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [label, setLabel] = useState('');
  const [meetingTypeId, setMeetingTypeId] = useState('');
  const [frequency, setFrequency] = useState('');
  const [occurrences, setOccurrences] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isOngoing, setIsOngoing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [emailError, setEmailError] = useState('');

  // Scheduling mode
  const [schedulingMode, setSchedulingMode] = useState<'strict' | 'flexible'>('strict');

  // Allowed days/time
  const [allowedDays, setAllowedDays] = useState<number[]>([]);
  const [allowedTimeStart, setAllowedTimeStart] = useState('');
  const [allowedTimeEnd, setAllowedTimeEnd] = useState('');

  // Notes
  const [notesToClient, setNotesToClient] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  // Edit modal state
  const [editTarget, setEditTarget] = useState<RecurringLink | null>(null);
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editLabel, setEditLabel] = useState('');
  const [editMeetingTypeId, setEditMeetingTypeId] = useState('');
  const [editFrequency, setEditFrequency] = useState('');
  const [editOccurrences, setEditOccurrences] = useState('');
  const [editEndDate, setEditEndDate] = useState('');
  const [editIsOngoing, setEditIsOngoing] = useState(false);
  const [editSchedulingMode, setEditSchedulingMode] = useState<'strict' | 'flexible'>('strict');
  const [editAllowedDays, setEditAllowedDays] = useState<number[]>([]);
  const [editAllowedTimeStart, setEditAllowedTimeStart] = useState('');
  const [editAllowedTimeEnd, setEditAllowedTimeEnd] = useState('');
  const [editNotesToClient, setEditNotesToClient] = useState('');
  const [editInternalNotes, setEditInternalNotes] = useState('');
  const [editExpiresAt, setEditExpiresAt] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  const allowFrequency = !frequency;
  const allowEndDate = !occurrences && !endDate && !isOngoing;

  const toggleDay = (day: number) => {
    setAllowedDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort()
    );
  };

  const toggleEditDay = (day: number) => {
    setEditAllowedDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort()
    );
  };

  // Check if allowed time is outside normal availability
  const outOfHoursWarning = useMemo(() => {
    if (!allowedTimeStart || !allowedTimeEnd) return false;
    const aStart = timeToMinutes(allowedTimeStart);
    const aEnd = timeToMinutes(allowedTimeEnd);

    for (const day of (allowedDays.length > 0 ? allowedDays : [0,1,2,3,4,5,6])) {
      const dayRules = rules.filter(r => r.day_of_week === day && r.is_active);
      if (dayRules.length === 0) continue;
      const covered = dayRules.some(r => {
        const rStart = timeToMinutes(r.start_time);
        const rEnd = timeToMinutes(r.end_time);
        return aStart >= rStart && aEnd <= rEnd;
      });
      if (!covered) return true;
    }
    return false;
  }, [allowedTimeStart, allowedTimeEnd, allowedDays, rules]);

  const editOutOfHoursWarning = useMemo(() => {
    if (!editAllowedTimeStart || !editAllowedTimeEnd) return false;
    const aStart = timeToMinutes(editAllowedTimeStart);
    const aEnd = timeToMinutes(editAllowedTimeEnd);

    for (const day of (editAllowedDays.length > 0 ? editAllowedDays : [0,1,2,3,4,5,6])) {
      const dayRules = rules.filter(r => r.day_of_week === day && r.is_active);
      if (dayRules.length === 0) continue;
      const covered = dayRules.some(r => {
        const rStart = timeToMinutes(r.start_time);
        const rEnd = timeToMinutes(r.end_time);
        return aStart >= rStart && aEnd <= rEnd;
      });
      if (!covered) return true;
    }
    return false;
  }, [editAllowedTimeStart, editAllowedTimeEnd, editAllowedDays, rules]);

  const resetForm = () => {
    setFirstName('');
    setLastName('');
    setClientEmail('');
    setLabel('');
    setMeetingTypeId('');
    setFrequency('');
    setOccurrences('');
    setEndDate('');
    setIsOngoing(false);
    setSchedulingMode('strict');
    setAllowedDays([]);
    setAllowedTimeStart('');
    setAllowedTimeEnd('');
    setNotesToClient('');
    setInternalNotes('');
    setExpiresAt('');
  };

  const handleCreate = async () => {
    if (!firstName.trim() || !lastName.trim() || !clientEmail.trim() || !meetingTypeId) return;
    if (!isValidEmail(clientEmail.trim())) {
      setEmailError('Please enter a valid email address');
      return;
    }
    setEmailError('');
    setCreating(true);
    try {
      const clientName = `${firstName.trim()} ${lastName.trim()}`;
      const link = await createLink({
        client_name: clientName,
        client_email: clientEmail.trim(),
        label: label.trim() || undefined,
        frequency: frequency || null,
        occurrences: occurrences ? parseInt(occurrences) : null,
        end_date: endDate || null,
        allow_client_frequency: allowFrequency,
        allow_client_end_date: allowEndDate,
        meeting_type_id: meetingTypeId || null,
        is_ongoing: isOngoing,
        scheduling_mode: schedulingMode,
        allowed_days: allowedDays.length > 0 ? allowedDays : null,
        allowed_time_start: allowedTimeStart || null,
        allowed_time_end: allowedTimeEnd || null,
        notes_to_client: notesToClient.trim() || null,
        internal_notes: internalNotes.trim() || null,
        expires_at: expiresAt ? new Date(expiresAt + 'T23:59:59').toISOString() : null,
      });

      const inviteUrl = `${window.location.origin}/book/${link.token}`;
      await triggerInviteEmail(clientName, clientEmail.trim(), inviteUrl, notesToClient.trim() || undefined);

      setShowCreate(false);
      resetForm();
    } catch (err) {
      console.error(err);
    } finally {
      setCreating(false);
    }
  };

  const copyLink = (token: string, id: string) => {
    const url = `${window.location.origin}/book/${token}`;
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleToggle = async (id: string, active: boolean) => {
    try { await toggleLink(id, !active); } catch (err) { console.error(err); }
  };

  const handleDelete = async (id: string) => {
    try { await deleteLink(id); } catch (err) { console.error(err); }
    setDeleteTarget(null);
  };

  const isLinkExpired = (link: { expires_at: string | null }) => {
    if (!link.expires_at) return false;
    return new Date(link.expires_at) < new Date();
  };

  const meetingTypeName = (id: string | null) => {
    if (!id) return null;
    return meetingTypes.find(mt => mt.id === id)?.name || null;
  };

  const openEditModal = (link: RecurringLink) => {
    const { first, last } = splitName(link.client_name);
    setEditTarget(link);
    setEditFirstName(first);
    setEditLastName(last);
    setEditEmail(link.client_email);
    setEditLabel(link.label || '');
    setEditMeetingTypeId(link.meeting_type_id || '');
    setEditFrequency(link.frequency || '');
    setEditOccurrences(link.occurrences?.toString() || '');
    setEditEndDate(link.end_date || '');
    setEditIsOngoing(link.is_ongoing);
    setEditSchedulingMode(link.scheduling_mode);
    setEditAllowedDays(link.allowed_days || []);
    setEditAllowedTimeStart(link.allowed_time_start || '');
    setEditAllowedTimeEnd(link.allowed_time_end || '');
    setEditNotesToClient(link.notes_to_client || '');
    setEditInternalNotes(link.internal_notes || '');
    setEditExpiresAt(link.expires_at ? new Date(link.expires_at).toISOString().slice(0, 10) : '');
    setEditError('');
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
      const editAllowFrequency = !editFrequency;
      const editAllowEndDate = !editOccurrences && !editEndDate && !editIsOngoing;
      await updateRecurringLink(editTarget.id, {
        client_name: clientName,
        client_email: editEmail.trim(),
        label: editLabel.trim() || null,
        frequency: editFrequency || null,
        occurrences: editOccurrences ? parseInt(editOccurrences) : null,
        end_date: editEndDate || null,
        allow_client_frequency: editAllowFrequency,
        allow_client_end_date: editAllowEndDate,
        meeting_type_id: editMeetingTypeId || null,
        is_ongoing: editIsOngoing,
        scheduling_mode: editSchedulingMode,
        allowed_days: editAllowedDays.length > 0 ? editAllowedDays : null,
        allowed_time_start: editAllowedTimeStart || null,
        allowed_time_end: editAllowedTimeEnd || null,
        notes_to_client: editNotesToClient.trim() || null,
        internal_notes: editInternalNotes.trim() || null,
        expires_at: editExpiresAt ? new Date(editExpiresAt + 'T23:59:59').toISOString() : null,
      });
      setEditTarget(null);
    } catch (err) {
      console.error(err);
      setEditError('Failed to save changes. Please try again.');
    } finally {
      setEditSaving(false);
    }
  };

  if (loading || mtLoading) {
    return <div className="flex justify-center py-20"><LoadingSpinner size="lg" /></div>;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Recurring Links</h1>
          <p className="text-gray-500 mt-1">Create unique booking links for recurring clients.</p>
        </div>
        <Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowCreate(true)}>
          Create Link
        </Button>
      </div>

      {links.length === 0 ? (
        <Card className="text-center py-16">
          <Link2 className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No recurring links yet.</p>
          <p className="text-sm text-gray-400 mt-1">Create a link to share with clients for recurring bookings.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {links.map(link => {
            const mtName = meetingTypeName(link.meeting_type_id);
            const canEdit = !link.is_used;
            return (
              <Card key={link.id} padding="sm">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-gray-900 truncate">{link.client_name}</p>
                      <Badge variant={link.is_active ? 'success' : 'neutral'}>
                        {link.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                      <Badge variant={link.scheduling_mode === 'flexible' ? 'info' : 'neutral'}>
                        {link.scheduling_mode === 'flexible' ? 'Flexible' : 'Strict'}
                      </Badge>
                      {link.is_used && <Badge variant="neutral">Used</Badge>}
                      {isLinkExpired(link) && <Badge variant="warning">Expired</Badge>}
                    </div>
                    <p className="text-sm text-gray-500 truncate">{link.client_email}</p>
                    {mtName && <p className="text-xs text-jungo-green-600 mt-0.5">{mtName}</p>}
                    {link.label && <p className="text-xs text-gray-400 mt-0.5">{link.label}</p>}
                    {link.is_ongoing ? (
                      <p className="text-xs text-jungo-green-600 mt-0.5 flex items-center gap-1">
                        <InfinityIcon className="w-3 h-3" />
                        Ongoing (no end date)
                      </p>
                    ) : link.frequency ? (
                      <p className="text-xs text-jungo-green-600 mt-0.5 capitalize">
                        {link.frequency}
                        {link.occurrences ? ` - ${link.occurrences} occurrences` : ''}
                        {link.end_date ? ` - until ${link.end_date}` : ''}
                      </p>
                    ) : null}
                    {link.expires_at && (
                      <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Expires {new Date(link.expires_at).toLocaleDateString()}
                      </p>
                    )}
                    {link.allowed_days && link.allowed_days.length > 0 && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        Allowed: {link.allowed_days.map(d => DAY_NAMES[d].slice(0, 3)).join(', ')}
                        {link.allowed_time_start && link.allowed_time_end && ` ${formatTime(link.allowed_time_start)}-${formatTime(link.allowed_time_end)}`}
                      </p>
                    )}
                    {link.notes_to_client && (
                      <div className="flex items-start gap-1.5 mt-1">
                        <Mail className="w-3 h-3 text-emerald-500 mt-0.5 flex-shrink-0" />
                        <p className="text-xs text-gray-500 truncate">{link.notes_to_client}</p>
                      </div>
                    )}
                    {link.internal_notes && (
                      <div className="flex items-start gap-1.5 mt-0.5">
                        <Lock className="w-3 h-3 text-amber-500 mt-0.5 flex-shrink-0" />
                        <p className="text-xs text-gray-500 truncate">{link.internal_notes}</p>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={copiedId === link.id ? <Check className="w-4 h-4 text-jungo-green-500" /> : <Copy className="w-4 h-4" />}
                      onClick={() => copyLink(link.token, link.id)}
                    >
                      {copiedId === link.id ? 'Copied' : 'Copy'}
                    </Button>
                    {canEdit && (
                      <button
                        onClick={() => openEditModal(link)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-jungo-green-600 hover:bg-jungo-green-50 transition-colors"
                        title="Edit"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => handleToggle(link.id, link.is_active)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                      title={link.is_active ? 'Deactivate' : 'Activate'}
                    >
                      {link.is_active ? <ToggleRight className="w-5 h-5 text-jungo-green-500" /> : <ToggleLeft className="w-5 h-5" />}
                    </button>
                    <button
                      onClick={() => setDeleteTarget(link.id)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Recurring Link" maxWidth="md">
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

          <Input label="Label (internal note)" value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g., Weekly check-in" />

          <Select
            label="Frequency (optional - leave blank to let client choose)"
            value={frequency}
            onChange={e => setFrequency(e.target.value)}
            options={[
              { value: '', label: 'Let client choose' },
              { value: 'daily', label: 'Daily' },
              { value: 'weekly', label: 'Weekly' },
              { value: 'biweekly', label: 'Biweekly' },
              { value: 'monthly', label: 'Monthly' },
            ]}
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Number of Occurrences"
              type="number"
              min="1"
              value={occurrences}
              onChange={e => setOccurrences(e.target.value)}
              placeholder="Optional"
              disabled={isOngoing}
            />
            <Input
              label="End Date"
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              disabled={isOngoing}
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={isOngoing}
              onChange={e => {
                setIsOngoing(e.target.checked);
                if (e.target.checked) {
                  setOccurrences('');
                  setEndDate('');
                }
              }}
              className="rounded border-gray-300 text-jungo-green-500 focus:ring-jungo-green-500"
            />
            <span className="flex items-center gap-1.5">
              <InfinityIcon className="w-4 h-4 text-jungo-green-600" />
              Ongoing (no end date or occurrence limit)
            </span>
          </label>

          {/* Scheduling Mode */}
          <div className="border-t pt-4">
            <p className="text-sm font-medium text-gray-700 mb-2">Scheduling Mode</p>
            <div className="flex gap-2">
              <button
                onClick={() => setSchedulingMode('strict')}
                className={`flex-1 rounded-lg border p-3 text-left transition-colors ${
                  schedulingMode === 'strict'
                    ? 'border-jungo-green-500 bg-jungo-green-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <p className="text-sm font-medium text-gray-900">Strict</p>
                <p className="text-xs text-gray-500 mt-0.5">Client picks a start date where all sessions are conflict-free. Conflicted dates are greyed out.</p>
              </button>
              <button
                onClick={() => setSchedulingMode('flexible')}
                className={`flex-1 rounded-lg border p-3 text-left transition-colors ${
                  schedulingMode === 'flexible'
                    ? 'border-jungo-green-500 bg-jungo-green-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <p className="text-sm font-medium text-gray-900">Flexible</p>
                <p className="text-xs text-gray-500 mt-0.5">Client can reschedule or skip individual conflicted sessions during booking.</p>
              </button>
            </div>
          </div>

          {/* Allowed Days */}
          <div className="border-t pt-4">
            <p className="text-sm font-medium text-gray-700 mb-2">Allowed Days (optional)</p>
            <p className="text-xs text-gray-500 mb-2">Restrict which days of the week the client can book. Leave blank to allow all days.</p>
            <div className="flex flex-wrap gap-1.5">
              {DAY_NAMES.map((day, idx) => (
                <button
                  key={idx}
                  onClick={() => toggleDay(idx)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    allowedDays.includes(idx)
                      ? 'bg-jungo-green-500 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {day.slice(0, 3)}
                </button>
              ))}
            </div>
          </div>

          {/* Allowed Time Range */}
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Allowed Start Time (optional)"
              type="time"
              value={allowedTimeStart}
              onChange={e => setAllowedTimeStart(e.target.value)}
            />
            <Input
              label="Allowed End Time (optional)"
              type="time"
              value={allowedTimeEnd}
              onChange={e => setAllowedTimeEnd(e.target.value)}
            />
          </div>

          {outOfHoursWarning && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
              <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-amber-700">
                The selected time range falls outside your normal availability hours. Sessions will be booked outside regular availability.
              </p>
            </div>
          )}

          {/* Notes */}
          <Textarea
            label="Notes to Client (optional)"
            value={notesToClient}
            onChange={e => setNotesToClient(e.target.value)}
            rows={2}
            placeholder="Notes included in the invite email and carried into each booking..."
          />

          <Textarea
            label="Internal Notes (admin only)"
            value={internalNotes}
            onChange={e => setInternalNotes(e.target.value)}
            rows={2}
            placeholder="Private notes not visible to the client..."
          />

          <Input
            label="Link Expiration Date (optional)"
            type="date"
            value={expiresAt}
            onChange={e => setExpiresAt(e.target.value)}
            hint="After this date, the link will no longer accept new bookings. Does not affect already-booked sessions."
          />

          <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-500 space-y-1">
            <p className="font-medium text-gray-600">Client permissions (auto-determined):</p>
            <p>- Client {allowFrequency ? 'can' : 'cannot'} set frequency {allowFrequency ? '' : '(locked by your selection)'}</p>
            <p>- Client {allowEndDate ? 'can' : 'cannot'} set end date / occurrences {allowEndDate ? '' : '(locked by your selection)'}</p>
          </div>

          <p className="text-xs text-gray-500">
            An invite email with the booking link will be sent to the client automatically when you create this link.
          </p>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} loading={creating} disabled={!meetingTypeId || !firstName.trim() || !lastName.trim() || !clientEmail.trim()}>Create Link</Button>
          </div>
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal open={!!editTarget} onClose={() => setEditTarget(null)} title="Edit Recurring Link" maxWidth="md">
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

          <Input label="Label (internal note)" value={editLabel} onChange={e => setEditLabel(e.target.value)} placeholder="e.g., Weekly check-in" />

          <Select
            label="Frequency (optional - leave blank to let client choose)"
            value={editFrequency}
            onChange={e => setEditFrequency(e.target.value)}
            options={[
              { value: '', label: 'Let client choose' },
              { value: 'daily', label: 'Daily' },
              { value: 'weekly', label: 'Weekly' },
              { value: 'biweekly', label: 'Biweekly' },
              { value: 'monthly', label: 'Monthly' },
            ]}
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Number of Occurrences"
              type="number"
              min="1"
              value={editOccurrences}
              onChange={e => setEditOccurrences(e.target.value)}
              placeholder="Optional"
              disabled={editIsOngoing}
            />
            <Input
              label="End Date"
              type="date"
              value={editEndDate}
              onChange={e => setEditEndDate(e.target.value)}
              disabled={editIsOngoing}
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={editIsOngoing}
              onChange={e => {
                setEditIsOngoing(e.target.checked);
                if (e.target.checked) {
                  setEditOccurrences('');
                  setEditEndDate('');
                }
              }}
              className="rounded border-gray-300 text-jungo-green-500 focus:ring-jungo-green-500"
            />
            <span className="flex items-center gap-1.5">
              <InfinityIcon className="w-4 h-4 text-jungo-green-600" />
              Ongoing (no end date or occurrence limit)
            </span>
          </label>

          {/* Scheduling Mode */}
          <div className="border-t pt-4">
            <p className="text-sm font-medium text-gray-700 mb-2">Scheduling Mode</p>
            <div className="flex gap-2">
              <button
                onClick={() => setEditSchedulingMode('strict')}
                className={`flex-1 rounded-lg border p-3 text-left transition-colors ${
                  editSchedulingMode === 'strict'
                    ? 'border-jungo-green-500 bg-jungo-green-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <p className="text-sm font-medium text-gray-900">Strict</p>
                <p className="text-xs text-gray-500 mt-0.5">Client picks a start date where all sessions are conflict-free.</p>
              </button>
              <button
                onClick={() => setEditSchedulingMode('flexible')}
                className={`flex-1 rounded-lg border p-3 text-left transition-colors ${
                  editSchedulingMode === 'flexible'
                    ? 'border-jungo-green-500 bg-jungo-green-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <p className="text-sm font-medium text-gray-900">Flexible</p>
                <p className="text-xs text-gray-500 mt-0.5">Client can reschedule or skip individual conflicted sessions.</p>
              </button>
            </div>
          </div>

          {/* Allowed Days */}
          <div className="border-t pt-4">
            <p className="text-sm font-medium text-gray-700 mb-2">Allowed Days (optional)</p>
            <div className="flex flex-wrap gap-1.5">
              {DAY_NAMES.map((day, idx) => (
                <button
                  key={idx}
                  onClick={() => toggleEditDay(idx)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    editAllowedDays.includes(idx)
                      ? 'bg-jungo-green-500 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {day.slice(0, 3)}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Allowed Start Time (optional)"
              type="time"
              value={editAllowedTimeStart}
              onChange={e => setEditAllowedTimeStart(e.target.value)}
            />
            <Input
              label="Allowed End Time (optional)"
              type="time"
              value={editAllowedTimeEnd}
              onChange={e => setEditAllowedTimeEnd(e.target.value)}
            />
          </div>

          {editOutOfHoursWarning && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
              <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-amber-700">
                The selected time range falls outside your normal availability hours.
              </p>
            </div>
          )}

          <Textarea
            label="Notes to Client (optional)"
            value={editNotesToClient}
            onChange={e => setEditNotesToClient(e.target.value)}
            rows={2}
          />

          <Textarea
            label="Internal Notes (admin only)"
            value={editInternalNotes}
            onChange={e => setEditInternalNotes(e.target.value)}
            rows={2}
          />

          <Input
            label="Link Expiration Date (optional)"
            type="date"
            value={editExpiresAt}
            onChange={e => setEditExpiresAt(e.target.value)}
          />

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button onClick={handleSaveEdit} loading={editSaving} icon={<Edit3 className="w-4 h-4" />}>Save Changes</Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete Recurring Link" maxWidth="sm">
        <div className="space-y-4">
          <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg p-4">
            <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-red-800">This will permanently delete this recurring link.</p>
              <p className="text-sm text-red-700 mt-1">
                Existing bookings made through this link will not be affected, but the link will no longer be usable.
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
