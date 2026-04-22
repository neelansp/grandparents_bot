import { ClassType } from "@/lib/classStore";
import ClassCard from "./ClassCard";

type ClassListProps = {
  classes: ClassType[];
  isSelected: (classId: string, day: string) => boolean;
  onToggleClass: (workoutClass: ClassType) => void;
};

export default function ClassList({
  classes,
  isSelected,
  onToggleClass,
}: ClassListProps) {
  if (classes.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-gray-500">
        No classes found for this day or search.
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {classes.map((workoutClass) => (
        <ClassCard
          key={`${workoutClass.id}-${workoutClass.day}`}
          workoutClass={workoutClass}
          checked={isSelected(workoutClass.id, workoutClass.day)}
          onToggle={() => onToggleClass(workoutClass)}
        />
      ))}
    </div>
  );
}
