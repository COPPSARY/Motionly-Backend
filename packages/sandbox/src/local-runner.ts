import { spawn } from "node:child_process";
import { realpath } from "node:fs/promises";
import path from "node:path";

import { SandboxExecutionError, type SandboxRequest, type SandboxResult, type SandboxRunner } from "./types.js";

const MAX_OUTPUT_BYTES = 2_000_000;

export interface LocalSandboxOptions {
  workspaceRoot: string;
}

export class LocalProcessSandboxRunner implements SandboxRunner {
  constructor(private readonly options: LocalSandboxOptions) {}

  async run(request: SandboxRequest): Promise<SandboxResult> {
    const workspaceRoot = await realpath(this.options.workspaceRoot);
    const workspacePath = await realpath(request.workspacePath);
    if (!isInside(workspaceRoot, workspacePath)) throw new Error("Sandbox workspace is outside the configured root.");
    if (!Number.isInteger(request.timeoutMs) || request.timeoutMs < 1_000 || request.timeoutMs > 7_200_000) {
      throw new Error("Sandbox timeout must be between 1 second and 2 hours.");
    }

    const startedAt = Date.now();
    const timeoutController = new AbortController();
    const timer = setTimeout(() => timeoutController.abort(new Error("Sandbox timed out.")), request.timeoutMs);
    const signal = request.signal ? AbortSignal.any([request.signal, timeoutController.signal]) : timeoutController.signal;
    
    try {
      // Find the absolute path to the backend repo root (one level up from packages/sandbox)
      // Since this file is in packages/sandbox/src/local-runner.ts
      const { fileURLToPath } = await import('node:url');
      const __dirname = path.dirname(fileURLToPath(import.meta.url));
      const rootDir = path.resolve(__dirname, "../../../");
      
      const args = ["--import", "tsx", "apps/renderer/src/browser.ts", request.operation];
      
      // Execute from the repo root so it can find apps/renderer
      const { stdout, stderr, exitCode } = await spawnProcess(args, signal, rootDir, workspacePath);
      if (exitCode !== 0) {
        throw new SandboxExecutionError("Sandbox operation failed.", exitCode, redactDiagnostics(stderr || stdout));
      }
      return { operation: request.operation, stdout, stderr, durationMs: Date.now() - startedAt };
    } finally {
      clearTimeout(timer);
    }
  }
}

function spawnProcess(args: string[], signal: AbortSignal, cwd: string, workspacePath: string): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  return new Promise((resolve, reject) => {
    // When bypassing docker, we need to pass the workspacePath to the renderer script, 
    // because normally Docker mounts it at /workspace
    const child = spawn(process.execPath, [...args, workspacePath], { 
      cwd, 
      windowsHide: true, 
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, TZ: "UTC" } 
    });
    
    let stdout = "";
    let stderr = "";
    let settled = false;
    
    const append = (current: string, chunk: Buffer) => {
      const next = current + chunk.toString("utf8");
      if (Buffer.byteLength(next, "utf8") > MAX_OUTPUT_BYTES) throw new Error("Sandbox output limit exceeded.");
      return next;
    };
    
    const terminate = (error: unknown) => {
      if (settled) return;
      settled = true;
      const failure = error instanceof Error ? error : new Error("Sandbox cancelled.");
      child.kill("SIGKILL");
      reject(failure);
    };
    
    const onAbort = () => terminate(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    
    child.stdout.on("data", (chunk: Buffer) => {
      try { stdout = append(stdout, chunk); } catch (error) { terminate(error); }
    });
    
    child.stderr.on("data", (chunk: Buffer) => {
      try { stderr = append(stderr, chunk); } catch (error) { terminate(error); }
    });
    
    child.once("error", (error) => {
      signal.removeEventListener("abort", onAbort);
      if (!settled) { settled = true; reject(error); }
    });
    
    child.once("close", (exitCode) => {
      signal.removeEventListener("abort", onAbort);
      if (!settled) { settled = true; resolve({ stdout, stderr, exitCode }); }
    });
  });
}

function isInside(root: string, candidate: string) {
  const relative = path.relative(root, candidate);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function redactDiagnostics(value: string) {
  return value
    .replaceAll(/(?:[A-Za-z]:\\|\/)(?:[^\s:'"]+[\\/])+/g, "<path>/")
    .replaceAll(/(api[_-]?key|token|secret|password)\s*[=:]\s*[^\s]+/gi, "$1=<redacted>")
    .slice(0, 20_000);
}
