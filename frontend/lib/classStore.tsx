// React context for class data.
//
// Holds three lists:
//   - availableClasses: classes Upace offers for the week being viewed
//   - selectedClasses:  rows the user saved (to be auto-booked later)
//   - bookedClasses:    confirmed reservations pulled live from Upace
//
// Pages call hooks like fetchAvailableClassesForWeek() which call the
// backend and put the result in state.

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

export type BookingResult = {
  selection_id: string;
  class_id: string;
  class_name: string;
  day: string;
  success: boolean;
  message?: string;
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
  reserveSelections: (accountId: string, selectionIds: string[]) => Promise<BookingResult[]>;
  clearSelections: () => void;
  clearError: () => void;
};


const ClassContext = createContext<ClassContextType | undefined>(undefined);


// Helper: turn a JS Date into "YYYY-MM-DD" for the backend.
function formatDateForApi(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}


// Helper: get the Monday of the current week (or future/past week).
function getWeekStart(today: Date) {
  const currentDay = today.getDay();
  const weekStart = new Date(today);

  if (currentDay === 0) {
    // Sunday — jump forward to tomorrow's Monday.
    weekStart.setDate(today.getDate() + 1);
  } else {
    // Any other day — rewind to this week's Monday.
    weekStart.setDate(today.getDate() - (currentDay - 1));
  }

  return weekStart;
}


// Helper: replace one account's selections in the combined list.
function replaceSelectionsForAccount(
  allSelections: SelectedClassType[],
  accountId: string,
  nextSelections: SelectedClassType[]
) {
  const others = allSelections.filter((item) => item.account_id !== accountId);
  return [...others, ...nextSelections];
}


export function ClassProvider({ children }: { children: ReactNode }) {
  const [availableClasses, setAvailableClasses] = useState<ClassType[]>([]);
  const [selectedClasses, setSelectedClasses] = useState<SelectedClassType[]>([]);
  const [bookedClasses, setBookedClasses] = useState<BookedClassType[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);


  const fetchAvailableClassesForWeek = useCallback(async (accountId: string, weekOffset = 0) => {
    setLoading(true);
    setError(null);
    try {
      // Figure out the 7 dates in the week we want to show.
      const weekStart = getWeekStart(new Date());
      weekStart.setDate(weekStart.getDate() + weekOffset * 7);

      const requests = [];
      for (let index = 0; index < 7; index++) {
        const date = new Date(weekStart);
        date.setDate(weekStart.getDate() + index);
        requests.push(getAvailableClasses(accountId, formatDateForApi(date)));
      }

      // Run all 7 requests in parallel, then flatten into a single list.
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
    setLoading(true);
    setError(null);
    try {
      const result = await getSelectedClasses(accountId);
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
          const selections = await getSelectedClasses(accountId);
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
    setLoading(true);
    setError(null);
    try {
      const result = await selectClass(
        accountId, classId, className, day, time, instructor, slotId
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


  const removeSelectedClass = useCallback(async (selectionId: string, _accountId: string) => {
    setLoading(true);
    setError(null);
    try {
      await deselectClass(selectionId);
      setSelectedClasses((prev) => prev.filter((item) => item.id !== selectionId));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to deselect class";
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);


  const removeSelectedClasses = useCallback(async (selectionIds: string[], _accountId: string) => {
    if (selectionIds.length === 0) return;

    setLoading(true);
    setError(null);
    try {
      await Promise.all(selectionIds.map((id) => deselectClass(id)));
      setSelectedClasses((prev) => prev.filter((item) => !selectionIds.includes(item.id)));
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
          const response = await getBookedClasses(accountId);
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
      if (selectionIds.length === 0) return [];

      setLoading(true);
      setError(null);
      try {
        const response = await bookClasses(accountId, selectionIds);
        // Refresh the selected list so their status (booked/failed) shows up.
        const refreshed = await getSelectedClasses(accountId);
        setSelectedClasses((prev) => replaceSelectionsForAccount(prev, accountId, refreshed));
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


  const value: ClassContextType = {
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
