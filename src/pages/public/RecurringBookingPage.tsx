import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { ArrowLeft, CircleAlert as AlertCircle, Repeat, Clock, TriangleAlert as AlertTriangle, CalendarClock, Check, X, Lock, CalendarDays } from 'lucide-react';
import CalendarGrid from '@/components/calendar/CalendarGrid';
import TimeSlotPicker from '@/components/calendar/TimeSlotPicker';
import IntakeForm from '@/components/booking/IntakeForm';
import type { IntakeFormData } from '@/components/booking/IntakeForm';
import BookingConfirmation from '@/components/booking/BookingConfirmation';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';
import Input from '@/components/ui/Input';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ProgressIndicator from '@/components/ui/ProgressIndicator';
import { supabase } from '@/lib/supabase';
import { useAvailability } from '@/hooks/useAvailability';
import { useBookings } from '@/hooks/useBookings';
import { useSettings } from '@/hooks/useSettings';
import { useRecurringLinks } from '@/hooks/useRecurringLinks';
import { generateTimeSlots, generateSlotsInRange, formatDate, formatDisplayDate, formatTime, addDays, addMonths, detectTimezone, getTimezoneOptions, timeToMinutes, convertTimeSlot, convertTimeSlotWithDate, isDateSelectable } from '@/lib/utils';
import { triggerRecurringConfirmationEmail } from '@/lib/bookingEmails';
import type { Booking, RecurringLink, MeetingType, TimeRestriction, BookingStep } from '@/lib/types';

type ConflictResolution = 'pending' | 'reschedule' | 'skip';

interface SessionConflict {
  date: string;
  index: number;
  hasConflict: boolean;
  resolution: ConflictResolution;
  rescheduleDate?: string;
  rescheduleTime?: string;
}

const FREQUENCY_LABELS: Record<string, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  biweekly: 'Every 2 weeks',
  monthly: 'Monthly',
};

function generateSlotsForRestrictions(
  date: Date,
  restrictions: TimeRestriction[],
  existingBookings: Booking[],
  durationMinutes: number,
  leadHours: number,
  bufferMinutes: number,
  slotIncrement: number,
  adminTimezone: string
): string[] {
  const dayOfWeek = date.getDay();
  const dayRestrictions = restrictions.filter(r => r.day === dayOfWeek);
  if (dayRestrictions.length === 0) return [];

  const allSlots: string[] = [];
  for (const rule of dayRestrictions) {
    const slots = generateSlotsInRange(date, rule.start, rule.end, existingBookings, durationMinutes, leadHours, bufferMinutes, slotIncrement, adminTimezone);
    allSlots.push(...slots);
  }
  return [...new Set(allSlots)].sort();
}

export default function RecurringBookingPage() {
  const { token } = useParams<{ token: string }>();
  const { fetchLinkByToken, markLinkAsUsed } = useRecurringLinks();
  const [link, setLink] = useState<RecurringLink | null>(null);
  const [meetingType, setMeetingType] = useState<MeetingType | null>(null);
  const [linkLoading, setLinkLoading] = useState(true);
  const [linkError, setLinkError] = useState(false);

  const ownerUserId = link?.user_id;
  const { rules, overrides, loading: availLoading } = useAvailability(ownerUserId);
  const { createBooking, fetchBookingsForDate } = useBookings({ autoFetch: false, userId: ownerUserId });
  const { settings, loading: settingsLoading } = useSettings(ownerUserId);

  // Steps: calendar -> time -> recurrence -> conflicts -> form -> confirm
  const [step, setStep] = useState<BookingStep | 'recurrence' | 'conflicts'>('calendar');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [slots, setSlots] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmedBooking, setConfirmedBooking] = useState<Booking | null>(null);
  const [clientTimezone, setClientTimezone] = useState(detectTimezone);
  const [recurrenceError, setRecurrenceError] = useState('');
  const [conflictError, setConflictError] = useState('');
  const [linkExpired, setLinkExpired] = useState(false);

  // Browse full availability toggle
  const [useFullAvailability, setUseFullAvailability] = useState(false);

  const [frequency, setFrequency] = useState('');
  const [occurrences, setOccurrences] = useState('');
  const [endDate, setEndDate] = useState('');

  const [sessionConflicts, setSessionConflicts] = useState<SessionConflict[]>([]);
  const [conflictChecking, setConflictChecking] = useState(false);
  const [rescheduleSlots, setRescheduleSlots] = useState<Record<number, string[]>>({});
  const [rescheduleSlotsLoading, setRescheduleSlotsLoading] = useState<Record<number, boolean>>({});

  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());

  const windowDays = settings?.booking_window_days || 90;
  const maxDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + windowDays);
    return d;
  }, [windowDays]);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const data = await fetchLinkByToken(token);
        if (!data) {
          setLinkError(true);
        } else if (data.is_used) {
          setLinkExpired(true);
        } else if (data.expires_at && new Date(data.expires_at) < new Date()) {
          setLinkExpired(true);
        } else {
          setLink(data);
          if (data.frequency) setFrequency(data.frequency);
          if (data.occurrences) setOccurrences(data.occurrences.toString());
          if (data.end_date) setEndDate(data.end_date);
          if (data.meeting_type_id) {
            const { data: mt } = await supabase
              .from('meeting_types')
              .select('*')
              .eq('id', data.meeting_type_id)
              .maybeSingle();
            if (mt) setMeetingType(mt);
          }
        }
      } catch {
        setLinkError(true);
      } finally {
        setLinkLoading(false);
      }
    })();
  }, [token, fetchLinkByToken]);

  const durationMinutes = meetingType?.duration_minutes || settings?.default_meeting_length || 30;
  const bufferMinutes = settings?.buffer_minutes ?? 0;
  const leadHours = settings?.booking_lead_hours || 2;
  const slotIncrement = settings?.slot_increment_minutes ?? 15;

  const adminTimezone = settings?.timezone || 'America/New_York';

  const timeRestrictions = link?.time_restrictions || null;
  const hasRestrictions = !!timeRestrictions && timeRestrictions.length > 0;
  const canBrowseFullAvailability = link?.allow_full_availability ?? true;

  // When using restrictions, use those; when using full availability (or no restrictions), use normal rules
  const activeRestrictions = hasRestrictions && !useFullAvailability ? timeRestrictions : null;

  const adminSetFrequency = !!link?.frequency && !link.allow_client_frequency;
  const adminSetEndCondition = !!link && (link.is_ongoing || !!link.occurrences || !!link.end_date) && !link.allow_client_end_date;

  const loadSlots = useCallback(async (dateStr: string) => {
    setSlotsLoading(true);
    const existing = await fetchBookingsForDate(dateStr, ownerUserId);
    const date = new Date(dateStr + 'T00:00:00');

    let available: string[];
    if (activeRestrictions) {
      available = generateSlotsForRestrictions(date, activeRestrictions, existing, durationMinutes, leadHours, bufferMinutes, slotIncrement, adminTimezone);
    } else {
      available = generateTimeSlots(date, rules, overrides, existing, durationMinutes, leadHours, bufferMinutes, slotIncrement, adminTimezone);
    }

    setSlots(available);
    setSlotsLoading(false);
  }, [rules, overrides, settings, fetchBookingsForDate, durationMinutes, activeRestrictions, leadHours, bufferMinutes, slotIncrement, adminTimezone, ownerUserId]);

  const handleDateSelect = (dateStr: string) => {
    setSelectedDate(dateStr);
    setSelectedSlot(null);
    setStep('time');
    loadSlots(dateStr);
  };

  const displaySlots = useMemo(() =>
    slots.map(s => convertTimeSlot(s, selectedDate || '', adminTimezone, clientTimezone)),
    [slots, selectedDate, adminTimezone, clientTimezone]
  );

  const handleSlotSelect = (slot: string) => {
    const adminSlot = convertTimeSlotWithDate(slot, selectedDate || '', clientTimezone, adminTimezone);
    setSelectedDate(adminSlot.date);
    setSelectedSlot(adminSlot.time);
    setConflictError('');
  };

  const handleContinueFromTime = () => {
    if (!selectedSlot) return;
    setStep('recurrence');
  };

  // Check if a given date is available under the active ruleset
  const isDateAvailable = useCallback((date: Date): boolean => {
    if (activeRestrictions) {
      return isDateSelectable(date, rules, overrides, activeRestrictions);
    }
    return isDateSelectable(date, rules, overrides, null);
  }, [activeRestrictions, rules, overrides]);

  const recurringDates = useMemo(() => {
    if (!selectedDate || !link) return [];
    const dates: string[] = [selectedDate];
    const start = new Date(selectedDate + 'T00:00:00');
    const maxOccurrences = parseInt(occurrences) || 0;

    if (frequency === 'monthly') {
      if (link.is_ongoing) {
        for (let i = 1; ; i++) {
          const next = addMonths(start, i);
          if (next > maxDate) break;
          dates.push(formatDate(next));
        }
        return dates;
      }
      for (let i = 1; ; i++) {
        const next = addMonths(start, i);
        if (next > maxDate) break;
        const nextStr = formatDate(next);
        if (endDate && nextStr > endDate) break;
        if (maxOccurrences > 0 && dates.length >= maxOccurrences) break;
        dates.push(nextStr);
      }
      return dates;
    }

    const intervalDays = frequency === 'daily' ? 1 : frequency === 'weekly' ? 7 : frequency === 'biweekly' ? 14 : 0;
    if (intervalDays === 0) return dates;

    if (frequency === 'daily') {
      // For daily: walk forward day-by-day, only including available days
      if (link.is_ongoing) {
        let current = addDays(start, 1);
        while (current <= maxDate) {
          if (isDateAvailable(current)) {
            dates.push(formatDate(current));
          }
          current = addDays(current, 1);
        }
        return dates;
      }
      let current = addDays(start, 1);
      while (current <= maxDate) {
        const currentStr = formatDate(current);
        if (endDate && currentStr > endDate) break;
        if (maxOccurrences > 0 && dates.length >= maxOccurrences) break;
        if (isDateAvailable(current)) {
          dates.push(currentStr);
        }
        current = addDays(current, 1);
      }
      return dates;
    }

    // Weekly / Biweekly
    if (link.is_ongoing) {
      for (let i = 1; ; i++) {
        const next = addDays(start, intervalDays * i);
        if (next > maxDate) break;
        dates.push(formatDate(next));
      }
      return dates;
    }

    for (let i = 1; ; i++) {
      const next = addDays(start, intervalDays * i);
      if (next > maxDate) break;
      const nextStr = formatDate(next);
      if (endDate && nextStr > endDate) break;
      if (maxOccurrences > 0 && dates.length >= maxOccurrences) break;
      dates.push(nextStr);
    }
    return dates;
  }, [selectedDate, frequency, occurrences, endDate, maxDate, link, isDateAvailable]);

  const handleContinueFromRecurrence = () => {
    if (!link) return;
    if (!frequency) {
      setRecurrenceError('Please select a frequency for your recurring series.');
      return;
    }
    if (!link.is_ongoing && !link.occurrences && !link.end_date) {
      const occ = parseInt(occurrences) || 0;
      if (occ < 2 && !endDate) {
        setRecurrenceError('Please enter either a number of sessions (2 or more) or an end date for your recurring series.');
        return;
      }
      if (occ > 0 && occ < 2) {
        setRecurrenceError('Number of sessions must be at least 2.');
        return;
      }
    }
    setRecurrenceError('');
    checkConflicts();
  };

  const checkConflicts = useCallback(async () => {
    if (!selectedSlot) return;
    setConflictChecking(true);
    setConflictError('');
    const conflicts: SessionConflict[] = [];

    for (let i = 0; i < recurringDates.length; i++) {
      const date = recurringDates[i];
      const dateObj = new Date(date + 'T00:00:00');

      let isConflict = false;

      if (activeRestrictions) {
        const dayOfWeek = dateObj.getDay();
        if (!activeRestrictions.some(r => r.day === dayOfWeek)) {
          isConflict = true;
        }
      }

      if (!isConflict) {
        const existing = await fetchBookingsForDate(date, ownerUserId);
        let filtered: string[];
        if (activeRestrictions) {
          filtered = generateSlotsForRestrictions(dateObj, activeRestrictions, existing, durationMinutes, leadHours, bufferMinutes, slotIncrement, adminTimezone);
        } else {
          filtered = generateTimeSlots(dateObj, rules, overrides, existing, durationMinutes, leadHours, bufferMinutes, slotIncrement, adminTimezone);
        }

        if (!filtered.includes(selectedSlot!)) {
          isConflict = true;
        }
      }

      conflicts.push({
        date,
        index: i,
        hasConflict: isConflict,
        resolution: 'pending',
      });
    }

    setSessionConflicts(conflicts);
    setConflictChecking(false);

    if (conflicts.some(c => c.hasConflict)) {
      setStep('conflicts');
    } else {
      setStep('form');
    }
  }, [recurringDates, selectedSlot, activeRestrictions, fetchBookingsForDate, rules, overrides, durationMinutes, leadHours, bufferMinutes, slotIncrement, adminTimezone, ownerUserId]);

  const loadRescheduleSlots = useCallback(async (conflictIndex: number, dateStr: string) => {
    setRescheduleSlotsLoading(prev => ({ ...prev, [conflictIndex]: true }));
    const existing = await fetchBookingsForDate(dateStr, ownerUserId);
    const dateObj = new Date(dateStr + 'T00:00:00');
    let available: string[];
    if (activeRestrictions) {
      available = generateSlotsForRestrictions(dateObj, activeRestrictions, existing, durationMinutes, leadHours, bufferMinutes, slotIncrement, adminTimezone);
    } else {
      available = generateTimeSlots(dateObj, rules, overrides, existing, durationMinutes, leadHours, bufferMinutes, slotIncrement, adminTimezone);
    }

    setRescheduleSlots(prev => ({ ...prev, [conflictIndex]: available }));
    setRescheduleSlotsLoading(prev => ({ ...prev, [conflictIndex]: false }));
  }, [fetchBookingsForDate, rules, overrides, durationMinutes, leadHours, bufferMinutes, slotIncrement, activeRestrictions, adminTimezone, ownerUserId]);

  const handleConflictResolution = (index: number, resolution: ConflictResolution) => {
    setSessionConflicts(prev => prev.map(c =>
      c.index === index ? { ...c, resolution } : c
    ));
  };

  const handleRescheduleDateChange = (index: number, dateStr: string) => {
    setSessionConflicts(prev => prev.map(c =>
      c.index === index ? { ...c, rescheduleDate: dateStr, rescheduleTime: undefined } : c
    ));
    if (dateStr) loadRescheduleSlots(index, dateStr);
  };

  const handleRescheduleTimeChange = (index: number, timeStr: string) => {
    setSessionConflicts(prev => prev.map(c =>
      c.index === index ? { ...c, rescheduleTime: timeStr } : c
    ));
  };

  const validateConflictsResolved = (): boolean => {
    const unresolved = sessionConflicts.filter(c => c.hasConflict && c.resolution === 'pending');
    if (unresolved.length > 0) {
      setConflictError(`Please resolve all ${unresolved.length} conflicted session${unresolved.length !== 1 ? 's' : ''} before continuing.`);
      return false;
    }
    const needsRescheduleTime = sessionConflicts.filter(c => c.hasConflict && c.resolution === 'reschedule' && !c.rescheduleTime);
    if (needsRescheduleTime.length > 0) {
      setConflictError(`Please select a new time for ${needsRescheduleTime.length} session${needsRescheduleTime.length !== 1 ? 's' : ''} you chose to reschedule.`);
      return false;
    }
    setConflictError('');
    return true;
  };

  const handleContinueFromConflicts = () => {
    if (!validateConflictsResolved()) return;
    setStep('form');
  };

  const finalSessions = useMemo(() => {
    return sessionConflicts
      .filter(c => !(c.hasConflict && c.resolution === 'skip'))
      .map(c => {
        if (c.hasConflict && c.resolution === 'reschedule' && c.rescheduleDate && c.rescheduleTime) {
          return { date: c.rescheduleDate, time: c.rescheduleTime };
        }
        return { date: c.date, time: selectedSlot! };
      });
  }, [sessionConflicts, selectedSlot]);

  const handleSubmit = async (formData: IntakeFormData) => {
    if (!selectedDate || !selectedSlot || !link) return;
    setSubmitting(true);
    setConflictError('');

    const groupId = crypto.randomUUID();
    const sessionsToBook = sessionConflicts.length > 0 ? finalSessions : recurringDates.map(d => ({ date: d, time: selectedSlot }));

    try {
      let firstBooking: Booking | null = null;
      const allBookings: Booking[] = [];
      for (const session of sessionsToBook) {
        const booking = await createBooking({
          first_name: formData.firstName,
          last_name: formData.lastName,
          client_email: formData.email,
          client_phone: formData.phone || undefined,
          is_existing_client: formData.isExistingClient ?? undefined,
          guests: formData.guests,
          date: session.date,
          start_time: session.time,
          duration_minutes: durationMinutes,
          client_notes: formData.clientNotes || undefined,
          notes_to_client: link.notes_to_client || undefined,
          source: 'recurring_link',
          recurring_link_id: link.id,
          recurrence_group_id: groupId,
          client_timezone: clientTimezone,
          meeting_type_id: meetingType?.id || undefined,
          meeting_location_type: formData.meetingLocation,
          user_id: link.user_id,
        });
        if (!firstBooking) firstBooking = booking;
        allBookings.push(booking);
      }
      setConfirmedBooking(firstBooking);
      setStep('confirm');
      triggerRecurringConfirmationEmail(allBookings.map(b => b.id));
      if (link) await markLinkAsUsed(link.id);
    } catch (err) {
      console.error(err);
      alert('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleNavigate = (dir: -1 | 1) => {
    let newMonth = viewMonth + dir;
    let newYear = viewYear;
    if (newMonth < 0) { newMonth = 11; newYear--; }
    if (newMonth > 11) { newMonth = 0; newYear++; }
    setViewMonth(newMonth);
    setViewYear(newYear);
  };

  const canGoBack = viewYear > now.getFullYear() || (viewYear === now.getFullYear() && viewMonth > now.getMonth());
  const canGoForward = new Date(viewYear, viewMonth + 1, 1) <= maxDate;

  if (linkLoading || availLoading || settingsLoading) {
    return (
      <div className="flex justify-center py-20">
        <LoadingSpinner size="lg" message="Loading booking page..." />
      </div>
    );
  }

  if (linkError || !link) {
    return (
      <Card className="text-center py-16 max-w-lg mx-auto">
        <AlertCircle className="w-12 h-12 text-red-300 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Link Not Found</h2>
        <p className="text-gray-500 mb-6">This booking link is no longer active or does not exist.</p>
      </Card>
    );
  }

  if (linkExpired) {
    return (
      <Card className="text-center py-16 max-w-lg mx-auto">
        <AlertCircle className="w-12 h-12 text-amber-300 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Link No Longer Available</h2>
        <p className="text-gray-500 mb-6">This booking link has already been used or has expired. Please contact us to schedule your appointment.</p>
      </Card>
    );
  }

  // Step order: calendar -> time -> recurrence -> conflicts -> form -> confirm
  const stepOrder: (BookingStep | 'recurrence' | 'conflicts')[] = ['calendar', 'time', 'recurrence', 'conflicts', 'form'];

  const conflictedCount = sessionConflicts.filter(c => c.hasConflict).length;

  return (
    <div className="max-w-lg mx-auto">
      <div className="flex items-center gap-2 mb-6 text-jungo-green-600">
        <Repeat className="w-5 h-5" />
        <span className="text-sm font-medium">Recurring Booking for {link.client_name}</span>
      </div>

      {step !== 'calendar' && step !== 'confirm' && (
        <button
          onClick={() => {
            if (step === 'form') setStep(conflictedCount > 0 ? 'conflicts' : 'recurrence');
            else if (step === 'conflicts') setStep('recurrence');
            else if (step === 'recurrence') { setStep('time'); setRecurrenceError(''); }
            else if (step === 'time') { setStep('calendar'); setSelectedDate(null); setSelectedSlot(null); setConflictError(''); }
          }}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
      )}

      {step !== 'confirm' && (
        <ProgressIndicator
          steps={[
            'Select Date',
            'Select Time',
            'Recurrence',
            'Conflicts',
            'Your Info',
            'Confirmation',
          ]}
          currentIndex={stepOrder.indexOf(step)}
        />
      )}

      <Card padding="lg">
        {step === 'calendar' && (
          <>
            <h2 className="text-xl font-bold text-gray-900 mb-1">
              {meetingType?.name || settings?.meeting_name || 'Schedule a Recurring Meeting'}
            </h2>
            {meetingType?.description && (
              <p className="text-sm text-gray-500 mb-4">{meetingType.description}</p>
            )}
            <div className="flex items-center gap-2 mb-6 text-sm text-gray-600">
              <Clock className="w-4 h-4 text-jungo-green-500" />
              <span>{durationMinutes} minutes</span>
            </div>

            <div className="mb-6">
              <Select
                label="Timezone"
                value={clientTimezone}
                onChange={e => setClientTimezone(e.target.value)}
                options={getTimezoneOptions()}
              />
            </div>

            {hasRestrictions && canBrowseFullAvailability && (
              <div className="mb-4">
                <button
                  onClick={() => setUseFullAvailability(!useFullAvailability)}
                  className={`w-full flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                    useFullAvailability
                      ? 'border-jungo-green-500 bg-jungo-green-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <CalendarDays className="w-5 h-5 text-jungo-green-600 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {useFullAvailability ? 'Browsing full availability' : 'Browsing restricted times'}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {useFullAvailability
                        ? 'Showing all available days. Click to switch to your curated time slots.'
                        : 'Showing curated time slots. Click to browse all available days.'}
                    </p>
                  </div>
                </button>
              </div>
            )}

            {activeRestrictions && (
              <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700">
                <p className="font-medium">Available Days</p>
                <p className="text-xs mt-0.5">
                  You can only start on: {activeRestrictions.map(r => ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][r.day]).join(', ')}
                </p>
              </div>
            )}

            <h3 className="text-lg font-semibold text-gray-900 mb-4">Select Start Date</h3>
            <p className="text-sm text-gray-500 mb-6">Choose when your recurring meetings begin.</p>
            <CalendarGrid
              year={viewYear}
              month={viewMonth}
              selectedDate={selectedDate}
              onSelectDate={handleDateSelect}
              onNavigate={handleNavigate}
              canGoBack={canGoBack}
              canGoForward={canGoForward}
              rules={rules}
              overrides={overrides}
              maxDate={maxDate}
              timeRestrictions={activeRestrictions}
            />
          </>
        )}

        {step === 'time' && selectedDate && (
          <div className="animate-slide-up space-y-5">
            <h3 className="text-lg font-semibold text-gray-900">Select a Time</h3>
            <p className="text-sm text-gray-500">
              Choose the time for your recurring sessions. All sessions will use the same time of day.
            </p>
            <TimeSlotPicker
              date={selectedDate}
              slots={displaySlots}
              selectedSlot={selectedSlot ? convertTimeSlot(selectedSlot, selectedDate, adminTimezone, clientTimezone) : null}
              onSelectSlot={handleSlotSelect}
              loading={slotsLoading}
              timezone={clientTimezone}
            />

            {conflictError && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
                <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-red-700">{conflictError}</p>
              </div>
            )}

            {selectedSlot && (
              <Button
                className="w-full"
                size="lg"
                onClick={handleContinueFromTime}
                icon={<CalendarClock className="w-5 h-5" />}
              >
                Continue to Recurrence
              </Button>
            )}
          </div>
        )}

        {step === 'recurrence' && selectedDate && selectedSlot && (
          <div className="animate-slide-up space-y-5">
            <h3 className="text-lg font-semibold text-gray-900">Recurrence Details</h3>

            {adminSetFrequency ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Frequency</label>
                <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-700">
                  <Lock className="w-3.5 h-3.5 text-gray-400" />
                  <span className="capitalize">{FREQUENCY_LABELS[link.frequency!] || link.frequency}</span>
                </div>
              </div>
            ) : (
              <Select
                label="Frequency"
                value={frequency}
                onChange={e => setFrequency(e.target.value)}
                options={[
                  { value: '', label: 'Select...' },
                  { value: 'daily', label: 'Daily' },
                  { value: 'weekly', label: 'Weekly' },
                  { value: 'biweekly', label: 'Every 2 weeks' },
                  { value: 'monthly', label: 'Monthly' },
                ]}
              />
            )}

            {link.is_ongoing ? (
              <div className="bg-jungo-green-50 border border-jungo-green-200 rounded-lg p-3 text-sm text-jungo-green-700">
                This is an ongoing recurring series with no end date. Sessions will continue until you stop booking.
              </div>
            ) : adminSetEndCondition ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">End Condition</label>
                <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-700">
                  <Lock className="w-3.5 h-3.5 text-gray-400" />
                  {link.occurrences ? `${link.occurrences} sessions` : `Until ${formatDisplayDate(link.end_date!)}`}
                </div>
              </div>
            ) : (
              <div>
                <p className="text-sm text-gray-500 mb-3">Choose how your recurring series ends. Enter either a number of sessions or an end date.</p>
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="Number of Sessions"
                    type="number"
                    min="2"
                    max="365"
                    value={occurrences}
                    onChange={e => setOccurrences(e.target.value)}
                    placeholder="e.g., 4"
                  />
                  <Input
                    label="Or End By Date"
                    type="date"
                    value={endDate}
                    onChange={e => setEndDate(e.target.value)}
                  />
                </div>
              </div>
            )}

            {recurringDates.length > 0 && (
              <div className="bg-gray-50 rounded-lg p-4 border">
                <p className="text-sm font-medium text-gray-700 mb-2">
                  Schedule Preview ({recurringDates.length} sessions)
                  {frequency === 'daily' && recurringDates.length > 20 && (
                    <span className="text-xs text-gray-400 ml-2">
                      ({recurringDates.length} sessions will be created)
                    </span>
                  )}
                </p>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {recurringDates.map((d, i) => (
                    <p key={d} className="text-sm text-gray-600">
                      <span className="text-gray-400 mr-2">#{i + 1}</span>
                      {formatDisplayDate(d)}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {recurrenceError && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
                <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-red-700">{recurrenceError}</p>
              </div>
            )}

            <Button
              className="w-full"
              size="lg"
              onClick={handleContinueFromRecurrence}
              loading={conflictChecking}
              icon={<CalendarClock className="w-5 h-5" />}
            >
              {conflictChecking ? 'Checking availability...' : 'Check Availability & Continue'}
            </Button>
          </div>
        )}

        {step === 'conflicts' && selectedDate && selectedSlot && (
          <div className="animate-slide-up space-y-5">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Resolve Conflicts</h3>
              <p className="text-sm text-gray-500 mt-1">
                {conflictedCount} of {recurringDates.length} sessions have scheduling conflicts. For each, choose to reschedule or skip.
              </p>
            </div>

            {conflictError && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
                <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-red-700">{conflictError}</p>
              </div>
            )}

            <div className="space-y-3 max-h-96 overflow-y-auto">
              {sessionConflicts.map((conflict) => (
                <div
                  key={conflict.index}
                  className={`rounded-lg border p-3 ${
                    conflict.hasConflict
                      ? 'border-amber-300 bg-amber-50'
                      : 'border-gray-200 bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">#{conflict.index + 1}</span>
                      <span className="text-sm text-gray-700">
                        {formatDisplayDate(conflict.date)} at {formatTime(convertTimeSlot(selectedSlot, conflict.date, adminTimezone, clientTimezone))}
                      </span>
                    </div>
                    {conflict.hasConflict ? (
                      <span className="flex items-center gap-1 text-xs text-amber-600 font-medium">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        Conflict
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-jungo-green-600 font-medium">
                        <Check className="w-3.5 h-3.5" />
                        Available
                      </span>
                    )}
                  </div>

                  {conflict.hasConflict && (
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleConflictResolution(conflict.index, 'reschedule')}
                          className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                            conflict.resolution === 'reschedule'
                              ? 'border-jungo-green-500 bg-jungo-green-500 text-white'
                              : 'border-gray-200 text-gray-600 hover:bg-gray-100'
                          }`}
                        >
                          Reschedule
                        </button>
                        <button
                          onClick={() => handleConflictResolution(conflict.index, 'skip')}
                          className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                            conflict.resolution === 'skip'
                              ? 'border-gray-400 bg-gray-400 text-white'
                              : 'border-gray-200 text-gray-600 hover:bg-gray-100'
                          }`}
                        >
                          Skip
                        </button>
                      </div>

                      {conflict.resolution === 'reschedule' && (
                        <div className="space-y-2 pt-2 border-t border-amber-200">
                          <Input
                            label="New Date"
                            type="date"
                            value={conflict.rescheduleDate || ''}
                            onChange={e => handleRescheduleDateChange(conflict.index, e.target.value)}
                          />
                          {conflict.rescheduleDate && (
                            <>
                              {rescheduleSlotsLoading[conflict.index] ? (
                                <p className="text-xs text-gray-400">Loading available times...</p>
                              ) : (
                                <Select
                                  label="New Time"
                                  value={conflict.rescheduleTime || ''}
                                  onChange={e => handleRescheduleTimeChange(conflict.index, e.target.value)}
                                  options={[
                                    { value: '', label: 'Select...' },
                                    ...(rescheduleSlots[conflict.index] || []).map(s => ({
                                      value: s,
                                      label: formatTime(s),
                                    })),
                                  ]}
                                />
                              )}
                              {conflict.rescheduleDate && !rescheduleSlotsLoading[conflict.index] &&
                                (rescheduleSlots[conflict.index] || []).length === 0 && (
                                <p className="text-xs text-amber-600">No available times on this date. Try another date or skip this session.</p>
                              )}
                            </>
                          )}
                        </div>
                      )}

                      {conflict.resolution === 'skip' && (
                        <div className="flex items-center gap-1.5 text-xs text-gray-500 pt-1">
                          <X className="w-3.5 h-3.5" />
                          This session will be skipped (no booking created).
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600">
              <p className="font-medium">{finalSessions.length} sessions will be booked.</p>
              {conflictedCount > 0 && (
                <p className="text-xs text-gray-400 mt-0.5">
                  {sessionConflicts.filter(c => c.hasConflict && c.resolution === 'skip').length} skipped,
                  {' '}{sessionConflicts.filter(c => c.hasConflict && c.resolution === 'reschedule').length} rescheduled
                </p>
              )}
            </div>

            <Button className="w-full" size="lg" onClick={handleContinueFromConflicts}>
              Continue to Details
            </Button>
          </div>
        )}

        {step === 'form' && selectedDate && selectedSlot && (
          <IntakeForm
            date={selectedDate}
            time={convertTimeSlot(selectedSlot, selectedDate, adminTimezone, clientTimezone)}
            durationMinutes={durationMinutes}
            onSubmit={handleSubmit}
            loading={submitting}
            prefillName={link.client_name}
            prefillEmail={link.client_email}
            forcedLocation={link.meeting_location_type || meetingType?.meeting_location_type || null}
          />
        )}

        {step === 'confirm' && confirmedBooking && (
          <div className="animate-scale-in text-center">
            <BookingConfirmation
              booking={confirmedBooking}
              adminTimezone={adminTimezone}
              clientTimezone={clientTimezone}
            />
            <p className="text-sm text-gray-500 mt-4">
              {sessionConflicts.length > 0 ? finalSessions.length : recurringDates.length} sessions have been booked.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
