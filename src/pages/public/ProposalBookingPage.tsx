import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { ArrowLeft, AlertCircle, Clock, CalendarClock, CalendarDays } from 'lucide-react';
import CalendarGrid from '@/components/calendar/CalendarGrid';
import TimeSlotPicker from '@/components/calendar/TimeSlotPicker';
import IntakeForm from '@/components/booking/IntakeForm';
import type { IntakeFormData } from '@/components/booking/IntakeForm';
import BookingConfirmation from '@/components/booking/BookingConfirmation';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ProgressIndicator from '@/components/ui/ProgressIndicator';
import { supabase } from '@/lib/supabase';
import { useProposalLinks } from '@/hooks/useProposalLinks';
import { useBookings } from '@/hooks/useBookings';
import { useSettings } from '@/hooks/useSettings';
import { useAvailability } from '@/hooks/useAvailability';
import { generateTimeSlots, formatDate, formatDisplayDate, formatTime, detectTimezone, getTimezoneOptions, classNames, convertTimeSlot, convertTimeSlotWithDate, getMeetingInstantUTC } from '@/lib/utils';
import { triggerBookingEmails } from '@/lib/bookingEmails';
import type { Booking, MeetingType, ProposalSlot, BookingStep } from '@/lib/types';
import type { ProposalLinkWithSlots } from '@/hooks/useProposalLinks';

type ProposalStep = BookingStep | 'slots';

export default function ProposalBookingPage() {
  const { token } = useParams<{ token: string }>();
  const { fetchByToken, claimSlot, markProposalAsUsed } = useProposalLinks();
  const [proposal, setProposal] = useState<ProposalLinkWithSlots | null>(null);
  const [meetingType, setMeetingType] = useState<MeetingType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const ownerUserId = proposal?.user_id;
  const { createBooking, fetchBookingsForDate } = useBookings({ autoFetch: false, userId: ownerUserId });
  const { settings, loading: settingsLoading } = useSettings(ownerUserId);
  const { rules, overrides, loading: availLoading } = useAvailability(ownerUserId);

  const [step, setStep] = useState<ProposalStep>('slots');
  const [selectedSlot, setSelectedSlot] = useState<ProposalSlot | null>(null);
  const [calendarSlot, setCalendarSlot] = useState<string | null>(null);
  const [calendarDate, setCalendarDate] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmedBooking, setConfirmedBooking] = useState<Booking | null>(null);
  const [showCalendar, setShowCalendar] = useState(false);
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

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const data = await fetchByToken(token);
        if (!data) {
          setError(true);
        } else {
          setProposal(data);
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
        setError(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [token, fetchByToken]);

  const isUsed = useMemo(() => proposal?.is_used ?? false, [proposal]);

  const isExpired = useMemo(() => {
    if (!proposal?.expires_at) return false;
    return new Date(proposal.expires_at) < new Date();
  }, [proposal]);

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
    const groups: Record<string, ProposalSlot[]> = {};
    for (const slot of availableSlots) {
      if (!groups[slot.date]) groups[slot.date] = [];
      groups[slot.date].push(slot);
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [availableSlots]);

  const durationMinutes = meetingType?.duration_minutes || settings?.default_meeting_length || 30;
  const adminTimezone = settings?.timezone || 'America/New_York';

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
  }, [rules, overrides, settings, fetchBookingsForDate, durationMinutes, meetingType, ownerUserId]);

  const handleCalendarDateSelect = (dateStr: string) => {
    setCalendarDate(dateStr);
    setCalendarSlot(null);
    loadCalendarSlots(dateStr);
  };

  const handleCalendarSlotSelect = (slot: string) => {
    const adminSlot = convertTimeSlotWithDate(slot, calendarDate || '', clientTimezone, adminTimezone);
    setCalendarDate(adminSlot.date);
    setCalendarSlot(adminSlot.time);
    setStep('form');
  };

  const handleSlotSelect = (slot: ProposalSlot) => {
    setSelectedSlot(slot);
    setStep('form');
  };

  const handleSubmit = async (formData: IntakeFormData) => {
    if (!proposal) return;
    setSubmitting(true);
    try {
      if (selectedSlot) {
        const leadHours = settings?.booking_lead_hours || 2;
        const cutoff = new Date(Date.now() + leadHours * 60 * 60 * 1000);
        const slotStart = getMeetingInstantUTC(selectedSlot.date, selectedSlot.start_time, adminTimezone);
        if (slotStart <= cutoff) {
          alert('This slot is too close to the start time to book. Please choose another slot.');
          setStep('slots');
          setSelectedSlot(null);
          return;
        }

        await claimSlot(selectedSlot.id);

        const booking = await createBooking({
          first_name: formData.firstName,
          last_name: formData.lastName,
          client_email: formData.email,
          client_phone: formData.phone || undefined,
          is_existing_client: formData.isExistingClient ?? undefined,
          guests: formData.guests,
          date: selectedSlot.date,
          start_time: selectedSlot.start_time,
          duration_minutes: durationMinutes,
          client_notes: formData.clientNotes || undefined,
          source: 'proposal_link',
          proposal_link_id: proposal.id,
          meeting_type_id: meetingType?.id || undefined,
          user_id: proposal.user_id,
        });

        setConfirmedBooking(booking);
        setStep('confirm');
        triggerBookingEmails(booking.id);
        await markProposalAsUsed(proposal.id);
      } else if (calendarDate && calendarSlot) {
        const booking = await createBooking({
          first_name: formData.firstName,
          last_name: formData.lastName,
          client_email: formData.email,
          client_phone: formData.phone || undefined,
          is_existing_client: formData.isExistingClient ?? undefined,
          guests: formData.guests,
          date: calendarDate,
          start_time: calendarSlot,
          duration_minutes: durationMinutes,
          client_notes: formData.clientNotes || undefined,
          source: 'proposal_link',
          proposal_link_id: proposal.id,
          meeting_type_id: meetingType?.id || undefined,
          client_timezone: clientTimezone,
          user_id: proposal.user_id,
        });

        setConfirmedBooking(booking);
        setStep('confirm');
        triggerBookingEmails(booking.id);
      }
    } catch (err) {
      console.error('Booking error:', err);
      alert('This slot may have just been booked by someone else, or something went wrong. Please try another slot.');
      setStep('slots');
      setSelectedSlot(null);
      setCalendarSlot(null);
      const refreshed = await fetchByToken(token!);
      if (refreshed) setProposal(refreshed);
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

  if (loading || settingsLoading || (showCalendar && availLoading)) {
    return (
      <div className="flex justify-center py-20">
        <LoadingSpinner size="lg" message="Loading booking page..." />
      </div>
    );
  }

  if (error || !proposal) {
    return (
      <Card className="text-center py-16 max-w-lg mx-auto">
        <AlertCircle className="w-12 h-12 text-red-300 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Link Not Found</h2>
        <p className="text-gray-500 mb-6">This booking link is no longer active or does not exist.</p>
      </Card>
    );
  }

  if (isExpired || isUsed) {
    return (
      <Card className="text-center py-16 max-w-lg mx-auto">
        <AlertCircle className="w-12 h-12 text-amber-300 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Link No Longer Available</h2>
        <p className="text-gray-500 mb-6">This proposal link has already been used or has expired. Please contact us to schedule your appointment.</p>
      </Card>
    );
  }

  if (step !== 'confirm' && !showCalendar && availableSlots.length === 0) {
    const canUseFullAvailability = proposal?.allow_full_availability ?? true;
    return (
      <div className="max-w-lg mx-auto">
        <Card className="text-center py-16">
          <CalendarClock className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">No Slots Available</h2>
          <p className="text-gray-500 mb-6">All the offered time slots have been booked.</p>
          {canUseFullAvailability && (
            <Button onClick={() => setShowCalendar(true)} icon={<CalendarDays className="w-4 h-4" />} className="mb-3">
              Choose from regular availability
            </Button>
          )}
        </Card>
      </div>
    );
  }

  const stepOrder: ProposalStep[] = ['slots', 'form'];

  return (
    <div className="max-w-lg mx-auto">
      <div className="flex items-center gap-2 mb-6 text-jungo-green-600">
        <CalendarClock className="w-5 h-5" />
        <span className="text-sm font-medium">
          {meetingType?.name || 'Meeting Proposal'}
        </span>
      </div>

      {step !== 'slots' && step !== 'confirm' && (
        <button
          onClick={() => {
            if (step === 'form') {
              setStep('slots');
              setSelectedSlot(null);
              setCalendarSlot(null);
            }
          }}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
      )}

      {step !== 'confirm' && (
        <ProgressIndicator
          steps={['Select Time', 'Your Info', 'Confirmation']}
          currentIndex={stepOrder.indexOf(step)}
        />
      )}

      <Card padding="lg">
        {step === 'slots' && !showCalendar && (
          <>
            <h2 className="text-xl font-bold text-gray-900 mb-1">
              {meetingType?.name || 'Choose a Time'}
            </h2>
            {meetingType?.description && (
              <p className="text-sm text-gray-500 mb-4">{meetingType.description}</p>
            )}
            <div className="flex items-center gap-2 mb-6 text-sm text-gray-600">
              <Clock className="w-4 h-4 text-jungo-green-500" />
              <span>{durationMinutes} minutes</span>
            </div>

            <p className="text-sm text-gray-500 mb-4">
              Please choose from the available times below:
            </p>

            <div className="space-y-5">
              {slotsByDate.map(([date, slots]) => (
                <div key={date}>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">
                    {formatDisplayDate(date)}
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {slots.map(slot => (
                      <button
                        key={slot.id}
                        onClick={() => handleSlotSelect(slot)}
                        className={classNames(
                          'flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2.5 text-sm font-medium transition-all duration-150',
                          'border-gray-200 text-gray-700 hover:border-jungo-green-500 hover:bg-jungo-green-50 hover:text-jungo-green-700',
                          'active:scale-95'
                        )}
                      >
                        <Clock className="w-3.5 h-3.5 text-gray-400" />
                        {formatTime(convertTimeSlot(slot.start_time, slot.date, adminTimezone, clientTimezone))}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 pt-6 border-t border-gray-100">
              {(proposal?.allow_full_availability ?? true) && (
                <button
                  onClick={() => setShowCalendar(true)}
                  className="flex items-center gap-2 text-sm text-jungo-green-600 hover:text-jungo-green-700 transition-colors"
                >
                  <CalendarDays className="w-4 h-4" />
                  None of these work? See other available days
                </button>
              )}
            </div>
          </>
        )}

        {step === 'slots' && showCalendar && (
          <>
            <h2 className="text-xl font-bold text-gray-900 mb-1">
              {meetingType?.name || 'Choose a Time'}
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

            <h3 className="text-lg font-semibold text-gray-900 mb-4">Select a Date</h3>
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
              <div className="mt-6">
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

            <div className="mt-6 pt-6 border-t border-gray-100">
              <button
                onClick={() => { setShowCalendar(false); setCalendarDate(null); setCalendarSlot(null); }}
                className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to proposed slots
              </button>
            </div>
          </>
        )}

        {step === 'form' && (selectedSlot || (calendarDate && calendarSlot)) && (
          <IntakeForm
            date={selectedSlot ? selectedSlot.date : calendarDate!}
            time={selectedSlot ? convertTimeSlot(selectedSlot.start_time, selectedSlot.date, adminTimezone, clientTimezone) : convertTimeSlot(calendarSlot!, calendarDate!, adminTimezone, clientTimezone)}
            durationMinutes={durationMinutes}
            onSubmit={handleSubmit}
            loading={submitting}
            prefillName={proposal.client_name}
            prefillEmail={proposal.client_email}
          />
        )}

        {step === 'confirm' && confirmedBooking && (
          <BookingConfirmation
            booking={confirmedBooking}
            adminTimezone={adminTimezone}
            clientTimezone={clientTimezone}
          />
        )}
      </Card>
    </div>
  );
}
