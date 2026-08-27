export interface ParsedError {
  type: string;
  message: string;
  details?: string;
}

function isNetworkError(err: unknown): boolean {
  if (err instanceof TypeError && err.message.includes('fetch')) return true;
  if (err instanceof Error && /network|failed to fetch|networkerror|load failed/i.test(err.message)) return true;
  return false;
}

function isAuthError(err: unknown): boolean {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as Record<string, unknown>).code;
    if (code === 'PGRST301' || code === '42501' || code === '42703') return true;
  }
  if (err instanceof Error && /jwt|token|session|unauthorized|not signed in/i.test(err.message)) return true;
  return false;
}

function isPermissionError(err: unknown): boolean {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as Record<string, unknown>).code;
    if (code === '42501') return true;
  }
  if (err instanceof Error && /permission|denied|policy|rls/i.test(err.message)) return true;
  return false;
}

function isNotFoundError(err: unknown): boolean {
  if (err instanceof Error && /not found|no rows|PGRST116|does not exist/i.test(err.message)) return true;
  return false;
}

function isConflictError(err: unknown): boolean {
  if (err instanceof Error && /conflict|overlap|duplicate|unique|23505/i.test(err.message)) return true;
  return false;
}

export function parseError(err: unknown): ParsedError {
  if (err === null || err === undefined) {
    return { type: 'Unknown Error', message: 'An unexpected error occurred with no details available.' };
  }

  if (isNetworkError(err)) {
    return {
      type: 'Network Error',
      message: 'The app could not reach the server. Check your internet connection and try again.',
      details: err instanceof Error ? err.message : String(err),
    };
  }

  if (isAuthError(err)) {
    return {
      type: 'Authentication Error',
      message: 'Your login session may have expired or is invalid. Try signing out and signing back in.',
      details: err instanceof Error ? err.message : String(err),
    };
  }

  if (isPermissionError(err)) {
    return {
      type: 'Permission Denied',
      message: 'You do not have permission to perform this action. This may be a security policy restriction. If you believe this is wrong, contact support.',
      details: err instanceof Error ? err.message : String(err),
    };
  }

  if (isNotFoundError(err)) {
    return {
      type: 'Not Found',
      message: 'The requested item could not be found. It may have been deleted or never existed.',
      details: err instanceof Error ? err.message : String(err),
    };
  }

  if (isConflictError(err)) {
    return {
      type: 'Conflict',
      message: 'This action conflicts with existing data. For example, a booking at the same time already exists, or a duplicate entry was attempted.',
      details: err instanceof Error ? err.message : String(err),
    };
  }

  if (err instanceof Error) {
    return {
      type: 'Error',
      message: err.message || 'An unexpected error occurred.',
      details: err.stack,
    };
  }

  if (typeof err === 'object' && 'message' in err) {
    const msg = (err as Record<string, unknown>).message;
    return {
      type: 'Error',
      message: typeof msg === 'string' ? msg : 'An unexpected error occurred.',
    };
  }

  return {
    type: 'Unknown Error',
    message: `An unexpected error occurred: ${String(err)}`,
  };
}

export function formatErrorForUser(err: unknown): string {
  const parsed = parseError(err);
  let result = `${parsed.type}: ${parsed.message}`;
  if (parsed.details && parsed.details !== parsed.message) {
    result += `\n\nTechnical details: ${parsed.details}`;
  }
  return result;
}
