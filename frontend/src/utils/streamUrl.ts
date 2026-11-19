export type StreamProtocol = "rtsp" | "rtsps" | "http" | "https";

export const STREAM_PROTOCOLS: StreamProtocol[] = ["rtsp", "rtsps", "http", "https"];

export const DEFAULT_PORTS: Record<StreamProtocol, string> = {
  rtsp: "554",
  rtsps: "322",
  http: "80",
  https: "443",
};

export interface StreamUrlParts {
  protocol: StreamProtocol;
  username: string;
  password: string;
  host: string;
  port: string;
  path: string;
}

const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
const FULL_URL = /^([a-z][a-z0-9+.-]*):\/\/([^/?#]*)([/?#][^]*)?$/i;

function compact(value: string): string {
  return value.trim().replace(/\s+/g, "");
}

function leadingSchemes(value: string): { rest: string; last: string } {
  let rest = compact(value);
  let last = "";
  for (;;) {
    const match = rest.match(SCHEME);
    if (!match) break;
    last = match[0];
    rest = rest.slice(last.length);
  }
  return { rest, last };
}

/** "http://http://host/x" -> "http://host/x" (the last scheme wins). */
export function stripDuplicateSchemes(value: string): string {
  const { rest, last } = leadingSchemes(value);
  return `${last}${rest}`;
}

/** Split an authority into a clean host and port, tolerating empty/repeated ports. */
export function splitHostPort(authority: string): { host: string; port: string } {
  const value = leadingSchemes(authority).rest.split(/[/?#]/, 1)[0];
  if (!value) return { host: "", port: "" };

  const ipv6 = value.match(/^(\[[^\]]+\])(?::(\d*))?$/);
  if (ipv6) return { host: ipv6[1], port: ipv6[2] ?? "" };

  const at = value.lastIndexOf("@");
  let host = at >= 0 ? value.slice(at + 1) : value;
  let port = "";

  for (;;) {
    const colon = host.lastIndexOf(":");
    if (colon < 0) break;
    const tail = host.slice(colon + 1);
    if (!/^\d*$/.test(tail)) break;
    if (!port) port = tail;
    host = host.slice(0, colon);
  }
  return { host, port };
}

/** Parse a complete pasted URL into editable parts. */
export function parseStreamUrl(raw: string): StreamUrlParts | null {
  const match = stripDuplicateSchemes(raw).match(FULL_URL);
  if (!match) return null;

  const protocol = match[1].toLowerCase() as StreamProtocol;
  if (!STREAM_PROTOCOLS.includes(protocol)) return null;

  let authority = match[2];
  let username = "";
  let password = "";
  const at = authority.lastIndexOf("@");
  if (at >= 0) {
    const credentials = authority.slice(0, at);
    const colon = credentials.indexOf(":");
    const rawUser = colon >= 0 ? credentials.slice(0, colon) : credentials;
    const rawPassword = colon >= 0 ? credentials.slice(colon + 1) : "";
    try {
      username = decodeURIComponent(rawUser);
      password = decodeURIComponent(rawPassword);
    } catch {
      username = rawUser;
      password = rawPassword;
    }
    authority = authority.slice(at + 1);
  }

  const { host, port } = splitHostPort(authority);
  if (!host) return null;

  return { protocol, username, password, host, port, path: match[3] ?? "" };
}

/** Assemble a URL with exactly one scheme and at most one port. */
export function buildStreamUrl(parts: StreamUrlParts): string {
  const { host } = splitHostPort(parts.host);
  if (!host) return "";

  const port = compact(parts.port);
  const portPart = /^\d+$/.test(port) ? `:${port}` : "";

  let path = parts.path.trim();
  if (path && !/^[/?#]/.test(path)) path = `/${path}`;

  const auth = parts.username
    ? `${encodeURIComponent(parts.username)}${parts.password ? `:${encodeURIComponent(parts.password)}` : ""}@`
    : "";

  return `${parts.protocol}://${auth}${host}${portPart}${path}`;
}

/** Clean a pasted URL without inventing a port the user didn't provide. */
export function normalizePastedUrl(raw: string): string {
  const parts = parseStreamUrl(raw);
  return parts ? buildStreamUrl(parts) : raw.trim();
}

export function validatePort(port: string): string | null {
  const value = port.trim();
  if (!value) return null;
  if (!/^\d+$/.test(value)) return "Port must be a number";
  const number = Number(value);
  if (number < 1 || number > 65535) return "Port must be between 1 and 65535";
  return null;
}

export function hostValidationError(host: string): string | null {
  if (!host.trim()) return "Enter a host or IP address";
  const clean = splitHostPort(host).host;
  if (!clean.startsWith("[") && clean.includes(":")) return "Port must be a number";
  return null;
}

export function urlValidationError(url: string): string | null {
  if (!url.trim()) return "Enter a stream URL";
  const parts = parseStreamUrl(url);
  if (!parts) return "URL must start with rtsp://, rtsps://, http:// or https:// followed by a host";
  return hostValidationError(parts.host) ?? validatePort(parts.port);
}
