import { useState, useMemo } from 'react';
import { CalendarDays } from 'lucide-react';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import NoteIndicators from '@/components/booking/NoteIndicators';
import CalendarGrid from '@/components/calendar/CalendarGrid';
import { formatTime, formatDisplayDate, formatDate, isToday, classNames, isBookingOutOfHours } from '@/lib/utils';
import type { Booking, AvailabilityRule, AvailabilityOverride } from '@/lib/types';

interface DashboardCalendarProps {
  bookings: Booking[];
  rules: AvailabilityRule[];
  overrides: AvailabilityOverride[];
  meetingTypeMap: Record<string, string>;
  onSelectBooking: (booking: Booking) => void;
}

type ViewMode = 'today' | 'week' | 'month';

export default function DashboardCalendar({ bookings, rules, overrides, meetingTypeMap, onSelectBooking }: DashboardCalendarProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('today');
  const now = useMemo(() => new Date(), []);
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const confirmed = useMemo(() => bookings.filter(b => b.status === 'confirmed'), [bookings]);

  const todayStr = formatDate(now);

  const weekDays = useMemo(() => {
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(startOfWeek);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [now]);

  const todayBookings = useMemo(() =>
    confirmed
      .filter(b => b.date === todayStr)
      .sort((a, b) => a.start_time.localeCompare(b.start_time)),
    [confirmed, todayStr]
  );

  const weekBookings = useMemo(() => {
    const weekStart = formatDate(weekDays[0]);
    const weekEnd = formatDate(weekDays[6]);
    return confirmed
      .filter(b => b.date >= weekStart && b.date <= weekEnd)
      .sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time));
  }, [confirmed, weekDays]);

  const monthBookings = useMemo(() => {
    const monthStart = formatDate(new Date(viewYear, viewMonth, 1));
    const monthEnd = formatDate(new Date(viewYear, viewMonth + 1, 0));
    return confirmed.filter(b => b.date >= monthStart && b.date <= monthEnd);
  }, [confirmed, viewYear, viewMonth]);

  const bookingsForSelectedDay = useMemo(() => {
    if (!selectedDay) return [];
    return confirmed
      .filter(b => b.date === selectedDay)
      .sort((a, b) => a.start_time.localeCompare(b.start_time));
  }, [confirmed, selectedDay]);

  const handleNavigate = (dir: -1 | 1) => {
    let newMonth = viewMonth + dir;
    let newYear = viewYear;
    if (newMonth < 0) { newMonth = 11; newYear--; }
    if (newMonth > 11) { newMonth = 0; newYear++; }
    setViewMonth(newMonth);
    setViewYear(newYear);
  };

  const canGoBack = viewYear > now.getFullYear() || (viewYear === now.getFullYear() && viewMonth > now.getMonth());
  const maxDate = useMemo(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return d;
  }, []);
  const canGoForward = new Date(viewYear, viewMonth + 1, 1) <= maxDate;

  const renderBookingCard = (booking: Booking, compact = false) => {
    const isRecurring = !!booking.recurrence_group_id;
    const outOfHours = isBookingOutOfHours(booking, rules, overrides);
    return (
      <div
        key={booking.id}
        onClick={() => onSelectBooking(booking)}
        className={classNames(
          'cursor-pointer rounded-lg border p-2.5 transition-all hover:shadow-sm hover:border-jungo-green-300',
          compact ? 'bg-white border-gray-200' : 'bg-white border-gray-200'
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">
              {booking.first_name} {booking.last_name}
              <NoteIndicators booking={booking} className="ml-1" />
            </p>
            <p className="text-xs text-gray-500 truncate">{formatTime(booking.start_time)}</p>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {booking.meeting_type_id && meetingTypeMap[booking.meeting_type_id] && (
              <span className="text-xs text-jungo-green-600 hidden sm:inline">{meetingTypeMap[booking.meeting_type_id]}</span>
            )}
            {isRecurring && (
              <Badge variant="info" className="text-xs">R</Badge>
            )}
            {outOfHours && (
              <Badge variant="warning" className="text-xs">!</Badge>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h2 className="text-lg font-semibold text-gray-900">Schedule</h2>
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          {(['today', 'week', 'month'] as ViewMode[]).map(mode => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={classNames(
                'px-3 py-1.5 text-sm font-medium rounded-md transition-all capitalize',
                viewMode === mode
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              )}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {viewMode === 'today' && (
        <>
          {todayBookings.length === 0 ? (
            <Card className="text-center py-12">
              <CalendarDays className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">No meetings scheduled for today.</p>
            </Card>
          ) : (
            <div className="space-y-2">
              {todayBookings.map(b => renderBookingCard(b))}
            </div>
          )}
        </>
      )}

      {viewMode === 'week' && (
        <div className="grid grid-cols-1 sm:grid-cols-7 gap-2">
          {weekDays.map((day, i) => {
            const dateStr = formatDate(day);
            const dayBookings = weekBookings.filter(b => b.date === dateStr);
            const isTodayDay = isToday(day);
            return (
              <div key={dateStr} className={classNames('min-h-[120px]', i === 0 && 'sm:col-span-1')}>
                <div className={classNames(
                  'text-center text-xs font-medium py-1.5 rounded-t-lg',
                  isTodayDay ? 'bg-jungo-green-500 text-white' : 'bg-gray-100 text-gray-500'
                )}>
                  {day.toLocaleDateString('en-US', { weekday: 'short' })}
                  <span className="ml-1">{day.getDate()}</span>
                </div>
                <div className="space-y-1.5 mt-1.5">
                  {dayBookings.length === 0 ? (
                    <p className="text-xs text-gray-300 text-center py-4">—</p>
                  ) : (
                    dayBookings.map(b => renderBookingCard(b, true))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {viewMode === 'month' && (
        <div className="space-y-4">
          <CalendarGrid
            year={viewYear}
            month={viewMonth}
            selectedDate={selectedDay}
            onSelectDate={(dateStr) => setSelectedDay(dateStr)}
            onNavigate={handleNavigate}
            canGoBack={canGoBack}
            canGoForward={canGoForward}
            rules={rules}
            overrides={overrides}
            maxDate={maxDate}
            allowAllFutureDates
            bookingsForDay={(dateStr) => confirmed.filter(b => b.date === dateStr)}
          />
          {selectedDay && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">
                {formatDisplayDate(selectedDay).split(',')[0]}
                {bookingsForSelectedDay.length > 0 && (
                  <span className="text-gray-400 ml-1">({bookingsForSelectedDay.length} meeting{bookingsForSelectedDay.length !== 1 ? 's' : ''})</span>
                )}
              </p>
              {bookingsForSelectedDay.length === 0 ? (
                <p className="text-sm text-gray-400">No meetings on this day.</p>
              ) : (
                <div className="space-y-2">
                  {bookingsForSelectedDay.map(b => renderBookingCard(b))}
                </div>
              )}
            </div>
          )}
          {monthBookings.length === 0 && !selectedDay && (
            <p className="text-sm text-gray-400 text-center py-4">No meetings this month.</p>
          )}
        </div>
      )}
    </div>
  );
}
