"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

export function SearchBar({ initial = "" }: { initial?: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [value, setValue] = useState(initial);
  const [, startTransition] = useTransition();

  function submit(next: string) {
    const sp = new URLSearchParams(params.toString());
    if (next) sp.set("q", next);
    else sp.delete("q");
    startTransition(() => router.replace(`/?${sp.toString()}`));
  }

  return (
    <div className="flex items-center gap-2 px-4">
      <label className="flex flex-1 items-center gap-2 rounded-lg bg-surface-chip px-3 py-2.5">
        <SearchIcon />
        <input
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            submit(e.target.value);
          }}
          placeholder="Search team or matchup…"
          className="w-full bg-transparent text-sm text-ink placeholder:text-ink-soft focus:outline-none"
        />
      </label>
      <button
        type="button"
        className="flex h-10 w-10 items-center justify-center rounded-lg bg-ink text-white"
        aria-label="Add to watchlist"
      >
        <PlusIcon />
      </button>
    </div>
  );
}

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <circle cx="11" cy="11" r="6.5" stroke="#64748b" strokeWidth="2" />
      <path
        d="m20 20-3.5-3.5"
        stroke="#64748b"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 5v14M5 12h14"
        stroke="white"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
