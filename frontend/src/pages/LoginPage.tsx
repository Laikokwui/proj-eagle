import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { login } from "@/api/auth";
import { systemApi } from "@/api/system";
import { useAuthStore } from "@/store/auth";
import { ShieldCheck, ArrowRight } from "lucide-react";

export default function LoginPage() {
  const navigate = useNavigate();
  const loginStore = useAuthStore((s) => s.login);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [version, setVersion] = useState("");

  useEffect(() => {
    systemApi
      .version()
      .then((info) => setVersion(info.version))
      .catch(() => setVersion(""));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const tokens = await login(username, password);
      loginStore(tokens.access_token, tokens.refresh_token);
      navigate("/dashboard");
    } catch {
      setError("Invalid username or password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-background ops-grid">
      <div className="hazard-rail w-2 flex-shrink-0" aria-hidden="true" />

      <section className="hidden md:flex w-[42%] max-w-xl flex-shrink-0 border-r border-border bg-panel flex-col justify-between p-10">
        <div>
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-7 w-7 text-primary" />
            <span className="ops-label">Restricted operations console</span>
          </div>
          <h1 className="mt-10 text-3xl font-semibold leading-tight tracking-tight">
            PPE Compliance<br />Monitor
          </h1>
          <p className="mt-4 max-w-sm text-sm text-muted-foreground">
            Camera streams, model state, and safety violations in one controlled workspace.
          </p>
        </div>

        <div className="space-y-3 border-l-2 border-primary/60 pl-4">
          <p className="ops-label">Access notes</p>
          <p className="text-xs text-muted-foreground">
            Use your assigned account. Model sources and detection rules are administered after sign-in.
          </p>
          {version && <p className="ops-label">Build {version}</p>}
        </div>
      </section>

      <section className="flex flex-1 items-center justify-center p-6">
        <div className="panel w-full max-w-md">
          <div className="panel-head">
            <div>
              <p className="ops-label">Credential check</p>
              <h2 className="ops-title mt-1">Sign in</h2>
            </div>
            <span className="ops-label">01 / AUTH</span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5 p-7">
            <div>
              <label className="ops-label block mb-2" htmlFor="username">
                Username
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="ops-input font-mono"
                placeholder="operator"
                autoComplete="username"
                required
              />
            </div>

            <div>
              <label className="ops-label block mb-2" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="ops-input"
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
            </div>

            {error && (
              <div className="ops-notice ops-notice-alert">{error}</div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="ops-button ops-button-primary w-full py-2.5"
            >
              {loading ? "Verifying…" : "Authenticate"}
              {!loading && <ArrowRight className="h-3.5 w-3.5" />}
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
