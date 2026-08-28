import { useState, useCallback } from 'react';
import { CalendarPlus, CheckCircle, AlertTriangle } from 'lucide-react';
import CalendarGrid from '@/components/calendar/CalendarGrid';
import TimeSlotPicker from '@/components/calendar/TimeSlotPicker';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { useAvailability } from '@/hooks/useAvailability';
import { useBookings } from '@/hooks/useBookings';
import { useSettings } from '@/hooks/useSettings';
import { useMeetingTypes } from '@/hooks/useMeetingTypes';
import { generateTimeSlots, formatDate, formatTime, formatDisplayDate, minutesToTime, timeToMinutes } from '@/lib/utils';
import { triggerBookingEmails } from '@/lib/bookingEmails';
import { isValidEmail, isValidPhone } from '@/lib/validation';
import type { Booking } from '@/lib/types';

export default function ManualBookingPage() {
  const { rules, overrides, loading: availLoading } = useAvailability();
  const { createBooking, fetchBookingsForDate } = useBookings({ autoFetch: false });
  const { settings, loading: settingsLoading } = useSettings();
  const { meetingTypes, loading: mtLoading } = useMeetingTypes();
  const [meetingLocationType, setMeetingLocationType] = useState('zoom');

  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [customTime, setCustomTime] = useState('');
  const [useCustomTime, setUseCustomTime] = useState(false);
  const [slots, setSlots] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [clientNotes, setClientNotes] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [notesToClient, setNotesToClient] = useState('');
  const [meetingTypeId, setMeetingTypeId] = useState('');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);
  const [overrideConflict, setOverrideConflict] = useState(false);

  const selectedMeetingType = meetingTypes.find(mt => mt.id === meetingTypeId);
  const duration = selectedMeetingType?.duration_minutes || settings?.default_meeting_length || 30;

  const loadSlots = useCallback(async (dateStr: string) => {
    setSlotsLoading(true);
    const existing = await fetchBookingsForDate(dateStr);
    const date = new Date(dateStr + 'T00:00:00');
    const available = generateTimeSlots(date, rules, overrides, existing, duration, 0, settings?.buffer_minutes ?? 0, settings?.slot_increment_minutes ?? 15, settings?.timezone || 'America/New_York');
    setSlots(available);
    setSlotsLoading(false);
  }, [rules, overrides, duration, fetchBookingsForDate]);

  const checkConflict = useCallback(async (dateStr: string, startTime: string) => {
    const buffer = settings?.buffer_minutes ?? 0;
    const existing = await fetchBookingsForDate(dateStr);
    const startMin = timeToMinutes(startTime);
    const endMin = startMin + duration;
    const conflict = existing.find(b => {
      const bStart = timeToMinutes(b.start_time);
      const bEnd = timeToMinutes(b.end_time);
      return startMin < bEnd + buffer && endMin + buffer > bStart;
    });
    if (conflict) {
      setConflictWarning(`Overlaps with ${conflict.first_name} ${conflict.last_name} at ${formatTime(conflict.start_time)} (${formatDisplayDate(conflict.date)}).`);
    } else {
      setConflictWarning(null);
    }
  }, [duration, settings, fetchBookingsForDate]);

  const handleDateSelect = (dateStr: string) => {
    setSelectedDate(dateStr);
    setSelectedSlot(null);
    setUseCustomTime(false);
    setConflictWarning(null);
    setOverrideConflict(false);
    loadSlots(dateStr);
  };

  const handleNavigate = (dir: -1 | 1) => {
    let newMonth = viewMonth + dir;
    let newYear = viewYear;
    if (newMonth < 0) { newMonth = 11; newYear--; }
    if (newMonth > 11) { newMonth = 0; newYear++; }
    setViewMonth(newMonth);
    setViewYear(newYear);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDate || (!selectedSlot && !customTime)) return;
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !meetingTypeId) return;
    if (conflictWarning && !overrideConflict) return;
    const newErrors: Record<string, string> = {};
    if (!meetingTypeId) newErrors.meetingType = 'Please select a meeting type';
    if (!isValidEmail(email)) newErrors.email = 'Please enter a valid email';
    if (phone && !isValidPhone(phone)) newErrors.phone = 'Please enter a valid phone number';
    if (Object.keys(newErrors).length > 0) { setFormErrors(newErrors); return; }
    setFormErrors({});

    const startTime = useCustomTime ? customTime : selectedSlot!;

    setSubmitting(true);
    try {
      const booking = await createBooking({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        client_email: email.trim(),
        client_phone: phone.trim() || undefined,
        date: selectedDate,
        start_time: startTime,
        duration_minutes: duration,
        client_notes: clientNotes.trim() || undefined,
        internal_notes: internalNotes.trim() || undefined,
        notes_to_client: notesToClient.trim() || undefined,
        source: 'admin',
        meeting_type_id: meetingTypeId || undefined,
      });
      setSuccess(true);
      triggerBookingEmails(booking.id);
    } catch (err) {
      console.error(err);
      alert('Could not create booking. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setSelectedDate(null);
    setSelectedSlot(null);
    setCustomTime('');
    setUseCustomTime(false);
    setFirstName('');
    setLastName('');
    setEmail('');
    setPhone('');
    setClientNotes('');
    setInternalNotes('');
    setNotesToClient('');
    setFormErrors({});
    setSuccess(false);
    setConflictWarning(null);
    setOverrideConflict(false);
  };

  if (availLoading || settingsLoading || mtLoading) {
    return <div className="flex justify-center py-20"><LoadingSpinner size="lg" /></div>;
  }

  if (success) {
    return (
      <div className="max-w-md mx-auto text-center py-16 animate-scale-in">
        <div className="w-16 h-16 bg-jungo-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-8 h-8 text-jungo-green-500" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Booking Created!</h2>
        <p className="text-gray-500 mb-6">The meeting has been scheduled.</p>
        <Button onClick={reset} icon={<CalendarPlus className="w-4 h-4" />}>Book Another</Button>
      </div>
    );
  }

  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() + 365);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Manual Booking</h1>
        <p className="text-gray-500 mt-1">Create a booking on behalf of a client. You can choose any date and time.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card padding="lg">
          <CalendarGrid
            year={viewYear}
            month={viewMonth}
            selectedDate={selectedDate}
            onSelectDate={handleDateSelect}
            onNavigate={handleNavigate}
            canGoBack={true}
            canGoForward={true}
            rules={rules}
            overrides={overrides}
            maxDate={maxDate}
            allowAllFutureDates
          />

          {selectedDate && (
            <div className="mt-6 pt-6 border-t">
              <div className="flex items-center gap-2 mb-4">
                <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useCustomTime}
                    onChange={e => { setUseCustomTime(e.target.checked); setSelectedSlot(null); }}
                    className="rounded border-gray-300 text-jungo-green-500 focus:ring-jungo-green-500"
                  />
                  Use custom time (override availability)
                </label>
              </div>

              {useCustomTime ? (
                <Input
                  label="Custom Time"
                  type="time"
                  value={customTime}
                  onChange={e => {
                    setCustomTime(e.target.value);
                    setConflictWarning(null);
                    setOverrideConflict(false);
                    if (e.target.value && selectedDate) checkConflict(selectedDate, e.target.value);
                  }}
                />
              ) : (
                <TimeSlotPicker
                  date={selectedDate}
                  slots={slots}
                  selectedSlot={selectedSlot}
                  onSelectSlot={(slot) => {
                    setSelectedSlot(slot);
                    setConflictWarning(null);
                    setOverrideConflict(false);
                    if (slot && selectedDate) checkConflict(selectedDate, slot);
                  }}
                  loading={slotsLoading}
                />
              )}
            </div>
          )}
        </Card>

        <Card padding="lg">
          <h2 className="text-lg font-semibold text-gray-900 mb-5">Client Information</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
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
              onChange={e => setMeetingLocationType(e.target.value)}
              options={[
                { value: 'zoom', label: 'Zoom' },
                { value: 'phone', label: 'Phone' },
              ]}
              required
              />

            <div className="grid grid-cols-2 gap-4">
              <Input label="First Name" required value={firstName} onChange={e => setFirstName(e.target.value)} />
              <Input label="Last Name" required value={lastName} onChange={e => setLastName(e.target.value)} />
            </div>
            <Input label="Email" type="email" required value={email} onChange={e => { setEmail(e.target.value); setFormErrors(p => { const { email: _, ...r } = p; return r; }); }} error={formErrors.email} />
            <Input label="Phone" type="tel" value={phone} onChange={e => { setPhone(e.target.value); setFormErrors(p => { const { phone: _, ...r } = p; return r; }); }} error={formErrors.phone} />
            <Textarea label="Client Notes" value={clientNotes} onChange={e => setClientNotes(e.target.value)} rows={2} placeholder="Notes the client would have entered..." />
            <Textarea label="Internal Notes (admin only)" value={internalNotes} onChange={e => setInternalNotes(e.target.value)} rows={2} placeholder="Private notes not visible to the client..." />
            <Textarea label="Notes to Client" value={notesToClient} onChange={e => setNotesToClient(e.target.value)} rows={2} placeholder="Notes visible to the client in emails and manage page..." />

            {selectedDate && (selectedSlot || (useCustomTime && customTime)) && (
              <div className="bg-jungo-green-50 border border-jungo-green-200 rounded-lg p-3 text-sm">
                <p className="font-medium text-jungo-green-800">{formatDisplayDate(selectedDate)}</p>
                <p className="text-jungo-green-600">
                  {formatTime(useCustomTime ? customTime : selectedSlot!)} -{' '}
                  {formatTime(minutesToTime(timeToMinutes(useCustomTime ? customTime : selectedSlot!) + duration))}
                  {' '}({duration} min)
                </p>
                {selectedMeetingType && (
                  <p className="text-jungo-green-600 mt-1">{selectedMeetingType.name}</p>
                )}
              </div>
            )}

            {conflictWarning && (
              <div className="bg-amber-50 border border-amber-300 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-amber-800">Scheduling Conflict</p>
                    <p className="text-sm text-amber-700 mt-0.5">{conflictWarning}</p>
                    <label className="flex items-center gap-2 mt-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={overrideConflict}
                        onChange={e => setOverrideConflict(e.target.checked)}
                        className="rounded border-amber-300 text-jungo-green-500 focus:ring-jungo-green-500"
                      />
                      <span className="text-sm text-amber-800">Override conflict and book anyway</span>
                    </label>
                  </div>
                </div>
              </div>
            )}

            <Button
              type="submit"
              loading={submitting}
              icon={<CalendarPlus className="w-4 h-4" />}
              className="w-full"
              size="lg"
              disabled={!selectedDate || (!selectedSlot && (!useCustomTime || !customTime)) || !firstName || !lastName || !email || !meetingTypeId || (!!conflictWarning && !overrideConflict)}
            >
              Create Booking
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
