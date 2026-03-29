import { describe, expect, it } from 'vitest';
import { buildAccountTurnMetrics, hashText, normalizeUsage, safeJsonMetrics, textBytes } from './accountTurnMetrics';

describe('accountTurnMetrics utilities', () => {
  it('calculates utf-8 bytes correctly', () => {
    expect(textBytes('abc')).toBe(3);
    expect(textBytes('Привет')).toBeGreaterThan(6);
  });

  it('generates stable hash', () => {
    expect(hashText('CheckCheck')).toBe(hashText('CheckCheck'));
    expect(hashText('CheckCheck')).not.toBe(hashText('checkcheck'));
  });

  it('normalizes usage from snake_case payload', () => {
    const usage = normalizeUsage({
      input_tokens: 12,
      cached_input_tokens: 3,
      output_tokens: 7,
      total_cost_usd: 0.0123,
      duration_ms: 3200,
    });

    expect(usage).toEqual({
      inputTokens: 12,
      cachedInputTokens: 3,
      outputTokens: 7,
      totalTokens: 19,
      totalCostUsd: 0.0123,
      durationMs: 3200,
      cacheCreationInputTokens: undefined,
      cacheReadInputTokens: undefined,
    });
  });

  it('builds account turn overhead metrics', () => {
    const payload = safeJsonMetrics({
      input: 'CheckCheck',
      model: 'sonnet',
      effort: 'medium',
    });
    const inputText = 'CheckCheck';

    const metrics = buildAccountTurnMetrics({
      provider: 'Anthropic',
      model: 'sonnet',
      effort: 'medium',
      threadId: 't-1',
      turnId: 'r-1',
      userInput: {
        chars: inputText.length,
        bytes: textBytes(inputText),
        hash: hashText(inputText),
      },
      payload: {
        chars: payload.chars,
        bytes: payload.bytes,
      },
      inbound: {
        deltaChars: 20,
        deltaBytes: 20,
        eventChars: 52,
        eventBytes: 52,
      },
      response: {
        chars: 20,
        bytes: 20,
        hash: hashText('ok'),
      },
      startedAtMs: 1000,
      firstDeltaAtMs: 1200,
      completedAtMs: 1850,
      upstreamUsage: {
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15,
      },
    });

    expect(metrics.boltOutboundOverheadChars).toBeGreaterThan(0);
    expect(metrics.boltOutboundOverheadBytes).toBeGreaterThan(0);
    expect(metrics.inboundBoltOverheadChars).toBe(32);
    expect(metrics.inboundBoltOverheadBytes).toBe(32);
    expect(metrics.timings.firstDeltaMs).toBe(200);
    expect(metrics.timings.completedMs).toBe(850);
  });
});
