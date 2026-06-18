import axios from "axios";

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export async function login(username: string, password: string): Promise<TokenResponse> {
  const form = new URLSearchParams({ username, password });
  const { data } = await axios.post<TokenResponse>("/api/auth/login", form, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  return data;
}
