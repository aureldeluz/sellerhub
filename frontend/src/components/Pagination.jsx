import { ChevronLeft, ChevronRight } from "lucide-react";

export default function Pagination({ skip, limit, total, onChange, testid = "pagination" }) {
  if (total <= limit) return null;
  const page = Math.floor(skip / limit) + 1;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const goto = (p) => onChange(Math.max(0, (p - 1) * limit));
  return (
    <div data-testid={testid} className="flex items-center justify-between gap-3 px-1 py-3 text-sm text-zinc-400">
      <div>
        Showing <span className="text-white">{skip + 1}–{Math.min(skip + limit, total)}</span> of{" "}
        <span className="text-white">{total}</span>
      </div>
      <div className="flex items-center gap-1">
        <button
          data-testid={`${testid}-prev`}
          disabled={page <= 1}
          onClick={() => goto(page - 1)}
          className="h-8 w-8 rounded-md bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="px-3 h-8 flex items-center text-xs uppercase tracking-wider">
          Page <span className="ml-1 text-[#FFC83D] font-semibold">{page}</span> / {totalPages}
        </div>
        <button
          data-testid={`${testid}-next`}
          disabled={page >= totalPages}
          onClick={() => goto(page + 1)}
          className="h-8 w-8 rounded-md bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
