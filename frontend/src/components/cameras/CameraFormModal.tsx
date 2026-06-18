import { useState } from "react";
import { camerasApi, type Camera } from "@/api/cameras";
import { X, Eye, EyeOff, CheckCircle2, XCircle, Loader2, ChevronDown, Wifi } from "lucide-react";

interface Props {
  camera: Camera | null;
  onClose: () => void;
  onSaved: (camera: Camera) => void;
}

type Protocol = "rtsp" | "http" | "https";

const DEFAULT_PORTS: Record<Protocol, string> = { rtsp: "554", http: "80", https: "443" };

const RTSP_PRESETS = [
  { label: "Generic  /stream", value: "/stream" },
  { label: "Generic  /live", value: "/live" },
  { label: "Generic  /live/ch0", value: "/live/ch0" },
  { label: "Generic  /h264", value: "/h264" },
  { label: "Hikvision  main", value: "/Streaming/Channels/101" },
  { label: "Hikvision  sub", value: "/Streaming/Channels/102" },
  { label: "Dahua  ch1 main", value: "/cam/realmonitor?channel=1&subtype=0" },
  { label: "Dahua  ch1 sub", value: "/cam/realmonitor?channel=1&subtype=1" },
  { label: "Reolink  main", value: "/h264Preview_01_main" },
  { label: "Reolink  sub", value: "/h264Preview_01_sub" },
  { label: "Axis", value: "/axis-media/media.amp" },
  { label: "Custom path…", value: "__custom__" },
];

const HTTP_PRESETS = [
  { label: "Generic  /video", value: "/video" },
  { label: "Generic  /mjpeg", value: "/mjpeg" },
  { label: "Generic  /stream", value: "/stream" },
  { label: "Axis MJPEG", value: "/mjpg/video.mjpg" },
  { label: "Hikvision MJPEG", value: "/Streaming/Channels/1/httppreview" },
  { label: "Dahua MJPEG", value: "/cgi-bin/mjpg/video.cgi" },
  { label: "Custom path…", value: "__custom__" },
];

function parseStreamUrl(url: string) {
  try {
    const match = url.match(/^(rtsp|http|https):\/\/(?:([^:@]+)(?::([^@]*))?@)?([^/:]+)(?::(\d+))?(\/.*)?$/);
    if (!match) return null;
    const proto = match[1] as Protocol;
    return {
      protocol: proto,
      username: match[2] ?? "",
      password: match[3] ?? "",
      host: match[4] ?? "",
      port: match[5] ?? DEFAULT_PORTS[proto],
      path: match[6] ?? "/stream",
    };
  } catch {
    return null;
  }
}

type TestState = "idle" | "loading" | "success" | "error";

export default function CameraFormModal({ camera, onClose, onSaved }: Props) {
  const parsed = camera ? parseStreamUrl(camera.rtsp_url) : null;

  const [name, setName] = useState(camera?.name ?? "");
  const [location, setLocation] = useState(camera?.location ?? "");
  const [fpsLimit, setFpsLimit] = useState(camera?.fps_limit ?? 5);
  const [saving, setSaving] = useState(false);

  // Stream builder fields
  const [manualMode, setManualMode] = useState(false);
  const [manualUrl, setManualUrl] = useState(camera?.rtsp_url ?? "");
  const [protocol, setProtocol] = useState<Protocol>(parsed?.protocol ?? "rtsp");
  const [host, setHost] = useState(parsed?.host ?? "");
  const [port, setPort] = useState(parsed?.port ?? "554");
  const [path, setPath] = useState(parsed?.path ?? "/stream");
  const [useAuth, setUseAuth] = useState(!!(parsed?.username));
  const [username, setUsername] = useState(parsed?.username ?? "");
  const [password, setPassword] = useState(parsed?.password ?? "");
  const [showPassword, setShowPassword] = useState(false);

  const presetsForProtocol = protocol === "rtsp" ? RTSP_PRESETS : HTTP_PRESETS;
  const [presetValue, setPresetValue] = useState<string>(() => {
    const p = parsed?.path ?? "/stream";
    const list = (parsed?.protocol ?? "rtsp") === "rtsp" ? RTSP_PRESETS : HTTP_PRESETS;
    return list.find((s) => s.value === p && s.value !== "__custom__") ? p : "__custom__";
  });

  // Test state
  const [testState, setTestState] = useState<TestState>("idle");
  const [testMessage, setTestMessage] = useState("");
  const [testFrame, setTestFrame] = useState<string | null>(null);

  const assembledUrl = manualMode
    ? manualUrl
    : (() => {
        if (!host) return "";
        const auth = useAuth && username ? `${encodeURIComponent(username)}:${encodeURIComponent(password)}@` : "";
        const defaultPort = DEFAULT_PORTS[protocol];
        const portPart = port && port !== defaultPort ? `:${port}` : `:${defaultPort}`;
        return `${protocol}://${auth}${host}${portPart}${path}`;
      })();

  const handleProtocolChange = (p: Protocol) => {
    setProtocol(p);
    setPort(DEFAULT_PORTS[p]);
    // Reset path preset since the lists differ
    const newPresets = p === "rtsp" ? RTSP_PRESETS : HTTP_PRESETS;
    const defaultPath = p === "rtsp" ? "/stream" : "/video";
    const match = newPresets.find((s) => s.value === defaultPath);
    setPresetValue(match ? defaultPath : "__custom__");
    setPath(defaultPath);
    setTestState("idle");
  };

  const handlePreset = (value: string) => {
    setPresetValue(value);
    if (value !== "__custom__") setPath(value);
  };

  const handleTest = async () => {
    if (!assembledUrl) return;
    setTestState("loading");
    setTestFrame(null);
    setTestMessage("Connecting to camera…");
    try {
      const result = await camerasApi.testUrl(assembledUrl);
      if (result.success) {
        setTestState("success");
        setTestMessage(result.message);
        setTestFrame(result.frame_base64 ?? null);
      } else {
        setTestState("error");
        setTestMessage(result.message);
      }
    } catch {
      setTestState("error");
      setTestMessage("Request failed. Make sure the API server is reachable.");
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assembledUrl) return;
    setSaving(true);
    try {
      const payload = { name, rtsp_url: assembledUrl, location: location || null, fps_limit: fpsLimit };
      const saved = camera
        ? await camerasApi.update(camera.id, payload)
        : await camerasApi.create(payload);
      onSaved(saved);
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    "w-full px-3 py-2 bg-secondary border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border sticky top-0 bg-card z-10">
          <h2 className="font-semibold">{camera ? "Edit Camera" : "Add Camera"}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-5 space-y-5">
          {/* Name + Location */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-1.5">
                Camera name <span className="text-destructive">*</span>
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputCls}
                placeholder="Gate A — Camera 1"
                required
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-1.5">
                Location
              </label>
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className={inputCls}
                placeholder="Main entrance"
              />
            </div>
          </div>

          {/* Stream Connection */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Stream URL <span className="text-destructive">*</span>
              </label>
              <button
                type="button"
                onClick={() => setManualMode((v) => !v)}
                className="text-xs text-primary hover:underline"
              >
                {manualMode ? "Use guided form" : "Enter URL manually"}
              </button>
            </div>

            {manualMode ? (
              <div>
                <input
                  value={manualUrl}
                  onChange={(e) => { setManualUrl(e.target.value); setTestState("idle"); }}
                  className={`${inputCls} font-mono`}
                  placeholder="rtsp://user:pass@192.168.1.100:554/stream"
                  required
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Supports <span className="font-mono">rtsp://</span>, <span className="font-mono">http://</span>, and <span className="font-mono">https://</span> streams.
                </p>
              </div>
            ) : (
              <div className="space-y-3 rounded-lg border border-border bg-secondary/30 p-3">
                {/* Protocol selector */}
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Protocol</label>
                  <div className="flex rounded-md overflow-hidden border border-border text-sm">
                    {(["rtsp", "http", "https"] as Protocol[]).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => handleProtocolChange(p)}
                        className={`flex-1 py-1.5 font-mono text-xs transition-colors ${
                          protocol === p
                            ? "bg-primary text-primary-foreground"
                            : "bg-secondary text-muted-foreground hover:bg-secondary/80"
                        }`}
                      >
                        {p}://
                      </button>
                    ))}
                  </div>
                  {protocol !== "rtsp" && (
                    <p className="text-xs text-muted-foreground mt-1">
                      HTTP/HTTPS is used for MJPEG streams. Most IP cameras also support RTSP.
                    </p>
                  )}
                </div>

                {/* Host + Port */}
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-xs text-muted-foreground block mb-1">IP Address / Hostname</label>
                    <input
                      value={host}
                      onChange={(e) => { setHost(e.target.value); setTestState("idle"); }}
                      className={inputCls}
                      placeholder="192.168.1.100"
                      required={!manualMode}
                    />
                  </div>
                  <div className="w-24">
                    <label className="text-xs text-muted-foreground block mb-1">Port</label>
                    <input
                      value={port}
                      onChange={(e) => { setPort(e.target.value); setTestState("idle"); }}
                      className={inputCls}
                      placeholder={DEFAULT_PORTS[protocol]}
                      type="number"
                      min={1}
                      max={65535}
                    />
                  </div>
                </div>

                {/* Stream path */}
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Stream path</label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <select
                        value={presetValue}
                        onChange={(e) => { handlePreset(e.target.value); setTestState("idle"); }}
                        className={`${inputCls} appearance-none pr-7`}
                      >
                        {presetsForProtocol.map((p) => (
                          <option key={p.value} value={p.value}>{p.label}</option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    </div>
                    {presetValue === "__custom__" && (
                      <input
                        value={path}
                        onChange={(e) => { setPath(e.target.value); setTestState("idle"); }}
                        className={`${inputCls} flex-1 font-mono`}
                        placeholder="/stream"
                      />
                    )}
                  </div>
                </div>

                {/* Credentials toggle */}
                <div>
                  <label className="flex items-center gap-2 cursor-pointer select-none w-fit">
                    <input
                      type="checkbox"
                      checked={useAuth}
                      onChange={(e) => { setUseAuth(e.target.checked); setTestState("idle"); }}
                      className="rounded border-border"
                    />
                    <span className="text-xs text-muted-foreground">Camera requires login (username &amp; password)</span>
                  </label>

                  {useAuth && (
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-muted-foreground block mb-1">Username</label>
                        <input
                          value={username}
                          onChange={(e) => { setUsername(e.target.value); setTestState("idle"); }}
                          className={inputCls}
                          placeholder="admin"
                          autoComplete="off"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground block mb-1">Password</label>
                        <div className="relative">
                          <input
                            type={showPassword ? "text" : "password"}
                            value={password}
                            onChange={(e) => { setPassword(e.target.value); setTestState("idle"); }}
                            className={`${inputCls} pr-8`}
                            placeholder="••••••••"
                            autoComplete="off"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword((v) => !v)}
                            className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
                          >
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Assembled URL preview */}
                {assembledUrl && (
                  <div className="rounded bg-black/30 px-3 py-2 font-mono text-xs text-muted-foreground break-all">
                    <span className="text-muted-foreground/50 select-none">URL → </span>
                    {assembledUrl}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Test Connection */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={handleTest}
              disabled={!assembledUrl || testState === "loading"}
              className="flex items-center gap-2 px-4 py-2 w-full justify-center rounded-md border border-border text-sm hover:bg-secondary disabled:opacity-40 transition-colors"
            >
              {testState === "loading" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Wifi className="h-4 w-4" />
              )}
              {testState === "loading" ? "Testing connection…" : "Test Connection"}
            </button>

            {testState === "success" && (
              <div className="rounded-lg border border-green-800 bg-green-900/20 overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2">
                  <CheckCircle2 className="h-4 w-4 text-green-400 flex-shrink-0" />
                  <span className="text-sm text-green-400 font-medium">Connected successfully</span>
                </div>
                {testFrame && (
                  <img
                    src={`data:image/jpeg;base64,${testFrame}`}
                    alt="Camera preview"
                    className="w-full"
                  />
                )}
              </div>
            )}

            {testState === "error" && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-3 flex items-start gap-2">
                <XCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-destructive font-medium">Connection failed</p>
                  <p className="text-xs text-destructive/80 mt-0.5">{testMessage}</p>
                  <p className="text-xs text-muted-foreground mt-1.5">
                    Check the IP address, port, stream path, and credentials then try again.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* FPS */}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-1.5">
              Detection FPS limit
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={1}
                max={25}
                value={fpsLimit}
                onChange={(e) => setFpsLimit(Number(e.target.value))}
                className="flex-1"
              />
              <span className="text-sm w-16 text-center bg-secondary border border-border rounded px-2 py-1">
                {fpsLimit} fps
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Lower FPS = less CPU. 5 fps is recommended for most deployments.
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-border rounded-md text-sm hover:bg-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !assembledUrl || !name}
              className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? "Saving…" : camera ? "Save changes" : "Add camera"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
