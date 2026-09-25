import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, X, Loader2 } from 'lucide-react';
import Card from '@/components/ui/Card';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

export default function GoogleCalendarCallbackPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const error = params.get('error');

    if (error) {
      setStatus('error');
      setMessage(error === 'access_denied' ? 'You denied access to Google Calendar.' : `Google returned an error: ${error}`);
      return;
    }

    if (!code) {
      setStatus('error');
      setMessage('No authorization code received from Google.');
      return;
    }

    // The edge function handles the OAuth callback via the code in the URL.
    // We redirect to the function endpoint which exchanges the code, then
    // we poll the connection status.
    const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-calendar-sync?code=${encodeURIComponent(code)}&state=${encodeURIComponent(params.get('state') || '')}`;

    fetch(functionUrl, {
      headers: {
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.connected) {
          setStatus('success');
          setMessage(`Connected to ${data.email || 'your Google Calendar'}.`);
        } else {
          setStatus('error');
          setMessage(data.error || 'Failed to connect to Google Calendar.');
        }
      })
      .catch(() => {
        setStatus('error');
        setMessage('Network error while connecting to Google Calendar.');
      });
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
      <Card className="max-w-md w-full text-center py-12">
        {status === 'loading' && (
          <>
            <LoadingSpinner size="lg" message="Connecting your Google Calendar..." />
          </>
        )}
        {status === 'success' && (
          <>
            <div className="w-14 h-14 rounded-full bg-jungo-green-100 flex items-center justify-center mx-auto mb-4">
              <Check className="w-7 h-7 text-jungo-green-600" />
            </div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">Google Calendar Connected</h1>
            <p className="text-sm text-gray-500 mb-6">{message}</p>
            <button
              onClick={() => navigate('/admin/settings')}
              className="text-sm font-medium text-jungo-green-600 hover:text-jungo-green-700 transition-colors"
            >
              Back to Settings
            </button>
          </>
        )}
        {status === 'error' && (
          <>
            <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
              <X className="w-7 h-7 text-red-500" />
            </div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">Connection Failed</h1>
            <p className="text-sm text-gray-500 mb-6">{message}</p>
            <button
              onClick={() => navigate('/admin/settings')}
              className="text-sm font-medium text-jungo-green-600 hover:text-jungo-green-700 transition-colors"
            >
              Back to Settings
            </button>
          </>
        )}
      </Card>
    </div>
  );
}
