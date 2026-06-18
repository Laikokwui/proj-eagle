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
    <div className="relative bg-black rounded-lg overflow-hidden aspect-video border border-border group">
      {/* Canvas — always mounted when streaming so socket can draw into it */}
      <canvas
        ref={canvasRef}
        className={`w-full h-full object-contain ${camera.is_streaming ? "block" : "hidden"}`}
      />

      {/* Offline state */}
      {!camera.is_streaming && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
          <WifiOff className="h-8 w-8" />
          <span className="text-xs">Offline</span>
        </div>
      )}

      {/* Connecting overlay — streaming but first frame not yet received */}
      {isConnecting && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground bg-black/60">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span className="text-xs">Connecting…</span>
        </div>
      )}

      {/* Bottom bar — always visible */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-2 pb-2 pt-4">
        <div className="flex items-center gap-2">
          <div
            className={`h-2 w-2 rounded-full flex-shrink-0 ${
              camera.is_streaming
                ? isConnecting
                  ? "bg-yellow-400 animate-pulse"
                  : "bg-green-400 animate-pulse"
                : "bg-gray-500"
            }`}
          />
          <span className="text-xs text-white font-medium truncate flex-1">{camera.name}</span>
          {camera.location && (
            <span className="text-xs text-white/50 truncate hidden group-hover:block">
              {camera.location}
            </span>
          )}
          {fps !== null && camera.is_streaming && !isConnecting && (
            <span className="text-xs text-white/60 font-mono flex-shrink-0">{fps} fps</span>
          )}
        </div>
      </div>
    </div>
  );
}
