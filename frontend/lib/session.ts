/**
 * Per-account bearer token storage in browser localStorage.
 *
 * The grandparents share one device, so we keep a `{accountId: token}` map
 * plus an "active account id" pointer. Switching accounts in the UI just
 * updates that pointer; tokens for other accounts stay valid in the map.
 */

const SESSIONS_KEY = "grandparents_bot.sessions";
const ACTIVE_ACCOUNT_ID_KEY = "grandparents_bot.active_account_id";


function canUseStorage() {
  return typeof window !== "undefined";
}


export function getStoredSessions(): Record<string, string> {
  if (!canUseStorage()) {
    return {};
  }

  const rawValue = window.localStorage.getItem(SESSIONS_KEY);
  if (!rawValue) {
    return {};
  }

  try {
    const parsed = JSON.parse(rawValue) as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}


function persistSessions(sessions: Record<string, string>) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
}


export function getSessionToken(accountId?: string | null) {
  const sessions = getStoredSessions();
  if (accountId) {
    return sessions[accountId] ?? null;
  }

  const activeAccountId = getActiveAccountId();
  return activeAccountId ? sessions[activeAccountId] ?? null : null;
}


export function persistSession(token: string, accountId: string) {
  const sessions = getStoredSessions();
  sessions[accountId] = token;
  persistSessions(sessions);
  setActiveAccountId(accountId);
}


export function removeSession(accountId: string) {
  const sessions = getStoredSessions();
  delete sessions[accountId];
  persistSessions(sessions);

  if (getActiveAccountId() === accountId) {
    const remainingAccountIds = Object.keys(sessions);
    if (remainingAccountIds.length > 0) {
      setActiveAccountId(remainingAccountIds[0]);
    } else {
      clearActiveAccountId();
    }
  }
}


export function clearAllSessions() {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.removeItem(SESSIONS_KEY);
  clearActiveAccountId();
}


export function getActiveAccountId() {
  if (!canUseStorage()) {
    return null;
  }

  return window.localStorage.getItem(ACTIVE_ACCOUNT_ID_KEY);
}


export function setActiveAccountId(accountId: string) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(ACTIVE_ACCOUNT_ID_KEY, accountId);
}


export function clearActiveAccountId() {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.removeItem(ACTIVE_ACCOUNT_ID_KEY);
}
