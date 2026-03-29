import { beforeEach, describe, expect, it, vi } from 'vitest';

const { execFileMock, spawnMock } = vi.hoisted(() => ({
  execFileMock: vi.fn(),
  spawnMock: vi.fn(),
}));

vi.mock('node:child_process', () => {
  return {
    execFile: execFileMock,
    spawn: spawnMock,
  };
});

import {
  getClaudeAuthStatus,
  mapClaudeResultUsage,
  normalizeClaudeReasoningEffort,
  startClaudeLogin,
} from './claude-auth';

describe('claude auth bridge', () => {
  beforeEach(() => {
    execFileMock.mockReset();
    spawnMock.mockReset();
  });

  it('returns unavailable status when Claude CLI is not found', async () => {
    execFileMock.mockImplementation(
      (_cmd: string, _args: string[], callback: (error: Error | null, stdout?: string, stderr?: string) => void) => {
        const error: any = new Error('not found');
        error.code = 'ENOENT';
        callback(error, '', '');
      },
    );

    const status = await getClaudeAuthStatus();

    expect(status.available).toBe(false);
    expect(status.authenticated).toBe(false);
    expect(status.error).toContain('claude_cli_not_found');
  });

  it('does not launch login when Claude CLI is unavailable', async () => {
    execFileMock.mockImplementation(
      (_cmd: string, _args: string[], callback: (error: Error | null, stdout?: string, stderr?: string) => void) => {
        const error: any = new Error('not found');
        error.code = 'ENOENT';
        callback(error, '', '');
      },
    );

    const result = await startClaudeLogin();

    expect(result.launched).toBe(false);
    expect(result.error).toContain('claude_cli_not_found');
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('normalizes claude reasoning effort values', () => {
    expect(normalizeClaudeReasoningEffort('low')).toBe('low');
    expect(normalizeClaudeReasoningEffort('xhigh')).toBe('max');
    expect(normalizeClaudeReasoningEffort('minimal')).toBeUndefined();
  });

  it('maps claude result usage and cost payload', () => {
    const usage = mapClaudeResultUsage({
      type: 'result',
      usage: {
        input_tokens: 24,
        output_tokens: 9,
        cache_creation_input_tokens: 4,
        cache_read_input_tokens: 2,
      },
      total_cost_usd: 0.034,
      duration_ms: 2100,
    });

    expect(usage).toEqual({
      inputTokens: 24,
      cachedInputTokens: undefined,
      outputTokens: 9,
      totalTokens: 33,
      totalCostUsd: 0.034,
      durationMs: 2100,
      cacheCreationInputTokens: 4,
      cacheReadInputTokens: 2,
    });
  });
});
