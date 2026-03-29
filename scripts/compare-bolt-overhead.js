import fs from 'node:fs/promises';

function parseArgs(argv) {
  const options = {
    bolt: undefined,
    baseline: undefined,
    provider: undefined,
    output: undefined,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--bolt') {
      options.bolt = argv[++i];
      continue;
    }

    if (arg === '--baseline') {
      options.baseline = argv[++i];
      continue;
    }

    if (arg === '--provider') {
      options.provider = argv[++i];
      continue;
    }

    if (arg === '--output') {
      options.output = argv[++i];
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }
  }

  return options;
}

function usageMessage() {
  return `
Usage:
  pnpm compare:bolt-overhead --bolt <bolt-metrics.json> --baseline <baseline.json> [--provider openai|anthropic] [--output <file>]

Input formats:
  --bolt can be:
    1) direct AccountTurnMetrics object,
    2) array of AccountTurnMetrics,
    3) exported event logs (map or array) where metrics are in details.accountTurnMetrics.
`.trim();
}

function asNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function pickLatest(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return undefined;
  }

  return items[items.length - 1];
}

function normalizeMetricsCandidate(candidate) {
  if (!candidate || typeof candidate !== 'object') {
    return undefined;
  }

  if (typeof candidate.provider === 'string' && typeof candidate.turnId === 'string' && 'userInputBytes' in candidate) {
    return candidate;
  }

  return undefined;
}

function extractBoltMetrics(input) {
  const extracted = [];

  const pushCandidate = (candidate) => {
    const normalized = normalizeMetricsCandidate(candidate);

    if (normalized) {
      extracted.push(normalized);
    }
  };

  if (Array.isArray(input)) {
    for (const item of input) {
      pushCandidate(item);
      pushCandidate(item?.accountTurnMetrics);
      pushCandidate(item?.details?.accountTurnMetrics);
    }

    return extracted;
  }

  if (input && typeof input === 'object') {
    pushCandidate(input);
    pushCandidate(input?.accountTurnMetrics);
    pushCandidate(input?.details?.accountTurnMetrics);

    const values = Object.values(input);

    for (const value of values) {
      pushCandidate(value);
      pushCandidate(value?.accountTurnMetrics);
      pushCandidate(value?.details?.accountTurnMetrics);
    }
  }

  return extracted;
}

function extractBaseline(input) {
  if (Array.isArray(input)) {
    return pickLatest(input);
  }

  if (input && typeof input === 'object') {
    return input;
  }

  return undefined;
}

function tokenDelta(boltUsage, baselineUsage, key) {
  const boltValue = asNumber(boltUsage?.[key]);
  const baselineValue = asNumber(baselineUsage?.[key]);

  if (boltValue === undefined || baselineValue === undefined) {
    return undefined;
  }

  return boltValue - baselineValue;
}

function percentDelta(current, baseline) {
  if (current === undefined || baseline === undefined || baseline === 0) {
    return undefined;
  }

  return ((current - baseline) / baseline) * 100;
}

function formatNumber(value, digits = 2) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }

  return Number(value).toFixed(digits);
}

async function readJson(path) {
  const contents = await fs.readFile(path, 'utf8');
  return JSON.parse(contents);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    console.log(usageMessage());
    process.exit(0);
  }

  if (!options.bolt || !options.baseline) {
    console.error('Both --bolt and --baseline are required.');
    console.error(usageMessage());
    process.exit(1);
  }

  const [boltRaw, baselineRaw] = await Promise.all([readJson(options.bolt), readJson(options.baseline)]);
  const boltCandidates = extractBoltMetrics(boltRaw);

  if (boltCandidates.length === 0) {
    throw new Error('No AccountTurnMetrics found in --bolt file.');
  }

  const filteredBolt = options.provider
    ? boltCandidates.filter((entry) => String(entry.provider).toLowerCase() === String(options.provider).toLowerCase())
    : boltCandidates;
  const bolt = pickLatest(filteredBolt.length > 0 ? filteredBolt : boltCandidates);
  const baseline = extractBaseline(baselineRaw);

  if (!baseline) {
    throw new Error('Unable to parse --baseline JSON.');
  }

  const report = {
    provider: bolt.provider,
    model: bolt.model,
    turnId: bolt.turnId,
    threadId: bolt.threadId,
    outbound: {
      userInputBytes: bolt.userInputBytes,
      payloadBytes: bolt.boltOutboundPayloadBytes,
      overheadBytes: bolt.boltOutboundOverheadBytes,
      overheadPercentOfPayload: percentDelta(bolt.boltOutboundPayloadBytes, bolt.userInputBytes),
    },
    inbound: {
      deltaTextBytes: bolt.inboundDeltaTextBytes,
      eventEnvelopeBytes: bolt.inboundEventEnvelopeBytes,
      overheadBytes: bolt.inboundBoltOverheadBytes,
    },
    baseline: {
      promptBytes: baseline.promptBytes,
      responseBytes: baseline.responseBytes,
      usage: baseline.usage || null,
      durationMs: baseline.durationMs,
    },
    usageDelta: {
      inputTokens: tokenDelta(bolt.upstreamUsage, baseline.usage, 'inputTokens'),
      cachedInputTokens: tokenDelta(bolt.upstreamUsage, baseline.usage, 'cachedInputTokens'),
      outputTokens: tokenDelta(bolt.upstreamUsage, baseline.usage, 'outputTokens'),
      totalTokens: tokenDelta(bolt.upstreamUsage, baseline.usage, 'totalTokens'),
      totalCostUsd: tokenDelta(bolt.upstreamUsage, baseline.usage, 'totalCostUsd'),
    },
  };

  const lines = [
    `Provider: ${report.provider}`,
    `Model: ${report.model}`,
    '',
    'Outbound overhead:',
    `  user input bytes:       ${formatNumber(report.outbound.userInputBytes, 0)}`,
    `  payload bytes:          ${formatNumber(report.outbound.payloadBytes, 0)}`,
    `  bolt overhead bytes:    ${formatNumber(report.outbound.overheadBytes, 0)}`,
    `  overhead vs input (%):  ${formatNumber(report.outbound.overheadPercentOfPayload, 2)}%`,
    '',
    'Inbound overhead:',
    `  delta text bytes:       ${formatNumber(report.inbound.deltaTextBytes, 0)}`,
    `  event envelope bytes:   ${formatNumber(report.inbound.eventEnvelopeBytes, 0)}`,
    `  bolt overhead bytes:    ${formatNumber(report.inbound.overheadBytes, 0)}`,
    '',
    'Provider usage delta (bolt - direct baseline):',
    `  input tokens:           ${formatNumber(report.usageDelta.inputTokens, 0)}`,
    `  cached input tokens:    ${formatNumber(report.usageDelta.cachedInputTokens, 0)}`,
    `  output tokens:          ${formatNumber(report.usageDelta.outputTokens, 0)}`,
    `  total tokens:           ${formatNumber(report.usageDelta.totalTokens, 0)}`,
    `  total cost usd:         ${formatNumber(report.usageDelta.totalCostUsd, 6)}`,
  ];

  console.log(lines.join('\n'));

  if (options.output) {
    await fs.writeFile(options.output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.error(`Wrote comparison report to ${options.output}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
