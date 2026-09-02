import { describe, expect, it } from 'vitest';

import { buildDockerArguments } from '../../../packages/sandbox/src/docker-runner.js';

describe('Docker sandbox arguments', () => {
  it('enforces isolation, limits, fixed operation, and a single workspace mount', () => {
    const args = buildDockerArguments({
      image: 'motionly-renderer:local',
      workspacePath: 'C:\\workspaces\\job-1',
      containerName: 'motionly-job-1',
      operation: 'validate',
      memoryMb: 2048,
      cpus: 2,
      pidsLimit: 256,
    });
    expect(args).toEqual(expect.arrayContaining([
      '--network', 'none', '--read-only', '--cap-drop', 'ALL',
      '--user', '1000:1000',
      '--security-opt', 'no-new-privileges', '--pids-limit', '256',
      '--memory', '2048m', '--cpus', '2',
    ]));
    expect(args.filter((argument) => argument === '--mount')).toHaveLength(1);
    expect(args.at(-1)).toBe('validate');
    expect(args.join(' ')).not.toContain('docker.sock');
  });

  it('rejects unsafe image names and unreasonable limits', () => {
    expect(() => buildDockerArguments({
      image: 'image; whoami', workspacePath: 'C:\\work', containerName: 'job', operation: 'capture',
      memoryMb: 2048, cpus: 2, pidsLimit: 256,
    })).toThrow('Invalid sandbox image');
    expect(() => buildDockerArguments({
      image: 'image:tag', workspacePath: 'C:\\work', containerName: 'job', operation: 'capture',
      memoryMb: 32, cpus: 2, pidsLimit: 256,
    })).toThrow('memory');
  });
});
