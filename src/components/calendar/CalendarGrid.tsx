import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getMonthDays, isPast, isToday, hasAvailability, isDateSelectable, classNames, formatDate } from '@/lib/utils';
import type { AvailabilityRule, AvailabilityOverride, Booking, TimeRestriction } from '@/lib/types';
import { DAY_NAMES_SHORT } from '@/lib/types';

interface CalendarGridProps {
  year: number;
  month: number;
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
  onNavigate: (direction: -1 | 1) => void;
  canGoBack: boolean;
  canGoForward: boolean;
  rules: AvailabilityRule[];
  overrides: AvailabilityOverride[];
  maxDate?: Date;
  allowAllFutureDates?: boolean;
  timeRestrictions?: TimeRestriction[] | null;
  bookingsForDay?: (date: string) => Booking[];
}

export default function CalendarGrid({
  year,
  month,
  selectedDate,
  onSelectDate,
  onNavigate,
  canGoBack,
  canGoForward,
  rules,
  overrides,
  maxDate,
  allowAllFutureDates = false,
  timeRestrictions = null,
  bookingsForDay,
}: CalendarGridProps) {
  const [slideDir, setSlideDir] = useState<1 | -1>(1);
  const days = useMemo(() => getMonthDays(year, month), [year, month]);
  const monthName = new Date(year, month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const handleNavigate = (dir: -1 | 1) => {
    setSlideDir(dir);
    onNavigate(dir);
  };

  const animClass = slideDir === 1 ? 'animate-slide-in-right' : 'animate-slide-in-left';

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => handleNavigate(-1)}
          disabled={!canGoBack}
          aria-label="Previous month"
          aria-disabled={!canGoBack}
          className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="w-5 h-5 text-gray-600" />
        </button>
        <h3 className="text-lg font-semibold text-gray-900">{monthName}</h3>
        <button
          onClick={() => handleNavigate(1)}
          disabled={!canGoForward}
          aria-label="Next month"
          aria-disabled={!canGoForward}
          className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight className="w-5 h-5 text-gray-600" />
        </button>
      </div>

      <div className={`grid grid-cols-7 mb-2 ${animClass}`} key={`${year}-${month}`}>
        {DAY_NAMES_SHORT.map(d => (
          <div key={d} className="text-center text-xs font-medium text-gray-400 py-2">
            {d}
          </div>
        ))}
      </div>

      <div className={`grid grid-cols-7 gap-1 ${animClass}`} key={`grid-${year}-${month}`} role="grid">
        {days.map(({ date: day, isCurrentMonth }, i) => {
          const dateStr = formatDate(day);
          const past = isPast(day);
          const beyondMax = maxDate ? day > maxDate : false;
          const today = isToday(day);
          const hasAvail = !past && !beyondMax && hasAvailability(day, rules, overrides);
          const hasRestrictions = !!timeRestrictions && timeRestrictions.length > 0;
          const selectable = isCurrentMonth && (allowAllFutureDates ? (!past && !beyondMax) : (hasRestrictions ? !past && !beyondMax && isDateSelectable(day, rules, overrides, timeRestrictions) : hasAvail));
          const selected = dateStr === selectedDate;
          const dayBookings = bookingsForDay ? bookingsForDay(dateStr).filter(b => b.status !== 'cancelled') : [];
          const bookingCount = dayBookings.length;

          return (
            <button
              key={dateStr}
              onClick={() => selectable && onSelectDate(dateStr)}
              disabled={!selectable}
              aria-selected={selected}
              aria-disabled={!selectable}
              aria-label={day.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
              role="gridcell"
              className={classNames(
                'aspect-square flex items-center justify-center rounded-lg text-sm font-medium transition-all duration-150 relative',
                !isCurrentMonth && 'pointer-events-none',
                selected
                  ? 'bg-jungo-green-500 text-white shadow-md ring-2 ring-jungo-green-300 ring-offset-1'
                  : selectable
                  ? hasAvail
                    ? 'bg-jungo-green-50 text-jungo-green-700 hover:bg-jungo-green-100 hover:shadow-sm cursor-pointer'
                    : 'bg-gray-50 text-gray-900 hover:bg-gray-100 hover:shadow-sm cursor-pointer'
                  : isCurrentMonth
                  ? 'text-gray-300 cursor-not-allowed'
                  : 'text-gray-300 cursor-not-allowed'
              )}
            >
              {day.getDate()}
              {today && (
                <span className={classNames(
                  'absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full',
                  selected ? 'bg-white' : 'bg-jungo-green-500'
                )} />
              )}
              {bookingCount > 0 && (
                <span className={classNames(
                  'absolute bottom-0.5 right-0.5 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-semibold leading-4 text-center',
                  selected ? 'bg-white text-jungo-green-700' : 'bg-jungo-green-500 text-white'
                )}>
                  {bookingCount}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
