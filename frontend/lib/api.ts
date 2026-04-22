/**
 * HTTP client for the FastAPI backend.
 *
 * One function per backend route, all returning typed JSON. The base URL is
 * `NEXT_PUBLIC_API_URL` — set to `http://localhost:8000` for local dev or
 * `/api` in Docker (Next.js rewrites `/api/*` to the backend container).
 */

import { getSessionToken } from "./session";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface ApiError {
  detail?: string;
  message?: string;
}

export type AccountResponse = {
  id: string;
  name: string;
  email: string;
  created_at?: string;
};

export type AuthResponse = {
  account: AccountResponse;
  token: string;
};

export type BootstrapAuthResponse = AuthResponse[];

async function handleResponse(response: Response) {
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || error.message || `API error: ${response.status}`);
  }
  return response.json();
}

function buildHeaders(withAuth = false, tokenOverride?: string | null) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (withAuth) {
    const token = tokenOverride ?? getSessionToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  return headers;
}

export async function registerAccount(name: string, email: string, password: string) {
  const response = await fetch(`${API_BASE_URL}/accounts/register`, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify({ name, email, password }),
  });
  return handleResponse(response) as Promise<AuthResponse>;
}

export async function listAccounts() {
  const response = await fetch(`${API_BASE_URL}/accounts`, {
    method: "GET",
  });
  return handleResponse(response) as Promise<AccountResponse[]>;
}

export async function bootstrapAccounts() {
  const response = await fetch(`${API_BASE_URL}/accounts/bootstrap`, {
    method: "GET",
  });
  return handleResponse(response) as Promise<BootstrapAuthResponse>;
}

export async function getAccount(accountId: string, tokenOverride?: string | null) {
  const response = await fetch(`${API_BASE_URL}/accounts/${accountId}`, {
    method: "GET",
    headers: buildHeaders(true, tokenOverride),
  });
  return handleResponse(response) as Promise<AccountResponse>;
}

export async function getCurrentSessionAccount(tokenOverride?: string | null) {
  const response = await fetch(`${API_BASE_URL}/accounts/me`, {
    method: "GET",
    headers: buildHeaders(true, tokenOverride),
  });
  return handleResponse(response) as Promise<AccountResponse>;
}

export async function loginAccount(accountId: string, email: string, password: string) {
  const response = await fetch(`${API_BASE_URL}/accounts/${accountId}/login`, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify({ email, password }),
  });
  return handleResponse(response) as Promise<AuthResponse>;
}

export async function logoutAccount(tokenOverride?: string | null) {
  const response = await fetch(`${API_BASE_URL}/accounts/logout`, {
    method: "POST",
    headers: buildHeaders(true, tokenOverride),
  });
  return handleResponse(response);
}

export async function deleteAccount(accountId: string, tokenOverride?: string | null) {
  const response = await fetch(`${API_BASE_URL}/accounts/${accountId}`, {
    method: "DELETE",
    headers: buildHeaders(true, tokenOverride),
  });
  return handleResponse(response);
}

export async function getAvailableClasses(
  accountId: string,
  date: string,
  tokenOverride?: string | null
) {
  const response = await fetch(
    `${API_BASE_URL}/classes/available/${accountId}?date=${date}`,
    {
      method: "GET",
      headers: buildHeaders(true, tokenOverride),
    }
  );
  return handleResponse(response);
}

export async function selectClass(
  accountId: string,
  classId: string,
  className: string,
  day: string,
  time: string,
  instructor: string,
  slotId: string,
  tokenOverride?: string | null
) {
  const response = await fetch(`${API_BASE_URL}/classes/select`, {
    method: "POST",
    headers: buildHeaders(true, tokenOverride),
    body: JSON.stringify({
      account_id: accountId,
      class_id: classId,
      class_name: className,
      day,
      time,
      instructor,
      slot_id: slotId,
    }),
  });
  return handleResponse(response);
}

export async function getSelectedClasses(accountId: string, tokenOverride?: string | null) {
  const response = await fetch(`${API_BASE_URL}/classes/selected/${accountId}`, {
    method: "GET",
    headers: buildHeaders(true, tokenOverride),
  });
  return handleResponse(response);
}

export async function deselectClass(selectionId: string, tokenOverride?: string | null) {
  const response = await fetch(`${API_BASE_URL}/classes/selected/${selectionId}`, {
    method: "DELETE",
    headers: buildHeaders(true, tokenOverride),
  });
  return handleResponse(response);
}

export async function getBookedClasses(
  accountId: string,
  tokenOverride?: string | null
) {
  const response = await fetch(`${API_BASE_URL}/classes/booked/${accountId}`, {
    method: "GET",
    headers: buildHeaders(true, tokenOverride),
  });
  return handleResponse(response);
}

export async function bookClasses(
  accountId: string,
  tokenOverride?: string | null,
  selectionIds: string[] = []
) {
  const response = await fetch(`${API_BASE_URL}/classes/book/${accountId}`, {
    method: "POST",
    headers: buildHeaders(true, tokenOverride),
    body: JSON.stringify({ selection_ids: selectionIds }),
  });
  return handleResponse(response);
}

export async function healthCheck() {
  try {
    const response = await fetch(`${API_BASE_URL}/health`, {
      method: "GET",
    });
    return response.ok;
  } catch {
    return false;
  }
}
