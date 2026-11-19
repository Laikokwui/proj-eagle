import api from "./client";

export interface VersionInfo {
  name: string;
  version: string;
}

export const systemApi = {
  version: () => api.get<VersionInfo>("/version").then((r) => r.data),
};
