import { create } from "zustand";

export interface AlertEvent {
  violation_id: number;
  camera_id: number;
  camera_name: string;
  timestamp: string;
  missing_ppe: string[];
  screenshot_url: string | null;
}

interface AlertsState {
  alerts: AlertEvent[];
  addAlert: (alert: AlertEvent) => void;
  dismissAlert: (violation_id: number) => void;
}

export const useAlertsStore = create<AlertsState>((set) => ({
  alerts: [],
  addAlert: (alert) =>
    set((state) => ({ alerts: [alert, ...state.alerts].slice(0, 50) })),
  dismissAlert: (violation_id) =>
    set((state) => ({ alerts: state.alerts.filter((a) => a.violation_id !== violation_id) })),
}));
