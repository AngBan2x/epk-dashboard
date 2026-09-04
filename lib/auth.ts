export interface SessionData {
  userId: string;
  email: string;
  role: string;
  iat: number;
  exp?: number;
}

export function decodeSessionToken(token: string): SessionData | null {
  try {
    const decoded = atob(token);
    const data = JSON.parse(decoded);
    if (!data.userId) return null;
    return data as SessionData;
  } catch {
    return null;
  }
}

export function isSessionValid(session: SessionData): boolean {
  if (session.exp && Date.now() > session.exp) return false;
  return true;
}
