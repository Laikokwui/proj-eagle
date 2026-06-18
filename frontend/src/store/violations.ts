import { create } from "zustand";

interface ViolationsState {
  unacknowledgedCount: number;
  setUnacknowledgedCount: (n: number) => void;
  increment: () => void;
  decrement: () => void;
}

export const useViolationsStore = create<ViolationsState>((set) => ({
  unacknowledgedCount: 0,
  setUnacknowledgedCount: (n) => set({ unacknowledgedCount: n }),
  increment: () => set((s) => ({ unacknowledgedCount: s.unacknowledgedCount + 1 })),
  decrement: () => set((s) => ({ unacknowledgedCount: Math.max(0, s.unacknowledgedCount - 1) })),
}));
