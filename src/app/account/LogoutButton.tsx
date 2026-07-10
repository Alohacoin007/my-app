"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  return (
    <button
      onClick={async () => {
        setSubmitting(true);
        await fetch("/api/auth/logout", { method: "POST" });
        router.push("/");
        router.refresh();
      }}
      disabled={submitting}
      className="w-full rounded-lg border border-ink-line bg-white py-3 text-sm font-bold text-ink disabled:opacity-60"
    >
      {submitting ? "Logging out…" : "Log out"}
    </button>
  );
}
