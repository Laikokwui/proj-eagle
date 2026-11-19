# PPE Compliance Monitoring System

AI-powered PPE detection platform using YOLO on live IP CCTV streams.

## Quick Start

```bash
cp .env.example .env          # review settings
docker compose up --build     # starts postgres, redis, api, frontend
# Frontend: http://localhost
# API docs: http://localhost:8000/docs
# Default login: admin / admin123
```

## Architecture

- **Backend**: FastAPI (Python 3.11) at port 8000
- **Frontend**: React 18 + TypeScript, served by Nginx at port 80
- **Detection**: Ultralytics YOLO in per-camera `DetectionWorker` threads
- **Frame bus**: Redis pub/sub — workers publish JPEG frames, FastAPI WS handlers subscribe
- **Database**: PostgreSQL 16 via SQLAlchemy 2 async

### Key design rule
YOLO inference always runs in `DetectionWorker` threads, **never** in the FastAPI event loop. Violations are published to Redis (`"alerts"` channel) and persisted asynchronously.

## Development

Backend dev (without Docker):
```bash
cd backend
pip install -r requirements.txt
export DATABASE_URL="postgresql+asyncpg://ppe:ppe@localhost:5432/ppe"
export REDIS_URL="redis://localhost:6379/0"
export JWT_SECRET="dev-secret"
export DATA_DIR="./data"
alembic upgrade head
python seed.py
uvicorn app.main:app --reload
```

Frontend dev:
```bash
cd frontend
npm install
npm run dev      # proxies /api and /ws to localhost:8000
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | postgres connection | Async PostgreSQL URL |
| `REDIS_URL` | redis://redis:6379/0 | Redis connection |
| `JWT_SECRET` | (required) | Secret for JWT signing |
| `JWT_EXPIRE_MINUTES` | 60 | Access token lifetime |
| `DATA_DIR` | /data | Root for models/ and screenshots/ |
| `DETECTION_FPS` | 5 | Inference rate per camera |
| `DETECTION_CONFIDENCE` | 0.5 | YOLO confidence threshold |
| `HF_TOKEN` | (optional) | HuggingFace token fallback for private models |
| `ULTRALYTICS_API_KEY` | (optional) | Ultralytics Platform API key fallback for private models |

## GPU Support

GPU passthrough is opt-in via `docker compose -f docker-compose.yml -f docker-compose.gpu.yml up --build`. The override is NOT loaded automatically. Requires NVIDIA Container Toolkit on the host.

YOLO workers auto-detect CUDA via `torch.cuda.is_available()`.

## Project Structure

```
backend/app/
  main.py              FastAPI app factory + lifespan
  routers/             auth, cameras, models, violations, stream (WS)
  services/            camera_manager, detection_service, model_service, alert_service
  workers/             CaptureWorker (RTSP thread), DetectionWorker (YOLO thread)
  models/              SQLAlchemy ORM
  schemas/             Pydantic I/O

frontend/src/
  pages/               LoginPage, Dashboard, Cameras, Models, Violations
  components/          layout, dashboard (canvas cells), cameras, violations
  hooks/               useStreamSocket, useAlertSocket
  store/               Zustand: auth, cameras, alerts
  api/                 Axios API layer
```

## API Endpoints

| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/login` | Login, returns JWT pair |
| POST | `/api/auth/refresh` | Refresh access token |
| GET/POST | `/api/cameras` | List / create cameras |
| POST | `/api/cameras/{id}/start` | Start RTSP stream |
| POST | `/api/cameras/{id}/test` | Test RTSP, returns first frame |
| GET | `/api/models` | List downloaded models |
| GET | `/api/models/ultralytics` | Official YOLO model catalog |
| GET | `/api/models/huggingface/search` | Search HuggingFace |
| POST | `/api/models/download` | Start model download |
| GET | `/api/models/download-progress/{task_id}` | SSE download progress |
| POST | `/api/models/{id}/activate` | Set active model |
| GET | `/api/violations` | List violations (filterable) |
| PATCH | `/api/violations/{id}/acknowledge` | Acknowledge violation |
| GET | `/api/violations/export/csv` | Export to CSV |
| WS | `/ws/stream/{camera_id}?token=` | Live binary JPEG stream |
| WS | `/ws/alerts?token=` | Real-time alert events |
| GET | `/api/health` | Service health check |
