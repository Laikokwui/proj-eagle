import { useEffect, useState } from "react";
import { camerasApi, type Camera } from "@/api/cameras";
import { useCamerasStore } from "@/store/cameras";
import { Plus, Play, Square, Pencil, Trash2, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import CameraFormModal from "@/components/cameras/CameraFormModal";

export default function CamerasPage() {
  const { cameras, setCameras, updateCamera, removeCamera } = useCamerasStore();
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCamera, setEditingCamera] = useState<Camera | null>(null);
  const [togglingIds, setTogglingIds] = useState<Set<number>>(new Set());
  const [streamErrors, setStreamErrors] = useState<Record<number, string>>({});
  const [bulkBusy, setBulkBusy] = useState<"start" | "stop" | null>(null);
  const [bulkNotice, setBulkNotice] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    camerasApi.list().then((data) => {
      setCameras(data);
      setLoading(false);
    });
  }, [setCameras]);

  const apiError = (err: unknown, fallback: string) =>
    (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? fallback;

  const clearStreamError = (id: number) =>
    setStreamErrors((e) => {
      const n = { ...e };
      delete n[id];
      return n;
    });

  const handleToggleStream = async (camera: Camera) => {
    if (bulkBusy) return;
    setBulkNotice(null);
    setTogglingIds((s) => new Set(s).add(camera.id));
    clearStreamError(camera.id);
    try {
      const updated = camera.is_streaming
        ? await camerasApi.stop(camera.id)
        : await camerasApi.start(camera.id);
      updateCamera(updated);
    } catch (err: unknown) {
      setStreamErrors((e) => ({ ...e, [camera.id]: apiError(err, "Failed to toggle stream") }));
    } finally {
      setTogglingIds((s) => {
        const n = new Set(s);
        n.delete(camera.id);
        return n;
      });
    }
  };

  const handleBulk = async (action: "start" | "stop") => {
    const targets =
      action === "start"
        ? cameras.filter((c) => !c.is_streaming && c.is_active)
        : cameras.filter((c) => c.is_streaming);
    if (!targets.length || bulkBusy || togglingIds.size > 0) return;

    const skippedInactive =
      action === "start" ? cameras.filter((c) => !c.is_streaming && !c.is_active).length : 0;

    setBulkBusy(action);
    setBulkNotice(null);
    setTogglingIds((s) => {
      const n = new Set(s);
      targets.forEach((c) => n.add(c.id));
      return n;
    });
    targets.forEach((c) => clearStreamError(c.id));

    const failed: string[] = [];
    // Sequential calls avoid spawning every detection worker at once.
    for (const camera of targets) {
      try {
        const updated =
          action === "start" ? await camerasApi.start(camera.id) : await camerasApi.stop(camera.id);
        updateCamera(updated);
      } catch (err: unknown) {
        failed.push(camera.name);
        setStreamErrors((e) => ({
          ...e,
          [camera.id]: apiError(err, `Failed to ${action} stream`),
        }));
      }
    }

    setTogglingIds((s) => {
      const n = new Set(s);
      targets.forEach((c) => n.delete(c.id));
      return n;
    });
    setBulkBusy(null);

    const verb = action === "start" ? "Started" : "Stopped";
    const ok = targets.length - failed.length;
    const parts = [`${verb} ${ok} of ${targets.length} camera${targets.length !== 1 ? "s" : ""}.`];
    if (skippedInactive) parts.push(`Skipped ${skippedInactive} inactive.`);
    if (failed.length) parts.push(`Failed: ${failed.join(", ")}.`);
    setBulkNotice({ text: parts.join(" "), ok: failed.length === 0 });
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this camera? This cannot be undone.")) return;
    try {
      await camerasApi.delete(id);
      removeCamera(id);
    } catch {
      alert("Failed to delete camera.");
    }
  };

  const handleSaved = (camera: Camera) => {
    setCameras(
      cameras.some((c) => c.id === camera.id)
        ? cameras.map((c) => (c.id === camera.id ? camera : c))
        : [...cameras, camera]
    );
    setModalOpen(false);
    setEditingCamera(null);
  };

  const startableCount = cameras.filter((c) => !c.is_streaming && c.is_active).length;
  const stoppableCount = cameras.filter((c) => c.is_streaming).length;
  const streamingCount = cameras.filter((c) => c.is_streaming).length;

  return (
    <div className="space-y-3">
      <div className="panel">
        <div className="panel-head">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="ops-label text-primary">02 / SOURCES</span>
            <h2 className="ops-title">Camera registry</h2>
            <span className="ops-label">
              {cameras.length} configured · {streamingCount} streaming
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => handleBulk("start")}
              disabled={loading || !!bulkBusy || togglingIds.size > 0 || startableCount === 0}
              title="Start all active cameras that are not already streaming"
              className="ops-button"
            >
              {bulkBusy === "start" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5 text-clear" />
              )}
              Start All
            </button>
            <button
              onClick={() => handleBulk("stop")}
              disabled={loading || !!bulkBusy || togglingIds.size > 0 || stoppableCount === 0}
              title="Stop all currently streaming cameras"
              className="ops-button"
            >
              {bulkBusy === "stop" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Square className="h-3.5 w-3.5 text-destructive" />
              )}
              Stop All
            </button>
            <button
              onClick={() => { setEditingCamera(null); setModalOpen(true); }}
              disabled={!!bulkBusy}
              className="ops-button ops-button-primary"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Camera
            </button>
          </div>
        </div>
      </div>

      {bulkNotice && (
        <div
          className={`ops-notice ${bulkNotice.ok ? "ops-notice-clear" : "ops-notice-alert"}`}
        >
          {bulkNotice.ok ? (
            <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
          )}
          <span className="flex-1">{bulkNotice.text}</span>
          <button
            onClick={() => setBulkNotice(null)}
            className="text-current opacity-70 hover:opacity-100"
            aria-label="Dismiss notification"
          >
            ×
          </button>
        </div>
      )}

      {loading ? (
        <div className="panel px-4 py-12">
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="ops-label">Reading camera registry…</span>
          </div>
        </div>
      ) : cameras.length === 0 ? (
        <div className="panel relative px-6 py-16 text-center">
          <div className="hazard-rail absolute left-0 top-0 bottom-0 w-1" aria-hidden="true" />
          <p className="ops-title">No cameras registered</p>
          <p className="text-xs text-muted-foreground mt-2">
            Add a camera to connect an RTSP or HTTP stream.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {cameras.map((camera) => {
            const isToggling = togglingIds.has(camera.id);
            const error = streamErrors[camera.id];
            const statusText = isToggling
              ? camera.is_streaming ? "Stopping…" : "Connecting…"
              : camera.is_streaming ? "Live" : "Offline";
            return (
              <div key={camera.id} className="panel relative overflow-hidden">
                <div
                  className={`absolute left-0 top-0 bottom-0 w-0.5 ${
                    camera.is_streaming ? "bg-clear" : "bg-border"
                  }`}
                  aria-hidden="true"
                />
                <div className="flex items-center gap-4 px-4 py-3">
                  <div className="flex-shrink-0">
                    {isToggling ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : (
                      <span
                        className={`status-dot block ${
                          camera.is_streaming
                            ? "bg-clear animate-pulse"
                            : "bg-muted-foreground/40"
                        }`}
                      />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <p className="text-sm font-medium">{camera.name}</p>
                      {camera.location && (
                        <span className="ops-label truncate">{camera.location}</span>
                      )}
                      <span className={`ops-chip ml-auto ${
                        isToggling
                          ? "ops-chip-warn"
                          : camera.is_streaming
                          ? "ops-chip-clear"
                          : "ops-chip-neutral"
                      }`}>
                        {statusText}
                      </span>
                    </div>
                    <p className="font-mono text-xs text-muted-foreground truncate mt-1 max-w-xl">
                      {camera.rtsp_url.replace(/:([^@/]+)@/, ":••••@")}
                    </p>
                  </div>

                  <span className="ops-chip ops-chip-neutral hidden md:inline-flex flex-shrink-0">
                    {camera.fps_limit} fps
                  </span>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => handleToggleStream(camera)}
                      disabled={isToggling || !!bulkBusy}
                      title={camera.is_streaming ? "Stop stream" : "Start stream"}
                      className={`icon-button ${
                        camera.is_streaming
                          ? "hover:text-destructive"
                          : "hover:text-clear"
                      }`}
                    >
                      {isToggling ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : camera.is_streaming ? (
                        <Square className="h-4 w-4" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                    </button>
                    <button
                      onClick={() => { setEditingCamera(camera); setModalOpen(true); }}
                      disabled={!!bulkBusy}
                      title="Edit camera"
                      className="icon-button"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(camera.id)}
                      title="Delete camera"
                      disabled={camera.is_streaming || !!bulkBusy}
                      className="icon-button hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="ops-notice ops-notice-alert border-t-0">
                    <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {modalOpen && (
        <CameraFormModal
          camera={editingCamera}
          onClose={() => { setModalOpen(false); setEditingCamera(null); }}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
