type SearchBarProps = {
  value: string;
  onChange: (value: string) => void;
};

export default function SearchBar({ value, onChange }: SearchBarProps) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm text-black font-medium">Search classes</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search by class name"
        className="rounded-lg border text-black border-gray-300 p-2"
      />
    </div>
  );
}