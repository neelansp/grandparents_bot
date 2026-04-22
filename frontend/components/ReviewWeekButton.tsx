import Link from "next/link";

type ReviewWeekButtonProps = {
  accountId: string;
};

export default function ReviewWeekButton({
  accountId,
}: ReviewWeekButtonProps) {
  return (
    <Link
      href={`/review?accountId=${accountId}`}
      className="inline-flex w-full sm:w-auto items-center justify-center rounded-lg bg-black px-4 py-2 text-white text-sm sm:text-base"
    >
      Review Classes for the Week
    </Link>
  );
}