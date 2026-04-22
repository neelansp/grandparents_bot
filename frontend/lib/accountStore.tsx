// React context that holds the list of grandparent accounts.
//
// On mount it fetches /accounts. Pages call useAccounts() to read the
// list, know which one is "active", or switch to a different one.
//
// No login, no tokens. Anyone on the LAN can switch between accounts.

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { listAccounts, type AccountResponse } from "./api";


const ACTIVE_ACCOUNT_KEY = "grandparents_bot.active_account_id";


export type AccountType = AccountResponse;

type AccountContextType = {
  accounts: AccountType[];
  currentAccount: AccountType | null;
  loading: boolean;
  initialized: boolean;
  error: string | null;
  switchAccount: (accountId: string) => void;

  // The planner and review pages use these fields. Keeping the names
  // so the rest of the app can stay unchanged.
  authenticatedAccounts: AccountType[];
  authenticatedAccountIds: string[];
  isAuthenticated: boolean;
};


const AccountContext = createContext<AccountContextType | undefined>(undefined);


function readActiveAccountId() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACTIVE_ACCOUNT_KEY);
}

function writeActiveAccountId(accountId: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ACTIVE_ACCOUNT_KEY, accountId);
}


export function AccountProvider({ children }: { children: ReactNode }) {
  const [accounts, setAccounts] = useState<AccountType[]>([]);
  const [currentAccount, setCurrentAccount] = useState<AccountType | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load the account list once on page load.
  useEffect(() => {
    async function loadAccounts() {
      setLoading(true);
      try {
        const list = await listAccounts();
        setAccounts(list);

        // Pick the last-active account if it's still in the list,
        // otherwise just pick the first one.
        const savedId = readActiveAccountId();
        const saved = list.find((account) => account.id === savedId);
        const next = saved ?? list[0] ?? null;
        if (next) {
          writeActiveAccountId(next.id);
        }
        setCurrentAccount(next);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load accounts");
      } finally {
        setLoading(false);
        setInitialized(true);
      }
    }

    loadAccounts();
  }, []);


  const switchAccount = useCallback((accountId: string) => {
    const account = accounts.find((item) => item.id === accountId);
    if (!account) return;
    writeActiveAccountId(account.id);
    setCurrentAccount(account);
  }, [accounts]);


  const value: AccountContextType = {
    accounts,
    currentAccount,
    loading,
    initialized,
    error,
    switchAccount,
    authenticatedAccounts: accounts,
    authenticatedAccountIds: accounts.map((a) => a.id),
    isAuthenticated: accounts.length > 0,
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
