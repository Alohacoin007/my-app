"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message ?? "Login failed");
        return;
      }
      router.push(next);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="px-5 pt-6">
      <Field
        label="Email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={setEmail}
      />
      <Field
        label="Password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={setPassword}
      />
      {error && <p className="mt-2 text-sm font-semibold text-down">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="mt-5 w-full rounded-lg bg-brand py-3 text-sm font-bold text-white disabled:opacity-60"
      >
        {submitting ? "Logging in…" : "Log in"}
      </button>
      <p className="mt-4 text-center text-sm text-ink-mid">
        New here?{" "}
        <Link href="/signup" className="font-bold text-brand">
          Create an account
        </Link>
      </p>
      <p className="mt-3 rounded-lg border border-ink-line bg-surface-soft px-3 py-2 text-[12px] text-ink-mid">
        Demo login: <b>demo@alohabet.dev</b> / <b>demo1234</b> · Admin:{" "}
        <b>admin@alohabet.dev</b> / <b>admin1234</b>
      </p>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  type,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type: string;
  autoComplete?: string;
}) {
  return (
    <label className="mt-4 block">
      <span className="text-[11px] font-bold uppercase tracking-wider text-ink-mid">
        {label}
      </span>
      <input
        type={type}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-ink-line bg-white px-3 py-2.5 text-sm focus:border-brand focus:outline-none"
        required
      />
    </label>
  );
}
