# PPE Compliance Monitoring System

A real-time AI-powered PPE (Personal Protective Equipment) compliance monitoring platform. Connects to IP CCTV cameras via RTSP, runs YOLO object detection to identify missing PPE, and displays live annotated video feeds on an operations dashboard.

---

## Features

- **Live CCTV monitoring** — connect any IP camera via RTSP or direct IP stream
- **AI PPE detection** — YOLO-based detection (helmet, vest, gloves, mask, etc.)
- **Model management** — download and switch models from Ultralytics or HuggingFace
- **Real-time alerts** — on-screen notifications and violation history log
- **Screenshot capture** — auto-saves violation images for audit
- **16+ camera support** — multi-threaded capture + detection workers
- **GPU acceleration** — auto-detects CUDA, falls back to CPU

---

## Prerequisites

Before you begin, make sure the following are installed on your machine:

| Tool | Version | Install |
|---|---|---|
| Docker | 24+ | https://docs.docker.com/get-docker/ |
| Docker Compose | v2 (included with Docker Desktop) | bundled with Docker |
| Git | any | https://git-scm.com/ |

**For GPU acceleration (optional):**
- NVIDIA GPU with CUDA support
- [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html) installed on the host

> **CPU-only machines are fully supported.** Detection runs on CPU if no GPU is found — just slower for many cameras.

---

## Option A — Docker Compose (Recommended)

This is the fastest way to get everything running. All services start in containers.

### Step 1 — Clone the project

```bash
git clone <your-repo-url> proj-eagle
cd proj-eagle
```

### Step 2 — Create the environment file

```bash
cp .env.example .env
```

Open `.env` in a text editor and update at minimum:

```env
JWT_SECRET=replace-this-with-a-long-random-string
```

Everything else has sensible defaults for local deployment.

> **Generate a secure JWT secret:**
> ```bash
> python3 -c "import secrets; print(secrets.token_hex(32))"
> ```

### Step 3 — Build and start all services

```bash
docker compose up --build
```

This will:
1. Pull and start **PostgreSQL 16** and **Redis 7**
2. Build the **Python/FastAPI** backend image (installs PyTorch, OpenCV, Ultralytics YOLO)
3. Build the **React** frontend image (Vite build + Nginx)
4. Run **database migrations** automatically
5. Create a default **admin user**

> The first build takes 5–15 minutes because it downloads PyTorch (~2 GB). Subsequent starts are fast.

### Step 4 — Open the app

| Service | URL |
|---|---|
| Frontend dashboard | http://localhost |
| Backend API docs | http://localhost:8000/docs |

**Default login credentials:**
- Username: `admin`
- Password: `admin123`

> Change the admin password after first login via the API: `PATCH /api/users/me` (or update directly in the DB).

### Step 5 — (Optional) Enable GPU

If you have an NVIDIA GPU and the Container Toolkit installed, Docker Compose will automatically use it via `docker-compose.override.yml`. No extra steps needed — just run `docker compose up`.

To verify GPU is detected inside the container:

```bash
docker compose exec api python3 -c "import torch; print('CUDA:', torch.cuda.is_available())"
```

### Common Docker commands

```bash
# Start in background
docker compose up -d

# View logs
docker compose logs -f api
docker compose logs -f frontend

# Stop everything
docker compose down

# Stop and delete all data (database, models, screenshots)
docker compose down -v

# Rebuild after code changes
docker compose up --build
```

---

## Option B — Local Development (No Docker)

Run the backend and frontend directly on your machine for development. Requires PostgreSQL and Redis running locally.

### Prerequisites for local dev

| Tool | Version |
|---|---|
| Python | 3.11+ |
| Node.js | 20+ |
| PostgreSQL | 14+ |
| Redis | 7+ |

**Install PostgreSQL and Redis (macOS):**

```bash
brew install postgresql@16 redis
brew services start postgresql@16
brew services start redis
```

**Install PostgreSQL and Redis (Ubuntu/Debian):**

```bash
sudo apt install postgresql redis-server -y
sudo systemctl start postgresql redis-server
```

---

### Backend Setup

#### Step 1 — Create the database

```bash
psql -U postgres -c "CREATE USER ppe WITH PASSWORD 'ppe';"
psql -U postgres -c "CREATE DATABASE ppe OWNER ppe;"
```

#### Step 2 — Create a Python virtual environment

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
```

#### Step 3 — Install Python dependencies

```bash
pip install -r requirements.txt
```

> This installs PyTorch, OpenCV, Ultralytics, FastAPI, and all other dependencies. Takes 3–10 minutes.

#### Step 4 — Set environment variables

Create a `.env` file inside the `backend/` directory:

```bash
cat > backend/.env << 'EOF'
DATABASE_URL=postgresql+asyncpg://ppe:ppe@localhost:5432/ppe
REDIS_URL=redis://localhost:6379/0
JWT_SECRET=dev-secret-change-in-production
JWT_EXPIRE_MINUTES=60
DATA_DIR=./data
DETECTION_FPS=5
DETECTION_CONFIDENCE=0.5
HF_TOKEN=
EOF
```

#### Step 5 — Run database migrations

```bash
cd backend
alembic upgrade head
```

Expected output:
```
INFO  [alembic.runtime.migration] Running upgrade  -> 0001, Initial schema
```

#### Step 6 — Seed the database

```bash
python seed.py
```

Expected output:
```
Created default admin user: admin / admin123
```

#### Step 7 — Start the backend server

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The API is now available at:
- **API**: http://localhost:8000
- **Interactive docs**: http://localhost:8000/docs

---

### Frontend Setup

Open a **new terminal** (keep the backend running).

#### Step 1 — Install Node.js dependencies

```bash
cd frontend
npm install
```

#### Step 2 — Start the dev server

```bash
npm run dev
```

The frontend is now available at **http://localhost:5173**

> In dev mode, Vite proxies all `/api` and `/ws` requests to `http://localhost:8000` automatically — no CORS issues.

---

## First Steps After Setup

### 1. Log in

Open the app and sign in with `admin` / `admin123`.

### 2. Download a YOLO model

Go to **Models → Ultralytics Official** and click **Download** on any model:

| Model | Size | Best for |
|---|---|---|
| YOLOv8 Nano | 6 MB | Testing, low-spec hardware |
| YOLOv8 Small | 22 MB | Balanced speed/accuracy |
| YOLOv8 Medium | 52 MB | Good accuracy, moderate GPU |
| YOLO11 Nano | 5 MB | Latest architecture, fast |

After download, click **Set Active** to enable the model.

> For PPE-specific detection, search HuggingFace for `ppe yolo` — there are pre-trained models for hard hats, vests, etc.

### 3. Add a camera

Go to **Cameras → Add Camera** and enter:
- **Name**: e.g. `Gate A`
- **RTSP URL**: your camera's stream URL, e.g.:
  - `rtsp://192.168.1.100:554/stream`
  - `rtsp://username:password@192.168.1.100:554/h264`
  - `rtsp://192.168.1.100/live/ch0` (Hikvision)
  - `rtsp://192.168.1.100:554/cam/realmonitor?channel=1&subtype=0` (Dahua)
- **FPS Limit**: 5 is recommended (reduces CPU load per camera)

Click **Test Connection** to verify the stream before saving.

**Testing with a sample RTSP stream** (no camera needed):
```
rtsp://wowzaec2demo.streamlock.net/vod/mp4:BigBuckBunny_115k.mp4
```

### 4. Start streaming

In the Cameras table, click the **Play** button next to your camera. The status indicator turns green.

### 5. View live feeds

Go to **Dashboard** to see all streaming cameras. Use the grid buttons (2×2, 3×3, 4×4) to adjust the layout.

---

## Camera URL Formats

| Brand | URL Format |
|---|---|
| Generic RTSP | `rtsp://<ip>:<port>/stream` |
| Hikvision | `rtsp://<user>:<pass>@<ip>:554/Streaming/Channels/101` |
| Dahua | `rtsp://<user>:<pass>@<ip>:554/cam/realmonitor?channel=1&subtype=0` |
| Reolink | `rtsp://<user>:<pass>@<ip>:554/h264Preview_01_main` |
| Axis | `rtsp://<user>:<pass>@<ip>/axis-media/media.amp` |
| IP address only | `http://<ip>/video.cgi` (MJPEG, not RTSP — may not work) |

---

## Project Structure

```
proj-eagle/
├── docker-compose.yml            # All services
├── docker-compose.override.yml   # GPU passthrough (auto-applied)
├── .env.example                  # Environment variable template
├── CLAUDE.md                     # Developer reference
│
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt          # Python dependencies
│   ├── alembic/                  # Database migrations
│   │   └── versions/0001_initial.py
│   ├── seed.py                   # Creates default admin user
│   └── app/
│       ├── main.py               # FastAPI entry point
│       ├── config.py             # Settings (reads from .env)
│       ├── routers/              # API endpoints
│       ├── services/             # Business logic
│       ├── workers/              # RTSP capture + YOLO detection threads
│       ├── models/               # SQLAlchemy database models
│       └── schemas/              # Pydantic request/response shapes
│
└── frontend/
    ├── Dockerfile
    ├── nginx.conf                # Serves SPA + proxies API/WS
    └── src/
        ├── pages/                # Dashboard, Cameras, Models, Violations, Login
        ├── components/           # UI components
        ├── hooks/                # useStreamSocket, useAlertSocket
        ├── store/                # Zustand state (auth, cameras, alerts)
        └── api/                  # Axios API layer
```

---

## Environment Variables Reference

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://ppe:ppe@postgres:5432/ppe` | PostgreSQL connection string |
| `REDIS_URL` | `redis://redis:6379/0` | Redis connection string |
| `JWT_SECRET` | *(required)* | Secret key for signing JWT tokens — use a long random string |
| `JWT_EXPIRE_MINUTES` | `60` | Access token lifetime in minutes |
| `JWT_REFRESH_EXPIRE_DAYS` | `7` | Refresh token lifetime in days |
| `DATA_DIR` | `/data` | Root directory for model files and screenshots |
| `DETECTION_FPS` | `5` | Inference frames per second per camera |
| `DETECTION_CONFIDENCE` | `0.5` | Minimum YOLO confidence threshold (0.0–1.0) |
| `HF_TOKEN` | *(optional)* | HuggingFace API token for private model repos |

---

## Troubleshooting

### "Cannot connect to Docker daemon"
Make sure Docker Desktop is running before executing any `docker compose` commands.

### Backend container keeps restarting
Check the logs:
```bash
docker compose logs api
```
Common causes:
- Database not ready yet — wait 10 seconds and try `docker compose up` again
- Bad `DATABASE_URL` in `.env`

### RTSP stream shows "Not streaming" / blank
1. Verify the URL with VLC: **Media → Open Network Stream** → paste the RTSP URL
2. Use the **Test Connection** button in the Cameras page
3. Check network — the Docker container must be able to reach the camera IP
4. For cameras behind NAT, use the host's IP or bridge mode networking

### "Module not found" errors in backend (local dev)
Make sure the virtual environment is activated:
```bash
source backend/.venv/bin/activate
```

### Frontend shows "Cannot connect" after login
The frontend Vite dev proxy requires the backend to be running on port 8000. Make sure:
```bash
uvicorn app.main:app --reload --port 8000
```

### HuggingFace download fails
Some models require authentication. Add your token to `.env`:
```
HF_TOKEN=hf_your_token_here
```
Get a free token at https://huggingface.co/settings/tokens

### GPU not detected
```bash
# Verify NVIDIA Container Toolkit is installed
docker run --rm --gpus all nvidia/cuda:12.0-base-ubuntu22.04 nvidia-smi
```
If this fails, follow the [NVIDIA Container Toolkit installation guide](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html).

---

## API Quick Reference

The full interactive API docs are at **http://localhost:8000/docs**

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/login` | Login (returns JWT tokens) |
| `GET` | `/api/cameras` | List all cameras |
| `POST` | `/api/cameras` | Add a camera |
| `POST` | `/api/cameras/{id}/start` | Start streaming |
| `POST` | `/api/cameras/{id}/stop` | Stop streaming |
| `POST` | `/api/cameras/{id}/test` | Test RTSP connection |
| `GET` | `/api/models` | List downloaded models |
| `GET` | `/api/models/ultralytics` | Browse Ultralytics catalog |
| `GET` | `/api/models/huggingface/search?q=ppe` | Search HuggingFace |
| `POST` | `/api/models/download` | Download a model |
| `POST` | `/api/models/{id}/activate` | Set active detection model |
| `GET` | `/api/violations` | List violations |
| `GET` | `/api/violations/export/csv` | Export violations to CSV |
| `PATCH` | `/api/violations/{id}/acknowledge` | Acknowledge a violation |
| `GET` | `/api/health` | System health check |

---

## Performance Tips

- **FPS Limit**: Set to 5 fps per camera (default). Higher values increase CPU/GPU load linearly.
- **JPEG Quality**: Detection workers encode at quality 75 — good balance of bandwidth and clarity.
- **Model size**: Use Nano or Small models for CPU-only servers with many cameras. Use Large/XLarge only with GPU.
- **16+ cameras on CPU**: Expect ~1–3 fps effective detection rate per camera. Increase detection FPS or use GPU to improve.
- **Grid view**: The 4×4 grid streams all 16 cameras simultaneously. If bandwidth is tight, use the 2×2 view to only connect to 4 streams.

---

## License

MIT
