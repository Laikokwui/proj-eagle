import api from "./client";

export interface AIModel {
  id: number;
  name: string;
  source: string;
  model_id: string;
  file_path: string;
  class_names: string[];
  ppe_class_ids: number[];
  is_active: boolean;
  file_size_mb: number | null;
  downloaded_at: string;
}

export interface UltralyticsModelInfo {
  model_id: string;
  name: string;
  size_mb: number;
  description: string;
}

export interface HFModelSearchResult {
  model_id: string;
  downloads: number | null;
  likes: number | null;
  tags: string[];
}

export interface DownloadProgress {
  task_id: string;
  status: string;
  progress_pct: number;
  message: string;
}

export const modelsApi = {
  list: () => api.get<AIModel[]>("/models").then((r) => r.data),
  listUltralytics: () => api.get<UltralyticsModelInfo[]>("/models/ultralytics").then((r) => r.data),
  searchHuggingFace: (q: string) =>
    api.get<HFModelSearchResult[]>(`/models/huggingface/search?q=${encodeURIComponent(q)}`).then((r) => r.data),
  download: (source: string, modelId: string, name?: string) =>
    api.post<{ task_id: string }>("/models/download", { source, model_id: modelId, name }).then((r) => r.data),
  activate: (id: number) => api.post<AIModel>(`/models/${id}/activate`).then((r) => r.data),
  delete: (id: number) => api.delete(`/models/${id}`),
};
