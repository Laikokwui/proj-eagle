import { useMemo, useState } from "react";
import { camerasApi, type Camera } from "@/api/cameras";
import { X, Eye, EyeOff, CheckCircle2, XCircle, Loader2, ChevronDown, Wifi } from "lucide-react";
import {
  DEFAULT_PORTS,
  buildStreamUrl,
  hostValidationError,
  normalizePastedUrl,
  parseStreamUrl,
  splitHostPort,
  urlValidationError,
  validatePort,
  type StreamProtocol,
} from "@/utils/streamUrl";

interface Props {
  camera: Camera | null;
  onClose: () => void;
  onSaved: (camera: Camera) => void;
}

type Protocol = StreamProtocol;
type FormMode = "simple" | "advanced";

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
  { label: "HLS playlist  .m3u8", value: "/playlist.m3u8" },
  { label: "Custom path…", value: "__custom__" },
];

type TestState = "idle" | "loading" | "success" | "error";

export default function CameraFormModal({ camera, onClose, onSaved }: Props) {
  const initial = camera ? parseStreamUrl(camera.rtsp_url) : null;

  const [mode, setMode] = useState<FormMode>("simple");
  const [pastedUrl, setPastedUrl] = useState(camera?.rtsp_url ?? "");

  // Advanced builder fields
  const [protocol, setProtocol] = useState<Protocol>(initial?.protocol ?? "rtsp");
  const [host, setHost] = useState(initial?.host ?? "");
  const [port, setPort] = useState(initial?.port ?? "");
  const [path, setPath] = useState(initial?.path ?? "/stream");
  const [useAuth, setUseAuth] = useState(!!initial?.username);
  const [username, setUsername] = useState(initial?.username ?? "");
  const [password, setPassword] = useState(initial?.password ?? "");
  const [showPassword, setShowPassword] = useState(false);

  const isRtsp = protocol === "rtsp" || protocol === "rtsps";
  const presetsForProtocol = isRtsp ? RTSP_PRESETS : HTTP_PRESETS;
  const [presetValue, setPresetValue] = useState<string>(() => {
    const p = initial?.path ?? "/stream";
    const initialRtsp = initial?.protocol === "rtsp" || initial?.protocol === "rtsps";
    const list = initialRtsp ? RTSP_PRESETS : HTTP_PRESETS;
    return list.find((s) => s.value === p && s.value !== "__custom__") ? p : "__custom__";
  });

  // Common fields
  const [name, setName] = useState(camera?.name ?? "");
  const [location, setLocation] = useState(camera?.location ?? "");
  const [fpsLimit, setFpsLimit] = useState(camera?.fps_limit ?? 5);
  const [saving, setSaving] = useState(false);

  // Test state
  const [testState, setTestState] = useState<TestState>("idle");
  const [testMessage, setTestMessage] = useState("");
  const [testFrame, setTestFrame] = useState<string | null>(null);

  const simpleUrl = useMemo(() => normalizePastedUrl(pastedUrl), [pastedUrl]);

  const advancedUrl = useMemo(
    () =>
      host.trim()
        ? buildStreamUrl({
            protocol,
            username: useAuth ? username : "",
            password: useAuth ? password : "",
            host,
            port: port.trim(),
            path,
          })
        : "",
    [host, protocol, useAuth, username, password, port, path],
  );

  const effectiveUrl = mode === "simple" ? simpleUrl : advancedUrl;
  const urlError =
    mode === "simple" ? urlValidationError(simpleUrl) : hostValidationError(host) ?? validatePort(port);
  const wasCleanedUp = mode === "simple" && !!pastedUrl.trim() && simpleUrl !== pastedUrl.trim();

  const clearTest = () => {
    setTestState("idle");
    setTestFrame(null);
  };

  const switchMode = (next: FormMode) => {
    setMode(next);
    clearTest();
  };

  const handleProtocolChange = (p: Protocol) => {
    setProtocol(p);
    setPort(DEFAULT_PORTS[p]);
    const newRtsp = p === "rtsp" || p === "rtsps";
    const newPresets = newRtsp ? RTSP_PRESETS : HTTP_PRESETS;
    const defaultPath = newRtsp ? "/stream" : "/video";
    setPresetValue(newPresets.find((s) => s.value === defaultPath) ? defaultPath : "__custom__");
    setPath(defaultPath);
    clearTest();
  };

  const handlePreset = (value: string) => {
    setPresetValue(value);
    if (value !== "__custom__") setPath(value);
  };

  // Accept a full URL or "host:port" pasted into the host field. The URL
  // builder strips schemes/ports from every part, so nothing gets duplicated.
  const handleHostChange = (value: string) => {
    clearTest();
    const trimmed = value.trim();
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
      const parts = parseStreamUrl(trimmed);
      if (parts) {
        const p = parts.protocol;
        const newRtsp = p === "rtsp" || p === "rtsps";
        const newPath = parts.path || (newRtsp ? "/stream" : "/video");
        const list = newRtsp ? RTSP_PRESETS : HTTP_PRESETS;
        setProtocol(p);
        setHost(parts.host);
        setPort(parts.port);
        setPath(newPath);
        setUseAuth(!!parts.username);
        setUsername(parts.username);
        setPassword(parts.password);
        setPresetValue(list.find((s) => s.value === newPath && s.value !== "__custom__") ? newPath : "__custom__");
        return;
      }
    }
    const split = splitHostPort(trimmed);
    setHost(split.host);
    if (split.port) setPort(split.port);
  };

  const handleTest = async () => {
    if (!effectiveUrl || urlError) return;
    setTestState("loading");
    setTestFrame(null);
    setTestMessage("Connecting to camera…");
    try {
      const result = await camerasApi.testUrl(effectiveUrl);
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
    if (!effectiveUrl || urlError) return;
    setSaving(true);
    try {
      const payload = { name, rtsp_url: effectiveUrl, location: location || null, fps_limit: fpsLimit };
      const saved = camera ? await camerasApi.update(camera.id, payload) : await camerasApi.create(payload);
      onSaved(saved);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-panel">
        <div className="modal-head">
          <div>
            <p className="ops-label text-primary">02 / SOURCE</p>
            <h2 className="ops-title mt-1">{camera ? "Edit camera" : "Register camera"}</h2>
          </div>
          <button onClick={onClose} className="icon-button" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-5 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="field-label" htmlFor="camera-name">
                Camera name <span className="text-destructive">*</span>
              </label>
              <input
                id="camera-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="ops-input"
                placeholder="Gate A — Camera 1"
                required
              />
            </div>
            <div>
              <label className="field-label" htmlFor="camera-location">Location</label>
              <input
                id="camera-location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="ops-input"
                placeholder="Main entrance"
              />
            </div>
          </div>

          <div className="space-y-3">
            <p className="field-label">
              Stream URL <span className="text-destructive">*</span>
            </p>

            <div className="segment">
              <button
                type="button"
                data-active={mode === "simple"}
                onClick={() => switchMode("simple")}
              >
                Simple — paste a link
              </button>
              <button
                type="button"
                data-active={mode === "advanced"}
                onClick={() => switchMode("advanced")}
              >
                Advanced — build a link
              </button>
            </div>

            {mode === "simple" ? (
              <div className="space-y-2">
                <textarea
                  value={pastedUrl}
                  onChange={(e) => {
                    setPastedUrl(e.target.value);
                    clearTest();
                  }}
                  rows={3}
                  className="ops-input font-mono resize-y break-all"
                  placeholder={
                    "rtsp://192.168.1.100:554/stream\n" +
                    "http://user:pass@192.168.1.100:8080/mjpeg\n" +
                    "http://host:1935/app/playlist.m3u8"
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Paste the complete URL — scheme, host, port, and path. Supports{" "}
                  <span className="font-mono">rtsp://</span>, <span className="font-mono">rtsps://</span>,{" "}
                  <span className="font-mono">http://</span>, and <span className="font-mono">https://</span>,
                  including MJPEG, HLS, and snapshot URLs.
                </p>
                {wasCleanedUp && (
                  <p className="text-xs text-hazard break-all">
                    Cleaned up automatically (duplicate scheme or port):{" "}
                    <span className="font-mono">{simpleUrl}</span>
                  </p>
                )}
                {urlError && <p className="text-xs text-destructive">{urlError}</p>}
                {effectiveUrl && !urlError && (
                  <div className="border border-border bg-black/30 px-3 py-2 font-mono text-xs text-muted-foreground break-all">
                    <span className="text-muted-foreground/50 select-none">URL → </span>
                    {effectiveUrl}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3 border border-border bg-panel-raised/40 p-3">
                <div>
                  <p className="ops-label mb-2">Protocol</p>
                  <div className="segment">
                    {(["rtsp", "rtsps", "http", "https"] as Protocol[]).map((p) => (
                      <button
                        key={p}
                        type="button"
                        data-active={protocol === p}
                        onClick={() => handleProtocolChange(p)}
                      >
                        {p}://
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="ops-label mb-2 block" htmlFor="camera-host">IP address / hostname</label>
                    <input
                      id="camera-host"
                      value={host}
                      onChange={(e) => handleHostChange(e.target.value)}
                      className="ops-input font-mono"
                      placeholder="192.168.1.100"
                    />
                  </div>
                  <div className="w-24">
                    <label className="ops-label mb-2 block" htmlFor="camera-port">Port</label>
                    <input
                      id="camera-port"
                      value={port}
                      onChange={(e) => {
                        setPort(e.target.value);
                        clearTest();
                      }}
                      className="ops-input font-mono"
                      placeholder={DEFAULT_PORTS[protocol]}
                      inputMode="numeric"
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground -mt-1">
                  Paste a full URL or <span className="font-mono">host:port</span> here. Leave the port
                  blank to use the default ({DEFAULT_PORTS[protocol]}).
                </p>

                <div>
                  <label className="ops-label mb-2 block" htmlFor="camera-path">Stream path</label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <select
                        id="camera-path"
                        value={presetValue}
                        onChange={(e) => {
                          handlePreset(e.target.value);
                          clearTest();
                        }}
                        className="ops-input appearance-none pr-7"
                      >
                        {presetsForProtocol.map((p) => (
                          <option key={p.value} value={p.value}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    </div>
                    {presetValue === "__custom__" && (
                      <input
                        value={path}
                        onChange={(e) => {
                          setPath(e.target.value);
                          clearTest();
                        }}
                        className="ops-input flex-1 font-mono"
                        placeholder="/stream"
                      />
                    )}
                  </div>
                </div>

                <div>
                  <label className="flex items-center gap-2 cursor-pointer select-none w-fit">
                    <input
                      type="checkbox"
                      checked={useAuth}
                      onChange={(e) => {
                        setUseAuth(e.target.checked);
                        clearTest();
                      }}
                      className="h-3.5 w-3.5 border-border"
                    />
                    <span className="text-xs text-muted-foreground">
                      Camera requires login (username and password)
                    </span>
                  </label>

                  {useAuth && (
                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="ops-label mb-2 block" htmlFor="camera-username">Username</label>
                        <input
                          id="camera-username"
                          value={username}
                          onChange={(e) => {
                            setUsername(e.target.value);
                            clearTest();
                          }}
                          className="ops-input"
                          placeholder="admin"
                          autoComplete="off"
                        />
                      </div>
                      <div>
                        <label className="ops-label mb-2 block" htmlFor="camera-password">Password</label>
                        <div className="relative">
                          <input
                            id="camera-password"
                            type={showPassword ? "text" : "password"}
                            value={password}
                            onChange={(e) => {
                              setPassword(e.target.value);
                              clearTest();
                            }}
                            className="ops-input pr-9"
                            placeholder="••••••••"
                            autoComplete="off"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword((v) => !v)}
                            className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
                            aria-label={showPassword ? "Hide password" : "Show password"}
                          >
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {urlError && <p className="text-xs text-destructive">{urlError}</p>}
                {advancedUrl && (
                  <div className="border border-border bg-black/30 px-3 py-2 font-mono text-xs text-muted-foreground break-all">
                    <span className="text-muted-foreground/50 select-none">URL → </span>
                    {advancedUrl}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <button
              type="button"
              onClick={handleTest}
              disabled={!effectiveUrl || !!urlError || testState === "loading"}
              className="ops-button w-full"
            >
              {testState === "loading" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Wifi className="h-3.5 w-3.5" />
              )}
              {testState === "loading" ? "Testing connection…" : "Test connection"}
            </button>

            {testState === "success" && (
              <div className="ops-notice ops-notice-clear block">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                  <span className="font-medium">
                    {testMessage || "Connected successfully"}
                  </span>
                </div>
                {testFrame && (
                  <img
                    src={`data:image/jpeg;base64,${testFrame}`}
                    alt="Camera preview"
                    className="mt-2 w-full border border-border"
                  />
                )}
              </div>
            )}

            {testState === "error" && (
              <div className="ops-notice ops-notice-alert block">
                <div className="flex items-start gap-2">
                  <XCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">Connection failed</p>
                    <p className="mt-1 opacity-80">{testMessage}</p>
                    <p className="mt-2 text-muted-foreground">
                      Check the URL, port, stream path, and credentials, then try again.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="field-label" htmlFor="camera-fps">Detection FPS limit</label>
            <div className="flex items-center gap-3">
              <input
                id="camera-fps"
                type="range"
                min={1}
                max={25}
                value={fpsLimit}
                onChange={(e) => setFpsLimit(Number(e.target.value))}
                className="flex-1"
              />
              <span className="w-16 border border-border bg-panel-raised px-2 py-1 text-center font-mono text-xs">
                {fpsLimit} fps
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Lower FPS uses less CPU. 5 fps is recommended for most deployments.
            </p>
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="ops-button flex-1">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !effectiveUrl || !!urlError || !name}
              className="ops-button ops-button-primary flex-1"
            >
              {saving ? "Saving…" : camera ? "Save changes" : "Add camera"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
