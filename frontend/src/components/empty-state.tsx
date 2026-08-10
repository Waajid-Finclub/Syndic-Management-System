import { Inbox } from "lucide-react";

export function EmptyState({ message = "No records found" }: { message?: string }) {
  return (
    <div className="grid place-items-center gap-2 py-12 text-center text-[var(--cmt)]">
      <Inbox size={28} />
      <p className="text-sm font-semibold">{message}</p>
    </div>
  );
}
