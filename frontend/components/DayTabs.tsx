type DayTabsProps = {
  days: string[];
  selectedDay: string;
  onChange: (day: string) => void;
};

export default function DayTabs({
  days,
  selectedDay,
  onChange,
}: DayTabsProps) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
      {days.map((day) => (
        <button
          key={day}
          onClick={() => onChange(day)}
          className={`w-full rounded-lg px-4 py-2 text-sm font-medium border ${
            selectedDay === day
              ? "bg-black text-white border-black"
              : "bg-white text-black border-gray-300"
          }`}
        >
          {day}
        </button>
      ))}
    </div>
  );
}
