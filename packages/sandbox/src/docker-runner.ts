import { spawn } from 'node:child_process';
import { realpath } from 'node:fs/promises';
import path from 'node:path';

import { SandboxExecutionError, type SandboxRequest, type SandboxResult, type SandboxRunner } from './types.js';

const MAX_OUTPUT_BYTES = 2_000_000;

export interface DockerSandboxOptions {
  image: string;
  workspaceRoot: string;
  memoryMb?: number;
  cpus?: number;
  pidsLimit?: number;
}

export class DockerSandboxRunner implements SandboxRunner {
  constructor(private readonly options: DockerSandboxOptions) {}

  async run(request: SandboxRequest): Promise<SandboxResult> {
    const workspaceRoot = await realpath(this.options.workspaceRoot);
    const workspacePath = await realpath(request.workspacePath);
    if (!isInside(workspaceRoot, workspacePath)) throw new Error('Sandbox workspace is outside the configured root.');
    if (!Number.isInteger(request.timeoutMs) || request.timeoutMs < 1_000 || request.timeoutMs > 7_200_000) {
      throw new Error('Sandbox timeout must be between 1 second and 2 hours.');
    }

    const containerName = `motionly-${crypto.randomUUID()}`;
    const args = buildDockerArguments({
      image: this.options.image,
      workspacePath,
      containerName,
      operation: request.operation,
      memoryMb: this.options.memoryMb ?? 2_048,
      cpus: this.options.cpus ?? 2,
      pidsLimit: this.options.pidsLimit ?? 256,
    });
    const startedAt = Date.now();
    const timeoutController = new AbortController();
    const timer = setTimeout(() => timeoutController.abort(new Error('Sandbox timed out.')), request.timeoutMs);
    const signal = request.signal ? AbortSignal.any([request.signal, timeoutController.signal]) : timeoutController.signal;
    try {
      const { stdout, stderr, exitCode } = await spawnDocker(args, signal, containerName);
      if (exitCode !== 0) {
        throw new SandboxExecutionError('Sandbox operation failed.', exitCode, redactDiagnostics(stderr || stdout));
      }
      return { operation: request.operation, stdout, stderr, durationMs: Date.now() - startedAt };
    } finally {
      clearTimeout(timer);
    }
  }
}

export function buildDockerArguments(input: {
  image: string;
  workspacePath: string;
  containerName: string;
  operation: 'validate' | 'capture' | 'export';
  memoryMb: number;
  cpus: number;
  pidsLimit: number;
}): string[] {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._/:@-]*$/.test(input.image)) throw new Error('Invalid sandbox image name.');
  if (!Number.isInteger(input.memoryMb) || input.memoryMb < 256 || input.memoryMb > 16_384) throw new Error('Invalid sandbox memory limit.');
  if (!Number.isFinite(input.cpus) || input.cpus < 0.25 || input.cpus > 16) throw new Error('Invalid sandbox CPU limit.');
  if (!Number.isInteger(input.pidsLimit) || input.pidsLimit < 16 || input.pidsLimit > 4_096) throw new Error('Invalid sandbox PID limit.');
  return [
    'run', '--rm', '--name', input.containerName,
    '--user', '1000:1000',
    '--network', 'none',
    '--read-only',
    '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges',
    '--pids-limit', String(input.pidsLimit),
    '--memory', `${input.memoryMb}m`,
    '--cpus', String(input.cpus),
    '--tmpfs', '/tmp:rw,noexec,nosuid,nodev,size=512m',
    '--mount', `type=bind,source=${input.workspacePath},target=/workspace`,
    '--workdir', '/workspace',
    '--env', 'HOME=/tmp',
    '--env', 'TZ=UTC',
    input.image,
    input.operation,
  ];
}

function spawnDocker(args: string[], signal: AbortSignal, containerName: string): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const append = (current: string, chunk: Buffer) => {
      const next = current + chunk.toString('utf8');
      if (Buffer.byteLength(next, 'utf8') > MAX_OUTPUT_BYTES) throw new Error('Sandbox output limit exceeded.');
      return next;
    };
    const terminate = (error: unknown) => {
      if (settled) return;
      settled = true;
      const failure = error instanceof Error ? error : new Error('Sandbox cancelled.');
      const stopper = spawn('docker', ['stop', '--time', '1', containerName], { windowsHide: true, stdio: 'ignore' });
      let stopped = false;
      const finish = () => {
        if (stopped) return;
        stopped = true;
        child.kill('SIGKILL');
        reject(failure);
      };
      stopper.once('close', finish);
      stopper.once('error', finish);
      setTimeout(finish, 3_000).unref();
    };
    const onAbort = () => terminate(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    child.stdout.on('data', (chunk: Buffer) => {
      try { stdout = append(stdout, chunk); } catch (error) { terminate(error); }
    });
    child.stderr.on('data', (chunk: Buffer) => {
      try { stderr = append(stderr, chunk); } catch (error) { terminate(error); }
    });
    child.once('error', (error) => {
      signal.removeEventListener('abort', onAbort);
      if (!settled) { settled = true; reject(error); }
    });
    child.once('close', (exitCode) => {
      signal.removeEventListener('abort', onAbort);
      if (!settled) { settled = true; resolve({ stdout, stderr, exitCode }); }
    });
  });
}

function isInside(root: string, candidate: string) {
  const relative = path.relative(root, candidate);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function redactDiagnostics(value: string) {
  return value
    .replaceAll(/(?:[A-Za-z]:\\|\/)(?:[^\s:'"]+[\\/])+/g, '<path>/')
    .replaceAll(/(api[_-]?key|token|secret|password)\s*[=:]\s*[^\s]+/gi, '$1=<redacted>')
    .slice(0, 20_000);
}
