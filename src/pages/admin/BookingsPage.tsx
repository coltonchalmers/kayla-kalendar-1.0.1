import { useState, useCallback, useEffect, useMemo } from 'react';
import { Search, Filter, CalendarDays, Repeat, Clock, Copy, Check, Link2, Mail, Trash2, Send, AlertTriangle, UserPlus, UserCheck } from 'lucide-react';
import { useBookings } from '@/hooks/useBookings';
import { useMeetingTypes } from '@/hooks/useMeetingTypes';
import { useAvailability } from '@/hooks/useAvailability';
import { useRecurringLinks } from '@/hooks/useRecurringLinks';
import { useProposalLinks } from '@/hooks/useProposalLinks';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { StatusBadge } from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Modal from '@/components/ui/Modal';
import BookingDetailsModal from '@/components/booking/BookingDetailsModal';
import { formatTime, formatDisplayDate, isBookingOutOfHours } from '@/lib/utils';
import NoteIndicators from '@/components/booking/NoteIndicators';
import { triggerAdminDailySummary } from '@/lib/bookingEmails';
import { parseError } from '@/lib/errors';
import type { Booking } from '@/lib/types';

export default function BookingsPage() {
  const { bookings, loading, fetchBookings, clearAllBookings } = useBookings();
  const { meetingTypes } = useMeetingTypes();
  const { rules, overrides } = useAvailability();
  const { links: recurringLinks } = useRecurringLinks();
  const { proposals } = useProposalLinks();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [meetingTypeFilter, setMeetingTypeFilter] = useState('');
  const [clientTypeFilter, setClientTypeFilter] = useState<'all' | 'new' | 'existing'>('all');
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearLoading, setClearLoading] = useState(false);
  const [clearResult, setClearResult] = useState<{ count: number; error: string | null } | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryResult, setSummaryResult] = useState<{ success: boolean; message: string } | null>(null);

  const meetingTypeMap = useMemo(() => {
    const map: Record<string, string> = {};
    meetingTypes.forEach(mt => { map[mt.id] = mt.name; });
    return map;
  }, [meetingTypes]);

  const isUnconfirmed = statusFilter === 'unconfirmed';

  const doSearch = useCallback(() => {
    if (isUnconfirmed) return;
    fetchBookings({
      status: statusFilter === 'all' ? undefined : statusFilter,
      search: search || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      meetingTypeId: meetingTypeFilter || undefined,
      isExistingClient: clientTypeFilter === 'all' ? undefined : clientTypeFilter === 'existing',
    });
  }, [fetchBookings, statusFilter, search, dateFrom, dateTo, meetingTypeFilter, isUnconfirmed, clientTypeFilter]);

  useEffect(() => {
    const timeout = setTimeout(doSearch, 300);
    return () => clearTimeout(timeout);
  }, [doSearch]);

  const pendingInvites = useMemo(() => {
    if (!isUnconfirmed) return { recurring: [], proposals: [] };

    const recurringWithBookings = new Set(
      bookings.filter(b => b.recurring_link_id && b.status === 'confirmed').map(b => b.recurring_link_id)
    );
    const pendingRecurring = recurringLinks.filter(
      l => l.is_active && !recurringWithBookings.has(l.id)
    );

    const proposalsWithClaims = new Set(
      proposals.filter(p => p.slots.some(s => s.is_claimed)).map(p => p.id)
    );
    const pendingProposals = proposals.filter(
      p => p.is_active && !proposalsWithClaims.has(p.id)
    );

    return { recurring: pendingRecurring, proposals: pendingProposals };
  }, [isUnconfirmed, bookings, recurringLinks, proposals]);

  const copyLink = (url: string, id: string) => {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleClearAll = async () => {
    setClearLoading(true);
    setClearResult(null);
    const result = await clearAllBookings();
    setClearResult(result);
    setClearLoading(false);
    if (!result.error) {
      setShowClearConfirm(false);
    }
  };

  const handleDailySummary = async () => {
    setSummaryLoading(true);
    setSummaryResult(null);
    const result = await triggerAdminDailySummary();
    if (result.success) {
      setSummaryResult({ success: true, message: result.skipped ? `Skipped: ${result.reason}` : 'Daily summary email sent successfully.' });
    } else if (result.error) {
      setSummaryResult({ success: false, message: `${result.error.type}: ${result.error.message}` });
    } else {
      setSummaryResult({ success: false, message: 'Unknown error occurred.' });
    }
    setSummaryLoading(false);
    setTimeout(() => setSummaryResult(null), 8000);
  };

  if (loading && !isUnconfirmed) {
    return <div className="flex justify-center py-20"><LoadingSpinner size="lg" /></div>;
  }

  const statusOptions = ['all', 'unconfirmed', 'confirmed', 'completed', 'cancelled'];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">All Bookings</h1>
          <p className="text-gray-500 mt-1">Manage and track all appointments.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            icon={<Send className="w-4 h-4" />}
            onClick={handleDailySummary}
            loading={summaryLoading}
          >
            Send Daily Summary
          </Button>
          <Button
            variant="danger"
            size="sm"
            icon={<Trash2 className="w-4 h-4" />}
            onClick={() => { setShowClearConfirm(true); setClearResult(null); }}
          >
            Clear All
          </Button>
        </div>
      </div>

      {summaryResult && (
        <div className={`rounded-lg p-3 flex items-start gap-2 ${summaryResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
          {summaryResult.success ? (
            <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
          )}
          <p className={`text-sm ${summaryResult.success ? 'text-green-800' : 'text-red-700'}`}>{summaryResult.message}</p>
        </div>
      )}

      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name or email..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-jungo-green-200 focus:border-jungo-green-500"
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="w-4 h-4 text-gray-400" />
            {statusOptions.map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 text-sm rounded-full font-medium transition-colors capitalize ${
                  statusFilter === s
                    ? 'bg-jungo-green-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {!isUnconfirmed && (<>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex items-center gap-2 flex-1">
              <label className="text-xs text-gray-500 whitespace-nowrap">From</label>
              <input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-jungo-green-200 focus:border-jungo-green-500"
              />
            </div>
            <div className="flex items-center gap-2 flex-1">
              <label className="text-xs text-gray-500 whitespace-nowrap">To</label>
              <input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-jungo-green-200 focus:border-jungo-green-500"
              />
            </div>
            <div className="flex-1 min-w-[180px]">
              <Select
                value={meetingTypeFilter}
                onChange={e => setMeetingTypeFilter(e.target.value)}
                options={[
                  { value: '', label: 'All Types' },
                  ...meetingTypes.map(mt => ({ value: mt.id, label: mt.name })),
                ]}
              />
            </div>
            {(dateFrom || dateTo || meetingTypeFilter) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setDateFrom(''); setDateTo(''); setMeetingTypeFilter(''); }}
              >
                Clear
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-500">Client:</span>
            {(['all', 'new', 'existing'] as const).map(t => (
              <button
                key={t}
                onClick={() => setClientTypeFilter(t)}
                className={`px-3 py-1.5 text-sm rounded-full font-medium transition-colors capitalize ${
                  clientTypeFilter === t
                    ? 'bg-jungo-green-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {t === 'all' ? 'All' : t === 'new' ? 'New' : 'Existing'}
              </button>
            ))}
          </div>
        </>
        )}
      </div>

      {isUnconfirmed ? (
        pendingInvites.recurring.length === 0 && pendingInvites.proposals.length === 0 ? (
          <Card className="text-center py-16">
            <Check className="w-10 h-10 text-jungo-green-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No pending invitations.</p>
            <p className="text-sm text-gray-400 mt-1">All sent links have been booked or claimed.</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {pendingInvites.recurring.map(link => {
              const url = `${window.location.origin}/book/${link.token}`;
              const mtName = link.meeting_type_id ? meetingTypeMap[link.meeting_type_id] : null;
              return (
                <Card key={link.id} padding="sm">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Link2 className="w-4 h-4 text-jungo-green-500" />
                        <p className="font-medium text-gray-900 truncate">{link.client_name}</p>
                        <Badge variant="info" className="text-xs">Recurring</Badge>
                      </div>
                      <p className="text-sm text-gray-500 truncate">{link.client_email}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {mtName && <span className="text-xs text-jungo-green-600">{mtName}</span>}
                        {link.frequency && <span className="text-xs text-gray-400 capitalize">{link.frequency}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={copiedId === link.id ? <Check className="w-4 h-4 text-jungo-green-500" /> : <Copy className="w-4 h-4" />}
                        onClick={() => copyLink(url, link.id)}
                      >
                        {copiedId === link.id ? 'Copied' : 'Copy Link'}
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
            {pendingInvites.proposals.map(link => {
              const url = `${window.location.origin}/p/${link.token}`;
              const mtName = link.meeting_type_id ? meetingTypeMap[link.meeting_type_id] : null;
              const availableSlots = link.slots.filter(s => !s.is_claimed).length;
              return (
                <Card key={link.id} padding="sm">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Mail className="w-4 h-4 text-blue-500" />
                        <p className="font-medium text-gray-900 truncate">{link.client_name}</p>
                        <Badge variant="info" className="text-xs">Proposal</Badge>
                      </div>
                      <p className="text-sm text-gray-500 truncate">{link.client_email}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {mtName && <span className="text-xs text-jungo-green-600">{mtName}</span>}
                        <span className="text-xs text-gray-400">{availableSlots} slots available</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={copiedId === link.id ? <Check className="w-4 h-4 text-jungo-green-500" /> : <Copy className="w-4 h-4" />}
                        onClick={() => copyLink(url, link.id)}
                      >
                        {copiedId === link.id ? 'Copied' : 'Copy Link'}
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )
      ) : bookings.length === 0 ? (
        <Card className="text-center py-16">
          <CalendarDays className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No bookings found.</p>
          <p className="text-sm text-gray-400 mt-1">
            {search || statusFilter !== 'all' || dateFrom || dateTo || meetingTypeFilter
              ? 'Try adjusting your filters.'
              : 'When clients book, their appointments will appear here!'}
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {bookings.map(booking => (
            <Card key={booking.id} hover onClick={() => setSelectedBooking(booking)}>
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-gray-900 truncate">
                    {booking.first_name} {booking.last_name}
                    <NoteIndicators booking={booking} className="ml-1" />
                  </p>
                  <p className="text-sm text-gray-500 truncate">{booking.client_email}</p>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1">
                    {booking.meeting_type_id && meetingTypeMap[booking.meeting_type_id] && (
                      <span className="text-xs text-jungo-green-600">{meetingTypeMap[booking.meeting_type_id]}</span>
                    )}
                    {booking.recurrence_group_id && (
                      <Badge variant="info" className="text-xs">
                        <Repeat className="w-2.5 h-2.5 mr-0.5 inline" />
                        Recurring
                      </Badge>
                    )}
                    {booking.is_existing_client === true && (
                      <Badge variant="success" className="text-xs">
                        <UserCheck className="w-2.5 h-2.5 mr-0.5 inline" />
                        Existing
                      </Badge>
                    )}
                    {booking.is_existing_client === false && (
                      <Badge variant="neutral" className="text-xs">
                        <UserPlus className="w-2.5 h-2.5 mr-0.5 inline" />
                        New
                      </Badge>
                    )}
                    {isBookingOutOfHours(booking, rules, overrides) && (
                      <Badge variant="warning" className="text-xs">Out of hours</Badge>
                    )}
                    <span className="text-xs text-gray-400 capitalize">
                      {booking.source.replace('_', ' ')}
                    </span>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-medium text-gray-900">
                    {formatDisplayDate(booking.date).split(',').slice(0, 2).join(',')}
                  </p>
                  <p className="text-sm text-gray-500">
                    {formatTime(booking.start_time)} - {formatTime(booking.end_time)}
                  </p>
                </div>
                <StatusBadge status={booking.status} />
              </div>
            </Card>
          ))}
        </div>
      )}

      {!isUnconfirmed && bookings.length > 0 && (
        <div className="flex items-center gap-4 text-xs text-gray-400 pt-2">
          <span className="font-medium text-gray-500">Notes:</span>
          <span className="flex items-center gap-1"><span className="text-blue-500 font-bold">*</span> Client</span>
          <span className="flex items-center gap-1"><span className="text-amber-500 font-bold">*</span> Internal</span>
          <span className="flex items-center gap-1"><span className="text-emerald-500 font-bold">*</span> To Client</span>
        </div>
      )}

      <BookingDetailsModal
        booking={selectedBooking}
        open={!!selectedBooking}
        onClose={() => setSelectedBooking(null)}
      />

      {/* Clear All confirmation modal */}
      <Modal open={showClearConfirm} onClose={() => setShowClearConfirm(false)} title="Clear All Bookings" maxWidth="sm">
        <div className="space-y-4">
          <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg p-4">
            <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-red-800">This will permanently delete ALL bookings.</p>
              <p className="text-sm text-red-700 mt-1">
                Every meeting — past, present, future, confirmed, cancelled, and completed — will be removed.
                This action cannot be undone.
              </p>
            </div>
          </div>

          {clearResult?.error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm font-medium text-red-800">Error: {clearResult.error}</p>
              <p className="text-xs text-red-600 mt-1">
                This may be due to a permission policy or network issue. Check your connection and try again.
              </p>
            </div>
          )}

          {clearResult && !clearResult.error && clearResult.count > 0 && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-2">
              <Check className="w-4 h-4 text-green-600" />
              <p className="text-sm text-green-800">Successfully deleted {clearResult.count} booking{clearResult.count !== 1 ? 's' : ''}.</p>
            </div>
          )}

          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setShowClearConfirm(false)} disabled={clearLoading}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleClearAll} loading={clearLoading} icon={<Trash2 className="w-4 h-4" />}>
              Yes, Delete Everything
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
