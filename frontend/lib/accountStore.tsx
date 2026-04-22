/**
 * React context that owns account + auth state for the whole app.
 *
 * On mount, it tries `bootstrapAccounts()` (the dev path that mints sessions
 * for seeded accounts when AUTO_LOGIN_ACCOUNTS is true). If that fails, it
 * falls back to hydrating any tokens already in localStorage. The exposed
 * `useAccounts()` hook is what pages call to log in, switch accounts, etc.
 */

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  bootstrapAccounts,
  getCurrentSessionAccount,
  listAccounts,
  loginAccount,
  logoutAccount,
  registerAccount,
  type AccountResponse,
} from "./api";
import {
  clearAllSessions,
  getActiveAccountId,
  getSessionToken,
  getStoredSessions,
  persistSession,
  removeSession,
  setActiveAccountId,
} from "./session";


export type AccountType = AccountResponse;

type AccountContextType = {
  accounts: AccountType[];
  authenticatedAccounts: AccountType[];
  authenticatedAccountIds: string[];
  currentAccount: AccountType | null;
  loading: boolean;
  initialized: boolean;
  error: string | null;
  isAuthenticated: boolean;
  loadAccounts: () => Promise<AccountType[]>;
  register: (name: string, email: string, password: string) => Promise<AccountType>;
  login: (accountId: string, email: string, password: string) => Promise<void>;
  switchAccount: (accountId: string) => void;
  logout: (accountId?: string) => Promise<void>;
  isAccountAuthenticated: (accountId: string) => boolean;
  clearError: () => void;
};

const AccountContext = createContext<AccountContextType | undefined>(undefined);


export function AccountProvider({ children }: { children: ReactNode }) {
  const [accounts, setAccounts] = useState<AccountType[]>([]);
  const [authenticatedAccounts, setAuthenticatedAccounts] = useState<AccountType[]>([]);
  const [currentAccount, setCurrentAccount] = useState<AccountType | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAccounts = useCallback(async () => {
    try {
      const result = await listAccounts();
      setAccounts(result);
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load accounts");
      return [];
    }
  }, []);

  const hydrateSessions = useCallback(async () => {
    const storedSessions = getStoredSessions();
    const sessionEntries = Object.entries(storedSessions);

    if (sessionEntries.length === 0) {
      setAuthenticatedAccounts([]);
      setCurrentAccount(null);
      return;
    }

    const results = await Promise.all(
      sessionEntries.map(async ([accountId, token]) => {
        try {
          const account = await getCurrentSessionAccount(token);
          return account;
        } catch {
          removeSession(accountId);
          return null;
        }
      })
    );

    const validAccounts = results.filter((account): account is AccountType => account !== null);
    setAuthenticatedAccounts(validAccounts);

    const activeAccountId = getActiveAccountId();
    const nextCurrentAccount =
      validAccounts.find((account) => account.id === activeAccountId) ??
      validAccounts[0] ??
      null;

    if (nextCurrentAccount) {
      setActiveAccountId(nextCurrentAccount.id);
    }

    setCurrentAccount(nextCurrentAccount);
  }, []);

  const bootstrapSeededAccounts = useCallback(async () => {
    const previousActiveAccountId = getActiveAccountId();
    const results = await bootstrapAccounts();
    const nextAccounts = results.map((result) => result.account);

    clearAllSessions();

    results.forEach((result) => {
      persistSession(result.token, result.account.id);
    });

    setAccounts(nextAccounts);
    setAuthenticatedAccounts(nextAccounts);

    const nextCurrentAccount =
      nextAccounts.find((account) => account.id === previousActiveAccountId) ??
      nextAccounts[0] ??
      null;

    if (nextCurrentAccount) {
      setActiveAccountId(nextCurrentAccount.id);
    }

    setCurrentAccount(nextCurrentAccount);
    return nextAccounts;
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      setLoading(true);
      setError(null);

      try {
        try {
          await bootstrapSeededAccounts();
        } catch {
          await Promise.all([loadAccounts(), hydrateSessions()]);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to initialize accounts");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setInitialized(true);
        }
      }
    }

    initialize();
    return () => {
      cancelled = true;
    };
  }, [bootstrapSeededAccounts, hydrateSessions, loadAccounts]);

  const register = useCallback(async (name: string, email: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await registerAccount(name, email, password);
      persistSession(result.token, result.account.id);
      setAuthenticatedAccounts((prev) => {
        const next = prev.filter((account) => account.id !== result.account.id);
        return [...next, result.account];
      });
      setCurrentAccount(result.account);
      await loadAccounts();
      return result.account;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Registration failed";
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [loadAccounts]);

  const login = useCallback(async (accountId: string, email: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await loginAccount(accountId, email, password);
      persistSession(result.token, result.account.id);
      setAuthenticatedAccounts((prev) => {
        const next = prev.filter((account) => account.id !== result.account.id);
        return [...next, result.account];
      });
      setCurrentAccount(result.account);
      await loadAccounts();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Login failed";
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [loadAccounts]);

  const switchAccount = useCallback((accountId: string) => {
    const account = authenticatedAccounts.find((item) => item.id === accountId);
    if (!account) {
      return;
    }

    setActiveAccountId(account.id);
    setCurrentAccount(account);
  }, [authenticatedAccounts]);

  const logout = useCallback(async (accountId?: string) => {
    const targetAccountId = accountId ?? currentAccount?.id;
    if (!targetAccountId) {
      clearAllSessions();
      setAuthenticatedAccounts([]);
      setCurrentAccount(null);
      return;
    }

    const token = getSessionToken(targetAccountId);
    setLoading(true);
    setError(null);
    try {
      if (token) {
        await logoutAccount(token);
      }
    } catch {
      // Always clear local session state even if the backend token is already invalid.
    } finally {
      removeSession(targetAccountId);

      const remainingAccounts = authenticatedAccounts.filter(
        (account) => account.id !== targetAccountId
      );
      setAuthenticatedAccounts(remainingAccounts);

      const nextCurrentAccount =
        remainingAccounts.find((account) => account.id === getActiveAccountId()) ??
        remainingAccounts[0] ??
        null;

      setCurrentAccount(nextCurrentAccount);
      setLoading(false);
    }
  }, [authenticatedAccounts, currentAccount]);

  const authenticatedAccountIds = useMemo(
    () => authenticatedAccounts.map((account) => account.id),
    [authenticatedAccounts]
  );

  const value = {
    accounts,
    authenticatedAccounts,
    authenticatedAccountIds,
    currentAccount,
    loading,
    initialized,
    error,
    isAuthenticated: authenticatedAccounts.length > 0,
    loadAccounts,
    register,
    login,
    switchAccount,
    logout,
    isAccountAuthenticated: (accountId: string) => authenticatedAccountIds.includes(accountId),
    clearError: () => setError(null),
  };

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}


export function useAccounts() {
  const context = useContext(AccountContext);
  if (context === undefined) {
    throw new Error("useAccounts must be used within an AccountProvider");
  }
  return context;
}
