// Starts the API and the web dev server together: `npm run dev:all` from web/.
//
// Ports come from the env files so the two sides always agree:
//   web  port = FRONTEND_ORIGIN in api/.env (the only origin the API's CORS allows)
//   API  port = NEXT_PUBLIC_API_URL in web/.env.local (where the web app sends its requests)
// A server already listening on its port is left alone, not started twice: a second `next dev` on the same folder
// fights over .next/, and a web server on any other port is blocked by the API's CORS.
// Ctrl+C stops whatever this script started.

import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apiDir = path.resolve(webDir, "..", "api");
const isWindows = process.platform === "win32";

function readEnv(file, key) {
  if (!existsSync(file)) return undefined;
  const line = readFileSync(file, "utf8")
    .split(/\r?\n/)
    .find((l) => l.trim().startsWith(`${key}=`));
  return line?.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
}

function portOf(url, fallback) {
  if (!url) return fallback;
  const u = new URL(url);
  return Number(u.port) || (u.protocol === "https:" ? 443 : 80);
}

const webPort = portOf(readEnv(path.join(apiDir, ".env"), "FRONTEND_ORIGIN"), 3000);
const apiPort = portOf(readEnv(path.join(webDir, ".env.local"), "NEXT_PUBLIC_API_URL"), 8000);

function isListening(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: "127.0.0.1" });
    socket.once("connect", () => (socket.destroy(), resolve(true)));
    socket.once("error", () => resolve(false));
  });
}

const children = [];

function start(name, command, args, cwd) {
  const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
  const prefix = `[${name}] `;
  for (const stream of [child.stdout, child.stderr]) {
    let buffered = "";
    stream.on("data", (chunk) => {
      buffered += chunk;
      const lines = buffered.split(/\r?\n/);
      buffered = lines.pop();
      for (const line of lines) process.stdout.write(prefix + line + "\n");
    });
  }
  child.on("exit", (code) => {
    console.log(`${prefix}stopped (exit code ${code ?? "signal"})`);
    stopAll(code ?? 1);
  });
  children.push(child);
}

let stopping = false;
function stopAll(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode !== null) continue;
    // uvicorn --reload and next dev both run worker processes; kill the whole tree.
    if (isWindows) spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    else child.kill("SIGTERM");
  }
  process.exit(code);
}
process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));

if (await isListening(apiPort)) {
  console.log(`[api] something is already listening on :${apiPort}; using it.`);
} else {
  const uvicorn = path.join(apiDir, ".venv", isWindows ? "Scripts" : "bin", isWindows ? "uvicorn.exe" : "uvicorn");
  if (!existsSync(uvicorn)) {
    console.error(`[api] ${uvicorn} not found. Create the venv first (README.md, "Run it locally").`);
    process.exit(1);
  }
  start("api", uvicorn, ["app.main:app", "--reload", "--port", String(apiPort)], apiDir);
}

if (await isListening(webPort)) {
  console.log(`[web] something is already listening on :${webPort}; using it. Open http://localhost:${webPort}`);
} else {
  const next = path.join(webDir, "node_modules", "next", "dist", "bin", "next");
  start("web", process.execPath, [next, "dev", "--port", String(webPort)], webDir);
}

if (children.length === 0) process.exit(0);
