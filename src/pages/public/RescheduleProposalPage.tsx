import { useState, useEffect, useCallback, useMemo } from 'react';
import { CalendarClock, Check, AlertCircle, Clock, Mail, CalendarDays, ArrowLeft } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { useRescheduleProposals } from '@/hooks/useRescheduleProposals';
import { useBookings } from '@/hooks/useBookings';
import { useSettings } from '@/hooks/useSettings';
import { useAvailability } from '@/hooks/useAvailability';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Badge from '@/components/ui/Badge';
import CalendarGrid from '@/components/calendar/CalendarGrid';
import TimeSlotPicker from '@/components/calendar/TimeSlotPicker';
import { formatTime, formatDisplayDate, generateTimeSlots, convertTimeSlot, convertTimeSlotWithDate, getTimezoneOptions, detectTimezone, classNames } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import type { RescheduleProposalWithSlots } from '@/hooks/useRescheduleProposals';
import type { Booking } from '@/lib/types';

export default function RescheduleProposalPage() {
  const { token } = useParams<{ token: string }>();
  const { fetchByToken, claimSlot } = useRescheduleProposals();
  const [proposal, setProposal] = useState<RescheduleProposalWithSlots | null>(null);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showCalendar, setShowCalendar] = useState(false);

  const ownerUserId = proposal?.user_id || booking?.user_id;
  const { rescheduleBooking, fetchBookingsForDate } = useBookings({ autoFetch: false, userId: ownerUserId });
  const { settings, loading: settingsLoading } = useSettings(ownerUserId);
  const { rules, overrides, loading: availLoading } = useAvailability(ownerUserId);

  // Calendar state
  const [calendarDate, setCalendarDate] = useState<string | null>(null);
  const [calendarSlot, setCalendarSlot] = useState<string | null>(null);
  const [calendarSlots, setCalendarSlots] = useState<string[]>([]);
  const [calendarSlotsLoading, setCalendarSlotsLoading] = useState(false);
  const [clientTimezone, setClientTimezone] = useState(detectTimezone);

  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());

  const windowDays = settings?.booking_window_days || 90;
  const maxDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + windowDays);
    return d;
  }, [windowDays]);

  const adminTimezone = settings?.timezone || 'America/New_York';
  const durationMinutes = booking?.duration_minutes || settings?.default_meeting_length || 30;

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const data = await fetchByToken(token);
        if (!data) {
          setError(true);
          return;
        }
        setProposal(data);

        // Fetch the booking details
        const { data: bd } = await supabase
          .from('bookings')
          .select('*')
          .eq('id', data.booking_id)
          .maybeSingle();
        if (bd) setBooking(bd as Booking);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [token, fetchByToken]);

  const availableSlots = useMemo(() => {
    if (!proposal) return [];
    const leadHours = settings?.booking_lead_hours || 2;
    const cutoff = new Date(Date.now() + leadHours * 60 * 60 * 1000);
    return proposal.slots.filter(s => {
      if (s.is_claimed) return false;
      const slotStart = new Date(`${s.date}T${s.start_time}`);
      return slotStart > cutoff;
    });
  }, [proposal, settings]);

  const slotsByDate = useMemo(() => {
    const groups: Record<string, typeof availableSlots> = {};
    for (const slot of availableSlots) {
      if (!groups[slot.date]) groups[slot.date] = [];
      groups[slot.date].push(slot);
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [availableSlots]);

  const displayCalendarSlots = useMemo(() =>
    calendarSlots.map(s => convertTimeSlot(s, calendarDate || '', adminTimezone, clientTimezone)),
    [calendarSlots, calendarDate, adminTimezone, clientTimezone]
  );

  const loadCalendarSlots = useCallback(async (dateStr: string) => {
    setCalendarSlotsLoading(true);
    const existing = await fetchBookingsForDate(dateStr, ownerUserId);
    const date = new Date(dateStr + 'T00:00:00');
    const available = generateTimeSlots(date, rules, overrides, existing, durationMinutes, settings?.booking_lead_hours || 2, settings?.buffer_minutes ?? 0, settings?.slot_increment_minutes ?? 15, adminTimezone);
    setCalendarSlots(available);
    setCalendarSlotsLoading(false);
  }, [rules, overrides, settings, fetchBookingsForDate, durationMinutes, adminTimezone, ownerUserId]);

  const handleCalendarDateSelect = (dateStr: string) => {
    setCalendarDate(dateStr);
    setCalendarSlot(null);
    loadCalendarSlots(dateStr);
  };

  const handleCalendarSlotSelect = (slot: string) => {
    const adminSlot = convertTimeSlotWithDate(slot, calendarDate || '', clientTimezone, adminTimezone);
    setCalendarDate(adminSlot.date);
    setCalendarSlot(adminSlot.time);
  };

  const handleConfirmCuratedSlot = async () => {
    if (!proposal || !selectedSlotId || !booking) return;
    setConfirming(true);
    setActionError(null);
    try {
      const slot = proposal.slots.find(s => s.id === selectedSlotId);
      if (!slot) return;

      await claimSlot(proposal.id, selectedSlotId);

      await rescheduleBooking(
        booking.id,
        slot.date,
        slot.start_time,
        booking.duration_minutes,
        true
      );

      setConfirmed(true);
    } catch (err) {
      setActionError('Could not confirm this reschedule. The slot may have already been claimed. Please try another time or contact us.');
      setSelectedSlotId(null);
    } finally {
      setConfirming(false);
    }
  };

  const handleConfirmCalendarSlot = async () => {
    if (!proposal || !booking || !calendarDate || !calendarSlot) return;
    setConfirming(true);
    setActionError(null);
    try {
      await rescheduleBooking(
        booking.id,
        calendarDate,
        calendarSlot,
        booking.duration_minutes,
        true
      );

      // Deactivate the proposal since it's been used
      await supabase
        .from('reschedule_proposals')
        .update({ is_active: false, is_claimed: true })
        .eq('id', proposal.id);

      setConfirmed(true);
    } catch (err) {
      setActionError('Could not confirm this reschedule. Please try another time or contact us.');
      setCalendarSlot(null);
    } finally {
      setConfirming(false);
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

  if (loading || (showCalendar && (settingsLoading || availLoading))) {
    return <div className="flex justify-center py-20"><LoadingSpinner size="lg" /></div>;
  }

  if (error || !proposal) {
    return (
      <Card className="text-center py-16 max-w-lg mx-auto">
        <AlertCircle className="w-12 h-12 text-red-300 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Link Not Found</h2>
        <p className="text-gray-500 mb-6">This reschedule link is no longer active or does not exist.</p>
      </Card>
    );
  }

  if (confirmed) {
    const slot = proposal.slots.find(s => s.id === selectedSlotId);
    return (
      <Card className="text-center py-16 max-w-lg mx-auto">
        <div className="w-16 h-16 bg-jungo-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Check className="w-8 h-8 text-jungo-green-600" />
        </div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Meeting Rescheduled!</h2>
        <p className="text-gray-500 mb-2">
          Your meeting has been moved to:
        </p>
        <p className="font-medium text-gray-900">
          {slot ? `${formatDisplayDate(slot.date)} at ${formatTime(slot.start_time)}` : calendarDate && calendarSlot ? `${formatDisplayDate(calendarDate)} at ${formatTime(convertTimeSlot(calendarSlot, calendarDate, adminTimezone, clientTimezone))}` : ''}
        </p>
        <p className="text-sm text-gray-400 mt-4">A confirmation email has been sent to {proposal.client_email}.</p>
      </Card>
    );
  }

  const canUseFullAvailability = proposal.allow_full_availability ?? true;
  const hasCuratedSlots = availableSlots.length > 0;

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      <div className="text-center">
        <div className="w-16 h-16 bg-jungo-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CalendarClock className="w-8 h-8 text-jungo-green-600" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Reschedule Your Meeting</h1>
        <p className="text-gray-500 mt-2">
          Hi {proposal.client_name}, please select a new time for your meeting.
        </p>
        {proposal.message && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-4 text-left">
            <p className="text-sm text-blue-800 whitespace-pre-wrap">{proposal.message}</p>
          </div>
        )}
      </div>

      {/* Curated slots */}
      {hasCuratedSlots && !showCalendar && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Available Times</h3>
          {slotsByDate.map(([date, slots]) => (
            <div key={date}>
              <p className="text-xs font-medium text-gray-500 mb-2">{formatDisplayDate(date)}</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {slots.map(slot => (
                  <button
                    key={slot.id}
                    onClick={() => setSelectedSlotId(slot.id)}
                    className={classNames(
                      'flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2.5 text-sm font-medium transition-all duration-150',
                      'border-gray-200 text-gray-700 hover:border-jungo-green-500 hover:bg-jungo-green-50 hover:text-jungo-green-700',
                      'active:scale-95',
                      selectedSlotId === slot.id && 'border-jungo-green-500 bg-jungo-green-50 text-jungo-green-700 ring-2 ring-jungo-green-200'
                    )}
                  >
                    <Clock className="w-3.5 h-3.5 text-gray-400" />
                    {formatTime(convertTimeSlot(slot.start_time, slot.date, adminTimezone, clientTimezone))}
                  </button>
                ))}
              </div>
            </div>
          ))}

          {canUseFullAvailability && (
            <div className="pt-4 border-t border-gray-100">
              <button
                onClick={() => setShowCalendar(true)}
                className="flex items-center gap-2 text-sm text-jungo-green-600 hover:text-jungo-green-700 transition-colors"
              >
                <CalendarDays className="w-4 h-4" />
                None of these work? See other available days
              </button>
            </div>
          )}
        </div>
      )}

      {/* Full availability calendar */}
      {showCalendar && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Choose a Date</h3>
            {hasCuratedSlots && (
              <button
                onClick={() => { setShowCalendar(false); setCalendarDate(null); setCalendarSlot(null); }}
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to proposed times
              </button>
            )}
          </div>

          <div className="mb-4">
            <Select
              label="Timezone"
              value={clientTimezone}
              onChange={e => setClientTimezone(e.target.value)}
              options={getTimezoneOptions()}
            />
          </div>

          <CalendarGrid
            year={viewYear}
            month={viewMonth}
            selectedDate={calendarDate}
            onSelectDate={handleCalendarDateSelect}
            onNavigate={handleNavigate}
            canGoBack={canGoBack}
            canGoForward={canGoForward}
            rules={rules}
            overrides={overrides}
            maxDate={maxDate}
          />

          {calendarDate && (
            <div className="mt-4">
              <TimeSlotPicker
                date={calendarDate}
                slots={displayCalendarSlots}
                selectedSlot={calendarSlot ? convertTimeSlot(calendarSlot, calendarDate, adminTimezone, clientTimezone) : null}
                onSelectSlot={handleCalendarSlotSelect}
                loading={calendarSlotsLoading}
                timezone={clientTimezone}
              />
            </div>
          )}
        </div>
      )}

      {/* No curated slots and no full availability */}
      {!hasCuratedSlots && !canUseFullAvailability && !showCalendar && (
        <Card className="text-center py-12">
          <Clock className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-gray-500">No times have been proposed yet. Please check back later.</p>
        </Card>
      )}

      {/* No curated slots but full availability allowed - show calendar directly */}
      {!hasCuratedSlots && canUseFullAvailability && !showCalendar && (
        <Card className="text-center py-8">
          <CalendarDays className="w-8 h-8 text-jungo-green-500 mx-auto mb-3" />
          <p className="text-gray-500 mb-4">No specific times were proposed. You can choose from our regular availability below.</p>
          <Button onClick={() => setShowCalendar(true)} icon={<CalendarDays className="w-4 h-4" />}>
            Choose from regular availability
          </Button>
        </Card>
      )}

      {actionError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-red-700">{actionError}</p>
        </div>
      )}

      {/* Confirm button for curated slot */}
      {selectedSlotId && !showCalendar && (
        <div className="flex justify-end">
          <Button
            onClick={handleConfirmCuratedSlot}
            loading={confirming}
            icon={<Check className="w-4 h-4" />}
            size="lg"
          >
            Confirm New Time
          </Button>
        </div>
      )}

      {/* Confirm button for calendar slot */}
      {showCalendar && calendarDate && calendarSlot && (
        <div className="flex justify-end">
          <Button
            onClick={handleConfirmCalendarSlot}
            loading={confirming}
            icon={<Check className="w-4 h-4" />}
            size="lg"
          >
            Confirm New Time
          </Button>
        </div>
      )}

      <div className="text-center text-sm text-gray-400">
        <Mail className="w-3.5 h-3.5 inline mr-1" />
        Questions? Reply to your confirmation email or contact us directly.
      </div>
    </div>
  );
}
