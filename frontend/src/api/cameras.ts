import api from "./client";

export interface Camera {
  id: number;
  name: string;
  rtsp_url: string;
  location: string | null;
  is_active: boolean;
  is_streaming: boolean;
  fps_limit: number;
  created_at: string;
  updated_at: string;
}

export interface CameraTestResult {
  success: boolean;
  message: string;
  frame_base64: string | null;
}

export const camerasApi = {
  list: () => api.get<Camera[]>("/cameras").then((r) => r.data),
  create: (data: Partial<Camera>) => api.post<Camera>("/cameras", data).then((r) => r.data),
  update: (id: number, data: Partial<Camera>) => api.patch<Camera>(`/cameras/${id}`, data).then((r) => r.data),
  delete: (id: number) => api.delete(`/cameras/${id}`),
  start: (id: number) => api.post<Camera>(`/cameras/${id}/start`).then((r) => r.data),
  stop: (id: number) => api.post<Camera>(`/cameras/${id}/stop`).then((r) => r.data),
  test: (id: number) => api.post<CameraTestResult>(`/cameras/${id}/test`).then((r) => r.data),
  testUrl: (rtsp_url: string) =>
    api.post<CameraTestResult>("/cameras/test-url", { rtsp_url }).then((r) => r.data),
};
