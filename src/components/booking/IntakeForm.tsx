import { useState, useEffect } from 'react';
import { UserPlus, X, Phone, Video, Lock } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import Badge from '@/components/ui/Badge';
import { formatTime, formatDisplayDate } from '@/lib/utils';
import type { MeetingLocationType } from '@/lib/types';

interface IntakeFormProps {
  date: string;
  time: string;
  durationMinutes: number;
  onSubmit: (data: IntakeFormData) => void;
  loading?: boolean;
  prefillName?: string;
  prefillEmail?: string;
  forcedLocation: MeetingLocationType | null;
}

export interface IntakeFormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  isExistingClient: boolean | null;
  guests: string[];
  clientNotes: string;
  meetingLocation: MeetingLocationType;
}

export default function IntakeForm({
  date,
  time,
  durationMinutes,
  onSubmit,
  loading,
  prefillName,
  prefillEmail,
  forcedLocation,
}: IntakeFormProps) {
  const nameParts = prefillName?.split(' ') || [];
  const [firstName, setFirstName] = useState(nameParts[0] || '');
  const [lastName, setLastName] = useState(nameParts.slice(1).join(' ') || '');
  const [email, setEmail] = useState(prefillEmail || '');
  const [phone, setPhone] = useState('');
  const [isExistingClient, setIsExistingClient] = useState<string>('');
  const [guests, setGuests] = useState<string[]>([]);
  const [guestInput, setGuestInput] = useState('');
  const [clientNotes, setClientNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [meetingLocation, setMeetingLocation] = useState<MeetingLocationType>(
    forcedLocation || 'zoom'
  );

  // If forcedLocation changes (e.g. navigating between links), sync the state
  useEffect(() => {
    if (forcedLocation) setMeetingLocation(forcedLocation);
  }, [forcedLocation]);

  const isPhone = meetingLocation === 'phone';
  const isLocationLocked = forcedLocation !== null;

  // When switching to phone, clear any guests that were added
  const handleLocationChange = (loc: MeetingLocationType) => {
    if (isLocationLocked) return;
    setMeetingLocation(loc);
    if (loc === 'phone' && guests.length > 0) {
      setGuests([]);
    }
  };

  const addGuest = () => {
    if (isPhone) return;
    const trimmed = guestInput.trim();
    if (!trimmed) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setErrors(prev => ({ ...prev, guest: 'Please enter a valid email' }));
      return;
    }
    if (guests.includes(trimmed)) {
      setErrors(prev => ({ ...prev, guest: 'This guest is already added' }));
      return;
    }
    setGuests(prev => [...prev, trimmed]);
    setGuestInput('');
    setErrors(prev => { const { guest, ...rest } = prev; return rest; });
  };

  const removeGuest = (email: string) => {
    setGuests(prev => prev.filter(g => g !== email));
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!firstName.trim()) newErrors.firstName = 'First name is required';
    if (!lastName.trim()) newErrors.lastName = 'Last name is required';
    if (!email.trim()) newErrors.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) newErrors.email = 'Please enter a valid email';
    if (isPhone && !phone.trim()) {
      newErrors.phone = 'Phone number is required for phone meetings';
    } else if (phone.trim() && !/^\+?[1-9]\d{1,14}$/.test(phone.trim())) {
      newErrors.phone = 'Please enter a valid phone number';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    onSubmit({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
      phone: phone.trim(),
      isExistingClient: isExistingClient === '' ? null : isExistingClient === 'yes',
      guests,
      clientNotes: clientNotes.trim(),
      meetingLocation,
    });
  };

  return (
    <div className="animate-slide-up">
      <div className="bg-jungo-green-50 rounded-lg p-4 mb-6 border border-jungo-green-200">
        <p className="text-sm font-medium text-jungo-green-800">
          {formatDisplayDate(date)} at {formatTime(time)}
        </p>
        <p className="text-sm text-jungo-green-600">{durationMinutes} minute meeting</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Meeting Location selector */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            Meeting Location <span className="text-red-500">*</span>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => handleLocationChange('zoom')}
              disabled={isLocationLocked}
              className={`flex items-center gap-2.5 rounded-lg border px-4 py-3 text-sm font-medium transition-colors ${
                meetingLocation === 'zoom'
                  ? 'border-jungo-green-500 bg-jungo-green-50 text-jungo-green-800'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              } ${isLocationLocked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
            >
              <Video className="w-4 h-4 flex-shrink-0" />
              Zoom Meeting
            </button>
            <button
              type="button"
              onClick={() => handleLocationChange('phone')}
              disabled={isLocationLocked}
              className={`flex items-center gap-2.5 rounded-lg border px-4 py-3 text-sm font-medium transition-colors ${
                meetingLocation === 'phone'
                  ? 'border-jungo-green-500 bg-jungo-green-50 text-jungo-green-800'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              } ${isLocationLocked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
            >
              <Phone className="w-4 h-4 flex-shrink-0" />
              Phone Call
            </button>
          </div>
          {isLocationLocked && (
            <p className="flex items-center gap-1 text-xs text-gray-400">
              <Lock className="w-3 h-3" />
              Meeting location is preset by the organizer.
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="First Name"
            required
            value={firstName}
            onChange={e => setFirstName(e.target.value)}
            error={errors.firstName}
            placeholder="Jane"
          />
          <Input
            label="Last Name"
            required
            value={lastName}
            onChange={e => setLastName(e.target.value)}
            error={errors.lastName}
            placeholder="Doe"
          />
        </div>

        <Input
          label="Email Address"
          type="email"
          required
          value={email}
          onChange={e => setEmail(e.target.value)}
          error={errors.email}
          placeholder="jane@example.com"
        />

        <Input
          label="Contact Phone"
          type="tel"
          required={isPhone}
          value={phone}
          onChange={e => setPhone(e.target.value)}
          error={errors.phone}
          placeholder="(555) 123-4567"
        />

        <Select
          label="Are you an existing client of Jungo Solutions?"
          value={isExistingClient}
          onChange={e => setIsExistingClient(e.target.value)}
          options={[
            { value: '', label: 'Select...' },
            { value: 'yes', label: 'Yes' },
            { value: 'no', label: 'No' },
          ]}
        />

        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">Add Guests (optional)</label>
          <div className={`flex gap-2 ${isPhone ? 'opacity-50 pointer-events-none' : ''}`}>
            <Input
              value={guestInput}
              onChange={e => setGuestInput(e.target.value)}
              placeholder="guest@example.com"
              error={errors.guest}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addGuest(); } }}
              disabled={isPhone}
            />
            <Button
              type="button"
              variant="outline"
              onClick={addGuest}
              icon={<UserPlus className="w-4 h-4" />}
              size="md"
              disabled={isPhone}
            >
              Add
            </Button>
          </div>
          {isPhone && (
            <p className="text-xs text-gray-500 italic">
              Additional guests cannot be added to phone meetings.
            </p>
          )}
          {guests.length > 0 && !isPhone && (
            <div className="flex flex-wrap gap-2 mt-2">
              {guests.map(g => (
                <Badge key={g} variant="neutral" className="py-1 pr-1.5 pl-2.5">
                  {g}
                  <button type="button" onClick={() => removeGuest(g)} className="ml-1 text-gray-400 hover:text-gray-600 transition-colors">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>

        <Textarea
          label="Please share anything that will help prepare for our meeting"
          value={clientNotes}
          onChange={e => setClientNotes(e.target.value)}
          rows={4}
          placeholder="Topics you'd like to discuss, questions, or context..."
        />

        <Button type="submit" loading={loading} size="lg" className="w-full">
          Book Appointment
        </Button>
      </form>
    </div>
  );
}
