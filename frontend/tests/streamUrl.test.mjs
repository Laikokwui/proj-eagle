// Run with: node tests/streamUrl.test.mjs
// No test runner required; TypeScript is already a dev dependency.
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const sourcePath = new URL("../src/utils/streamUrl.ts", import.meta.url);
const source = fs.readFileSync(sourcePath, "utf8");
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText;
const u = await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);

let passed = 0;
function check(name, actual, expected) {
  assert.deepEqual(actual, expected, name);
  passed += 1;
  console.log(`ok  ${name}`);
}

check("duplicate scheme", u.stripDuplicateSchemes("http://http://host/x"), "http://host/x");
check("mixed duplicate scheme", u.stripDuplicateSchemes("rtsp://https://host/x"), "https://host/x");
check("normal scheme untouched", u.stripDuplicateSchemes("rtsp://user:pass@host:554/stream"), "rtsp://user:pass@host:554/stream");

check("empty port", u.splitHostPort("host:/stream"), { host: "host", port: "" });
check("explicit port", u.splitHostPort("host:1935"), { host: "host", port: "1935" });
check("repeated port", u.splitHostPort("host:80:80"), { host: "host", port: "80" });
check("credentials", u.splitHostPort("user:pass@host:554"), { host: "host", port: "554" });
check("ipv6", u.splitHostPort("[2606:4700:4700::1111]:554"), {
  host: "[2606:4700:4700::1111]",
  port: "554",
});

check(
  "simple: HLS example",
  u.normalizePastedUrl("http://il28.cast-tv.com:1935/23595_LIVE/_definst_//23595_LIVE/playlist.m3u8"),
  "http://il28.cast-tv.com:1935/23595_LIVE/_definst_//23595_LIVE/playlist.m3u8",
);
check(
  "simple: snapshot example",
  u.normalizePastedUrl("http://archives.earthcam.com/archives5/live2.jpg"),
  "http://archives.earthcam.com/archives5/live2.jpg",
);
check(
  "simple: REST image example",
  u.normalizePastedUrl("http://api.deckchair.com/v1/camera/542292d45d880f297389bda3/images"),
  "http://api.deckchair.com/v1/camera/542292d45d880f297389bda3/images",
);
check("simple: duplicate scheme cleaned", u.normalizePastedUrl("http://http://host:8080/video"), "http://host:8080/video");
check("simple: empty port cleaned", u.normalizePastedUrl("rtsp://host:/stream"), "rtsp://host/stream");
check("simple: repeated port cleaned", u.normalizePastedUrl("http://host:80:80/video"), "http://host:80/video");
check(
  "simple: credentials preserved",
  u.normalizePastedUrl("rtsp://user:p%40ss@host:554/stream"),
  "rtsp://user:p%40ss@host:554/stream",
);
check("simple: rtsps accepted", u.normalizePastedUrl("rtsps://host:322/stream"), "rtsps://host:322/stream");

check(
  "advanced: no duplicate scheme or port from pasted host",
  u.buildStreamUrl({
    protocol: "http",
    username: "",
    password: "",
    host: "http://192.168.1.5:8080",
    port: "8080",
    path: "/mjpeg",
  }),
  "http://192.168.1.5:8080/mjpeg",
);
check(
  "advanced: blank port uses scheme default",
  u.buildStreamUrl({
    protocol: "rtsp",
    username: "admin",
    password: "p@ss",
    host: "192.168.1.5",
    port: "",
    path: "stream",
  }),
  "rtsp://admin:p%40ss@192.168.1.5/stream",
);
check(
  "advanced: ipv6",
  u.buildStreamUrl({
    protocol: "https",
    username: "",
    password: "",
    host: "[2606:4700:4700::1111]:443",
    port: "443",
    path: "/video",
  }),
  "https://[2606:4700:4700::1111]:443/video",
);
check(
  "advanced: rtsps",
  u.buildStreamUrl({
    protocol: "rtsps",
    username: "",
    password: "",
    host: "host:322",
    port: "322",
    path: "/stream",
  }),
  "rtsps://host:322/stream",
);

check("invalid: missing scheme", u.urlValidationError("192.168.1.5:554/stream")?.startsWith("URL must start"), true);
check("invalid: non numeric port", u.urlValidationError("http://host:abc/video"), "Port must be a number");
check("invalid: port out of range", u.urlValidationError("http://host:70000/video"), "Port must be between 1 and 65535");
check("valid: example", u.urlValidationError("http://host:1935/app/playlist.m3u8"), null);

console.log(`\nAll ${passed} stream URL checks passed.`);
