import { useEffect, useState } from "react";
import { modelsApi, type AIModel, type UltralyticsModelInfo, type HFModelSearchResult } from "@/api/models";
import { CheckCircle, Download, Trash2, Search, Brain } from "lucide-react";

type Tab = "downloaded" | "ultralytics" | "huggingface";

export default function ModelsPage() {
  const [tab, setTab] = useState<Tab>("downloaded");
  const [models, setModels] = useState<AIModel[]>([]);
  const [ultralyticsModels, setUltralyticsModels] = useState<UltralyticsModelInfo[]>([]);
  const [hfResults, setHfResults] = useState<HFModelSearchResult[]>([]);
  const [hfQuery, setHfQuery] = useState("ppe detection yolo");
  const [loadingHf, setLoadingHf] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<Record<string, number>>({});

  useEffect(() => {
    modelsApi.list().then(setModels);
    modelsApi.listUltralytics().then(setUltralyticsModels);
  }, []);

  const handleActivate = async (id: number) => {
    const updated = await modelsApi.activate(id);
    setModels((prev) => prev.map((m) => ({ ...m, is_active: m.id === updated.id })));
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this model?")) return;
    await modelsApi.delete(id);
    setModels((prev) => prev.filter((m) => m.id !== id));
  };

  const handleDownload = async (source: string, modelId: string, name?: string) => {
    const key = `${source}:${modelId}`;
    setDownloadingId(key);
    try {
      const { task_id } = await modelsApi.download(source, modelId, name);
      const eventSource = new EventSource(`/api/models/download-progress/${task_id}`);
      eventSource.onmessage = (e) => {
        const data = JSON.parse(e.data);
        setDownloadProgress((prev) => ({ ...prev, [key]: data.progress_pct }));
        if (data.status === "completed" || data.status === "error") {
          eventSource.close();
          setDownloadingId(null);
          if (data.status === "completed") modelsApi.list().then(setModels);
        }
      };
    } catch {
      setDownloadingId(null);
    }
  };

  const handleHfSearch = async () => {
    setLoadingHf(true);
    try {
      const results = await modelsApi.searchHuggingFace(hfQuery);
      setHfResults(results);
    } finally {
      setLoadingHf(false);
    }
  };

  const activeModel = models.find((m) => m.is_active);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">AI Models</h2>
        {activeModel && (
          <div className="flex items-center gap-2 bg-green-900/20 text-green-400 border border-green-800 px-3 py-1.5 rounded-full text-xs font-medium">
            <CheckCircle className="h-3.5 w-3.5" />
            Active: {activeModel.name}
          </div>
        )}
      </div>

      <div className="flex gap-2 border-b border-border">
        {(["downloaded", "ultralytics", "huggingface"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm capitalize ${
              tab === t ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "downloaded" ? "Downloaded" : t === "ultralytics" ? "Ultralytics Official" : "HuggingFace"}
          </button>
        ))}
      </div>

      {tab === "downloaded" && (
        <div>
          {models.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              No models downloaded yet. Browse Ultralytics or HuggingFace.
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-secondary">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">Model</th>
                    <th className="text-left px-4 py-3 font-medium">Source</th>
                    <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Classes</th>
                    <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Size</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {models.map((model) => (
                    <tr key={model.id} className="hover:bg-secondary/50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {model.is_active && <CheckCircle className="h-3.5 w-3.5 text-green-400 flex-shrink-0" />}
                          <span className={model.is_active ? "text-green-400 font-medium" : ""}>{model.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground capitalize">{model.source}</td>
                      <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{model.class_names.length}</td>
                      <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                        {model.file_size_mb ? `${model.file_size_mb} MB` : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          {!model.is_active && (
                            <button
                              onClick={() => handleActivate(model.id)}
                              className="px-2 py-1 text-xs bg-primary/10 text-primary rounded hover:bg-primary/20"
                            >
                              Set Active
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(model.id)}
                            disabled={model.is_active}
                            className="p-2 rounded hover:bg-secondary text-muted-foreground hover:text-destructive disabled:opacity-30"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "ultralytics" && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ultralyticsModels.map((m) => {
            const key = `ultralytics:${m.model_id}`;
            const isDownloaded = models.some((dm) => dm.model_id === m.model_id && dm.source === "ultralytics");
            const isDownloading = downloadingId === key;
            const progress = downloadProgress[key] ?? 0;
            return (
              <div key={m.model_id} className="bg-card border border-border rounded-lg p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-sm">{m.name}</p>
                    <p className="text-xs text-muted-foreground">{m.description}</p>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{m.size_mb} MB</span>
                </div>
                {isDownloading && (
                  <div className="w-full bg-secondary rounded-full h-1.5">
                    <div className="bg-primary h-1.5 rounded-full transition-all" style={{ width: `${progress}%` }} />
                  </div>
                )}
                <button
                  onClick={() => handleDownload("ultralytics", m.model_id, m.name)}
                  disabled={isDownloaded || isDownloading}
                  className="w-full flex items-center justify-center gap-2 py-1.5 px-3 text-xs bg-primary/10 text-primary rounded hover:bg-primary/20 disabled:opacity-40"
                >
                  {isDownloaded ? <CheckCircle className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}
                  {isDownloaded ? "Downloaded" : isDownloading ? `${Math.round(progress)}%` : "Download"}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {tab === "huggingface" && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <input
              value={hfQuery}
              onChange={(e) => setHfQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleHfSearch()}
              placeholder="Search HuggingFace models..."
              className="flex-1 px-3 py-2 bg-secondary border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              onClick={handleHfSearch}
              disabled={loadingHf}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90 disabled:opacity-50"
            >
              <Search className="h-4 w-4" />
            </button>
          </div>

          {hfResults.length > 0 && (
            <div className="space-y-2">
              {hfResults.map((m) => {
                const key = `huggingface:${m.model_id}`;
                const isDownloaded = models.some((dm) => dm.model_id === m.model_id && dm.source === "huggingface");
                const isDownloading = downloadingId === key;
                const progress = downloadProgress[key] ?? 0;
                return (
                  <div key={m.model_id} className="flex items-center gap-3 bg-card border border-border rounded-lg p-3">
                    <Brain className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-mono truncate">{m.model_id}</p>
                      <p className="text-xs text-muted-foreground">
                        {m.downloads != null ? `↓ ${m.downloads.toLocaleString()}` : ""}{" "}
                        {m.likes != null ? `♥ ${m.likes}` : ""}
                      </p>
                      {isDownloading && (
                        <div className="w-full bg-secondary rounded-full h-1 mt-1">
                          <div className="bg-primary h-1 rounded-full transition-all" style={{ width: `${progress}%` }} />
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => handleDownload("huggingface", m.model_id)}
                      disabled={isDownloaded || isDownloading}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary/10 text-primary rounded hover:bg-primary/20 disabled:opacity-40 flex-shrink-0"
                    >
                      {isDownloaded ? <CheckCircle className="h-3 w-3" /> : <Download className="h-3 w-3" />}
                      {isDownloaded ? "Downloaded" : isDownloading ? `${Math.round(progress)}%` : "Download"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
