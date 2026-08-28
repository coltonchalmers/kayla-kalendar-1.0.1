import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { ArrowLeft, CircleAlert as AlertCircle, Clock, CalendarClock } from 'lucide-react';
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
import { useAvailability } from '@/hooks/useAvailability';
import { useBookings } from '@/hooks/useBookings';
import { useSettings } from '@/hooks/useSettings';
import { useMeetingTypes } from '@/hooks/useMeetingTypes';
import { generateTimeSlots, formatDate, detectTimezone, getTimezoneOptions, convertTimeSlot, convertTimeSlotWithDate } from '@/lib/utils';
import { triggerBookingEmails } from '@/lib/bookingEmails';
import type { Booking, MeetingType, BookingStep } from '@/lib/types';

export default function MeetingTypeBookingPage() {
  const { token } = useParams<{ token: string }>();
  const { fetchByToken } = useMeetingTypes();
  const [meetingType, setMeetingType] = useState<MeetingType | null>(null);
  const [mtLoading, setMtLoading] = useState(true);
  const [mtError, setMtError] = useState(false);

  const ownerUserId = meetingType?.user_id;
  const { rules, overrides, loading: availLoading } = useAvailability(ownerUserId);
  const { createBooking, fetchBookingsForDate } = useBookings({ autoFetch: false, userId: ownerUserId });
  const { settings, loading: settingsLoading } = useSettings(ownerUserId);

  const [step, setStep] = useState<BookingStep>('calendar');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [slots, setSlots] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmedBooking, setConfirmedBooking] = useState<Booking | null>(null);
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
        if (!data) setMtError(true);
        else setMeetingType(data);
      } catch {
        setMtError(true);
      } finally {
        setMtLoading(false);
      }
    })();
  }, [token, fetchByToken]);

  const durationMinutes = meetingType?.duration_minutes || 30;
  const adminTimezone = settings?.timezone || 'America/New_York';

  const loadSlots = useCallback(async (dateStr: string) => {
    setSlotsLoading(true);
    const existing = await fetchBookingsForDate(dateStr, ownerUserId);
    const date = new Date(dateStr + 'T00:00:00');
    const available = generateTimeSlots(date, rules, overrides, existing, durationMinutes, settings?.booking_lead_hours || 2, settings?.buffer_minutes ?? 0, settings?.slot_increment_minutes ?? 15, adminTimezone);
    setSlots(available);
    setSlotsLoading(false);
  }, [rules, overrides, settings, fetchBookingsForDate, durationMinutes, adminTimezone, ownerUserId]);

  const displaySlots = useMemo(() =>
    slots.map(s => convertTimeSlot(s, selectedDate || '', adminTimezone, clientTimezone)),
    [slots, selectedDate, adminTimezone, clientTimezone]
  );

  const handleDateSelect = (dateStr: string) => {
    setSelectedDate(dateStr);
    setSelectedSlot(null);
    setStep('time');
    loadSlots(dateStr);
  };

  const handleSlotSelect = (slot: string) => {
    const adminSlot = convertTimeSlotWithDate(slot, selectedDate || '', clientTimezone, adminTimezone);
    setSelectedDate(adminSlot.date);
    setSelectedSlot(adminSlot.time);
    setStep('form');
  };

  const handleSubmit = async (formData: IntakeFormData) => {
    if (!selectedDate || !selectedSlot || !meetingType) return;
    setSubmitting(true);
    try {
      const booking = await createBooking({
        first_name: formData.firstName,
        last_name: formData.lastName,
        client_email: formData.email,
        client_phone: formData.phone || undefined,
        is_existing_client: formData.isExistingClient ?? undefined,
        guests: formData.guests,
        date: selectedDate,
        start_time: selectedSlot,
        duration_minutes: durationMinutes,
        client_notes: formData.clientNotes || undefined,
        source: 'public',
        client_timezone: clientTimezone,
        meeting_type_id: meetingType.id,
        meeting_location_type: formData.meetingLocation,
        user_id: meetingType.user_id,
      });
      setConfirmedBooking(booking);
      setStep('confirm');
      triggerBookingEmails(booking.id);
    } catch (err) {
      console.error('Booking error:', err);
      alert('Something went wrong booking your appointment. Please try again.');
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

  if (mtLoading || availLoading || settingsLoading) {
    return (
      <div className="flex justify-center py-20">
        <LoadingSpinner size="lg" message="Loading booking page..." />
      </div>
    );
  }

  if (mtError || !meetingType) {
    return (
      <Card className="text-center py-16 max-w-lg mx-auto">
        <AlertCircle className="w-12 h-12 text-red-300 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Link Not Found</h2>
        <p className="text-gray-500 mb-6">This booking link is no longer active or does not exist.</p>
      </Card>
    );
  }

  const stepOrder: BookingStep[] = ['calendar', 'time', 'form'];

  return (
    <div className="max-w-lg mx-auto">
      <div className="flex items-center gap-2 mb-6 text-jungo-green-600">
        <CalendarClock className="w-5 h-5" />
        <span className="text-sm font-medium">{meetingType.name}</span>
      </div>

      {step !== 'calendar' && step !== 'confirm' && (
        <button
          onClick={() => {
            if (step === 'form') { setStep('time'); setSelectedSlot(null); }
            else if (step === 'time') { setStep('calendar'); setSelectedDate(null); }
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
        {step === 'calendar' && (
          <>
            <h2 className="text-xl font-bold text-gray-900 mb-1">{meetingType.name}</h2>
            {meetingType.description && (
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
              selectedDate={selectedDate}
              onSelectDate={handleDateSelect}
              onNavigate={handleNavigate}
              canGoBack={canGoBack}
              canGoForward={canGoForward}
              rules={rules}
              overrides={overrides}
              maxDate={maxDate}
            />
          </>
        )}

        {step === 'time' && selectedDate && (
          <TimeSlotPicker
            date={selectedDate}
            slots={displaySlots}
            selectedSlot={selectedSlot}
            onSelectSlot={handleSlotSelect}
            loading={slotsLoading}
            timezone={clientTimezone}
          />
        )}

        {step === 'form' && selectedDate && selectedSlot && (
          <IntakeForm
            date={selectedDate}
            time={convertTimeSlot(selectedSlot, selectedDate, adminTimezone, clientTimezone)}
            durationMinutes={durationMinutes}
            onSubmit={handleSubmit}
            loading={submitting}
            forcedLocation={meetingType.meeting_location_type}
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
