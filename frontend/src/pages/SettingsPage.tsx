import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  KeyRound,
  Loader2,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import {
  integrationsApi,
  type CredentialProvider,
  type CredentialStatus,
} from "@/api/integrations";

interface ProviderConfig {
  id: CredentialProvider;
  title: string;
  description: string;
  tokenLabel: string;
  tokenUrl: string;
  tokenUrlLabel: string;
  placeholder: string;
}

const PROVIDERS: ProviderConfig[] = [
  {
    id: "huggingface",
    title: "Hugging Face",
    description:
      "Needed for gated or private model repositories. Use a read access token; the token is encrypted before it is stored.",
    tokenLabel: "Access token",
    tokenUrl: "https://huggingface.co/settings/tokens",
    tokenUrlLabel: "Create a Hugging Face token",
    placeholder: "hf_…",
  },
  {
    id: "ultralytics",
    title: "Ultralytics",
    description:
      "Needed only for private Ultralytics Platform models written as owner/project/model. Public YOLO weights do not require a key.",
    tokenLabel: "API key",
    tokenUrl: "https://platform.ultralytics.com/account/api-keys",
    tokenUrlLabel: "Create an Ultralytics API key",
    placeholder: "ul_…",
  },
];

function errorMessage(err: unknown, fallback: string): string {
  const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (err instanceof Error) return err.message;
  return fallback;
}

export default function SettingsPage() {
  const [statuses, setStatuses] = useState<Record<string, CredentialStatus>>({});
  const [tokens, setTokens] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<CredentialProvider | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await integrationsApi.listCredentials();
      setStatuses(Object.fromEntries(list.map((item) => [item.provider, item])));
    } catch (err) {
      setError(errorMessage(err, "Could not load connected accounts"));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async (provider: CredentialProvider) => {
    const token = (tokens[provider] ?? "").trim();
    if (!token) {
      setError("Paste a token before saving.");
      return;
    }
    setBusy(provider);
    setError(null);
    try {
      const status = await integrationsApi.saveCredential(provider, token);
      setStatuses((prev) => ({ ...prev, [provider]: status }));
      setTokens((prev) => ({ ...prev, [provider]: "" }));
    } catch (err) {
      setError(errorMessage(err, "Could not save credential"));
    } finally {
      setBusy(null);
    }
  };

  const handleClear = async (provider: CredentialProvider) => {
    setBusy(provider);
    setError(null);
    try {
      const status = await integrationsApi.clearCredential(provider);
      setStatuses((prev) => ({ ...prev, [provider]: status }));
    } catch (err) {
      setError(errorMessage(err, "Could not remove credential"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3 max-w-4xl">
      <div className="panel">
        <div className="panel-head">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="ops-label text-primary">05 / SYSTEM</span>
            <h2 className="ops-title">Settings</h2>
          </div>
          <Link to="/models" className="ops-label text-primary hover:underline">
            ← Models
          </Link>
        </div>
      </div>

      {error && (
        <div className="ops-notice ops-notice-alert">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <section className="panel">
        <div className="panel-head">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-primary" />
            <h3 className="ops-title">Connected accounts</h3>
          </div>
          <span className="ops-label">Credential vault</span>
        </div>

        <div className="divide-y divide-border">
          {PROVIDERS.map((config) => {
            const status = statuses[config.id];
            const connected = status?.connected ?? false;
            const isBusy = busy === config.id;
            return (
              <div key={config.id} className="space-y-3 px-4 py-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{config.title}</p>
                      {connected ? (
                        <span className="ops-chip ops-chip-clear">
                          <CheckCircle2 className="h-3 w-3" />
                          Connected
                        </span>
                      ) : (
                        <span className="ops-chip ops-chip-neutral">Not connected</span>
                      )}
                    </div>
                    <p className="mt-2 max-w-2xl text-xs text-muted-foreground">{config.description}</p>
                    {connected && status?.hint && (
                      <p className="ops-label mt-2">
                        Saved {status.hint} {status.source === "environment" ? "from environment" : ""}
                      </p>
                    )}
                  </div>
                  <a
                    href={config.tokenUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="ops-label flex flex-shrink-0 items-center gap-1 text-primary hover:underline"
                  >
                    {config.tokenUrlLabel}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    type="password"
                    value={tokens[config.id] ?? ""}
                    onChange={(e) =>
                      setTokens((prev) => ({ ...prev, [config.id]: e.target.value }))
                    }
                    placeholder={`New ${config.tokenLabel.toLowerCase()} — leave blank to keep current`}
                    autoComplete="off"
                    className="ops-input min-w-0 flex-1 font-mono"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => void handleSave(config.id)}
                      disabled={isBusy || !(tokens[config.id] ?? "").trim()}
                      className="ops-button ops-button-primary flex-1 sm:flex-none"
                    >
                      {isBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      Save
                    </button>
                    <button
                      onClick={() => void handleClear(config.id)}
                      disabled={isBusy || !connected}
                      title="Remove saved credential"
                      className="ops-button ops-button-danger flex-1 sm:flex-none"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="ops-notice ops-notice-info">
        <ShieldCheck className="h-4 w-4 flex-shrink-0 mt-0.5" />
        <span>
          Credentials are encrypted at rest and masked in the UI. Only administrators can save or remove them.
        </span>
      </div>
    </div>
  );
}
