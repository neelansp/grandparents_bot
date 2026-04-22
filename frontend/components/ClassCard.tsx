import { ClassType } from "@/lib/classStore";

type ClassCardProps = {
  workoutClass: ClassType;
  checked: boolean;
  onToggle: () => void;
};

export default function ClassCard({
  workoutClass,
  checked,
  onToggle,
}: ClassCardProps) {
  return (
    <div className="rounded-xl border border-gray-200 p-3 sm:p-4 shadow-sm bg-white">
      <div className="flex items-start justify-between gap-3 sm:gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="text-base sm:text-lg text-black font-semibold">{workoutClass.name}</h3>
          <p className="text-xs sm:text-sm text-gray-600">
            Instructor: {workoutClass.instructor}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-sm">
            <span className="text-gray-600">Time: {workoutClass.time}</span>
            <span className="text-gray-500">Day: {workoutClass.day}</span>
            <span className="text-black">
              Spots available: {workoutClass.spots_available ?? 0}
            </span>
          </div>
        </div>

        <label className="flex shrink-0 items-center gap-2 text-black text-sm font-medium">
          <input
            type="checkbox"
            checked={checked}
            onChange={onToggle}
            className="h-4 w-4"
          />
          Select
        </label>
      </div>
    </div>
  );
}