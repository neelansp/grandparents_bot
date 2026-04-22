"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useAccounts } from "@/lib/accountStore";
import {
  useClasses,
  type BookedClassType,
  type SelectedClassType,
  type SelectionStatus,
} from "@/lib/classStore";


const RESERVATION_LEAD_DAYS = 5;


function formatDateForApi(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}


function getPlanningWeekStart(weekOffset: number) {
  const today = new Date();
  const currentDay = today.getDay();
  const monday = new Date(today);

  if (currentDay === 0) {
    monday.setDate(today.getDate() + 1);
  } else {
    monday.setDate(today.getDate() - (currentDay - 1));
  }

  monday.setDate(monday.getDate() + weekOffset * 7);
  return monday;
}


function getPlanningWeek(weekOffset: number) {
  const monday = getPlanningWeekStart(weekOffset);

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return {
      label: date.toLocaleDateString("en-US", { weekday: "long" }),
      date: formatDateForApi(date),
      prettyDate: date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
    };
  });
}


function formatWeekRange(week: ReturnType<typeof getPlanningWeek>) {
  if (week.length === 0) {
    return "";
  }

  const firstDate = new Date(`${week[0].date}T00:00:00`);
  const lastDate = new Date(`${week[week.length - 1].date}T00:00:00`);

  const firstLabel = firstDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  const lastLabel = lastDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return `${firstLabel} - ${lastLabel}`;
}


function parseClassDateTime(day: string, time: string): Date | null {
  if (!day || !time) {
    return null;
  }
  const trimmed = time.trim();
  const candidates = [
    `${day}T${trimmed.length === 5 ? `${trimmed}:00` : trimmed}`,
  ];

  for (const candidate of candidates) {
    const parsed = new Date(candidate);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return null;
}


function getReservationOpenAt(day: string, time: string): Date | null {
  const classDate = parseClassDateTime(day, time);
  if (!classDate) {
    return null;
  }
  const open = new Date(classDate);
  open.setDate(open.getDate() - RESERVATION_LEAD_DAYS);
  return open;
}


function formatOpensAt(open: Date): string {
  return open.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}


function statusBadgeClasses(status: SelectionStatus): string {
  switch (status) {
    case "booked":
      return "bg-green-100 text-green-800 border-green-200";
    case "failed":
      return "bg-red-100 text-red-800 border-red-200";
    case "manual":
      return "bg-amber-100 text-amber-800 border-amber-200";
    case "scheduled":
    default:
      return "bg-blue-100 text-blue-800 border-blue-200";
  }
}


function statusLabel(status: SelectionStatus): string {
  switch (status) {
    case "booked":
      return "Booked";
    case "failed":
      return "Failed";
    case "manual":
      return "Manual";
    case "scheduled":
    default:
      return "Scheduled";
  }
}


function ReviewPageContent() {
  const {
    authenticatedAccounts,
    initialized,
    loading: accountLoading,
    error: accountError,
  } = useAccounts();
  const {
    selectedClasses,
    bookedClasses,
    fetchSelectedClassesForAccounts,
    fetchBookedClassesForAccounts,
    reserveSelections,
  } = useClasses();

  const [error, setError] = useState<string | null>(null);
  const [reservingId, setReservingId] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);

  const planningWeek = useMemo(() => getPlanningWeek(weekOffset), [weekOffset]);
  const weekRangeLabel = useMemo(() => formatWeekRange(planningWeek), [planningWeek]);
  const displayedWeekDates = useMemo(
    () => new Set(planningWeek.map((day) => day.date)),
    [planningWeek]
  );

  useEffect(() => {
    if (authenticatedAccounts.length === 0) {
      return;
    }

    const accountIds = authenticatedAccounts.map((account) => account.id);
    fetchSelectedClassesForAccounts(accountIds);
    fetchBookedClassesForAccounts(accountIds);
  }, [authenticatedAccounts, fetchSelectedClassesForAccounts, fetchBookedClassesForAccounts]);

  const pendingSelections = useMemo(
    () =>
      selectedClasses.filter(
        (item) => item.status !== "booked" && displayedWeekDates.has(item.day)
      ),
    [selectedClasses, displayedWeekDates]
  );

  const bookedForWeek = useMemo(
    () => bookedClasses.filter((item) => displayedWeekDates.has(item.day)),
    [bookedClasses, displayedWeekDates]
  );

  async function handleReserveNow(selection: SelectedClassType) {
    setError(null);
    setResultMessage(null);
    setReservingId(selection.id);
    try {
      const results = await reserveSelections(selection.account_id, [selection.id]);
      const result = results[0];
      if (!result) {
        setError("No response from booking service.");
        return;
      }
      if (result.success) {
        setResultMessage(
          `Reserved ${selection.class_name} on ${selection.day}: ${result.message || "Success."}`
        );
      } else {
        setError(
          `Could not reserve ${selection.class_name} on ${selection.day}: ${result.message || "Unknown error."}`
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reserve failed");
    } finally {
      setReservingId(null);
    }
  }

  if (!initialized || accountLoading || authenticatedAccounts.length === 0) {
    if (initialized && !accountLoading && authenticatedAccounts.length === 0) {
      return (
        <main className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
          <div className="rounded-lg bg-red-50 p-4 text-sm text-red-800">
            {accountError || "No accounts are available for review."}
          </div>
        </main>
      );
    }

    return (
      <main className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 p-3 sm:p-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:gap-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl text-black font-bold">Weekly Review</h1>
            <p className="mt-1 sm:mt-2 text-gray-600 text-sm sm:text-base">
              Auto-booking fires 5 days before each class. Use Reserve Now for classes less than 5 days away.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 sm:flex-nowrap sm:gap-3 sm:justify-start">
            <button
              type="button"
              onClick={() => setWeekOffset((current) => current - 1)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-black"
              aria-label="Previous week"
            >
              ←
            </button>

            <div className="flex-1 sm:flex-none sm:min-w-37.5 text-center text-sm font-medium text-black">
              {weekRangeLabel}
            </div>

            <button
              type="button"
              onClick={() => setWeekOffset((current) => current + 1)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-black"
              aria-label="Next week"
            >
              →
            </button>

            <Link
              href="/planner"
              className="w-full sm:w-auto text-center rounded-lg border border-gray-300 bg-black px-4 py-2 text-white text-sm"
            >
              Back to Planner
            </Link>
          </div>
        </div>

        {resultMessage && (
          <div className="rounded-2xl border border-green-300 bg-green-50 p-4 text-green-800 text-sm">
            {resultMessage}
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-red-300 bg-red-50 p-4 text-red-800 text-sm">
            {error}
          </div>
        )}

        <SelectionsGrid
          title="Scheduled"
          subtitle="Pending auto-book at T-5 days, or awaiting manual reservation."
          accounts={authenticatedAccounts}
          week={planningWeek}
          selections={pendingSelections}
          onReserveNow={handleReserveNow}
          reservingId={reservingId}
          emptyText="Nothing pending in this week."
        />

        <BookedGrid
          title="Booked"
          subtitle="Pulled from your Upace upcoming reservations."
          accounts={authenticatedAccounts}
          week={planningWeek}
          bookings={bookedForWeek}
          emptyText="No Upace reservations for this week."
        />
      </div>
    </main>
  );
}


type SelectionsGridProps = {
  title: string;
  subtitle: string;
  accounts: { id: string; name: string }[];
  week: ReturnType<typeof getPlanningWeek>;
  selections: SelectedClassType[];
  emptyText: string;
  readOnly?: boolean;
  onReserveNow?: (selection: SelectedClassType) => void;
  reservingId?: string | null;
};


function SelectionCard({
  workoutClass,
  readOnly,
  onReserveNow,
  reservingId,
}: {
  workoutClass: SelectedClassType;
  readOnly: boolean;
  onReserveNow?: (selection: SelectedClassType) => void;
  reservingId?: string | null;
}) {
  const opensAt = getReservationOpenAt(workoutClass.day, workoutClass.time);
  const isReserving = reservingId === workoutClass.id;

  return (
    <div className="rounded-lg bg-white p-3 border border-gray-200 text-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium text-black">{workoutClass.class_name}</p>
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${statusBadgeClasses(workoutClass.status)}`}
        >
          {statusLabel(workoutClass.status)}
        </span>
      </div>
      <p className="mt-1 text-xs text-gray-600">{workoutClass.time}</p>
      {workoutClass.status === "scheduled" && opensAt && (
        <p className="mt-1 text-xs text-gray-500">
          Auto-books at {formatOpensAt(opensAt)}
        </p>
      )}
      {workoutClass.last_message && (
        <p className="mt-1 text-xs text-gray-500">{workoutClass.last_message}</p>
      )}
      {!readOnly && onReserveNow && workoutClass.status !== "scheduled" && (
        <button
          type="button"
          onClick={() => onReserveNow(workoutClass)}
          disabled={isReserving}
          className="mt-2 w-full rounded-md bg-black px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          {isReserving ? "Reserving..." : "Reserve Now"}
        </button>
      )}
    </div>
  );
}


function SelectionsGrid({
  title,
  subtitle,
  accounts,
  week,
  selections,
  emptyText,
  readOnly = false,
  onReserveNow,
  reservingId,
}: SelectionsGridProps) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-6 shadow-sm">
      <div className="mb-4">
        <h2 className="text-lg sm:text-xl font-semibold text-black">{title}</h2>
        <p className="text-xs sm:text-sm text-gray-600">{subtitle}</p>
      </div>

      {selections.length === 0 ? (
        <p className="text-sm text-gray-500">{emptyText}</p>
      ) : (
        <>
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-gray-300">
                  <th className="px-4 py-2 text-left text-black font-semibold">Day</th>
                  {accounts.map((account) => (
                    <th
                      key={account.id}
                      className="px-4 py-2 text-left text-black font-semibold"
                    >
                      {account.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {week.map((day) => (
                  <tr key={day.date} className="border-b border-gray-200">
                    <td className="px-4 py-3 align-top text-black font-medium">
                      <div>{day.label}</div>
                      <div className="text-xs text-gray-500">{day.prettyDate}</div>
                    </td>

                    {accounts.map((account) => {
                      const dayClasses = selections.filter(
                        (item) =>
                          item.account_id === account.id && item.day === day.date
                      );

                      return (
                        <td
                          key={`${account.id}-${day.date}`}
                          className="px-4 py-3 bg-gray-50 align-top"
                        >
                          {dayClasses.length === 0 ? (
                            <p className="text-sm text-gray-400">—</p>
                          ) : (
                            <div className="flex flex-col gap-2">
                              {dayClasses.map((workoutClass) => (
                                <SelectionCard
                                  key={workoutClass.id}
                                  workoutClass={workoutClass}
                                  readOnly={readOnly}
                                  onReserveNow={onReserveNow}
                                  reservingId={reservingId}
                                />
                              ))}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="md:hidden flex flex-col gap-4">
            {week.map((day) => {
              const dayClasses = selections.filter((item) => item.day === day.date);
              if (dayClasses.length === 0) {
                return null;
              }
              return (
                <div key={day.date} className="flex flex-col gap-2">
                  <div className="text-sm font-semibold text-black">
                    {day.label}
                    <span className="ml-2 text-xs font-normal text-gray-500">
                      {day.prettyDate}
                    </span>
                  </div>
                  <div className="flex flex-col gap-2">
                    {accounts.map((account) => {
                      const accountClasses = dayClasses.filter(
                        (item) => item.account_id === account.id
                      );
                      if (accountClasses.length === 0) {
                        return null;
                      }
                      return (
                        <div key={account.id} className="flex flex-col gap-2">
                          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                            {account.name}
                          </div>
                          {accountClasses.map((workoutClass) => (
                            <SelectionCard
                              key={workoutClass.id}
                              workoutClass={workoutClass}
                              readOnly={readOnly}
                              onReserveNow={onReserveNow}
                              reservingId={reservingId}
                            />
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}


type BookedGridProps = {
  title: string;
  subtitle: string;
  accounts: { id: string; name: string }[];
  week: ReturnType<typeof getPlanningWeek>;
  bookings: BookedClassType[];
  emptyText: string;
};


function BookedCard({ booking }: { booking: BookedClassType }) {
  const isWaitlist = !booking.id && !!booking.waitlist_id;
  return (
    <div className="rounded-lg bg-white p-3 border border-gray-200 text-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium text-black">{booking.name}</p>
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${
            isWaitlist
              ? "bg-amber-100 text-amber-800 border-amber-200"
              : "bg-green-100 text-green-800 border-green-200"
          }`}
        >
          {isWaitlist ? `Waitlist #${booking.wait_position}` : "Booked"}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600">
        <span>{booking.time}{booking.end_time ? ` – ${booking.end_time}` : ""}</span>
        {booking.instructor && <span>{booking.instructor}</span>}
        {booking.room_name && <span>{booking.room_name}</span>}
      </div>
    </div>
  );
}


function BookedGrid({
  title,
  subtitle,
  accounts,
  week,
  bookings,
  emptyText,
}: BookedGridProps) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-6 shadow-sm">
      <div className="mb-4">
        <h2 className="text-lg sm:text-xl font-semibold text-black">{title}</h2>
        <p className="text-xs sm:text-sm text-gray-600">{subtitle}</p>
      </div>

      {bookings.length === 0 ? (
        <p className="text-sm text-gray-500">{emptyText}</p>
      ) : (
        <>
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-gray-300">
                  <th className="px-4 py-2 text-left text-black font-semibold">Day</th>
                  {accounts.map((account) => (
                    <th
                      key={account.id}
                      className="px-4 py-2 text-left text-black font-semibold"
                    >
                      {account.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {week.map((day) => (
                  <tr key={day.date} className="border-b border-gray-200">
                    <td className="px-4 py-3 align-top text-black font-medium">
                      <div>{day.label}</div>
                      <div className="text-xs text-gray-500">{day.prettyDate}</div>
                    </td>

                    {accounts.map((account) => {
                      const dayBookings = bookings.filter(
                        (item) =>
                          item.account_id === account.id && item.day === day.date
                      );

                      return (
                        <td
                          key={`${account.id}-${day.date}`}
                          className="px-4 py-3 bg-gray-50 align-top"
                        >
                          {dayBookings.length === 0 ? (
                            <p className="text-sm text-gray-400">—</p>
                          ) : (
                            <div className="flex flex-col gap-2">
                              {dayBookings.map((booking, index) => (
                                <BookedCard
                                  key={`${booking.id || booking.waitlist_id}-${index}`}
                                  booking={booking}
                                />
                              ))}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="md:hidden flex flex-col gap-4">
            {week.map((day) => {
              const dayBookings = bookings.filter((item) => item.day === day.date);
              if (dayBookings.length === 0) {
                return null;
              }
              return (
                <div key={day.date} className="flex flex-col gap-2">
                  <div className="text-sm font-semibold text-black">
                    {day.label}
                    <span className="ml-2 text-xs font-normal text-gray-500">
                      {day.prettyDate}
                    </span>
                  </div>
                  <div className="flex flex-col gap-2">
                    {accounts.map((account) => {
                      const accountBookings = dayBookings.filter(
                        (item) => item.account_id === account.id
                      );
                      if (accountBookings.length === 0) {
                        return null;
                      }
                      return (
                        <div key={account.id} className="flex flex-col gap-2">
                          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                            {account.name}
                          </div>
                          {accountBookings.map((booking, index) => (
                            <BookedCard
                              key={`${booking.id || booking.waitlist_id}-${index}`}
                              booking={booking}
                            />
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}


export default function ReviewPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
          <div className="text-gray-600">Loading...</div>
        </main>
      }
    >
      <ReviewPageContent />
    </Suspense>
  );
}
