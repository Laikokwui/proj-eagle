# AI-Powered Video Management System 

Real-time AI-powered PPE detection on live IP CCTV streams. Connects to any RTSP/HTTP camera, runs YOLO object detection, and displays live annotated feeds on an operations dashboard.

---

## Screenshots

<!-- Dashboard – live camera grid -->
<img width="1773" height="752" alt="Screenshot 2026-06-18 at 4 22 26 PM" src="https://github.com/user-attachments/assets/6c809c5b-05c2-4bca-93a6-4de77046a8d4" />

<!-- Models – download and activate YOLO models -->
<img width="1797" height="671" alt="Screenshot 2026-06-18 at 4 22 35 PM" src="https://github.com/user-attachments/assets/677f2d3c-c35f-4790-ba88-98095fbef737" />
<img width="1760" height="708" alt="Screenshot 2026-06-18 at 4 24 14 PM" src="https://github.com/user-attachments/assets/80d633b4-3eac-445f-9270-e8e7f01d0f2f" />
<img width="1767" height="869" alt="Screenshot 2026-06-18 at 4 24 26 PM" src="https://github.com/user-attachments/assets/8dad3eba-979c-44dc-b9d4-f62caba6a76b" />

---

## Quick Start

**Requirements:** Docker 24+ with Docker Compose v2

```bash
git clone <your-repo-url> proj-eagle
cd proj-eagle
cp .env.example .env          # set JWT_SECRET to a random string
docker compose up --build     # first build ~10 min (downloads PyTorch)
```

Open **http://localhost** — login with `admin` / `admin123`

> Generate a secure secret: `python3 -c "import secrets; print(secrets.token_hex(32))"`

---

## First Steps

1. **Download a model** — go to *Models → Ultralytics Official*, download any YOLO model, click **Set Active**
2. **Add a camera** — go to *Cameras → Add Camera*, fill in the IP/port/path, click **Test Connection**
3. **Start streaming** — click the Play button next to your camera
4. **View live feeds** — go to *Dashboard*, choose a 2×2 / 3×3 / 4×4 grid layout

**Test RTSP URL (no camera needed):**
```
rtsp://wowzaec2demo.streamlock.net/vod/mp4:BigBuckBunny_115k.mp4
```

---

## Common Camera URLs

| Brand | URL |
|---|---|
| Hikvision | `rtsp://user:pass@<ip>:554/Streaming/Channels/101` |
| Dahua | `rtsp://user:pass@<ip>:554/cam/realmonitor?channel=1&subtype=0` |
| Reolink | `rtsp://user:pass@<ip>:554/h264Preview_01_main` |
| Axis | `rtsp://user:pass@<ip>/axis-media/media.amp` |
| Generic | `rtsp://<ip>:554/stream` |

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `JWT_SECRET` | *(required)* | Secret for JWT signing — use a long random string |
| `DATABASE_URL` | postgres connection | Async PostgreSQL URL |
| `REDIS_URL` | `redis://redis:6379/0` | Redis connection |
| `DATA_DIR` | `/data` | Root for models/ and screenshots/ |
| `DETECTION_FPS` | `5` | Inference rate per camera |
| `DETECTION_CONFIDENCE` | `0.5` | YOLO confidence threshold |
| `HF_TOKEN` | *(optional)* | HuggingFace token for private models |

---

## GPU Support

Add NVIDIA GPU passthrough by running with the GPU override:

```bash
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up --build
```

Requires [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html) on the host. YOLO workers auto-detect CUDA.

---

## Useful Commands

```bash
docker compose up -d          # start in background
docker compose logs -f api    # stream API logs
docker compose down           # stop all
docker compose down -v        # stop and delete all data
docker compose up --build     # rebuild after code changes
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.11, FastAPI, SQLAlchemy 2, Alembic |
| Detection | Ultralytics YOLO (v8/9/10/11), OpenCV |
| Database | PostgreSQL 16 |
| Messaging | Redis pub/sub |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| Serving | Nginx, Docker Compose |

---

## API Docs

Full interactive docs at **http://localhost:8000/docs**

---

## License

MIT
