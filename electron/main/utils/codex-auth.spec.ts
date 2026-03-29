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
  extractCodexTokenUsageUpdate,
  getCodexAuthStatus,
  mapCodexModel,
  normalizeCodexReasoningEffort,
  normalizeCodexTurnUsage,
  startCodexLogin,
} from './codex-auth';

describe('codex auth bridge', () => {
  beforeEach(() => {
    execFileMock.mockReset();
    spawnMock.mockReset();
  });

  it('returns unavailable status when Codex CLI is not found', async () => {
    execFileMock.mockImplementation(
      (_cmd: string, _args: string[], callback: (error: Error | null, stdout?: string, stderr?: string) => void) => {
        const error: any = new Error('not found');
        error.code = 'ENOENT';
        callback(error, '', '');
      },
    );

    const status = await getCodexAuthStatus();

    expect(status.available).toBe(false);
    expect(status.authenticated).toBe(false);
    expect(status.error).toContain('codex_cli_not_found');
  });

  it('does not launch login when Codex CLI is unavailable', async () => {
    execFileMock.mockImplementation(
      (_cmd: string, _args: string[], callback: (error: Error | null, stdout?: string, stderr?: string) => void) => {
        const error: any = new Error('not found');
        error.code = 'ENOENT';
        callback(error, '', '');
      },
    );

    const result = await startCodexLogin();

    expect(result.launched).toBe(false);
    expect(result.error).toContain('codex_cli_not_found');
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('normalizes supported reasoning effort values', () => {
    expect(normalizeCodexReasoningEffort('low')).toBe('low');
    expect(normalizeCodexReasoningEffort('xhigh')).toBe('xhigh');
    expect(normalizeCodexReasoningEffort('unsupported')).toBeUndefined();
    expect(normalizeCodexReasoningEffort(undefined)).toBeUndefined();
  });

  it('maps model capabilities including reasoning efforts', () => {
    const mapped = mapCodexModel({
      id: 'model-1',
      model: 'model-1',
      displayName: 'Model One',
      description: 'Test model',
      isDefault: false,
      hidden: false,
      defaultReasoningEffort: 'medium',
      supportedReasoningEfforts: [
        { reasoningEffort: 'low', description: 'fast' },
        { reasoningEffort: 'high', description: 'deep' },
        { reasoningEffort: 'invalid', description: 'drop me' },
      ],
    });

    expect(mapped.supportedReasoningEfforts).toEqual(['low', 'high']);
    expect(mapped.defaultReasoningEffort).toBe('medium');
  });

  it('normalizes codex usage fields from mixed payload', () => {
    const usage = normalizeCodexTurnUsage({
      input_tokens: 42,
      cachedInputTokens: 11,
      output_tokens: 8,
      duration_ms: 1200,
    });

    expect(usage).toEqual({
      inputTokens: 42,
      cachedInputTokens: 11,
      outputTokens: 8,
      totalTokens: 50,
      totalCostUsd: undefined,
      durationMs: 1200,
      cacheCreationInputTokens: undefined,
      cacheReadInputTokens: undefined,
    });
  });

  it('extracts token usage updates from thread event payload', () => {
    const update = extractCodexTokenUsageUpdate({
      thread: { id: 'thread-1' },
      tokenUsage: {
        inputTokens: 100,
        outputTokens: 25,
      },
    });

    expect(update).toEqual({
      threadId: 'thread-1',
      usage: {
        inputTokens: 100,
        cachedInputTokens: undefined,
        outputTokens: 25,
        totalTokens: 125,
        totalCostUsd: undefined,
        durationMs: undefined,
        cacheCreationInputTokens: undefined,
        cacheReadInputTokens: undefined,
      },
    });
  });
});
