/**
 * React context for class data: available, selected, and booked.
 *
 * - `availableClasses`: classes returned from Upace for a given week
 * - `selectedClasses`: rows the user has saved (status: scheduled / manual / booked / failed)
 * - `bookedClasses`: live truth from Upace's "my reservations" endpoint
 *
 * Pages call hooks like `fetchAvailableClassesForWeek` and `reserveSelections`;
 * those wrap the matching `api.ts` functions and update the local state.
 */

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import {
  bookClasses,
  deselectClass,
  getAvailableClasses,
  getBookedClasses,
  getSelectedClasses,
  selectClass,
} from "./api";
import { getSessionToken } from "./session";


export type ClassType = {
  id: string;
  name: string;
  day: string;
  time: string;
  instructor: string;
  slot_id: string;
  spots_available?: number;
};

export type SelectionStatus = "scheduled" | "manual" | "booked" | "failed";

export type BookedClassType = {
  id: string;
  class_id: string;
  slot_id: string;
  name: string;
  day: string;
  time: string;
  end_time: string;
  instructor: string;
  room_name: string;
  wait_position: string;
  waitlist_id: string;
  account_id: string;
};

export type SelectedClassType = {
  id: string;
  account_id: string;
  class_id: string;
  class_name: string;
  day: string;
  time: string;
  instructor: string;
  slot_id: string;
  status: SelectionStatus;
  attempted_at?: string | null;
  last_message?: string | null;
  created_at?: string;
};

type ClassContextType = {
  availableClasses: ClassType[];
  selectedClasses: SelectedClassType[];
  bookedClasses: BookedClassType[];
  loading: boolean;
  error: string | null;
  fetchAvailableClassesForWeek: (accountId: string, weekOffset?: number) => Promise<void>;
  fetchSelectedClasses: (accountId: string) => Promise<void>;
  fetchSelectedClassesForAccounts: (accountIds: string[]) => Promise<void>;
  fetchBookedClassesForAccounts: (accountIds: string[]) => Promise<void>;
  addSelectedClass: (
    accountId: string,
    classId: string,
    className: string,
    day: string,
    time: string,
    instructor: string,
    slotId: string
  ) => Promise<void>;
  removeSelectedClass: (selectionId: string, accountId: string) => Promise<void>;
  removeSelectedClasses: (selectionIds: string[], accountId: string) => Promise<void>;
  reserveSelections: (
    accountId: string,
    selectionIds: string[]
  ) => Promise<BookingResult[]>;
  clearSelections: () => void;
  clearError: () => void;
};

export type BookingResult = {
  selection_id: string;
  class_id: string;
  class_name: string;
  day: string;
  success: boolean;
  message?: string;
};

const ClassContext = createContext<ClassContextType | undefined>(undefined);


function formatDateForApi(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}


function getWeekStart(today: Date) {
  const currentDay = today.getDay();
  const weekStart = new Date(today);

  if (currentDay === 0) {
    weekStart.setDate(today.getDate() + 1);
    return weekStart;
  }

  weekStart.setDate(today.getDate() - (currentDay - 1));
  return weekStart;
}


function replaceSelectionsForAccount(
  allSelections: SelectedClassType[],
  accountId: string,
  nextSelections: SelectedClassType[]
) {
  const otherSelections = allSelections.filter((item) => item.account_id !== accountId);
  return [...otherSelections, ...nextSelections];
}


export function ClassProvider({ children }: { children: ReactNode }) {
  const [availableClasses, setAvailableClasses] = useState<ClassType[]>([]);
  const [selectedClasses, setSelectedClasses] = useState<SelectedClassType[]>([]);
  const [bookedClasses, setBookedClasses] = useState<BookedClassType[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAvailableClassesForWeek = useCallback(async (accountId: string, weekOffset = 0) => {
    const token = getSessionToken(accountId);
    if (!token) {
      setAvailableClasses([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const weekStart = getWeekStart(new Date());
      weekStart.setDate(weekStart.getDate() + weekOffset * 7);
      const requests = Array.from({ length: 7 }, (_, index) => {
        const date = new Date(weekStart);
        date.setDate(weekStart.getDate() + index);
        return getAvailableClasses(accountId, formatDateForApi(date), token);
      });

      const results = await Promise.all(requests);
      const allClasses = results.flatMap((result) => result.classes || []);
      setAvailableClasses(allClasses);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch classes");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSelectedClasses = useCallback(async (accountId: string) => {
    const token = getSessionToken(accountId);
    if (!token) {
      setSelectedClasses((prev) => prev.filter((item) => item.account_id !== accountId));
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await getSelectedClasses(accountId, token);
      setSelectedClasses((prev) => replaceSelectionsForAccount(prev, accountId, result));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch selected classes");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSelectedClassesForAccounts = useCallback(async (accountIds: string[]) => {
    setLoading(true);
    setError(null);
    try {
      const results = await Promise.all(
        accountIds.map(async (accountId) => {
          const token = getSessionToken(accountId);
          if (!token) {
            return { accountId, selections: [] as SelectedClassType[] };
          }

          const selections = await getSelectedClasses(accountId, token);
          return { accountId, selections };
        })
      );

      setSelectedClasses((prev) => {
        let nextState = prev.filter((item) => !accountIds.includes(item.account_id));
        for (const result of results) {
          nextState = [...nextState, ...result.selections];
        }
        return nextState;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch selected classes");
    } finally {
      setLoading(false);
    }
  }, []);

  const addSelectedClass = useCallback(async (
    accountId: string,
    classId: string,
    className: string,
    day: string,
    time: string,
    instructor: string,
    slotId: string
  ) => {
    const token = getSessionToken(accountId);
    if (!token) {
      throw new Error("Please log in to that account first");
    }

    setLoading(true);
    setError(null);
    try {
      const result = await selectClass(
        accountId,
        classId,
        className,
        day,
        time,
        instructor,
        slotId,
        token
      );
      setSelectedClasses((prev) => [...prev, result]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to select class";
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const removeSelectedClass = useCallback(async (selectionId: string, accountId: string) => {
    const token = getSessionToken(accountId);
    if (!token) {
      throw new Error("Please log in to that account first");
    }

    setLoading(true);
    setError(null);
    try {
      await deselectClass(selectionId, token);
      setSelectedClasses((prev) => prev.filter((item) => item.id !== selectionId));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to deselect class";
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const removeSelectedClasses = useCallback(async (selectionIds: string[], accountId: string) => {
    const token = getSessionToken(accountId);
    if (!token) {
      throw new Error("Please log in to that account first");
    }

    if (selectionIds.length === 0) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await Promise.all(selectionIds.map((selectionId) => deselectClass(selectionId, token)));
      setSelectedClasses((prev) =>
        prev.filter((item) => !selectionIds.includes(item.id))
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to deselect classes";
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchBookedClassesForAccounts = useCallback(async (accountIds: string[]) => {
    setLoading(true);
    setError(null);
    try {
      const results = await Promise.all(
        accountIds.map(async (accountId) => {
          const token = getSessionToken(accountId);
          if (!token) {
            return { accountId, bookings: [] as BookedClassType[] };
          }

          const response = await getBookedClasses(accountId, token);
          const bookings = (response.bookings || []).map(
            (item: Omit<BookedClassType, "account_id">) => ({
              ...item,
              account_id: accountId,
            })
          ) as BookedClassType[];
          return { accountId, bookings };
        })
      );

      setBookedClasses((prev) => {
        let nextState = prev.filter((item) => !accountIds.includes(item.account_id));
        for (const result of results) {
          nextState = [...nextState, ...result.bookings];
        }
        return nextState;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch booked classes");
    } finally {
      setLoading(false);
    }
  }, []);

  const reserveSelections = useCallback(
    async (accountId: string, selectionIds: string[]): Promise<BookingResult[]> => {
      const token = getSessionToken(accountId);
      if (!token) {
        throw new Error("Please log in to that account first");
      }

      if (selectionIds.length === 0) {
        return [];
      }

      setLoading(true);
      setError(null);
      try {
        const response = await bookClasses(accountId, token, selectionIds);
        const refreshed = await getSelectedClasses(accountId, token);
        setSelectedClasses((prev) =>
          replaceSelectionsForAccount(prev, accountId, refreshed)
        );
        return (response.bookings || []) as BookingResult[];
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to reserve classes";
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const value = {
    availableClasses,
    selectedClasses,
    bookedClasses,
    loading,
    error,
    fetchAvailableClassesForWeek,
    fetchSelectedClasses,
    fetchSelectedClassesForAccounts,
    fetchBookedClassesForAccounts,
    addSelectedClass,
    removeSelectedClass,
    removeSelectedClasses,
    reserveSelections,
    clearSelections: () => setSelectedClasses([]),
    clearError: () => setError(null),
  };

  return <ClassContext.Provider value={value}>{children}</ClassContext.Provider>;
}


export function useClasses() {
  const context = useContext(ClassContext);
  if (context === undefined) {
    throw new Error("useClasses must be used within a ClassProvider");
  }
  return context;
}
