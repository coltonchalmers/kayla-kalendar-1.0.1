import { useState } from 'react';
import { Search, X } from 'lucide-react';
import { classNames } from '@/lib/utils';

interface AdminHeaderProps {
  pageTitle: string;
}

export default function AdminHeader({ pageTitle }: AdminHeaderProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState('');

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchText.trim()) {
      setSearchText('');
      setSearchOpen(false);
    }
  };

  return (
    <header className="hidden lg:flex items-center justify-between bg-white border-b border-gray-200 px-8 py-4 shadow-sm relative z-10">
      <h1 className="text-2xl font-bold text-gray-900">{pageTitle}</h1>
      <div className="flex items-center gap-4">
        <div className="relative">
          <form onSubmit={handleSearch} className="flex items-center">
            <input
              type="text"
              placeholder="Search bookings, clients, types..."
              className={classNames(
                'block rounded-lg border border-gray-300 px-3.5 py-2 text-sm text-gray-900 placeholder-gray-400 transition-all duration-300',
                'focus:outline-none focus:ring-2 focus:ring-jungo-green-200 focus:border-jungo-green-500',
                searchOpen
                  ? 'w-80 opacity-100 pointer-events-auto'
                  : 'w-0 opacity-0 pointer-events-none border-transparent p-0'
              )}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setSearchOpen(!searchOpen)}
              className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 ml-2 transition-colors"
            >
              {searchOpen ? <X className="w-5 h-5" /> : <Search className="w-5 h-5" />}
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
