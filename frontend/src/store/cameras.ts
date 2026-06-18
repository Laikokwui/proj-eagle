import { create } from "zustand";
import type { Camera } from "@/api/cameras";

interface CamerasState {
  cameras: Camera[];
  setCameras: (cameras: Camera[]) => void;
  updateCamera: (camera: Camera) => void;
  removeCamera: (id: number) => void;
}

export const useCamerasStore = create<CamerasState>((set) => ({
  cameras: [],
  setCameras: (cameras) => set({ cameras }),
  updateCamera: (camera) =>
    set((state) => ({
      cameras: state.cameras.map((c) => (c.id === camera.id ? camera : c)),
    })),
  removeCamera: (id) =>
    set((state) => ({ cameras: state.cameras.filter((c) => c.id !== id) })),
}));
