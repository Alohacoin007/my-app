"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";

export function SignupForm() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName, email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message ?? "Signup failed");
        return;
      }
      router.push("/");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="px-5 pt-6">
      <Field label="Display name" value={displayName} onChange={setDisplayName} />
      <Field label="Email" type="email" value={email} onChange={setEmail} />
      <Field
        label="Password (min 8)"
        type="password"
        value={password}
        onChange={setPassword}
      />
      {error && <p className="mt-2 text-sm font-semibold text-down">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="mt-5 w-full rounded-lg bg-brand py-3 text-sm font-bold text-white disabled:opacity-60"
      >
        {submitting ? "Creating…" : "Create account"}
      </button>
      <p className="mt-4 text-center text-sm text-ink-mid">
        Already have an account?{" "}
        <Link href="/login" className="font-bold text-brand">
          Log in
        </Link>
      </p>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="mt-4 block">
      <span className="text-[11px] font-bold uppercase tracking-wider text-ink-mid">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-ink-line bg-white px-3 py-2.5 text-sm focus:border-brand focus:outline-none"
        required
        minLength={type === "password" ? 8 : 1}
      />
    </label>
  );
}
