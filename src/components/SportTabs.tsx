"use client";

import { useRouter, useSearchParams } from "next/navigation";

type Tab = { key: string; label: string; count: number };

export function SportTabs({ tabs, active }: { tabs: Tab[]; active: string }) {
  const router = useRouter();
  const params = useSearchParams();

  function go(key: string) {
    const sp = new URLSearchParams(params.toString());
    if (key === "ALL") sp.delete("tab");
    else sp.set("tab", key);
    router.replace(`/?${sp.toString()}`);
  }

  return (
    <div className="flex gap-2 overflow-x-auto px-4 pb-1 pt-1 [&::-webkit-scrollbar]:hidden">
      {tabs.map((t) => {
        const isActive = t.key === active;
        return (
          <button
            key={t.key}
            onClick={() => go(t.key)}
            className={`pill whitespace-nowrap ${isActive ? "pill-active" : ""}`}
          >
            {t.key === "FAV" && <StarIcon active={isActive} />}
            <span>{t.label}</span>
            <span className="pill-count">{t.count}</span>
          </button>
        );
      })}
    </div>
  );
}

function StarIcon({ active }: { active: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill={active ? "white" : "#0f172a"}>
      <path d="m12 3 2.7 5.7 6.3.6-4.8 4.3 1.4 6.2L12 16.9 6.4 19.8l1.4-6.2L3 9.3l6.3-.6L12 3Z" />
    </svg>
  );
}
