import type { AccountTurnMetrics, AccountUpstreamUsage } from '~/types/model';
import type { ReasoningEffort } from '~/lib/modules/llm/types';

const FALLBACK_HASH_SEED = 0x811c9dc5;

export function textBytes(value: string): number {
  return new TextEncoder().encode(value).length;
}

export function fnv1a32(input: string, seed = FALLBACK_HASH_SEED): number {
  let hash = seed >>> 0;

  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return hash >>> 0;
}

export function hashHex(hash: number): string {
  return hash.toString(16).padStart(8, '0');
}

export function hashText(input: string): string {
  return hashHex(fnv1a32(input));
}

export function safeJsonMetrics(value: unknown): {
  chars: number;
  bytes: number;
  json: string;
} {
  const json = JSON.stringify(value) ?? '';

  return {
    chars: json.length,
    bytes: textBytes(json),
    json,
  };
}

function readNumeric(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const numeric = Number(value);

    if (Number.isFinite(numeric)) {
      return numeric;
    }
  }

  return undefined;
}

export function normalizeUsage(value: unknown): AccountUpstreamUsage | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const usage = value as Record<string, unknown>;
  const inputTokens = readNumeric(usage.inputTokens ?? usage.input_tokens);
  const cachedInputTokens = readNumeric(usage.cachedInputTokens ?? usage.cached_input_tokens);
  const outputTokens = readNumeric(usage.outputTokens ?? usage.output_tokens);
  const totalTokens =
    readNumeric(usage.totalTokens ?? usage.total_tokens) ??
    (typeof inputTokens === 'number' && typeof outputTokens === 'number' ? inputTokens + outputTokens : undefined);
  const totalCostUsd = readNumeric(usage.totalCostUsd ?? usage.total_cost_usd ?? usage.costUsd ?? usage.cost_usd);
  const durationMs = readNumeric(usage.durationMs ?? usage.duration_ms);
  const cacheCreationInputTokens = readNumeric(usage.cacheCreationInputTokens ?? usage.cache_creation_input_tokens);
  const cacheReadInputTokens = readNumeric(usage.cacheReadInputTokens ?? usage.cache_read_input_tokens);

  if (
    inputTokens === undefined &&
    cachedInputTokens === undefined &&
    outputTokens === undefined &&
    totalTokens === undefined &&
    totalCostUsd === undefined &&
    durationMs === undefined &&
    cacheCreationInputTokens === undefined &&
    cacheReadInputTokens === undefined
  ) {
    return undefined;
  }

  return {
    inputTokens,
    cachedInputTokens,
    outputTokens,
    totalTokens,
    totalCostUsd,
    durationMs,
    cacheCreationInputTokens,
    cacheReadInputTokens,
  };
}

export function mergeUsage(
  currentUsage: AccountUpstreamUsage | undefined,
  nextUsage: AccountUpstreamUsage | undefined,
): AccountUpstreamUsage | undefined {
  if (!currentUsage && !nextUsage) {
    return undefined;
  }

  return {
    ...currentUsage,
    ...nextUsage,
  };
}

export type AccountTurnMetricsInput = {
  provider: string;
  model: string;
  effort?: ReasoningEffort;
  threadId: string;
  turnId: string;
  userInput: {
    chars: number;
    bytes: number;
    hash: string;
  };
  payload: {
    chars: number;
    bytes: number;
  };
  inbound: {
    deltaChars: number;
    deltaBytes: number;
    eventChars: number;
    eventBytes: number;
  };
  response: {
    chars: number;
    bytes: number;
    hash: string;
  };
  upstreamUsage?: AccountUpstreamUsage;
  startedAtMs: number;
  firstDeltaAtMs?: number;
  completedAtMs: number;
};

export function buildAccountTurnMetrics(input: AccountTurnMetricsInput): AccountTurnMetrics {
  const outboundOverheadChars = Math.max(0, input.payload.chars - input.userInput.chars);
  const outboundOverheadBytes = Math.max(0, input.payload.bytes - input.userInput.bytes);
  const inboundOverheadChars = Math.max(0, input.inbound.eventChars - input.inbound.deltaChars);
  const inboundOverheadBytes = Math.max(0, input.inbound.eventBytes - input.inbound.deltaBytes);

  return {
    provider: input.provider,
    model: input.model,
    effort: input.effort,
    threadId: input.threadId,
    turnId: input.turnId,
    userInputChars: input.userInput.chars,
    userInputBytes: input.userInput.bytes,
    userInputHash: input.userInput.hash,
    boltOutboundPayloadChars: input.payload.chars,
    boltOutboundPayloadBytes: input.payload.bytes,
    boltOutboundOverheadChars: outboundOverheadChars,
    boltOutboundOverheadBytes: outboundOverheadBytes,
    inboundDeltaTextChars: input.inbound.deltaChars,
    inboundDeltaTextBytes: input.inbound.deltaBytes,
    inboundEventEnvelopeChars: input.inbound.eventChars,
    inboundEventEnvelopeBytes: input.inbound.eventBytes,
    inboundBoltOverheadChars: inboundOverheadChars,
    inboundBoltOverheadBytes: inboundOverheadBytes,
    responseTextChars: input.response.chars,
    responseTextBytes: input.response.bytes,
    responseTextHash: input.response.hash,
    upstreamUsage: input.upstreamUsage,
    timings: {
      startedAt: new Date(input.startedAtMs).toISOString(),
      firstDeltaMs:
        typeof input.firstDeltaAtMs === 'number'
          ? Math.max(0, Math.round(input.firstDeltaAtMs - input.startedAtMs))
          : undefined,
      completedMs: Math.max(0, Math.round(input.completedAtMs - input.startedAtMs)),
    },
  };
}
