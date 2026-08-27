import type { Booking } from '@/lib/types';

interface NoteIndicatorsProps {
  booking: Booking;
  className?: string;
}

export default function NoteIndicators({ booking, className = '' }: NoteIndicatorsProps) {
  const indicators: { color: string; title: string }[] = [];

  if (booking.client_notes) {
    indicators.push({ color: 'text-blue-500', title: 'Has client notes' });
  }
  if (booking.internal_notes) {
    indicators.push({ color: 'text-amber-500', title: 'Has internal notes' });
  }
  if (booking.notes_to_client) {
    indicators.push({ color: 'text-emerald-500', title: 'Has notes to client' });
  }

  if (indicators.length === 0) return null;

  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`}>
      {indicators.map((ind, i) => (
        <span key={i} className={`${ind.color} font-bold text-sm leading-none`} title={ind.title}>
          *
        </span>
      ))}
    </span>
  );
}
