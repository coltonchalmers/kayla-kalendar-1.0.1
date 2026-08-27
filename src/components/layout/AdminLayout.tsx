import { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Clock,
  CalendarPlus,
  Link2,
  List,
  Settings,
  LogOut,
  Menu,
  X,
  CalendarClock,
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { classNames } from '@/lib/utils';
import AdminHeader from './AdminHeader';

const navItems = [
  { to: '/admin', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/admin/availability', icon: Clock, label: 'Availability' },
  { to: '/admin/bookings/new', icon: CalendarPlus, label: 'Manual Booking' },
  { to: '/admin/meeting-types', icon: CalendarClock, label: 'Meeting Types' },
  { to: '/admin/recurring-links', icon: Link2, label: 'Recurring Links' },
  { to: '/admin/proposals', icon: CalendarCheck, label: 'Proposal Links' },
  { to: '/admin/bookings', icon: List, label: 'All Bookings', end: true },
  { to: '/admin/settings', icon: Settings, label: 'Settings' },
];

const COLLAPSE_KEY = 'jungo-admin-sidebar-collapsed';

export default function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const stored = localStorage.getItem(COLLAPSE_KEY);
    if (stored === 'true') setIsCollapsed(true);
  }, []);

  const toggleCollapsed = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(COLLAPSE_KEY, String(next));
      return next;
    });
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/admin/login');
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={classNames(
          'group fixed inset-y-0 left-0 z-50 bg-jungo-brown-700 text-white flex flex-col transition-all duration-300 ease-in-out',
          'lg:translate-x-0 lg:static lg:z-auto',
          isCollapsed ? 'lg:w-20' : 'lg:w-64',
          'w-64',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div
          className={classNames(
            'flex items-center border-b border-jungo-brown-600',
            isCollapsed ? 'lg:justify-center lg:p-3' : 'p-5 gap-3'
          )}
        >
          <img
            src="/Jungo_logo_greenbrown_no_background.png"
            alt="Jungo Solutions"
            className="h-9 w-auto brightness-200 flex-shrink-0"
          />
          {!isCollapsed && (
            <div className="min-w-0">
              <h1 className="text-sm font-semibold truncate">Jungo Solutions</h1>
              <p className="text-xs text-jungo-brown-300">Admin Panel</p>
            </div>
          )}
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden ml-auto p-1 hover:bg-jungo-brown-600 rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map(({ to, icon: Icon, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                classNames(
                  'relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150',
                  isCollapsed && 'lg:justify-center lg:px-0',
                  isActive
                    ? 'bg-jungo-brown-600 text-white'
                    : 'text-jungo-brown-200 hover:bg-jungo-brown-600 hover:text-white'
                )
              }
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              {!isCollapsed && <span>{label}</span>}
              {isCollapsed && (
                <span className="hidden lg:group-hover:block absolute left-full ml-2 px-2 py-1 rounded-md bg-jungo-brown-600 text-white text-xs whitespace-nowrap shadow-lg z-50 pointer-events-none">
                  {label}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-jungo-brown-600 space-y-1">
          <button
            onClick={handleSignOut}
            className={classNames(
              'flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-jungo-brown-200 hover:bg-jungo-brown-600 hover:text-white transition-colors',
              isCollapsed && 'lg:justify-center lg:px-0'
            )}
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            {!isCollapsed && <span>Sign Out</span>}
            {isCollapsed && (
              <span className="hidden lg:group-hover:block absolute left-full ml-2 px-2 py-1 rounded-md bg-jungo-brown-600 text-white text-xs whitespace-nowrap shadow-lg z-50 pointer-events-none">
                Sign Out
              </span>
            )}
          </button>

          <button
            onClick={toggleCollapsed}
            className={classNames(
              'hidden lg:flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-jungo-brown-200 hover:bg-jungo-brown-600 hover:text-white transition-colors',
              isCollapsed && 'lg:justify-center lg:px-0'
            )}
          >
            {isCollapsed ? (
              <ChevronRight className="w-5 h-5 flex-shrink-0" />
            ) : (
              <ChevronLeft className="w-5 h-5 flex-shrink-0" />
            )}
            {!isCollapsed && <span>Collapse</span>}
          </button>
        </div>
      </aside>

      <div
        className={classNames(
          'flex-1 flex flex-col min-w-0 transition-all duration-300 ease-in-out',
          isCollapsed ? 'lg:ml-0' : 'lg:ml-0'
        )}
      >
        <header className="bg-white border-b border-gray-200 px-4 sm:px-6 py-3 flex items-center gap-3 lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 -ml-2 rounded-lg text-gray-600 hover:bg-gray-100"
          >
            <Menu className="w-5 h-5" />
          </button>
          <h1 className="text-sm font-semibold text-jungo-brown-700">Jungo Solutions</h1>
        </header>

        <AdminHeader pageTitle="Dashboard" />

        <main className="flex-1 p-4 sm:p-6 lg:px-8 lg:pt-6 lg:pb-8 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
