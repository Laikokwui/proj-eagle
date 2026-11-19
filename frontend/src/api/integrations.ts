import api from "./client";

export type CredentialProvider = "huggingface" | "ultralytics";

export interface CredentialStatus {
  provider: CredentialProvider;
  connected: boolean;
  source: "saved" | "environment" | null;
  hint: string | null;
  updated_at: string | null;
}

export const integrationsApi = {
  listCredentials: () =>
    api.get<CredentialStatus[]>("/integrations/credentials").then((r) => r.data),
  saveCredential: (provider: CredentialProvider, token: string) =>
    api
      .put<CredentialStatus>(`/integrations/credentials/${provider}`, { token })
      .then((r) => r.data),
  clearCredential: (provider: CredentialProvider) =>
    api.delete<CredentialStatus>(`/integrations/credentials/${provider}`).then((r) => r.data),
};
