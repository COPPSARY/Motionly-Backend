export type SandboxOperation = 'validate' | 'capture' | 'export';

export interface SandboxRequest {
  workspacePath: string;
  operation: SandboxOperation;
  timeoutMs: number;
  signal?: AbortSignal;
}

export interface SandboxResult {
  operation: SandboxOperation;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export interface SandboxRunner {
  run(request: SandboxRequest): Promise<SandboxResult>;
}

export class SandboxExecutionError extends Error {
  constructor(
    message: string,
    public readonly exitCode: number | null,
    public readonly diagnostics: string,
  ) {
    super(message);
    this.name = 'SandboxExecutionError';
  }
}
