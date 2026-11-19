FROM python:3.11-slim

WORKDIR /app

# Dependencies first so source edits reuse the cached layer. No apt packages
# are needed: headless OpenCV bundles FFmpeg and needs no X11/GL libraries.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
    && pip install --no-cache-dir --no-deps ultralytics==8.3.55 \
    && python -c "import cv2, ultralytics"

COPY entrypoint.sh /entrypoint.sh
# Git checks this file out with CRLF on Windows; a trailing \r in the shebang
# makes exec fail with "no such file or directory" and the API crash-loops.
RUN sed -i 's/\r$//' /entrypoint.sh && chmod +x /entrypoint.sh

COPY . .

EXPOSE 8000

ENTRYPOINT ["/entrypoint.sh"]
