import api from "./client";

export interface Violation {
  id: number;
  camera_id: number | null;
  camera_name: string | null;
  ai_model_id: number | null;
  screenshot_path: string | null;
  screenshot_url: string | null;
  missing_classes: string[];
  detection_conf: number | null;
  acknowledged: boolean;
  acknowledged_by: number | null;
  acknowledged_at: string | null;
  occurred_at: string;
}

export interface ViolationFilters {
  camera_id?: number;
  missing_class?: string;
  acknowledged?: boolean;
  from_date?: string;
  to_date?: string;
  cursor?: number;
  limit?: number;
}

export const violationsApi = {
  list: (filters?: ViolationFilters) =>
    api.get<Violation[]>("/violations", { params: filters }).then((r) => r.data),
  get: (id: number) => api.get<Violation>(`/violations/${id}`).then((r) => r.data),
  acknowledge: (id: number, acknowledged = true) =>
    api.patch<Violation>(`/violations/${id}/acknowledge`, { acknowledged }).then((r) => r.data),
  stats: () =>
    api.get<{ unacknowledged_count: number }>("/violations/stats").then((r) => r.data),
  exportCsv: (filters?: Omit<ViolationFilters, "cursor" | "limit">) => {
    const params = new URLSearchParams(filters as Record<string, string>);
    window.open(`/api/violations/export/csv?${params}`, "_blank");
  },
};
