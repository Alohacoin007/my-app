"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SettleForm({ matchId }: { matchId: string }) {
  const router = useRouter();
  const [away, setAway] = useState("");
  const [home, setHome] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/matches/${matchId}/settle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          homeScore: parseInt(home, 10),
          awayScore: parseInt(away, 10),
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.message ?? "Failed to settle");
        return;
      }
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-2 flex items-center gap-2">
      <input
        inputMode="numeric"
        placeholder="Away"
        value={away}
        onChange={(e) => setAway(e.target.value.replace(/[^0-9]/g, ""))}
        className="w-16 rounded-md border border-ink-line px-2 py-1 text-sm"
        required
      />
      <span className="text-ink-mid">@</span>
      <input
        inputMode="numeric"
        placeholder="Home"
        value={home}
        onChange={(e) => setHome(e.target.value.replace(/[^0-9]/g, ""))}
        className="w-16 rounded-md border border-ink-line px-2 py-1 text-sm"
        required
      />
      <button
        type="submit"
        disabled={submitting}
        className="ml-auto rounded-md bg-ink px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"
      >
        Settle
      </button>
      {error && <span className="text-xs text-down">{error}</span>}
    </form>
  );
}
