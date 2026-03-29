import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';

const DEFAULT_TIMEOUT_MS = 180_000;
const FNV_SEED = 0x811c9dc5;

function parseArgs(argv) {
  const options = {
    provider: undefined,
    prompt: undefined,
    model: undefined,
    effort: undefined,
    cwd: process.cwd(),
    output: undefined,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };
  const positional = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--provider') {
      options.provider = argv[++i];
      continue;
    }

    if (arg === '--prompt') {
      options.prompt = argv[++i];
      continue;
    }

    if (arg === '--model') {
      options.model = argv[++i];
      continue;
    }

    if (arg === '--effort') {
      options.effort = argv[++i];
      continue;
    }

    if (arg === '--cwd') {
      options.cwd = argv[++i];
      continue;
    }

    if (arg === '--output') {
      options.output = argv[++i];
      continue;
    }

    if (arg === '--timeout-ms') {
      options.timeoutMs = Number(argv[++i]) || DEFAULT_TIMEOUT_MS;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }

    positional.push(arg);
  }

  if (!options.prompt && positional.length > 0) {
    options.prompt = positional.join(' ');
  }

  return options;
}

function byteLength(value) {
  return new TextEncoder().encode(value).length;
}

function hashFnv1a32(text, seed = FNV_SEED) {
  let hash = seed >>> 0;

  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return hash >>> 0;
}

function hashHex(text) {
  return hashFnv1a32(text).toString(16).padStart(8, '0');
}

function readNumeric(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

function normalizeUsage(value) {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const usage = value;
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

function extractTokenUsageUpdate(params) {
  if (!params || typeof params !== 'object') {
    return {};
  }

  const payload = params;
  const thread = typeof payload.thread === 'object' && payload.thread ? payload.thread : undefined;
  const threadId = payload.threadId ?? payload.thread_id ?? thread?.id;
  const usage = normalizeUsage(
    payload.usage ?? payload.tokenUsage ?? payload.token_usage ?? thread?.usage ?? thread?.tokenUsage,
  );

  return { threadId, usage };
}

function normalizeClaudeEffort(effort) {
  if (!effort) {
    return undefined;
  }

  if (effort === 'xhigh') {
    return 'max';
  }

  if (effort === 'low' || effort === 'medium' || effort === 'high' || effort === 'max') {
    return effort;
  }

  return undefined;
}

function usageMessage() {
  return `
Usage:
  pnpm measure:account-baseline --provider openai|anthropic --prompt "CheckCheck" [--model <id>] [--effort <value>] [--output <file>]

Examples:
  pnpm measure:account-baseline --provider openai --prompt "CheckCheck" --model gpt-5
  pnpm measure:account-baseline --provider anthropic --prompt "CheckCheck" --model sonnet --effort medium --output ./anthropic-baseline.json
`.trim();
}

function writeJsonLine(stream, payload) {
  stream.write(`${JSON.stringify(payload)}\n`);
}

async function runOpenAiBaseline(options) {
  const cliPath = process.env.CODEX_CLI_PATH || 'codex';
  const child = spawn(cliPath, ['app-server', '--listen', 'stdio://'], {
    stdio: 'pipe',
    env: process.env,
    cwd: options.cwd,
  });
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');

  const pending = new Map();
  let nextId = 1;
  let stdoutBuffer = '';
  let activeThreadId;
  let activeTurnId;
  let completed = false;
  let assistantResponse = '';
  let latestUsage;
  let completionUsage;
  let turnError;

  const turnCompletion = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`openai baseline timeout after ${options.timeoutMs}ms`));
    }, options.timeoutMs);

    const finish = (value, error) => {
      if (completed) {
        return;
      }

      completed = true;
      clearTimeout(timeout);

      if (error) {
        reject(error);
      } else {
        resolve(value);
      }
    };

    child.on('error', (error) => finish(null, error));
    child.on('exit', (code, signal) => {
      if (!completed && (code !== 0 || signal)) {
        finish(
          null,
          new Error(`codex app-server exited before completion (code=${String(code)}, signal=${String(signal)})`),
        );
      }
    });

    child.stdout.on('data', (chunk) => {
      stdoutBuffer += chunk;
      const lines = stdoutBuffer.split('\n');
      stdoutBuffer = lines.pop() || '';

      for (const rawLine of lines) {
        const line = rawLine.trim();

        if (!line) {
          continue;
        }

        let parsed;

        try {
          parsed = JSON.parse(line);
        } catch {
          continue;
        }

        if ((typeof parsed.id === 'number' || typeof parsed.id === 'string') && typeof parsed.method === 'string') {
          const { id, method } = parsed;

          switch (method) {
            case 'item/commandExecution/requestApproval':
            case 'item/fileChange/requestApproval': {
              writeJsonLine(child.stdin, { jsonrpc: '2.0', id, result: { decision: 'decline' } });
              break;
            }
            case 'item/permissions/requestApproval': {
              writeJsonLine(child.stdin, { jsonrpc: '2.0', id, result: { permissions: {}, scope: 'turn' } });
              break;
            }
            case 'item/tool/requestUserInput': {
              writeJsonLine(child.stdin, { jsonrpc: '2.0', id, result: { answers: {} } });
              break;
            }
            case 'item/tool/call': {
              writeJsonLine(child.stdin, {
                jsonrpc: '2.0',
                id,
                result: { contentItems: [], success: false },
              });
              break;
            }
            case 'mcpServer/elicitation/request': {
              writeJsonLine(child.stdin, {
                jsonrpc: '2.0',
                id,
                result: { action: 'decline', content: null, _meta: null },
              });
              break;
            }
            case 'applyPatchApproval':
            case 'execCommandApproval': {
              writeJsonLine(child.stdin, { jsonrpc: '2.0', id, result: { decision: 'denied' } });
              break;
            }
            default: {
              writeJsonLine(child.stdin, {
                jsonrpc: '2.0',
                id,
                error: { code: -32601, message: `Unsupported server request method: ${method}` },
              });
            }
          }

          continue;
        }

        if (typeof parsed.id === 'number' || typeof parsed.id === 'string') {
          const pendingRequest = pending.get(parsed.id);

          if (!pendingRequest) {
            continue;
          }

          pending.delete(parsed.id);

          if (parsed.error) {
            pendingRequest.reject(new Error(parsed.error.message || `JSON-RPC error: ${String(parsed.error.code)}`));
          } else {
            pendingRequest.resolve(parsed.result);
          }

          continue;
        }

        if (typeof parsed.method === 'string') {
          const { method, params } = parsed;

          if (method === 'thread/tokenUsage/updated') {
            const update = extractTokenUsageUpdate(params);

            if (update.threadId && update.usage) {
              latestUsage = update.usage;
            }
          }

          if (method === 'item/agentMessage/delta') {
            if (params?.turnId === activeTurnId && typeof params?.delta === 'string') {
              assistantResponse += params.delta;
            }
          }

          if (method === 'turn/completed' && params?.turn?.id === activeTurnId) {
            completionUsage = normalizeUsage(params?.turn?.usage);

            if (params?.turn?.status === 'failed') {
              turnError = params?.turn?.error?.message || 'OpenAI baseline turn failed';
              finish(null, new Error(turnError));
              return;
            }

            finish({
              threadId: params?.threadId || activeThreadId,
              turnId: params?.turn?.id,
              usage: completionUsage || latestUsage,
              responseText: assistantResponse,
            });
          }
        }
      }
    });
  });

  const request = (method, params) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      writeJsonLine(child.stdin, { jsonrpc: '2.0', id, method, params });
    });

  const startedAt = Date.now();

  try {
    await request('initialize', {
      clientInfo: {
        name: 'bolt-overhead-baseline',
        version: '1.0.0',
      },
      capabilities: null,
    });
    writeJsonLine(child.stdin, { jsonrpc: '2.0', method: 'initialized', params: {} });

    const account = await request('account/read', { refreshToken: false });

    if (!account?.account) {
      throw new Error('OpenAI account is not authenticated for codex app-server');
    }

    const thread = await request('thread/start', {
      cwd: options.cwd || process.cwd(),
      approvalPolicy: 'never',
      sandbox: 'dangerFullAccess',
      model: options.model || null,
      modelProvider: 'openai',
      experimentalRawEvents: false,
      persistExtendedHistory: false,
    });
    activeThreadId = thread?.thread?.id;

    const turn = await request('turn/start', {
      threadId: activeThreadId,
      input: [
        {
          type: 'text',
          text: options.prompt,
        },
      ],
      model: options.model || null,
      cwd: options.cwd || process.cwd(),
      ...(options.effort ? { effort: options.effort } : {}),
    });
    activeTurnId = turn?.turn?.id;

    const completion = await turnCompletion;
    const completedAt = Date.now();
    const promptBytes = byteLength(options.prompt);
    const responseBytes = byteLength(completion.responseText || '');

    return {
      provider: 'openai',
      source: 'codex-app-server',
      model: options.model || null,
      effort: options.effort || null,
      threadId: completion.threadId || activeThreadId || null,
      turnId: completion.turnId || activeTurnId || null,
      promptChars: options.prompt.length,
      promptBytes,
      promptHash: hashHex(options.prompt),
      responseChars: (completion.responseText || '').length,
      responseBytes,
      responseHash: hashHex(completion.responseText || ''),
      usage: completion.usage || latestUsage || null,
      durationMs: completedAt - startedAt,
      completedAt: new Date(completedAt).toISOString(),
    };
  } finally {
    if (!child.killed) {
      child.kill('SIGTERM');
    }
  }
}

async function runAnthropicBaseline(options) {
  const cliPath = process.env.CLAUDE_CLI_PATH || 'claude';
  const effort = normalizeClaudeEffort(options.effort);
  const model = options.model || 'sonnet';
  const args = [
    '--print',
    '--output-format',
    'stream-json',
    '--verbose',
    '--include-partial-messages',
    '--permission-mode',
    'bypassPermissions',
    '--allowedTools',
    '',
    '--model',
    model,
    ...(effort ? ['--effort', effort] : []),
  ];
  const child = spawn(cliPath, args, {
    stdio: 'pipe',
    env: process.env,
    cwd: options.cwd || process.cwd(),
  });
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');

  let stdoutBuffer = '';
  let resultUsage;
  let resultError;
  let assistantResponse = '';
  let stderrOutput = '';

  const startedAt = Date.now();

  const completionPromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`anthropic baseline timeout after ${options.timeoutMs}ms`));
    }, options.timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdoutBuffer += chunk;
      const lines = stdoutBuffer.split('\n');
      stdoutBuffer = lines.pop() || '';

      for (const rawLine of lines) {
        const line = rawLine.trim();

        if (!line) {
          continue;
        }

        let parsed;

        try {
          parsed = JSON.parse(line);
        } catch {
          continue;
        }

        if (parsed?.type === 'stream_event' && parsed?.event?.type === 'content_block_delta') {
          const delta = parsed?.event?.delta?.text || parsed?.event?.delta?.text_delta;

          if (typeof delta === 'string') {
            assistantResponse += delta;
          }
        }

        if (parsed?.type === 'result') {
          resultUsage = normalizeUsage({
            ...(parsed?.usage || {}),
            total_cost_usd: parsed?.total_cost_usd,
            duration_ms: parsed?.duration_ms,
          });

          if (parsed?.is_error === true) {
            resultError = parsed?.result || 'Anthropic baseline turn failed';
          }
        }
      }
    });

    child.stderr.on('data', (chunk) => {
      stderrOutput += chunk;
    });

    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    child.on('exit', (code, signal) => {
      clearTimeout(timeout);

      if (resultError) {
        reject(new Error(resultError));
        return;
      }

      if (code !== 0) {
        reject(new Error(`claude exited with code ${String(code)} (${signal || 'no signal'}) ${stderrOutput.trim()}`));
        return;
      }

      resolve({
        usage: resultUsage || null,
        responseText: assistantResponse,
      });
    });
  });

  child.stdin.write(options.prompt);
  child.stdin.end();

  const completion = await completionPromise;

  const completedAt = Date.now();

  return {
    provider: 'anthropic',
    source: 'claude-cli',
    model,
    effort: options.effort || null,
    promptChars: options.prompt.length,
    promptBytes: byteLength(options.prompt),
    promptHash: hashHex(options.prompt),
    responseChars: completion.responseText.length,
    responseBytes: byteLength(completion.responseText),
    responseHash: hashHex(completion.responseText),
    usage: completion.usage,
    durationMs: completedAt - startedAt,
    completedAt: new Date(completedAt).toISOString(),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    console.log(usageMessage());
    process.exit(0);
  }

  if (!options.provider || !['openai', 'anthropic'].includes(options.provider)) {
    console.error('Missing or invalid --provider. Expected: openai | anthropic');
    console.error(usageMessage());
    process.exit(1);
  }

  if (!options.prompt) {
    console.error('Missing prompt. Use --prompt "..." or provide it as positional text.');
    console.error(usageMessage());
    process.exit(1);
  }

  const result = options.provider === 'openai' ? await runOpenAiBaseline(options) : await runAnthropicBaseline(options);

  const output = JSON.stringify(result, null, 2);
  console.log(output);

  if (options.output) {
    await fs.writeFile(options.output, `${output}\n`, 'utf8');
    console.error(`Wrote baseline to ${options.output}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
