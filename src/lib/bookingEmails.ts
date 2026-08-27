import { supabase } from '@/lib/supabase';
import { parseError, type ParsedError } from '@/lib/errors';

type EmailType =
  | 'confirmation'
  | 'invite'
  | 'cancellation'
  | 'reschedule'
  | 'change'
  | 'admin_change_notification'
  | 'sameday_alert'
  | 'recurring_confirmation'
  | 'reminder'
  | 'admin_daily_summary';

interface TriggerOptions {
  emailType?: EmailType;
  inviteLink?: string;
  inviteClientName?: string;
  inviteClientEmail?: string;
  inviteNotesToClient?: string;
  oldDate?: string;
  oldTime?: string;
  newDate?: string;
  newTime?: string;
  bookingIds?: string[];
  forceResend?: boolean;
  dummyMode?: boolean;
  dummyRecipient?: string;
  adminDailySummary?: boolean;
  changeType?: string;
  internalNotes?: string;
  clientNotes?: string;
  userId?: string;
}

export interface EmailResult {
  success: boolean;
  sent?: boolean;
  skipped?: boolean;
  reason?: string;
  error?: ParsedError;
}

async function callEmailFunction(body: Record<string, unknown>): Promise<EmailResult> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    const currentUserId = sessionData.session?.user?.id;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken || import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
    };

    const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-booking-emails`;

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...body, siteUrl: window.location.origin, userId: body.userId || currentUserId }),
    });

    if (!response.ok) {
      let errorBody: string;
      try {
        const data = await response.json();
        errorBody = data.error || data.reason || `HTTP ${response.status}`;
      } catch {
        errorBody = `HTTP ${response.status}: ${response.statusText}`;
      }
      return {
        success: false,
        error: {
          type: `Email Send Failed (${response.status})`,
          message: errorBody,
          details: `The email server responded with an error. This could be due to a missing API key, an invalid email address, or a server configuration issue.`,
        },
      };
    }

    const data = await response.json();
    if (data.error) {
      return {
        success: false,
        error: {
          type: 'Email Send Error',
          message: data.error,
          details: 'The email function reported an error while trying to send.',
        },
      };
    }

    return {
      success: true,
      sent: data.sent,
      skipped: data.skipped,
      reason: data.reason,
    };
  } catch (err) {
    return {
      success: false,
      error: parseError(err),
    };
  }
}

export async function triggerBookingEmails(
  bookingId: string,
  options?: Omit<TriggerOptions, 'bookingIds'>
): Promise<EmailResult> {
  return callEmailFunction({ bookingId, ...options });
}

export async function triggerRecurringConfirmationEmail(
  bookingIds: string[]
): Promise<EmailResult> {
  return callEmailFunction({ emailType: 'recurring_confirmation', bookingIds });
}

export async function triggerInviteEmail(
  clientName: string,
  clientEmail: string,
  inviteLink: string,
  notesToClient?: string,
  userId?: string
): Promise<EmailResult> {
  return callEmailFunction({
    emailType: 'invite',
    inviteClientName: clientName,
    inviteClientEmail: clientEmail,
    inviteLink,
    inviteNotesToClient: notesToClient,
    userId,
  });
}

export async function triggerResendEmail(
  bookingId: string,
  emailType: EmailType
): Promise<EmailResult> {
  return callEmailFunction({ bookingId, emailType, forceResend: true });
}

export async function triggerDummyEmail(
  emailType: EmailType,
  recipientEmail: string,
  userId?: string
): Promise<EmailResult> {
  return callEmailFunction({
    emailType,
    dummyMode: true,
    dummyRecipient: recipientEmail,
    bookingId: 'dummy',
    userId,
  });
}

export async function triggerAdminDailySummary(userId?: string): Promise<EmailResult> {
  return callEmailFunction({ adminDailySummary: true, userId });
}

export async function triggerRescheduleProposalEmail(
  bookingId: string,
  clientEmail: string,
  clientName: string,
  rescheduleLink: string,
  message?: string
): Promise<EmailResult> {
  return callEmailFunction({
    emailType: 'reschedule' as EmailType,
    bookingId,
    inviteClientEmail: clientEmail,
    inviteClientName: clientName,
    inviteLink: rescheduleLink,
    inviteNotesToClient: message,
  });
}

export async function triggerChangeEmail(
  bookingId: string,
  options?: { oldDate?: string; oldTime?: string; newDate?: string; newTime?: string }
): Promise<EmailResult> {
  return callEmailFunction({ bookingId, emailType: 'change', ...options });
}

export async function triggerAdminChangeNotification(
  bookingId: string,
  changeType: 'rescheduled' | 'cancelled' | 'updated',
  options?: { oldDate?: string; oldTime?: string; newDate?: string; newTime?: string; clientNotes?: string }
): Promise<EmailResult> {
  return callEmailFunction({
    bookingId,
    emailType: 'admin_change_notification',
    changeType,
    ...options,
  });
}
