import { CheckCircle, Calendar, Clock, Mail, ExternalLink } from 'lucide-react';
import { formatTime, formatDisplayDate, convertTimeSlotWithDate } from '@/lib/utils';
import type { Booking } from '@/lib/types';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';

interface BookingConfirmationProps {
  booking: Booking;
  adminTimezone: string;
  clientTimezone: string;
}

function tzShortLabel(tz: string): string {
  try {
    const now = new Date();
    const offset = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'short',
    }).formatToParts(now).find(p => p.type === 'timeZoneName')?.value;
    return offset || tz;
  } catch {
    return tz;
  }
}

export default function BookingConfirmation({ booking, adminTimezone, clientTimezone }: BookingConfirmationProps) {
  const useClientTz = booking.client_timezone && booking.client_timezone !== adminTimezone;
  const displayTz = useClientTz ? booking.client_timezone! : adminTimezone;

  const converted = useClientTz
    ? convertTimeSlotWithDate(booking.start_time, booking.date, adminTimezone, displayTz)
    : { date: booking.date, time: booking.start_time };

  const convertedEnd = useClientTz
    ? convertTimeSlotWithDate(booking.end_time, booking.date, adminTimezone, displayTz)
    : { time: booking.end_time };

  return (
    <div className="animate-scale-in text-center max-w-md mx-auto">
      <div className="mb-6">
        <div className="w-16 h-16 bg-jungo-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-8 h-8 text-jungo-green-500" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">You're booked!</h2>
        <p className="text-gray-500">A confirmation email will be sent to {booking.client_email}</p>
      </div>

      <Card className="text-left mb-6">
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <Calendar className="w-5 h-5 text-jungo-green-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium text-gray-900">{formatDisplayDate(converted.date)}</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Clock className="w-5 h-5 text-jungo-green-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium text-gray-900">
                {formatTime(converted.time)} - {formatTime(convertedEnd.time)}
              </p>
              <p className="text-sm text-gray-500">
                {booking.duration_minutes} minutes
                {useClientTz && <span className="text-gray-400"> · {tzShortLabel(displayTz)}</span>}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Mail className="w-5 h-5 text-jungo-green-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium text-gray-900">{booking.first_name} {booking.last_name}</p>
              <p className="text-sm text-gray-500">{booking.client_email}</p>
              {booking.guests.length > 0 && (
                <p className="text-sm text-gray-400 mt-1">
                  +{booking.guests.length} guest{booking.guests.length > 1 ? 's' : ''}
                </p>
              )}
            </div>
          </div>
        </div>
      </Card>

      <a href="https://jungosolutions.com" target="_blank" rel="noopener noreferrer">
        <Button
          variant="outline"
          icon={<ExternalLink className="w-4 h-4" />}
        >
          Return to Jungo Solutions
        </Button>
      </a>
    </div>
  );
}
