import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Users, Clock, TrendingUp, ArrowRight, Mail, Link2, Copy, Check, Repeat } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useBookings } from '@/hooks/useBookings';
import { useSettings } from '@/hooks/useSettings';
import { useRecurringLinks } from '@/hooks/useRecurringLinks';
import { useProposalLinks } from '@/hooks/useProposalLinks';
import { useMeetingTypes } from '@/hooks/useMeetingTypes';
import { useAvailability } from '@/hooks/useAvailability';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { StatusBadge } from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Modal from '@/components/ui/Modal';
import BookingDetailsModal from '@/components/booking/BookingDetailsModal';
import { formatTime, formatDate, formatDisplayDate, isBookingOutOfHours } from '@/lib/utils';
import NoteIndicators from '@/components/booking/NoteIndicators';
import DashboardCalendar from '@/components/booking/DashboardCalendar';
import type { Booking } from '@/lib/types';

export default function DashboardPage() {
  const { user } = useAuth();
  const { bookings, loading } = useBookings();
  const { ensureSettings } = useSettings();
  const { links: recurringLinks } = useRecurringLinks();
  const { proposals } = useProposalLinks();
  const { meetingTypes } = useMeetingTypes();
  const { rules, overrides } = useAvailability();
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [viewInvite, setViewInvite] = useState<{ type: 'recurring' | 'proposal'; data: any } | null>(null);

  useEffect(() => {
    if (user) ensureSettings(user.id);
  }, [user, ensureSettings]);

  const today = formatDate(new Date());

  const stats = useMemo(() => {
    const confirmed = bookings.filter(b => b.status === 'confirmed');
    const todayBookings = confirmed.filter(b => b.date === today);

    const weekFromNow = new Date();
    weekFromNow.setDate(weekFromNow.getDate() + 7);
    const weekStr = formatDate(weekFromNow);
    const thisWeek = confirmed.filter(b => b.date >= today && b.date <= weekStr);

    const upcoming = confirmed
      .filter(b => b.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time));

    return { todayCount: todayBookings.length, weekCount: thisWeek.length, upcoming, total: bookings.length };
  }, [bookings, today]);

  const pendingInvites = useMemo(() => {
    const recurringWithBookings = new Set(
      bookings.filter(b => b.recurring_link_id && b.status === 'confirmed').map(b => b.recurring_link_id)
    );
    const pendingRecurring = recurringLinks.filter(
      l => l.is_active && !recurringWithBookings.has(l.id)
    );

    const proposalsWithClaims = new Set(
      proposals.filter(p => p.slots.some(s => s.is_claimed)).map(p => p.id)
    );
    const pendingProposal = proposals.filter(
      p => p.is_active && !proposalsWithClaims.has(p.id)
    );

    return { pendingRecurring, pendingProposal, total: pendingRecurring.length + pendingProposal.length };
  }, [recurringLinks, proposals, bookings]);

  const meetingTypeMap = useMemo(() => {
    const map: Record<string, string> = {};
    meetingTypes.forEach(mt => { map[mt.id] = mt.name; });
    return map;
  }, [meetingTypes]);

  if (loading) {
    return <div className="flex justify-center py-20"><LoadingSpinner size="lg" /></div>;
  }

  const statCards = [
    { label: "Today's Meetings", value: stats.todayCount, icon: CalendarDays, color: 'text-jungo-green-500 bg-jungo-green-50' },
    { label: 'This Week', value: stats.weekCount, icon: Clock, color: 'text-blue-500 bg-blue-50' },
    { label: 'Total Bookings', value: stats.total, icon: Users, color: 'text-jungo-brown-500 bg-jungo-brown-50' },
    { label: 'Pending Invites', value: pendingInvites.total, icon: Mail, color: 'text-amber-500 bg-amber-50' },
  ];

  const copyLink = (url: string, id: string) => {
    navigator.clipboard.writeText(url);
    setCopiedLink(id);
    setTimeout(() => setCopiedLink(null), 2000);
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1">Welcome back! Here's your scheduling overview.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map(({ label, value, icon: Icon, color }) => (
          <Card key={label}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-gray-500">{label}</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
              </div>
              <div className={`p-2.5 rounded-lg ${color}`}>
                <Icon className="w-5 h-5" />
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Pending Invites */}
      {pendingInvites.total > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Pending Invites</h2>
            <Badge variant="warning">{pendingInvites.total} awaiting response</Badge>
          </div>
          <div className="space-y-3">
            {pendingInvites.pendingRecurring.map(link => {
              const url = `${window.location.origin}/book/${link.token}`;
              const mtName = link.meeting_type_id ? meetingTypeMap[link.meeting_type_id] : null;
              return (
                <Card key={link.id} padding="sm">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Link2 className="w-4 h-4 text-jungo-green-500" />
                        <p className="font-medium text-gray-900 truncate">{link.client_name}</p>
                      </div>
                      <p className="text-sm text-gray-500 truncate">{link.client_email}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {mtName && <span className="text-xs text-jungo-green-600">{mtName}</span>}
                        {link.frequency && <span className="text-xs text-gray-400 capitalize">{link.frequency}</span>}
                        {link.is_ongoing && <span className="text-xs text-gray-400">Ongoing</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button variant="ghost" size="sm" onClick={() => setViewInvite({ type: 'recurring', data: link })}>View Details</Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={copiedLink === link.id ? <Check className="w-4 h-4 text-jungo-green-500" /> : <Copy className="w-4 h-4" />}
                        onClick={() => copyLink(url, link.id)}
                      >
                        {copiedLink === link.id ? 'Copied' : 'Copy'}
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
            {pendingInvites.pendingProposal.map(link => {
              const url = `${window.location.origin}/proposal/${link.token}`;
              const mtName = link.meeting_type_id ? meetingTypeMap[link.meeting_type_id] : null;
              const availableSlots = link.slots.filter((s: any) => !s.is_claimed).length;
              return (
                <Card key={link.id} padding="sm">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Mail className="w-4 h-4 text-blue-500" />
                        <p className="font-medium text-gray-900 truncate">{link.client_name}</p>
                      </div>
                      <p className="text-sm text-gray-500 truncate">{link.client_email}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {mtName && <span className="text-xs text-jungo-green-600">{mtName}</span>}
                        <span className="text-xs text-gray-400">{availableSlots} slots available</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button variant="ghost" size="sm" onClick={() => setViewInvite({ type: 'proposal', data: link })}>View Details</Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={copiedLink === link.id ? <Check className="w-4 h-4 text-jungo-green-500" /> : <Copy className="w-4 h-4" />}
                        onClick={() => copyLink(url, link.id)}
                      >
                        {copiedLink === link.id ? 'Copied' : 'Copy'}
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Upcoming Appointments</h2>
          <Button variant="ghost" size="sm" onClick={() => window.location.hash = '#/admin/bookings'} icon={<ArrowRight className="w-4 h-4" />}>
            View All
          </Button>
        </div>

        {stats.upcoming.length === 0 ? (
          <Card className="text-center py-12">
            <CalendarDays className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No scheduled appointments yet.</p>
            <p className="text-sm text-gray-400 mt-1">When a client books, they'll appear here!</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {stats.upcoming.slice(0, 8).map(booking => {
              const isRecurring = !!booking.recurrence_group_id;
              const outOfHours = isBookingOutOfHours(booking, rules, overrides);
              return (
                <Card key={booking.id} hover onClick={() => setSelectedBooking(booking)}>
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 truncate">
                        {booking.first_name} {booking.last_name}
                        <NoteIndicators booking={booking} className="ml-1" />
                      </p>
                      <p className="text-sm text-gray-500 truncate">{booking.client_email}</p>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        {booking.meeting_type_id && meetingTypeMap[booking.meeting_type_id] && (
                          <span className="text-xs text-jungo-green-600">{meetingTypeMap[booking.meeting_type_id]}</span>
                        )}
                        {isRecurring && (
                          <Badge variant="info" className="text-xs">
                            <Repeat className="w-2.5 h-2.5 mr-0.5 inline" />
                            Recurring
                          </Badge>
                        )}
                        {outOfHours && (
                          <Badge variant="warning" className="text-xs">Out of hours</Badge>
                        )}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-medium text-gray-900">
                        {formatDisplayDate(booking.date).split(',')[0]}
                      </p>
                      <p className="text-sm text-gray-500">
                        {formatTime(booking.start_time)} - {formatTime(booking.end_time)}
                      </p>
                    </div>
                    <StatusBadge status={booking.status} />
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <DashboardCalendar
        bookings={bookings}
        rules={rules}
        overrides={overrides}
        meetingTypeMap={meetingTypeMap}
        onSelectBooking={setSelectedBooking}
      />

      <BookingDetailsModal
        booking={selectedBooking}
        open={!!selectedBooking}
        onClose={() => setSelectedBooking(null)}
      />

      {/* Invite details modal */}
      <Modal open={!!viewInvite} onClose={() => setViewInvite(null)} title={viewInvite?.type === 'recurring' ? 'Recurring Invite Details' : 'Proposal Invite Details'} maxWidth="md">
        {viewInvite && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider">Client</p>
                <p className="font-medium text-gray-900">{viewInvite.data.client_name}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider">Email</p>
                <p className="text-sm text-gray-900">{viewInvite.data.client_email}</p>
              </div>
              {viewInvite.data.meeting_type_id && (
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider">Meeting Type</p>
                  <p className="text-sm text-gray-900">{meetingTypeMap[viewInvite.data.meeting_type_id] || '---'}</p>
                </div>
              )}
              {viewInvite.type === 'recurring' && (
                <>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wider">Frequency</p>
                    <p className="text-sm text-gray-900 capitalize">{viewInvite.data.frequency || 'Client chooses'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wider">End Date</p>
                    <p className="text-sm text-gray-900">
                      {viewInvite.data.is_ongoing ? 'Ongoing' : (viewInvite.data.end_date || formatDisplayDate(new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)))}
                    </p>
                  </div>
                </>
              )}
              {viewInvite.type === 'proposal' && (
                <div className="col-span-2">
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Available Slots ({viewInvite.data.slots.filter((s: any) => !s.is_claimed).length})</p>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {viewInvite.data.slots.filter((s: any) => !s.is_claimed).map((s: any) => (
                      <div key={s.id} className="text-sm text-gray-600 bg-gray-50 rounded px-2 py-1">
                        {formatDisplayDate(s.date)} at {formatTime(s.start_time)}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Booking Link</p>
              <div className="flex items-center gap-2">
                <p className="text-sm text-jungo-green-700 break-all flex-1">
                  {viewInvite.type === 'recurring'
                    ? `${window.location.origin}/book/${viewInvite.data.token}`
                    : `${window.location.origin}/proposal/${viewInvite.data.token}`}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  icon={copiedLink === viewInvite.data.id ? <Check className="w-4 h-4 text-jungo-green-500" /> : <Copy className="w-4 h-4" />}
                  onClick={() => copyLink(
                    viewInvite.type === 'recurring'
                      ? `${window.location.origin}/book/${viewInvite.data.token}`
                      : `${window.location.origin}/proposal/${viewInvite.data.token}`,
                    viewInvite.data.id
                  )}
                >
                  {copiedLink === viewInvite.data.id ? 'Copied' : 'Copy'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
