import { AccountType } from "@/lib/accountStore";

type AccountSwitcherProps = {
  accounts: AccountType[];
  selectedAccountId: string;
  onChange: (accountId: string) => void;
};

export default function AccountSwitcher({
  accounts,
  selectedAccountId,
  onChange,
}: AccountSwitcherProps) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm text-black font-medium">Account</label>
      <select
        value={selectedAccountId}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border text-black border-gray-300 p-2"
      >
        {accounts.map((account) => (
          <option key={account.id} value={account.id}>
            {account.name}
          </option>
        ))}
      </select>
    </div>
  );
}
