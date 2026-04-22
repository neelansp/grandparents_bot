import { type SelectedClassType, type SelectionStatus } from "@/lib/classStore";

type SelectedClassesPreviewProps = {
  classes: SelectedClassType[];
  loading?: boolean;
  onDeselectClass: (selectionId: string) => Promise<void> | void;
  onDeselectAll: () => Promise<void> | void;
};

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


export default function SelectedClassesPreview({
  classes,
  loading = false,
  onDeselectClass,
  onDeselectAll,
}: SelectedClassesPreviewProps) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 sm:gap-3">
        <h2 className="text-lg sm:text-xl text-black font-semibold">Selected Classes</h2>

        <button
          type="button"
          onClick={onDeselectAll}
          disabled={loading || classes.length === 0}
          className="rounded-lg border border-gray-300 px-3 py-2 text-xs sm:text-sm text-black disabled:opacity-50"
        >
          Deselect All
        </button>
      </div>

      {classes.length === 0 ? (
        <p className="text-sm text-gray-500">No classes selected yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {classes.map((workoutClass) => (
            <label
              key={`${workoutClass.account_id}-${workoutClass.id}`}
              className="flex items-start gap-3 rounded-lg bg-gray-50 p-3 text-black"
            >
              <input
                type="checkbox"
                checked
                disabled={loading || workoutClass.status === "booked"}
                onChange={() => onDeselectClass(workoutClass.id)}
                className="mt-1 h-4 w-4"
              />

              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium">{workoutClass.class_name}</p>
                  <span
                    className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${statusBadgeClasses(workoutClass.status)}`}
                  >
                    {statusLabel(workoutClass.status)}
                  </span>
                </div>
                <p className="text-sm text-gray-600">{workoutClass.day}</p>
                <p className="text-sm text-gray-600">{workoutClass.time}</p>
              </div>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
