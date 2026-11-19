from urllib.parse import urlparse, urlunparse


def normalize_stream_url(url: str) -> str:
    """Remove an empty port from a camera stream URL.

    FFmpeg reads ``rtsp://host:/path`` as ``tcp://host`` and fails with
    ``Port missing in uri``. A genuinely portless URL (``rtsp://host/path``)
    is valid and defaults to the scheme's standard port, so only a trailing
    colon in the authority is stripped.
    """
    if not isinstance(url, str) or not url:
        return url
    try:
        parsed = urlparse(url.strip())
    except ValueError:
        return url
    if not parsed.netloc.endswith(":"):
        return url
    return urlunparse(parsed._replace(netloc=parsed.netloc[:-1]))
