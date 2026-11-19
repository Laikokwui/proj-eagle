import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  modelsApi,
  type AIModel,
  type DownloadProgress,
  type HFModelSearchResult,
  type UltralyticsModelInfo,
} from "@/api/models";
import {
  CheckCircle, Download, Trash2, Search, Brain, Upload, Settings2, Loader2, AlertTriangle,
} from "lucide-react";
import ModelRulesModal from "@/components/models/ModelRulesModal";

type Tab = "downloaded" | "ultralytics" | "huggingface";

const TABS: { id: Tab; label: string; code: string }[] = [
  { id: "downloaded", label: "Downloaded", code: "01" },
  { id: "ultralytics", label: "Ultralytics", code: "02" },
  { id: "huggingface", label: "Hugging Face", code: "03" },
];

export default function ModelsPage() {
  const [tab, setTab] = useState<Tab>("downloaded");
  const [models, setModels] = useState<AIModel[]>([]);
  const [ultralyticsModels, setUltralyticsModels] = useState<UltralyticsModelInfo[]>([]);
  const [hfResults, setHfResults] = useState<HFModelSearchResult[]>([]);
  const [hfQuery, setHfQuery] = useState("ppe detection yolo");
  const [loadingHf, setLoadingHf] = useState(false);
  const [hfError, setHfError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<Record<string, number>>({});
  const [downloadErrors, setDownloadErrors] = useState<Record<string, string>>({});
  const [platformRef, setPlatformRef] = useState("");
  const [rulesModel, setRulesModel] = useState<AIModel | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    modelsApi.list().then(setModels);
    modelsApi.listUltralytics().then(setUltralyticsModels);
  }, []);

  const handleActivate = async (id: number) => {
    const updated = await modelsApi.activate(id);
    setModels((prev) => prev.map((m) => ({ ...m, is_active: m.id === updated.id })));
    // Auto-open rules if the newly activated model has none configured
    if (updated.ppe_class_ids.length === 0) {
      setRulesModel(updated);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this model?")) return;
    await modelsApi.delete(id);
    setModels((prev) => prev.filter((m) => m.id !== id));
  };

  const handleDownload = async (source: string, modelId: string, name?: string) => {
    const key = `${source}:${modelId}`;
    setDownloadingId(key);
    setDownloadErrors((prev) => ({ ...prev, [key]: "" }));
    try {
      const { task_id } = await modelsApi.download(source, modelId, name);
      // EventSource cannot send an Authorization header, so pass the token.
      const token = localStorage.getItem("access_token") ?? "";
      const eventSource = new EventSource(
        `/api/models/download-progress/${task_id}?token=${encodeURIComponent(token)}`
      );
      eventSource.onmessage = (e) => {
        const data = JSON.parse(e.data) as DownloadProgress;
        setDownloadProgress((prev) => ({ ...prev, [key]: data.progress_pct }));
        if (data.status === "completed" || data.status === "error") {
          eventSource.close();
          setDownloadingId(null);
          if (data.status === "completed") {
            modelsApi.list().then(setModels);
          } else {
            setDownloadErrors((prev) => ({ ...prev, [key]: data.message }));
          }
        }
      };
      eventSource.onerror = () => {
        eventSource.close();
        setDownloadingId(null);
        setDownloadErrors((prev) => ({ ...prev, [key]: "Lost connection to download progress." }));
      };
    } catch (err) {
      setDownloadingId(null);
      setDownloadErrors((prev) => ({
        ...prev,
        [key]: err instanceof Error ? err.message : "Download could not be started.",
      }));
    }
  };

  const handleHfSearch = async () => {
    setLoadingHf(true);
    setHfError(null);
    try {
      const results = await modelsApi.searchHuggingFace(hfQuery);
      setHfResults(results);
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setHfError(detail ?? "Hugging Face search failed.");
    } finally {
      setLoadingHf(false);
    }
  };

  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    const name = prompt("Model name:", file.name.replace(".pt", ""));
    if (!name) return;

    setUploading(true);
    setUploadError(null);
    try {
      const model = await modelsApi.upload(file, name);
      setModels((prev) => [model, ...prev]);
      setTab("downloaded");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        ?? "Upload failed";
      setUploadError(msg);
    } finally {
      setUploading(false);
    }
  };

  const handleRulesSaved = (updated: AIModel) => {
    setModels((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
    setRulesModel(null);
  };

  const activeModel = models.find((m) => m.is_active);
  const activeHasNoRules = activeModel && activeModel.ppe_class_names.length === 0 && activeModel.ppe_class_ids.length === 0;

  return (
    <div className="space-y-3">
      <div className="panel">
        <div className="panel-head">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="ops-label text-primary">03 / DETECTORS</span>
            <h2 className="ops-title">Model registry</h2>
            <span className="ops-label">{models.length} local</span>
          </div>
          {activeModel && (
            <span className="ops-chip ops-chip-clear">
              <CheckCircle className="h-3 w-3" />
              Active: {activeModel.name}
            </span>
          )}
        </div>
      </div>

      {activeHasNoRules && (
        <div className="ops-notice ops-notice-warn">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="font-medium">No violation rules configured</p>
            <p className="mt-1 opacity-80">
              <span className="font-mono">{activeModel.name}</span> is active but has no violation
              classes set — violations will not be logged. Select the classes that should trigger an event.
            </p>
          </div>
          <button
            onClick={() => setRulesModel(activeModel)}
            className="ops-button ops-button-danger flex-shrink-0"
          >
            <Settings2 className="h-3.5 w-3.5" />
            Configure Rules
          </button>
        </div>
      )}

      <div className="flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`relative px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.14em] transition-colors ${
              tab === t.id
                ? "text-primary after:absolute after:bottom-[-1px] after:left-0 after:right-0 after:h-0.5 after:bg-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <span className="mr-2 opacity-60">{t.code}</span>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "downloaded" && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="ops-label">{models.length} model{models.length !== 1 ? "s" : ""}</p>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="ops-button"
            >
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              {uploading ? "Uploading…" : "Upload .pt file"}
            </button>
            <input ref={fileInputRef} type="file" accept=".pt" className="hidden" onChange={handleUploadFile} />
          </div>

          {uploadError && (
            <div className="ops-notice ops-notice-alert">{uploadError}</div>
          )}

          {models.length === 0 ? (
            <div className="panel px-6 py-14 text-center">
              <p className="ops-title">No local models</p>
              <p className="text-xs text-muted-foreground mt-2">
                Browse Ultralytics or Hugging Face, or upload a .pt file.
              </p>
            </div>
          ) : (
            <div className="panel overflow-x-auto">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>Model</th>
                    <th>Source</th>
                    <th className="hidden md:table-cell">Classes</th>
                    <th>Violation rules</th>
                    <th className="hidden md:table-cell">Size</th>
                    <th><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {models.map((model) => {
                    const hasRules = model.ppe_class_names.length > 0 || model.ppe_class_ids.length > 0;
                    const ruleCount = model.ppe_class_names.length || model.ppe_class_ids.length;
                    const needsRules = model.is_active && !hasRules;
                    return (
                      <tr key={model.id} className={needsRules ? "bg-hazard/5" : ""}>
                        <td>
                          <div className="flex items-center gap-2">
                            {model.is_active && <CheckCircle className="h-3.5 w-3.5 text-clear flex-shrink-0" />}
                            <span className={model.is_active ? "font-medium text-clear" : ""}>{model.name}</span>
                          </div>
                        </td>
                        <td className="font-mono text-xs text-muted-foreground capitalize">{model.source}</td>
                        <td className="hidden md:table-cell font-mono text-xs text-muted-foreground">
                          {model.class_names.length}
                        </td>
                        <td>
                          {hasRules ? (
                            <span className="ops-chip ops-chip-alert">{ruleCount} class{ruleCount !== 1 ? "es" : ""}</span>
                          ) : (
                            <span className={`ops-chip ${needsRules ? "ops-chip-warn" : "ops-chip-neutral"}`}>
                              {needsRules ? "Not set" : "Auto-detect"}
                            </span>
                          )}
                        </td>
                        <td className="hidden md:table-cell font-mono text-xs text-muted-foreground">
                          {model.file_size_mb ? `${model.file_size_mb} MB` : "—"}
                        </td>
                        <td>
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => setRulesModel(model)}
                              className={`ops-button ${needsRules ? "ops-button-danger" : ""}`}
                            >
                              <Settings2 className="h-3.5 w-3.5" />
                              {hasRules ? `Rules (${ruleCount})` : "Configure Rules"}
                            </button>
                            {!model.is_active && (
                              <button onClick={() => handleActivate(model.id)} className="ops-button">
                                Set Active
                              </button>
                            )}
                            <button
                              onClick={() => handleDelete(model.id)}
                              disabled={model.is_active}
                              title="Delete model"
                              className="icon-button hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "ultralytics" && (
        <div className="space-y-3">
          <div className="ops-notice ops-notice-info">
            <Brain className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <p>
              These are general-purpose YOLO models that detect 80 common objects (person, car, etc.) —{" "}
              <strong>not PPE-specific</strong>. After downloading and activating, use{" "}
              <strong>Configure Rules</strong> and select “person” or another class to test detection.
              For helmet, vest, and glove detection, search Hugging Face for a PPE-trained model.
            </p>
          </div>

          <div className="panel p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="field-label mb-0">Private Platform model</p>
              <Link to="/settings" className="ops-label text-primary hover:underline">
                API key setup →
              </Link>
            </div>
            <p className="text-xs text-muted-foreground">
              Use <code className="font-mono text-foreground">owner/project/model</code> for a trained
              model in your Ultralytics account. This requires an API key in Settings.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id="ultralytics-platform-ref"
                value={platformRef}
                onChange={(e) => setPlatformRef(e.target.value.trim())}
                placeholder="acme-vision/inspection/best-model"
                className="ops-input min-w-0 flex-1 font-mono"
              />
              <button
                onClick={() => {
                  const parts = platformRef.split("/");
                  if (parts.length === 3 && parts.every(Boolean)) {
                    void handleDownload("ultralytics", platformRef, parts[2]);
                  }
                }}
                disabled={platformRef.split("/").length !== 3 || platformRef.split("/").some((p) => !p)}
                className="ops-button ops-button-primary flex-shrink-0"
              >
                <Download className="h-3.5 w-3.5" />
                Download private model
              </button>
            </div>
            {downloadErrors[`ultralytics:${platformRef}`] && (
              <p className="text-xs text-destructive">
                {downloadErrors[`ultralytics:${platformRef}`]}
              </p>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {ultralyticsModels.map((m) => {
              const key = `ultralytics:${m.model_id}`;
              const isDownloaded = models.some((dm) => dm.model_id === m.model_id && dm.source === "ultralytics");
              const isDownloading = downloadingId === key;
              const progress = downloadProgress[key] ?? 0;
              return (
                <div key={m.model_id} className="panel p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-sm">{m.name}</p>
                      <p className="text-xs text-muted-foreground mt-1">{m.description}</p>
                    </div>
                    <span className="font-mono text-[10px] text-muted-foreground whitespace-nowrap">
                      {m.size_mb} MB
                    </span>
                  </div>
                  {isDownloading && (
                    <div className="progress-track">
                      <div className="progress-fill" style={{ width: `${progress}%` }} />
                    </div>
                  )}
                  <button
                    onClick={() => handleDownload("ultralytics", m.model_id, m.name)}
                    disabled={isDownloaded || isDownloading}
                    className={`ops-button w-full ${isDownloaded ? "ops-chip-clear" : ""}`}
                  >
                    {isDownloaded ? <CheckCircle className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}
                    {isDownloaded ? "Downloaded" : isDownloading ? `${Math.round(progress)}%` : "Download"}
                  </button>
                  {downloadErrors[key] && (
                    <p className="text-[11px] text-destructive">{downloadErrors[key]}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === "huggingface" && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              value={hfQuery}
              onChange={(e) => setHfQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleHfSearch()}
              placeholder="Search Hugging Face models…"
              className="ops-input flex-1 font-mono"
            />
            <button
              onClick={handleHfSearch}
              disabled={loadingHf}
              className="ops-button ops-button-primary flex-shrink-0"
            >
              {loadingHf ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">Search</span>
            </button>
          </div>

          <div className="ops-notice ops-notice-info">
            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <p>
              Gated or private repositories need a Hugging Face access token. Add one under{" "}
              <Link to="/settings" className="text-primary hover:underline">Settings → Connected Accounts</Link>.
            </p>
          </div>

          {hfError && (
            <div className="ops-notice ops-notice-alert">{hfError}</div>
          )}

          {hfResults.length > 0 && (
            <div className="space-y-2">
              {hfResults.map((m) => {
                const key = `huggingface:${m.model_id}`;
                const isDownloaded = models.some((dm) => dm.model_id === m.model_id && dm.source === "huggingface");
                const isDownloading = downloadingId === key;
                const progress = downloadProgress[key] ?? 0;
                return (
                  <div key={m.model_id} className="panel">
                    <div className="flex items-center gap-3 p-3">
                      <Brain className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-mono text-sm truncate">{m.model_id}</p>
                        <p className="ops-label mt-1">
                          {m.downloads != null ? `↓ ${m.downloads.toLocaleString()}` : ""}{" "}
                          {m.likes != null ? `♥ ${m.likes}` : ""}
                        </p>
                        {isDownloading && (
                          <div className="progress-track mt-2">
                            <div className="progress-fill" style={{ width: `${progress}%` }} />
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => handleDownload("huggingface", m.model_id)}
                        disabled={isDownloaded || isDownloading}
                        className="ops-button flex-shrink-0"
                      >
                        {isDownloaded ? <CheckCircle className="h-3 w-3" /> : <Download className="h-3 w-3" />}
                        {isDownloaded ? "Downloaded" : isDownloading ? `${Math.round(progress)}%` : "Download"}
                      </button>
                    </div>
                    {downloadErrors[key] && (
                      <p className="px-3 pb-2 text-[11px] text-destructive">{downloadErrors[key]}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {rulesModel && (
        <ModelRulesModal
          model={rulesModel}
          onClose={() => setRulesModel(null)}
          onSaved={handleRulesSaved}
        />
      )}
    </div>
  );
}
