import { useEffect, useState } from "react";
import { camerasApi, type Camera } from "@/api/cameras";
import { useCamerasStore } from "@/store/cameras";
import { Plus, Play, Square, Pencil, Trash2, Loader2, AlertCircle } from "lucide-react";
import CameraFormModal from "@/components/cameras/CameraFormModal";

export default function CamerasPage() {
  const { cameras, setCameras, updateCamera, removeCamera } = useCamerasStore();
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCamera, setEditingCamera] = useState<Camera | null>(null);
  const [togglingIds, setTogglingIds] = useState<Set<number>>(new Set());
  const [streamErrors, setStreamErrors] = useState<Record<number, string>>({});

  useEffect(() => {
    camerasApi.list().then((data) => {
      setCameras(data);
      setLoading(false);
    });
  }, [setCameras]);

  const handleToggleStream = async (camera: Camera) => {
    setTogglingIds((s) => new Set(s).add(camera.id));
    setStreamErrors((e) => { const n = { ...e }; delete n[camera.id]; return n; });
    try {
      const updated = camera.is_streaming
        ? await camerasApi.stop(camera.id)
        : await camerasApi.start(camera.id);
      updateCamera(updated);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "Failed to toggle stream";
      setStreamErrors((e) => ({ ...e, [camera.id]: msg }));
    } finally {
      setTogglingIds((s) => { const n = new Set(s); n.delete(camera.id); return n; });
    }
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Cameras</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {cameras.length} camera{cameras.length !== 1 ? "s" : ""} ·{" "}
            {cameras.filter((c) => c.is_streaming).length} streaming
          </p>
        </div>
        <button
          onClick={() => { setEditingCamera(null); setModalOpen(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Add Camera
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading cameras…</span>
        </div>
      ) : cameras.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground border border-dashed border-border rounded-lg space-y-2">
          <p className="text-sm font-medium">No cameras yet</p>
          <p className="text-xs">Click <strong>Add Camera</strong> to connect your first RTSP stream.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {cameras.map((camera) => {
            const isToggling = togglingIds.has(camera.id);
            const error = streamErrors[camera.id];
            return (
              <div
                key={camera.id}
                className="rounded-lg border border-border bg-card overflow-hidden"
              >
                <div className="flex items-center gap-4 px-4 py-3">
                  {/* Status dot */}
                  <div className="flex-shrink-0">
                    {isToggling ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : (
                      <div
                        className={`h-2.5 w-2.5 rounded-full ${
                          camera.is_streaming
                            ? "bg-green-400 shadow-[0_0_6px_2px_rgba(74,222,128,0.4)] animate-pulse"
                            : "bg-gray-600"
                        }`}
                      />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <p className="font-medium text-sm">{camera.name}</p>
                      {camera.location && (
                        <span className="text-xs text-muted-foreground truncate">{camera.location}</span>
                      )}
                      <span
                        className={`ml-auto text-xs font-medium ${
                          isToggling
                            ? "text-muted-foreground"
                            : camera.is_streaming
                            ? "text-green-400"
                            : "text-muted-foreground"
                        }`}
                      >
                        {isToggling
                          ? camera.is_streaming ? "Stopping…" : "Connecting…"
                          : camera.is_streaming
                          ? "Live"
                          : "Offline"}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground font-mono truncate mt-0.5 max-w-sm">
                      {/* Mask password in displayed URL */}
                      {camera.rtsp_url.replace(/:([^@/]+)@/, ":••••@")}
                    </p>
                  </div>

                  {/* FPS badge */}
                  <span className="hidden md:block text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded flex-shrink-0">
                    {camera.fps_limit} fps
                  </span>

                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => handleToggleStream(camera)}
                      disabled={isToggling}
                      title={camera.is_streaming ? "Stop stream" : "Start stream"}
                      className={`p-2 rounded transition-colors disabled:opacity-40 ${
                        camera.is_streaming
                          ? "text-green-400 hover:bg-destructive/10 hover:text-destructive"
                          : "text-muted-foreground hover:bg-green-900/20 hover:text-green-400"
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
                      title="Edit camera"
                      className="p-2 rounded text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>

                    <button
                      onClick={() => handleDelete(camera.id)}
                      title="Delete camera"
                      disabled={camera.is_streaming}
                      className="p-2 rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors disabled:opacity-30"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Error row */}
                {error && (
                  <div className="flex items-center gap-2 px-4 py-2 bg-destructive/10 border-t border-destructive/20 text-xs text-destructive">
                    <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                    {error}
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
