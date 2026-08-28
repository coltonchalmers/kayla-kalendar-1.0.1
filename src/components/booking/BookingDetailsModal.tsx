import { useState, useEffect, useMemo, useCallback } from 'react';
import { Circle as XCircle, CalendarClock, CircleCheck as CheckCircle, Repeat, Clock, TriangleAlert as AlertTriangle, CreditCard as Edit3, Save, Bell, Lock, Mail, User, Send, ChevronDown, ChevronUp, Check, X, CircleAlert as AlertCircle, UserPlus, UserCheck, Plus, Trash2, Phone, Video } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Dropdown from '@/components/ui/Dropdown';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import Badge from '@/components/ui/Badge';
import { StatusBadge } from '@/components/ui/Badge';
import CalendarGrid from '@/components/calendar/CalendarGrid';
import TimeSlotPicker from '@/components/calendar/TimeSlotPicker';
import { formatTime, formatDisplayDate, minutesToTime, timeToMinutes, isBookingOutOfHours, generateTimeSlots, hasAvailability, classNames } from '@/lib/utils';
import { useBookings, type ConflictResult } from '@/hooks/useBookings';
import { useMeetingTypes } from '@/hooks/useMeetingTypes';
import { useSettings } from '@/hooks/useSettings';
import { useAvailability } from '@/hooks/useAvailability';
import { triggerResendEmail, triggerDummyEmail, triggerRescheduleProposalEmail, type EmailResult } from '@/lib/bookingEmails';
import { parseError } from '@/lib/errors';
import { useRescheduleProposals } from '@/hooks/useRescheduleProposals';
import type { Booking, BookingChange, MeetingType, MeetingLocationType } from '@/lib/types';

interface Props {
  booking: Booking | null;
  open: boolean;
  onClose: () => void;
}

type EmailTypeOption = 'confirmation' | 'reschedule' | 'cancellation' | 'reminder' | 'recurring_confirmation';

const EMAIL_TYPE_OPTIONS: { value: EmailTypeOption; label: string }[] = [
  { value: 'confirmation', label: 'Confirmation' },
  { value: 'reschedule', label: 'Reschedule' },
  { value: 'cancellation', label: 'Cancellation' },
  { value: 'reminder', label: 'Reminder' },
  { value: 'recurring_confirmation', label: 'Recurring Confirmation' },
];

export default function BookingDetailsModal({ booking, open, onClose }: Props) {
  const {
    fetchBookings,
    cancelBooking,
    updateBookingStatus,
    rescheduleBooking,
    cancelRecurringGroup,
    checkMeetingTypeConflict,
    updateBookingMeetingType,
    updateBookingDetails,
    fetchRecurringGroup,
    fetchBookingChanges,
    updateBookingNotes,
    fetchBookingsForDate,
  } = useBookings({ autoFetch: false });
  const { meetingTypes } = useMeetingTypes();
  const { settings } = useSettings();
  const { rules, overrides } = useAvailability();

  const [mode, setMode] = useState<'view' | 'edit' | 'reschedule' | 'propose_reschedule' | 'series' | 'email'>('view');
  const [recurringGroup, setRecurringGroup] = useState<Booking[]>([]);
  const [changes, setChanges] = useState<BookingChange[]>([]);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Edit mode state
  const [editMeetingTypeId, setEditMeetingTypeId] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editZoomLink, setEditZoomLink] = useState('');
  const [editMeetingLocation, setEditMeetingLocation] = useState<MeetingLocationType>('zoom');
  const [notifyClient, setNotifyClient] = useState(false);
  const [conflictError, setConflictError] = useState<string | null>(null);
  const [bufferWarning, setBufferWarning] = useState<string | null>(null);

  // Notes editing state
  const [editInternalNotes, setEditInternalNotes] = useState('');
  const [editNotesToClient, setEditNotesToClient] = useState('');
  const [notesSaving, setNotesSaving] = useState(false);

  // Reschedule state
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTime, setRescheduleTime] = useState('');
  const [rescheduleSlots, setRescheduleSlots] = useState<string[]>([]);
  const [rescheduleSlotsLoading, setRescheduleSlotsLoading] = useState(false);
  const [overrideConflict, setOverrideConflict] = useState(false);
  const [rescheduleConflictWarning, setRescheduleConflictWarning] = useState<string | null>(null);
  const now = useMemo(() => new Date(), []);
  const [rescheduleViewYear, setRescheduleViewYear] = useState(now.getFullYear());
  const [rescheduleViewMonth, setRescheduleViewMonth] = useState(now.getMonth());

  // Series reschedule state
  interface SeriesSession {
    bookingId: string;
    originalDate: string;
    originalTime: string;
    action: 'keep' | 'reschedule' | 'skip';
    newDate?: string;
    newTime?: string;
    hasConflict: boolean;
  }
  const [seriesSessions, setSeriesSessions] = useState<SeriesSession[]>([]);
  const [seriesSlots, setSeriesSlots] = useState<Record<number, string[]>>({});
  const [seriesSlotsLoading, setSeriesSlotsLoading] = useState<Record<number, boolean>>({});

  // Email sending state
  const [emailSending, setEmailSending] = useState(false);
  const [emailResult, setEmailResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showEmailPanel, setShowEmailPanel] = useState(false);
  const [dummyMode, setDummyMode] = useState(false);
  const [dummyRecipient, setDummyRecipient] = useState('');
  const [selectedEmailType, setSelectedEmailType] = useState<EmailTypeOption>('confirmation');
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  // Propose reschedule state
  const { createProposal: createRescheduleProposal } = useRescheduleProposals();
  const [proposeSlots, setProposeSlots] = useState<{ date: string; start_time: string }[]>([]);
  const [proposeDate, setProposeDate] = useState('');
  const [proposeTime, setProposeTime] = useState('');
  const [proposeMessage, setProposeMessage] = useState('');
  const [proposeAllowFullAvailability, setProposeAllowFullAvailability] = useState(true);
  const [proposeLoading, setProposeLoading] = useState(false);

  const meetingTypeMap = useMemo(() => {
    const map: Record<string, MeetingType> = {};
    meetingTypes.forEach(mt => { map[mt.id] = mt; });
    return map;
  }, [meetingTypes]);

  useEffect(() => {
    if (!booking || !open) {
      setMode('view');
      setRecurringGroup([]);
      setChanges([]);
      setConflictError(null);
      setBufferWarning(null);
      setActionError(null);
      setEmailResult(null);
      setShowEmailPanel(false);
      return;
    }
    setEditMeetingTypeId(booking.meeting_type_id || '');
    setEditEmail(booking.client_email);
    setEditPhone(booking.client_phone || '');
    setEditZoomLink(booking.zoom_link || '');
    setEditMeetingLocation(booking.meeting_location_type || 'zoom');
    setEditInternalNotes(booking.internal_notes || '');
    setEditNotesToClient(booking.notes_to_client || '');
    setNotifyClient(false);
    setRescheduleDate(booking.date);
    setRescheduleTime(booking.start_time);
    setRescheduleSlots([]);
    setOverrideConflict(false);
    setRescheduleConflictWarning(null);
    setSeriesSessions([]);
    setSeriesSlots({});
    setDummyRecipient(booking.client_email);

    (async () => {
      if (booking.recurrence_group_id) {
        const group = await fetchRecurringGroup(booking.recurrence_group_id);
        setRecurringGroup(group);
      }
      const ch = await fetchBookingChanges(booking.id);
      setChanges(ch);
    })();
  }, [booking, open, fetchRecurringGroup, fetchBookingChanges]);

  const handleMeetingTypeChange = useCallback(async (mtId: string) => {
    setEditMeetingTypeId(mtId);
    setConflictError(null);
    setBufferWarning(null);
    if (!booking || !mtId || mtId === booking.meeting_type_id) return;
    const mt = meetingTypeMap[mtId];
    if (!mt) return;
    try {
      const result: ConflictResult = await checkMeetingTypeConflict(
        booking.id, booking.date, booking.start_time,
        mt.duration_minutes, settings?.buffer_minutes ?? 0
      );
      if (result.hasConflict) {
        setConflictError(
          `Overlaps with ${result.conflictingBooking?.first_name} ${result.conflictingBooking?.last_name} at ${formatTime(result.conflictingBooking?.start_time || '')}. Change blocked.`
        );
      } else if (result.hasBufferOverlap) {
        setBufferWarning(
          `Eats into buffer time near ${result.conflictingBooking?.first_name} ${result.conflictingBooking?.last_name}. You can still save.`
        );
      }
    } catch (err) {
      const parsed = parseError(err);
      setConflictError(`${parsed.type}: ${parsed.message}`);
    }
  }, [booking, meetingTypeMap, checkMeetingTypeConflict, settings?.buffer_minutes]);

  const refreshAndClose = async () => {
    await fetchBookings();
    onClose();
  };

  const handleCancel = async () => {
    if (!booking) return;
    setShowCancelConfirm(true);
  };

  const confirmCancel = async () => {
    if (!booking) return;
    setActionLoading(true);
    setActionError(null);
    setShowCancelConfirm(false);
    try {
      await cancelBooking(booking.id, true);
      await refreshAndClose();
    } catch (err) {
      const parsed = parseError(err);
      setActionError(`${parsed.type}: ${parsed.message}\n\nPossible cause: ${parsed.details || 'The server rejected this action.'}`);
    } finally { setActionLoading(false); }
  };

  const handleComplete = async () => {
    if (!booking) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await updateBookingStatus(booking.id, 'completed');
      await refreshAndClose();
    } catch (err) {
      const parsed = parseError(err);
      setActionError(`${parsed.type}: ${parsed.message}\n\nPossible cause: ${parsed.details || 'The server rejected this action.'}`);
    } finally { setActionLoading(false); }
  };

  const handleCancelGroup = async () => {
    if (!booking?.recurrence_group_id) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await cancelRecurringGroup(booking.recurrence_group_id, true);
      await refreshAndClose();
    } catch (err) {
      const parsed = parseError(err);
      setActionError(`${parsed.type}: ${parsed.message}\n\nPossible cause: ${parsed.details || 'The server rejected this action.'}`);
    } finally { setActionLoading(false); }
  };

  const handleSaveEdit = async () => {
    if (!booking || conflictError) return;
    setActionLoading(true);
    setActionError(null);
    try {
      if (editMeetingTypeId !== (booking.meeting_type_id || '')) {
        const mt = meetingTypeMap[editMeetingTypeId];
        if (mt) {
          await updateBookingMeetingType(
            booking.id, editMeetingTypeId, mt.duration_minutes,
            settings?.buffer_minutes ?? 0, notifyClient
          );
        }
      }
      await updateBookingDetails(booking.id, {
        client_email: editEmail,
        client_phone: editPhone || null,
        zoom_link: editZoomLink || null,
        internal_notes: editInternalNotes || null,
        notes_to_client: editNotesToClient || null,
        meeting_location_type: editMeetingLocation,
      }, notifyClient);
      await refreshAndClose();
    } catch (err) {
      const parsed = parseError(err);
      setActionError(`${parsed.type}: ${parsed.message}\n\nPossible cause: ${parsed.details || 'The server rejected this action.'}`);
    } finally { setActionLoading(false); }
  };

  const handleProposeReschedule = async () => {
    if (!booking || proposeSlots.length === 0) return;
    setProposeLoading(true);
    setActionError(null);
    try {
      const proposal = await createRescheduleProposal({
        booking_id: booking.id,
        client_email: booking.client_email,
        client_name: `${booking.first_name} ${booking.last_name}`,
        message: proposeMessage.trim() || null,
        allow_full_availability: proposeAllowFullAvailability,
        slots: proposeSlots,
      });

      const rescheduleUrl = `${window.location.origin}/reschedule/${proposal.token}`;
      const emailResult = await triggerRescheduleProposalEmail(
        booking.id,
        booking.client_email,
        `${booking.first_name} ${booking.last_name}`,
        rescheduleUrl,
        proposeMessage.trim() || undefined
      );

      if (emailResult && !emailResult.success) {
        setActionError(`Proposal created but email failed: ${emailResult.error?.message || 'Unknown error'}`);
      } else {
        await refreshAndClose();
      }
    } catch (err) {
      const parsed = parseError(err);
      setActionError(`${parsed.type}: ${parsed.message}`);
    } finally {
      setProposeLoading(false);
    }
  };

  const handleSaveNotes = async () => {
    if (!booking) return;
    setNotesSaving(true);
    setActionError(null);
    try {
      await updateBookingNotes(booking.id, {
        internal_notes: editInternalNotes || null,
        notes_to_client: editNotesToClient || null,
      });
      await fetchBookings();
    } catch (err) {
      const parsed = parseError(err);
      setActionError(`${parsed.type}: ${parsed.message}\n\nPossible cause: ${parsed.details || 'The server rejected this action.'}`);
    } finally {
      setNotesSaving(false);
    }
  };

  const loadRescheduleSlots = useCallback(async (dateStr: string) => {
    setRescheduleSlotsLoading(true);
    setRescheduleConflictWarning(null);
    const existing = await fetchBookingsForDate(dateStr);
    const dateObj = new Date(dateStr + 'T00:00:00');
    const duration = booking?.duration_minutes || 30;
    const buffer = settings?.buffer_minutes ?? 0;
    const lead = settings?.booking_lead_hours || 0;
    const increment = settings?.slot_increment_minutes ?? 15;
    const available = generateTimeSlots(dateObj, rules, overrides, existing, duration, lead, buffer, increment, settings?.timezone || 'America/New_York');
    setRescheduleSlots(available);
    setRescheduleSlotsLoading(false);
  }, [booking, fetchBookingsForDate, rules, overrides, settings, meetingTypeMap]);

  const handleRescheduleDateSelect = (dateStr: string) => {
    setRescheduleDate(dateStr);
    setRescheduleTime('');
    setRescheduleConflictWarning(null);
    loadRescheduleSlots(dateStr);
  };

  const handleRescheduleSlotSelect = (slot: string) => {
    setRescheduleTime(slot);
    setRescheduleConflictWarning(null);
  };

  const handleRescheduleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setRescheduleDate(e.target.value);
    setRescheduleTime('');
    setRescheduleConflictWarning(null);
  };

  const handleRescheduleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setRescheduleTime(e.target.value);
    setRescheduleConflictWarning(null);
  };

  const checkRescheduleConflict = useCallback(async (): Promise<boolean> => {
    if (!booking || !rescheduleDate || !rescheduleTime) return false;
    const result = await checkMeetingTypeConflict(
      booking.id, rescheduleDate, rescheduleTime,
      booking.duration_minutes,
      settings?.buffer_minutes ?? 0
    );
    if (result.hasConflict) {
      setRescheduleConflictWarning(
        `Overlaps with ${result.conflictingBooking?.first_name} ${result.conflictingBooking?.last_name} at ${formatTime(result.conflictingBooking?.start_time || '')}.`
      );
      return true;
    }
    const dateObj = new Date(rescheduleDate + 'T00:00:00');
    if (!hasAvailability(dateObj, rules, overrides)) {
      setRescheduleConflictWarning('This date/time is outside your available hours.');
      return true;
    }
    return false;
  }, [booking, rescheduleDate, rescheduleTime, checkMeetingTypeConflict, meetingTypeMap, settings, rules, overrides]);

  const handleReschedule = async () => {
    if (!booking || !rescheduleDate || !rescheduleTime) return;
    if (!overrideConflict) {
      const hasConflict = await checkRescheduleConflict();
      if (hasConflict) return;
    }
    setActionLoading(true);
    setActionError(null);
    try {
      await rescheduleBooking(booking.id, rescheduleDate, rescheduleTime, booking.duration_minutes, true);
      await refreshAndClose();
    } catch (err) {
      const parsed = parseError(err);
      setActionError(`${parsed.type}: ${parsed.message}\n\nPossible cause: ${parsed.details || 'The server rejected this action.'}`);
    } finally { setActionLoading(false); }
  };

  const initSeriesSessions = useCallback(async () => {
    if (!booking?.recurrence_group_id) return;
    const group = recurringGroup.length > 0 ? recurringGroup : await fetchRecurringGroup(booking.recurrence_group_id);
    const todayStr = new Date().toISOString().slice(0, 10);
    const upcoming = group.filter(b => b.status === 'confirmed' && b.date >= todayStr);
    const sessions: SeriesSession[] = upcoming.map(b => ({
      bookingId: b.id,
      originalDate: b.date,
      originalTime: b.start_time,
      action: 'keep',
      hasConflict: false,
    }));
    setSeriesSessions(sessions);
  }, [booking, recurringGroup, fetchRecurringGroup]);

  const loadSeriesSlots = useCallback(async (index: number, dateStr: string) => {
    setSeriesSlotsLoading(prev => ({ ...prev, [index]: true }));
    const existing = await fetchBookingsForDate(dateStr);
    const dateObj = new Date(dateStr + 'T00:00:00');
    const duration = booking?.duration_minutes || 30;
    const buffer = settings?.buffer_minutes ?? 0;
    const lead = settings?.booking_lead_hours || 0;
    const increment = settings?.slot_increment_minutes ?? 15;
    const available = generateTimeSlots(dateObj, rules, overrides, existing, duration, lead, buffer, increment, settings?.timezone || 'America/New_York');
    setSeriesSlots(prev => ({ ...prev, [index]: available }));
    setSeriesSlotsLoading(prev => ({ ...prev, [index]: false }));
  }, [booking, fetchBookingsForDate, rules, overrides, settings, meetingTypeMap]);

  const handleSeriesAction = (index: number, action: 'keep' | 'reschedule' | 'skip') => {
    setSeriesSessions(prev => prev.map((s, i) =>
      i === index ? { ...s, action, newDate: action === 'reschedule' ? s.newDate : undefined, newTime: action === 'reschedule' ? s.newTime : undefined } : s
    ));
  };

  const handleSeriesDateChange = (index: number, dateStr: string) => {
    setSeriesSessions(prev => prev.map((s, i) =>
      i === index ? { ...s, newDate: dateStr, newTime: undefined } : s
    ));
    if (dateStr) loadSeriesSlots(index, dateStr);
  };

  const handleSeriesTimeChange = (index: number, timeStr: string) => {
    setSeriesSessions(prev => prev.map((s, i) =>
      i === index ? { ...s, newTime: timeStr } : s
    ));
  };

  const handleSaveSeries = async () => {
    if (!booking) return;
    const unresolved = seriesSessions.filter(s => s.action === 'reschedule' && !s.newTime);
    if (unresolved.length > 0) {
      setActionError(`Please select a new time for ${unresolved.length} session${unresolved.length !== 1 ? 's' : ''} you chose to reschedule.`);
      return;
    }
    setActionLoading(true);
    setActionError(null);
    try {
      for (const session of seriesSessions) {
        if (session.action === 'skip') {
          await cancelBooking(session.bookingId, false);
        } else if (session.action === 'reschedule' && session.newDate && session.newTime) {
          await rescheduleBooking(session.bookingId, session.newDate, session.newTime, booking.duration_minutes, false);
        }
      }
      const rescheduledCount = seriesSessions.filter(s => s.action === 'reschedule').length;
      const skippedCount = seriesSessions.filter(s => s.action === 'skip').length;
      if (rescheduledCount > 0 || skippedCount > 0) {
        await triggerResendEmail(booking.id, 'reschedule');
      }
      await refreshAndClose();
    } catch (err) {
      const parsed = parseError(err);
      setActionError(`${parsed.type}: ${parsed.message}\n\nPossible cause: ${parsed.details || 'The server rejected this action.'}`);
    } finally { setActionLoading(false); }
  };

  const handleSendEmail = async () => {
    if (!booking) return;
    setEmailSending(true);
    setEmailResult(null);
    try {
      let result: EmailResult;
      if (dummyMode) {
        if (!dummyRecipient) {
          setEmailResult({ success: false, message: 'Please enter a recipient email address.' });
          setEmailSending(false);
          return;
        }
        result = await triggerDummyEmail(selectedEmailType, dummyRecipient);
      } else {
        result = await triggerResendEmail(booking.id, selectedEmailType);
      }

      if (result.success) {
        setEmailResult({
          success: true,
          message: result.skipped
            ? `Email skipped: ${result.reason || 'this email type is disabled in settings.'}`
            : `${EMAIL_TYPE_OPTIONS.find(o => o.value === selectedEmailType)?.label} email sent successfully${dummyMode ? ' (dummy)' : ''} to ${dummyMode ? dummyRecipient : booking.client_email}.`,
        });
      } else if (result.error) {
        setEmailResult({
          success: false,
          message: `${result.error.type}: ${result.error.message}${result.error.details ? '\n\n' + result.error.details : ''}`,
        });
      } else {
        setEmailResult({ success: false, message: 'Unknown error occurred while sending email.' });
      }
    } catch (err) {
      const parsed = parseError(err);
      setEmailResult({ success: false, message: `${parsed.type}: ${parsed.message}` });
    } finally {
      setEmailSending(false);
    }
  };

  if (!booking) return null;

  const isRecurring = !!booking.recurrence_group_id;
  const outOfHours = isBookingOutOfHours(booking, rules, overrides);
  const upcomingInGroup = recurringGroup.filter(
    b => b.status === 'confirmed' && b.date >= new Date().toISOString().slice(0, 10)
  );
  const lastChange = changes[0];

  const effectiveZoomLink = booking.zoom_link || meetingTypeMap[booking.meeting_type_id || '']?.zoom_link || settings?.zoom_default_link || null;
  const effectiveAdminPhone = meetingTypeMap[booking.meeting_type_id || '']?.contact_phone_override || settings?.contact_phone || null;

  const sourceLabel = booking.source === 'recurring_link' ? 'Recurring Link'
    : booking.source === 'proposal_link' ? 'Proposal'
    : booking.source === 'admin' ? 'Manual'
    : 'Public';

  return (
    <>
    <Modal open={open} onClose={onClose} title="Booking Details" maxWidth="md">
      <div className="space-y-4">
        {actionError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-red-800">Action failed</p>
              <p className="text-sm text-red-700 mt-0.5 whitespace-pre-wrap">{actionError}</p>
            </div>
            <button onClick={() => setActionError(null)} className="ml-auto text-red-400 hover:text-red-600">
              <XCircle className="w-4 h-4" />
            </button>
          </div>
        )}

        {mode === 'view' && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider">Client</p>
                <p className="font-medium text-gray-900">{booking.first_name} {booking.last_name}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider">Email</p>
                <p className="text-sm text-gray-900">{booking.client_email}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider">Date</p>
                <p className="text-sm text-gray-900">{formatDisplayDate(booking.date)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider">Time</p>
                <p className="text-sm text-gray-900">{formatTime(booking.start_time)} - {formatTime(booking.end_time)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider">Duration</p>
                <p className="text-sm text-gray-900">{booking.duration_minutes} minutes</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider">Meeting Type</p>
                <p className="text-sm text-gray-900">
                  {booking.meeting_type_id && meetingTypeMap[booking.meeting_type_id]
                    ? meetingTypeMap[booking.meeting_type_id].name
                    : '---'}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider">Meeting Location</p>
                <p className="text-sm text-gray-900 flex items-center gap-1.5">
                  {booking.meeting_location_type === 'phone' ? (
                    <><Phone className="w-3.5 h-3.5 text-gray-500" /> Phone Call</>
                  ) : (
                    <><Video className="w-3.5 h-3.5 text-gray-500" /> Zoom Meeting</>
                  )}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider">Status</p>
                <StatusBadge status={booking.status} />
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider">Source</p>
                <p className="text-sm text-gray-900">{sourceLabel}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider">Client Type</p>
                {booking.is_existing_client === true ? (
                  <Badge variant="success"><UserCheck className="w-3 h-3 mr-1 inline" />Existing</Badge>
                ) : booking.is_existing_client === false ? (
                  <Badge variant="neutral"><UserPlus className="w-3 h-3 mr-1 inline" />New</Badge>
                ) : (
                  <p className="text-sm text-gray-400">---</p>
                )}
              </div>
              {booking.client_phone && (
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider">Phone</p>
                  <p className="text-sm text-gray-900">{booking.client_phone}</p>
                </div>
              )}
              {booking.meeting_location_type !== 'phone' && effectiveZoomLink && (
                <div className="col-span-2">
                  <p className="text-xs text-gray-500 uppercase tracking-wider">Zoom Link</p>
                  <a href={effectiveZoomLink} target="_blank" rel="noopener noreferrer" className="text-sm text-green-700 underline break-all">
                    {effectiveZoomLink}
                  </a>
                  {booking.zoom_passcode && (
                    <p className="text-xs text-gray-500 mt-0.5">Passcode: {booking.zoom_passcode}</p>
                  )}
                </div>
              )}
              {booking.meeting_location_type === 'phone' && (
                <div className="col-span-2">
                  <p className="text-xs text-gray-500 uppercase tracking-wider">Phone Meeting</p>
                  <p className="text-sm text-gray-900">
                    Call to: {booking.client_phone || '---'}
                    {effectiveAdminPhone && <> | From: {effectiveAdminPhone}</>}
                  </p>
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {isRecurring && (
                <Badge variant="info">
                  <Repeat className="w-3 h-3 mr-1 inline" />
                  Recurring
                </Badge>
              )}
              {outOfHours && (
                <Badge variant="warning">
                  <Clock className="w-3 h-3 mr-1 inline" />
                  Out of hours
                </Badge>
              )}
            </div>

            {booking.guests.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Guests</p>
                <div className="flex flex-wrap gap-1.5">
                  {booking.guests.map(g => (
                    <span key={g} className="bg-gray-100 text-gray-600 text-xs px-2.5 py-1 rounded-full">{g}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Three-tier notes */}
            {booking.client_notes && (
              <Card padding="sm" className="bg-blue-50 border-blue-200">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <User className="w-3.5 h-3.5 text-blue-600" />
                  <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider">Client Notes</p>
                </div>
                <p className="text-sm text-blue-900 whitespace-pre-wrap">{booking.client_notes}</p>
              </Card>
            )}

            <Card padding="sm" className="bg-amber-50 border-amber-200">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Lock className="w-3.5 h-3.5 text-amber-600" />
                <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider">Internal Notes</p>
                <span className="text-xs text-amber-500 ml-1">(admin only)</span>
              </div>
              <Textarea
                value={editInternalNotes}
                onChange={e => setEditInternalNotes(e.target.value)}
                rows={2}
                placeholder="Add private notes for yourself..."
                className="border-amber-200 bg-white"
              />
            </Card>

            <Card padding="sm" className="bg-emerald-50 border-emerald-200">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Mail className="w-3.5 h-3.5 text-emerald-600" />
                <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">Notes to Client</p>
                <span className="text-xs text-emerald-500 ml-1">(visible in emails + manage page)</span>
              </div>
              <Textarea
                value={editNotesToClient}
                onChange={e => setEditNotesToClient(e.target.value)}
                rows={2}
                placeholder="Add notes for the client..."
                className="border-emerald-200 bg-white"
              />
            </Card>

            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                icon={<Save className="w-4 h-4" />}
                onClick={handleSaveNotes}
                loading={notesSaving}
              >
                Save Notes
              </Button>
            </div>

            {lastChange && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
                <Clock className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-amber-800">
                  {lastChange.change_type === 'rescheduled' && lastChange.old_date && (
                    <>Rescheduled from {formatDisplayDate(lastChange.old_date)} at {formatTime(lastChange.old_start_time || '')}</>
                  )}
                  {lastChange.change_type === 'cancelled' && 'This booking was cancelled.'}
                  {lastChange.change_type === 'completed' && 'This booking was marked completed.'}
                </p>
              </div>
            )}

            {isRecurring && recurringGroup.length > 0 && (
              <div className="border-t pt-4">
                <div className="flex items-center gap-2 mb-3">
                  <Repeat className="w-4 h-4 text-jungo-green-600" />
                  <p className="text-sm font-semibold text-gray-700">Recurring Series ({recurringGroup.length} sessions)</p>
                </div>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {recurringGroup.map(b => (
                    <div key={b.id} className="flex items-center justify-between gap-3 bg-gray-50 rounded-lg px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-700">{formatDisplayDate(b.date)}</span>
                        <span className="text-sm text-gray-500">at {formatTime(b.start_time)}</span>
                      </div>
                      <StatusBadge status={b.status} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Manual email sending panel */}
            <div className="border-t pt-4">
              <button
                onClick={() => setShowEmailPanel(!showEmailPanel)}
                aria-expanded={showEmailPanel}
                aria-controls="email-panel-content"
                className="flex items-center gap-2 text-sm font-semibold text-gray-700 hover:text-gray-900 transition-colors"
              >
                <Send className="w-4 h-4 text-jungo-green-600" />
                Send / Resend Emails
                {showEmailPanel ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {showEmailPanel && (
                <div id="email-panel-content" className="mt-3 space-y-3 bg-gray-50 rounded-lg p-4">
                  <Select
                    label="Email Type"
                    value={selectedEmailType}
                    onChange={e => setSelectedEmailType(e.target.value as EmailTypeOption)}
                    options={EMAIL_TYPE_OPTIONS}
                  />

                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={dummyMode}
                      onChange={e => setDummyMode(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-jungo-green-500 focus:ring-jungo-green-500"
                    />
                    <span className="text-sm text-gray-700">Dummy mode (sends a test email with placeholder data instead of real booking data)</span>
                  </label>

                  {dummyMode && (
                    <Input
                      label="Recipient Email"
                      type="email"
                      value={dummyRecipient}
                      onChange={e => setDummyRecipient(e.target.value)}
                      placeholder="recipient@example.com"
                    />
                  )}

                  {!dummyMode && (
                    <p className="text-xs text-gray-500">
                      Will resend the <strong>{EMAIL_TYPE_OPTIONS.find(o => o.value === selectedEmailType)?.label}</strong> email to <strong>{booking.client_email}</strong>.
                    </p>
                  )}

                  {emailResult && (
                    <div className={`rounded-lg p-3 flex items-start gap-2 ${emailResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                      {emailResult.success ? (
                        <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                      )}
                      <p className={`text-sm whitespace-pre-wrap ${emailResult.success ? 'text-green-800' : 'text-red-700'}`}>{emailResult.message}</p>
                    </div>
                  )}

                  <Button
                    variant="primary"
                    size="sm"
                    icon={<Send className="w-4 h-4" />}
                    onClick={handleSendEmail}
                    loading={emailSending}
                  >
                    {dummyMode ? 'Send Dummy Email' : 'Resend Email'}
                  </Button>
                </div>
              )}
            </div>

            {booking.status === 'confirmed' && (
              <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t">
                <Button variant="ghost" size="sm" icon={<Edit3 className="w-4 h-4" />} onClick={() => setMode('edit')}>Edit</Button>
                <Button variant="ghost" size="sm" icon={<CalendarClock className="w-4 h-4" />} onClick={() => setMode('reschedule')}>Reschedule</Button>
                <Dropdown
                  triggerLabel="More Actions"
                  items={[
                    { label: 'Propose Times', icon: <Send className="w-4 h-4" />, onClick: () => { setProposeSlots([]); setProposeDate(''); setProposeTime(''); setProposeMessage(''); setProposeAllowFullAvailability(true); setMode('propose_reschedule'); } },
                    { label: 'Complete', icon: <CheckCircle className="w-4 h-4" />, onClick: handleComplete, disabled: actionLoading },
                    ...(isRecurring && upcomingInGroup.length > 1 ? [
                      { label: 'Edit Series', icon: <Repeat className="w-4 h-4" />, onClick: () => { initSeriesSessions(); setMode('series'); } },
                      { label: 'Cancel All Remaining', icon: <XCircle className="w-4 h-4" />, onClick: handleCancelGroup, disabled: actionLoading },
                    ] : []),
                    { label: 'Cancel', icon: <XCircle className="w-4 h-4" />, onClick: handleCancel, disabled: actionLoading, variant: 'danger' as const },
                  ]}
                />
              </div>
            )}
          </>
        )}

        {mode === 'edit' && (
          <div className="space-y-4">
            <Select
              label="Meeting Type"
              value={editMeetingTypeId}
              onChange={e => handleMeetingTypeChange(e.target.value)}
              options={[
                { value: '', label: 'None' },
                ...meetingTypes.filter(mt => mt.is_active).map(mt => ({
                  value: mt.id,
                  label: `${mt.name} (${mt.duration_minutes} min)`,
                })),
              ]}
            />
            {conflictError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-red-700">{conflictError}</p>
              </div>
            )}
            {bufferWarning && !conflictError && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-amber-700">{bufferWarning}</p>
              </div>
            )}
            <Input label="Client Email" type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)} />
            <Input label="Client Phone" type="tel" value={editPhone} onChange={e => setEditPhone(e.target.value)} />
            <Input label="Zoom Link" value={editZoomLink} onChange={e => setEditZoomLink(e.target.value)} placeholder="https://zoom.us/j/..." />
            <Select
              label="Meeting Location"
              value={editMeetingLocation}
              onChange={e => setEditMeetingLocation(e.target.value as MeetingLocationType)}
              options={[
                { value: 'zoom', label: 'Zoom Meeting' },
                { value: 'phone', label: 'Phone Call' },
              ]}
            />

            <div className="space-y-3 pt-2 border-t">
              <Card padding="sm" className="bg-amber-50 border-amber-200">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Lock className="w-3.5 h-3.5 text-amber-600" />
                  <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider">Internal Notes</p>
                </div>
                <Textarea
                  value={editInternalNotes}
                  onChange={e => setEditInternalNotes(e.target.value)}
                  rows={2}
                  placeholder="Add private notes for yourself..."
                  className="border-amber-200 bg-white"
                />
              </Card>
              <Card padding="sm" className="bg-emerald-50 border-emerald-200">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Mail className="w-3.5 h-3.5 text-emerald-600" />
                  <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">Notes to Client</p>
                </div>
                <Textarea
                  value={editNotesToClient}
                  onChange={e => setEditNotesToClient(e.target.value)}
                  rows={2}
                  placeholder="Add notes for the client..."
                  className="border-emerald-200 bg-white"
                />
              </Card>
            </div>

            <label className="flex items-center gap-3 cursor-pointer pt-2 border-t">
              <input
                type="checkbox"
                checked={notifyClient}
                onChange={e => setNotifyClient(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-jungo-green-500 focus:ring-jungo-green-500"
              />
              <div className="flex items-center gap-1.5">
                <Bell className="w-3.5 h-3.5 text-gray-500" />
                <span className="text-sm font-medium text-gray-700">Notify client of these changes</span>
              </div>
            </label>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="ghost" onClick={() => { setMode('view'); setConflictError(null); setBufferWarning(null); }}>Cancel</Button>
              <Button onClick={handleSaveEdit} loading={actionLoading} disabled={!!conflictError} icon={<Save className="w-4 h-4" />}>Save Changes</Button>
            </div>
          </div>
        )}

        {mode === 'reschedule' && (
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-lg p-3 text-sm">
              <p className="text-gray-500">Current: {formatDisplayDate(booking.date)} at {formatTime(booking.start_time)}</p>
            </div>

            {!overrideConflict ? (
              <>
                <CalendarGrid
                  year={rescheduleViewYear}
                  month={rescheduleViewMonth}
                  selectedDate={rescheduleDate}
                  onSelectDate={handleRescheduleDateSelect}
                  onNavigate={(dir) => {
                    let m = rescheduleViewMonth + dir;
                    let y = rescheduleViewYear;
                    if (m < 0) { m = 11; y--; }
                    if (m > 11) { m = 0; y++; }
                    setRescheduleViewMonth(m);
                    setRescheduleViewYear(y);
                  }}
                  canGoBack={rescheduleViewYear > now.getFullYear() || (rescheduleViewYear === now.getFullYear() && rescheduleViewMonth > now.getMonth())}
                  canGoForward={true}
                  rules={rules}
                  overrides={overrides}
                  maxDate={new Date(new Date().getFullYear() + 1, 11, 31)}
                />
                {rescheduleDate && (
                  <TimeSlotPicker
                    date={rescheduleDate}
                    slots={rescheduleSlots}
                    selectedSlot={rescheduleTime || null}
                    onSelectSlot={handleRescheduleSlotSelect}
                    loading={rescheduleSlotsLoading}
                  />
                )}
                {rescheduleDate && !rescheduleSlotsLoading && rescheduleSlots.length === 0 && (
                  <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-amber-700">No available time slots on this date. You can override and pick any time below.</p>
                  </div>
                )}
              </>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <Input label="New Date" type="date" value={rescheduleDate} onChange={handleRescheduleDateChange} />
                <Input label="New Time" type="time" value={rescheduleTime} onChange={handleRescheduleTimeChange} />
              </div>
            )}

            {rescheduleConflictWarning && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
                <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-red-700">{rescheduleConflictWarning}</p>
              </div>
            )}

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={overrideConflict}
                onChange={e => { setOverrideConflict(e.target.checked); setRescheduleConflictWarning(null); }}
                className="w-4 h-4 rounded border-gray-300 text-jungo-green-500 focus:ring-jungo-green-500"
              />
              <span className="text-sm text-gray-700">Override conflict check (allow booking into unavailable or occupied slots)</span>
            </label>

            {overrideConflict && (
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
                <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-amber-700">Warning: You are overriding the conflict check. This may create double-bookings or schedule meetings outside your available hours.</p>
              </div>
            )}

            {rescheduleDate && rescheduleTime && (
              <div className="bg-jungo-green-50 border border-jungo-green-200 rounded-lg p-3 text-sm">
                <p className="font-medium text-jungo-green-800">{formatDisplayDate(rescheduleDate)}</p>
                <p className="text-jungo-green-600">
                  {formatTime(rescheduleTime)} - {formatTime(minutesToTime(timeToMinutes(rescheduleTime) + booking.duration_minutes))}
                  {' '}({booking.duration_minutes} min)
                </p>
              </div>
            )}
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="ghost" onClick={() => setMode('view')}>Cancel</Button>
              <Button onClick={handleReschedule} loading={actionLoading} disabled={!rescheduleDate || !rescheduleTime} icon={<CalendarClock className="w-4 h-4" />}>Confirm Reschedule</Button>
            </div>
          </div>
        )}

        {mode === 'propose_reschedule' && (
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-sm text-blue-700">
                Propose new times for this meeting. The client will receive an email with a link to pick their preferred slot.
              </p>
              <p className="text-xs text-blue-600 mt-1">
                Current: {formatDisplayDate(booking.date)} at {formatTime(booking.start_time)} ({booking.duration_minutes} min)
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Date"
                type="date"
                value={proposeDate}
                onChange={e => setProposeDate(e.target.value)}
              />
              <Input
                label="Time"
                type="time"
                value={proposeTime}
                onChange={e => setProposeTime(e.target.value)}
              />
            </div>

            <Button
              variant="outline"
              size="sm"
              icon={<Plus className="w-4 h-4" />}
              onClick={() => {
                if (!proposeDate || !proposeTime) return;
                setProposeSlots(prev => [...prev, { date: proposeDate, start_time: proposeTime }]);
                setProposeDate('');
                setProposeTime('');
              }}
              disabled={!proposeDate || !proposeTime}
            >
              Add Time Option
            </Button>

            {proposeSlots.length > 0 ? (
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {proposeSlots.map((slot, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 bg-gray-50 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-3">
                      <Clock className="w-4 h-4 text-gray-400" />
                      <span className="text-sm text-gray-700">{formatDisplayDate(slot.date)}</span>
                      <span className="text-sm text-gray-500">at {formatTime(slot.start_time)}</span>
                    </div>
                    <button
                      onClick={() => setProposeSlots(prev => prev.filter((_, idx) => idx !== i))}
                      className="p-1 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400 text-center py-3 bg-gray-50 rounded-lg">No time options added yet.</p>
            )}

            <Textarea
              label="Message to Client (optional)"
              value={proposeMessage}
              onChange={e => setProposeMessage(e.target.value)}
              rows={2}
              placeholder="Add a personal note to the reschedule email..."
            />

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={proposeAllowFullAvailability}
                onChange={e => setProposeAllowFullAvailability(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-jungo-green-500 focus:ring-jungo-green-500"
              />
              <span className="text-sm text-gray-700">Allow client to also choose from regular availability</span>
            </label>
            <p className="text-xs text-gray-400 -mt-2 ml-7">When checked, the client can browse the full availability calendar in addition to the specific times you propose.</p>

            {actionError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-red-700 whitespace-pre-wrap">{actionError}</p>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="ghost" onClick={() => setMode('view')}>Cancel</Button>
              <Button
                onClick={handleProposeReschedule}
                loading={proposeLoading}
                disabled={proposeSlots.length === 0}
                icon={<Send className="w-4 h-4" />}
              >
                Send Reschedule Request
              </Button>
            </div>
          </div>
        )}

        {mode === 'series' && (
          <div className="space-y-4">
            <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-lg p-3">
              <Repeat className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-blue-700">
                Edit each session in this recurring series. You can keep, reschedule, or skip individual sessions. Rescheduled sessions will use available time slots.
              </p>
            </div>

            {actionError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-red-700 whitespace-pre-wrap">{actionError}</p>
              </div>
            )}

            <div className="space-y-3 max-h-96 overflow-y-auto">
              {seriesSessions.map((session, index) => (
                <div
                  key={session.bookingId}
                  className={classNames(
                    'rounded-lg border p-3',
                    session.action === 'skip' ? 'border-gray-300 bg-gray-50' : session.action === 'reschedule' ? 'border-jungo-green-300 bg-jungo-green-50' : 'border-gray-200 bg-white'
                  )}
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">#{index + 1}</span>
                      <span className="text-sm text-gray-700">
                        {formatDisplayDate(session.originalDate).split(',')[0]} at {formatTime(session.originalTime)}
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleSeriesAction(index, 'keep')}
                      className={classNames(
                        'flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                        session.action === 'keep' ? 'border-gray-400 bg-gray-400 text-white' : 'border-gray-200 text-gray-600 hover:bg-gray-100'
                      )}
                    >
                      Keep
                    </button>
                    <button
                      onClick={() => handleSeriesAction(index, 'reschedule')}
                      className={classNames(
                        'flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                        session.action === 'reschedule' ? 'border-jungo-green-500 bg-jungo-green-500 text-white' : 'border-gray-200 text-gray-600 hover:bg-gray-100'
                      )}
                    >
                      Reschedule
                    </button>
                    <button
                      onClick={() => handleSeriesAction(index, 'skip')}
                      className={classNames(
                        'flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                        session.action === 'skip' ? 'border-red-400 bg-red-400 text-white' : 'border-gray-200 text-gray-600 hover:bg-gray-100'
                      )}
                    >
                      Skip
                    </button>
                  </div>

                  {session.action === 'reschedule' && (
                    <div className="space-y-2 pt-2 border-t border-jungo-green-200">
                      <Input
                        label="New Date"
                        type="date"
                        value={session.newDate || ''}
                        onChange={e => handleSeriesDateChange(index, e.target.value)}
                      />
                      {session.newDate && (
                        <>
                          {seriesSlotsLoading[index] ? (
                            <p className="text-xs text-gray-400">Loading available times...</p>
                          ) : (
                            <Select
                              label="New Time"
                              value={session.newTime || ''}
                              onChange={e => handleSeriesTimeChange(index, e.target.value)}
                              options={[
                                { value: '', label: 'Select...' },
                                ...((seriesSlots[index] || []).map(s => ({ value: s, label: formatTime(s) }))),
                              ]}
                            />
                          )}
                          {session.newDate && !seriesSlotsLoading[index] && (seriesSlots[index] || []).length === 0 && (
                            <p className="text-xs text-amber-600">No available times on this date. Try another date or keep/skip this session.</p>
                          )}
                        </>
                      )}
                      {session.action === 'reschedule' && session.newDate && session.newTime && (
                        <div className="text-xs text-jungo-green-700 bg-jungo-green-50 rounded px-2 py-1">
                          {formatDisplayDate(session.newDate).split(',')[0]} at {formatTime(session.newTime)}
                        </div>
                      )}
                    </div>
                  )}

                  {session.action === 'skip' && (
                    <div className="flex items-center gap-1.5 text-xs text-gray-500 pt-1">
                      <X className="w-3.5 h-3.5" />
                      This session will be cancelled.
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600">
              <p className="font-medium">
                {seriesSessions.filter(s => s.action === 'keep').length} kept,
                {' '}{seriesSessions.filter(s => s.action === 'reschedule').length} rescheduled,
                {' '}{seriesSessions.filter(s => s.action === 'skip').length} skipped
              </p>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="ghost" onClick={() => setMode('view')}>Cancel</Button>
              <Button onClick={handleSaveSeries} loading={actionLoading} icon={<Check className="w-4 h-4" />}>Save Changes</Button>
            </div>
          </div>
        )}
      </div>
    </Modal>

    <Modal open={showCancelConfirm} onClose={() => setShowCancelConfirm(false)} title="Cancel This Meeting" maxWidth="sm">
      <div className="space-y-4">
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg p-4">
          <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-800">Are you sure you want to cancel this meeting?</p>
            <p className="text-sm text-red-700 mt-1">
              The client will be notified that this meeting has been cancelled. This action cannot be undone.
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setShowCancelConfirm(false)}>No, Keep It</Button>
          <Button variant="danger" onClick={confirmCancel} loading={actionLoading} icon={<XCircle className="w-4 h-4" />}>Yes, Cancel Meeting</Button>
        </div>
      </div>
    </Modal>
    </>
  );
}
