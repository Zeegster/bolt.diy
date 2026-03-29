import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const DEFAULT_CLAUDE_CLI_PATH = '/Users/razrabotcik/.local/bin/claude';
export type ReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';

type ClaudeAuthRawStatus = {
  loggedIn?: boolean;
  authMethod?: string;
  apiProvider?: string;
  email?: string;
  orgId?: string;
  orgName?: string;
  subscriptionType?: string;
};

export interface ClaudeAuthStatus {
  available: boolean;
  authenticated: boolean;
  authMethod?: string;
  apiProvider?: string;
  email?: string;
  orgId?: string;
  orgName?: string;
  subscriptionType?: string;
  cliPath?: string;
  error?: string;
}

export interface ClaudeModelInfo {
  id: string;
  model: string;
  displayName: string;
  description: string;
  isDefault: boolean;
  hidden: boolean;
  supportedReasoningEfforts?: ReasoningEffort[];
  defaultReasoningEffort?: ReasoningEffort;
}

export interface ClaudeTurnUsage {
  inputTokens?: number;
  cachedInputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  totalCostUsd?: number;
  durationMs?: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
}

export type ClaudeBridgeEvent =
  | {
      type: 'item/agentMessage/delta';
      params: {
        threadId: string;
        turnId: string;
        itemId: string;
        delta: string;
      };
    }
  | {
      type: 'turn/completed';
      params: {
        threadId: string;
        turn: {
          id: string;
          status: 'completed' | 'interrupted' | 'failed' | 'inProgress';
          error: {
            message?: string;
          } | null;
          usage?: ClaudeTurnUsage;
        };
      };
    }
  | {
      type: 'account/login/completed';
      params: {
        loginId: string | null;
        success: boolean;
        error: string | null;
      };
    };

type ClaudeLoginStartResult = {
  launched: boolean;
  error?: string;
  alreadyAuthenticated?: boolean;
};

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

export function mapClaudeResultUsage(value: unknown): ClaudeTurnUsage | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const payload = value as Record<string, unknown>;
  const usageRaw = payload.usage;

  if (!usageRaw || typeof usageRaw !== 'object') {
    return undefined;
  }

  const usage = usageRaw as Record<string, unknown>;
  const inputTokens = readNumeric(usage.input_tokens ?? usage.inputTokens);
  const cachedInputTokens = readNumeric(usage.cached_input_tokens ?? usage.cachedInputTokens);
  const outputTokens = readNumeric(usage.output_tokens ?? usage.outputTokens);
  const totalTokens =
    readNumeric(usage.total_tokens ?? usage.totalTokens) ??
    (typeof inputTokens === 'number' && typeof outputTokens === 'number' ? inputTokens + outputTokens : undefined);
  const totalCostUsd = readNumeric(payload.total_cost_usd ?? payload.totalCostUsd);
  const durationMs = readNumeric(payload.duration_ms ?? payload.durationMs);
  const cacheCreationInputTokens = readNumeric(usage.cache_creation_input_tokens ?? usage.cacheCreationInputTokens);
  const cacheReadInputTokens = readNumeric(usage.cache_read_input_tokens ?? usage.cacheReadInputTokens);

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

const CLAUDE_MODEL_ALIASES: ClaudeModelInfo[] = [
  {
    id: 'sonnet',
    model: 'sonnet',
    displayName: 'Claude Sonnet',
    description: 'Claude Code alias model',
    isDefault: true,
    hidden: false,
    supportedReasoningEfforts: ['low', 'medium', 'high', 'max'],
    defaultReasoningEffort: 'medium',
  },
  {
    id: 'opus',
    model: 'opus',
    displayName: 'Claude Opus',
    description: 'Claude Code alias model',
    isDefault: false,
    hidden: false,
    supportedReasoningEfforts: ['low', 'medium', 'high', 'max'],
    defaultReasoningEffort: 'medium',
  },
  {
    id: 'haiku',
    model: 'haiku',
    displayName: 'Claude Haiku',
    description: 'Claude Code alias model',
    isDefault: false,
    hidden: false,
    supportedReasoningEfforts: ['low', 'medium', 'high', 'max'],
    defaultReasoningEffort: 'medium',
  },
];

export function normalizeClaudeReasoningEffort(
  effort?: ReasoningEffort | null,
): 'low' | 'medium' | 'high' | 'max' | undefined {
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

class ClaudeCliBridge {
  private cliPath: string | null = null;
  private listeners = new Set<(event: ClaudeBridgeEvent) => void>();
  private activeTurnProcess: ChildProcessWithoutNullStreams | null = null;
  private activeTurnId: string | null = null;
  private activeThreadId: string | null = null;
  private activeTurnKilledByUser = false;
  private activeTurnCompletionEmitted = false;
  private activeTurnUsage: ClaudeTurnUsage | undefined;
  private stdoutBuffer = '';

  subscribe(listener: (event: ClaudeBridgeEvent) => void) {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  async getStatus(): Promise<ClaudeAuthStatus> {
    try {
      const cliPath = await this.resolveCliPath();

      if (!cliPath) {
        return {
          available: false,
          authenticated: false,
          error: 'claude_cli_not_found',
        };
      }

      const { stdout } = await execFileAsync(cliPath, ['auth', 'status', '--json']);
      const parsed = JSON.parse(stdout) as ClaudeAuthRawStatus;

      return {
        available: true,
        authenticated: Boolean(parsed.loggedIn),
        authMethod: parsed.authMethod,
        apiProvider: parsed.apiProvider,
        email: parsed.email,
        orgId: parsed.orgId,
        orgName: parsed.orgName,
        subscriptionType: parsed.subscriptionType,
        cliPath,
      };
    } catch (error: any) {
      return {
        available: false,
        authenticated: false,
        error: error?.message || 'claude_auth_status_failed',
        cliPath: this.cliPath || undefined,
      };
    }
  }

  async startLogin(): Promise<ClaudeLoginStartResult> {
    const status = await this.getStatus();

    if (!status.available) {
      return {
        launched: false,
        error: status.error || 'claude_cli_not_found',
      };
    }

    if (status.authenticated) {
      return {
        launched: true,
        alreadyAuthenticated: true,
      };
    }

    const cliPath = status.cliPath || this.cliPath;

    if (!cliPath) {
      return {
        launched: false,
        error: 'claude_cli_not_found',
      };
    }

    try {
      const child = spawn(cliPath, ['auth', 'login', '--claudeai'], {
        stdio: 'ignore',
        detached: true,
      });
      child.unref();

      // Emit completion event after a short delay so renderer can refresh status.
      setTimeout(async () => {
        const nextStatus = await this.getStatus();
        this.emit({
          type: 'account/login/completed',
          params: {
            loginId: null,
            success: nextStatus.authenticated,
            error: nextStatus.authenticated ? null : nextStatus.error || null,
          },
        });
      }, 1000);

      return {
        launched: true,
      };
    } catch (error: any) {
      return {
        launched: false,
        error: error?.message || 'claude_login_start_failed',
      };
    }
  }

  async listModels(_options?: { includeHidden?: boolean }) {
    const status = await this.getStatus();

    if (!status.available || !status.authenticated) {
      return [] as ClaudeModelInfo[];
    }

    return CLAUDE_MODEL_ALIASES;
  }

  async startTurn(params: { input: string; model?: string; cwd?: string; effort?: ReasoningEffort }) {
    const status = await this.getStatus();

    if (!status.available) {
      throw new Error(status.error || 'claude_cli_not_found');
    }

    if (!status.authenticated) {
      throw new Error('Anthropic account authentication is required.');
    }

    const cliPath = status.cliPath || this.cliPath;

    if (!cliPath) {
      throw new Error('claude_cli_not_found');
    }

    if (this.activeTurnProcess) {
      throw new Error('anthropic_turn_already_in_progress');
    }

    const turnId = `anthropic-turn-${Date.now()}`;
    const threadId = this.activeThreadId || `anthropic-thread-${Date.now()}`;
    const model = params.model || 'sonnet';
    const cwd = params.cwd || process.cwd();
    const effort = normalizeClaudeReasoningEffort(params.effort);

    const child = spawn(
      cliPath,
      [
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
      ],
      {
        cwd,
        stdio: 'pipe',
        env: process.env,
      },
    );
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');

    this.activeTurnProcess = child;
    this.activeTurnId = turnId;
    this.activeThreadId = threadId;
    this.activeTurnKilledByUser = false;
    this.activeTurnCompletionEmitted = false;
    this.activeTurnUsage = undefined;
    this.stdoutBuffer = '';

    child.stdout.on('data', (chunk: string) => {
      this.handleStdoutChunk(chunk, threadId, turnId);
    });

    child.stderr.on('data', (chunk: string) => {
      console.warn('[claude-auth] claude stderr:', chunk.trim());
    });

    child.on('exit', (code, signal) => {
      const isActiveTurn = this.activeTurnId === turnId;

      if (!isActiveTurn) {
        return;
      }

      const wasInterrupted = this.activeTurnKilledByUser || signal === 'SIGINT' || signal === 'SIGTERM';
      const failed = !wasInterrupted && code !== 0;
      const usage = this.activeTurnUsage;

      if (!this.activeTurnCompletionEmitted) {
        this.emit({
          type: 'turn/completed',
          params: {
            threadId,
            turn: {
              id: turnId,
              status: failed ? 'failed' : wasInterrupted ? 'interrupted' : 'completed',
              error: failed ? { message: `Claude turn exited with code ${String(code)}` } : null,
              usage,
            },
          },
        });
      }

      this.activeTurnProcess = null;
      this.activeTurnId = null;
      this.activeTurnKilledByUser = false;
      this.activeTurnCompletionEmitted = false;
      this.activeTurnUsage = undefined;
    });

    child.stdin.write(params.input);
    child.stdin.end();

    return {
      threadId,
      turnId,
    };
  }

  async interruptTurn(params?: { threadId?: string; turnId?: string }) {
    const threadId = params?.threadId || this.activeThreadId;
    const turnId = params?.turnId || this.activeTurnId;

    if (!threadId || !turnId || !this.activeTurnProcess) {
      return { interrupted: false, error: 'no_active_turn' };
    }

    this.activeTurnKilledByUser = true;
    this.activeTurnProcess.kill('SIGINT');

    return { interrupted: true };
  }

  async resetThread() {
    this.activeThreadId = null;
    this.activeTurnId = null;
    this.activeTurnKilledByUser = false;
    this.activeTurnCompletionEmitted = false;
    this.activeTurnUsage = undefined;
  }

  private async resolveCliPath() {
    if (this.cliPath) {
      return this.cliPath;
    }

    const candidates = [process.env.CLAUDE_CLI_PATH, DEFAULT_CLAUDE_CLI_PATH, 'claude'].filter(Boolean) as string[];

    for (const candidate of candidates) {
      try {
        await execFileAsync(candidate, ['--version']);
        this.cliPath = candidate;
        return candidate;
      } catch (error: any) {
        if (error?.code === 'ENOENT') {
          continue;
        }
      }
    }

    return null;
  }

  private handleStdoutChunk(chunk: string, threadId: string, turnId: string) {
    this.stdoutBuffer += chunk;
    const lines = this.stdoutBuffer.split('\n');
    this.stdoutBuffer = lines.pop() || '';

    for (const line of lines) {
      const trimmedLine = line.trim();

      if (!trimmedLine) {
        continue;
      }

      let parsed: any;

      try {
        parsed = JSON.parse(trimmedLine);
      } catch {
        continue;
      }

      if (parsed?.type === 'stream_event' && parsed?.event?.type === 'content_block_delta') {
        const delta = parsed?.event?.delta?.text || parsed?.event?.delta?.text_delta;

        if (typeof delta === 'string' && delta.length > 0) {
          this.emit({
            type: 'item/agentMessage/delta',
            params: {
              threadId,
              turnId,
              itemId: turnId,
              delta,
            },
          });
        }
      }

      if (parsed?.type === 'result' && parsed?.is_error === true) {
        const usage = mapClaudeResultUsage(parsed);

        if (usage) {
          this.activeTurnUsage = usage;
        }

        this.activeTurnCompletionEmitted = true;
        this.emit({
          type: 'turn/completed',
          params: {
            threadId,
            turn: {
              id: turnId,
              status: 'failed',
              error: {
                message: parsed?.result || 'Anthropic account turn failed.',
              },
              usage: this.activeTurnUsage,
            },
          },
        });
      }

      if (parsed?.type === 'result' && parsed?.is_error !== true) {
        const usage = mapClaudeResultUsage(parsed);

        if (usage) {
          this.activeTurnUsage = usage;
        }
      }
    }
  }

  private emit(event: ClaudeBridgeEvent) {
    this.listeners.forEach((listener) => listener(event));
  }
}

const bridge = new ClaudeCliBridge();

export const subscribeClaudeBridgeEvents = (listener: (event: ClaudeBridgeEvent) => void) => bridge.subscribe(listener);

export const getClaudeAuthStatus = () => bridge.getStatus();

export const startClaudeLogin = () => bridge.startLogin();

export const listClaudeModels = (options?: { includeHidden?: boolean }) => bridge.listModels(options);

export const startClaudeTurn = (params: { input: string; model?: string; cwd?: string; effort?: ReasoningEffort }) =>
  bridge.startTurn(params);

export const interruptClaudeTurn = (params?: { threadId?: string; turnId?: string }) => bridge.interruptTurn(params);

export const resetClaudeThread = () => bridge.resetThread();
