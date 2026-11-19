import { useRef, useState, useCallback } from "react";
import { useStreamSocket } from "@/hooks/useStreamSocket";
import type { Camera } from "@/api/cameras";
import { WifiOff, Loader2 } from "lucide-react";

interface Props {
  camera: Camera;
}

export default function CameraCell({ camera }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fps, setFps] = useState<number | null>(null);
  const [hasFrame, setHasFrame] = useState(false);

  const handleFirstFrame = useCallback(() => setHasFrame(true), []);
  useStreamSocket(camera.id, canvasRef, camera.is_streaming, setFps, handleFirstFrame);

  const isConnecting = camera.is_streaming && !hasFrame;

  return (
    <div className="reticle relative bg-black aspect-video border border-border overflow-hidden">
      <canvas
        ref={canvasRef}
        className={`w-full h-full object-contain ${camera.is_streaming ? "block" : "hidden"}`}
      />

      {!camera.is_streaming && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
          <WifiOff className="h-8 w-8" />
          <span className="ops-label">Offline</span>
        </div>
      )}

      {isConnecting && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground bg-black/70">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
          <span className="ops-label">Connecting</span>
        </div>
      )}

      <div className="absolute bottom-0 left-0 right-0 flex items-center gap-2 border-t border-border/70 bg-black/85 px-3 py-2">
        <span
          className={`h-2 w-2 flex-shrink-0 ${
            camera.is_streaming
              ? isConnecting
                ? "bg-primary animate-pulse"
                : "bg-clear animate-pulse"
              : "bg-muted-foreground/50"
          }`}
        />
        <span className="text-xs font-medium truncate flex-1">{camera.name}</span>
        {camera.location && (
          <span className="ops-label hidden group-hover:inline truncate">{camera.location}</span>
        )}
        {fps !== null && camera.is_streaming && !isConnecting && (
          <span className="ops-label text-primary">{fps} fps</span>
        )}
      </div>
    </div>
  );
}
