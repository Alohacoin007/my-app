"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type Selection = {
  matchId: string;
  matchLabel: string; // "Cleveland Cavaliers @ New York Knicks"
  pickLabel: string;  // "Cleveland Cavaliers"
  market: "MONEYLINE" | "SPREAD" | "TOTAL";
  pick: "HOME" | "AWAY" | "OVER" | "UNDER";
  line: number | null;
  americanOdds: number;
};

type Ctx = {
  selections: Selection[];
  add: (s: Selection) => void;
  remove: (matchId: string, market: Selection["market"]) => void;
  clear: () => void;
  isSelected: (matchId: string, market: Selection["market"], pick: Selection["pick"]) => boolean;
  open: boolean;
  setOpen: (v: boolean) => void;
};

const BetSlipCtx = createContext<Ctx | null>(null);

const STORAGE_KEY = "alohabet.slip.v1";

export function BetSlipProvider({ children }: { children: React.ReactNode }) {
  const [selections, setSelections] = useState<Selection[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setSelections(JSON.parse(raw));
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(selections));
    } catch {}
  }, [selections]);

  const add = useCallback((s: Selection) => {
    setSelections((prev) => {
      // one selection per (match, market): re-picking another side replaces it
      const filtered = prev.filter(
        (p) => !(p.matchId === s.matchId && p.market === s.market)
      );
      return [...filtered, s];
    });
    setOpen(true);
  }, []);

  const remove = useCallback((matchId: string, market: Selection["market"]) => {
    setSelections((prev) =>
      prev.filter((p) => !(p.matchId === matchId && p.market === market))
    );
  }, []);

  const clear = useCallback(() => setSelections([]), []);

  const isSelected = useCallback(
    (matchId: string, market: Selection["market"], pick: Selection["pick"]) =>
      selections.some(
        (s) => s.matchId === matchId && s.market === market && s.pick === pick
      ),
    [selections]
  );

  const value = useMemo<Ctx>(
    () => ({ selections, add, remove, clear, isSelected, open, setOpen }),
    [selections, add, remove, clear, isSelected, open]
  );

  return <BetSlipCtx.Provider value={value}>{children}</BetSlipCtx.Provider>;
}

export function useBetSlip() {
  const ctx = useContext(BetSlipCtx);
  if (!ctx) throw new Error("BetSlipProvider missing");
  return ctx;
}
