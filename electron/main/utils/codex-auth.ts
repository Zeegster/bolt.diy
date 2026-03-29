import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const DEFAULT_CODEX_CLI_PATH = '/Applications/Codex.app/Contents/Resources/codex';
const RESPONSE_TIMEOUT_MS = 90_000;
export type ReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';

type JsonRpcId = string | number;

type JsonRpcErrorPayload = {
  code?: number;
  message?: string;
  data?: unknown;
};

type JsonRpcResponseMessage = {
  id: JsonRpcId;
  result?: unknown;
  error?: JsonRpcErrorPayload;
};

type JsonRpcNotificationMessage = {
  method: string;
  params?: unknown;
};

type JsonRpcServerRequestMessage = {
  id: JsonRpcId;
  method: string;
  params?: unknown;
};

type PendingRequest = {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};

export interface CodexAuthStatus {
  available: boolean;
  authenticated: boolean;
  loginMethod?: 'chatgpt' | 'api_key' | 'unknown';
  accountType?: 'chatgpt' | 'apiKey' | 'unknown';
  requiresOpenaiAuth?: boolean;
  email?: string;
  planType?: string;
  cliPath?: string;
  error?: string;
}

export interface CodexModelInfo {
  id: string;
  model: string;
  displayName: string;
  description: string;
  isDefault: boolean;
  hidden: boolean;
  supportedReasoningEfforts?: ReasoningEffort[];
  defaultReasoningEffort?: ReasoningEffort;
}

export interface CodexTurnUsage {
  inputTokens?: number;
  cachedInputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  totalCostUsd?: number;
  durationMs?: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
}

export type CodexBridgeEvent =
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
          usage?: CodexTurnUsage;
        };
      };
    }
  | {
      type: 'thread/tokenUsage/updated';
      params: {
        threadId: string;
        usage?: CodexTurnUsage;
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

type AccountReadResponse = {
  account: { type: 'chatgpt'; email: string; planType: string } | { type: 'apiKey' } | null;
  requiresOpenaiAuth: boolean;
};

type LoginResponse =
  | { type: 'apiKey' }
  | { type: 'chatgpt'; loginId: string; authUrl: string }
  | { type: 'chatgptDeviceCode'; loginId: string; verificationUrl: string; userCode: string }
  | { type: 'chatgptAuthTokens' };

type ThreadStartResponse = {
  thread: {
    id: string;
  };
};

type TurnStartResponse = {
  turn: {
    id: string;
  };
};

type ModelListResponse = {
  data: Array<{
    id: string;
    model: string;
    displayName: string;
    description: string;
    isDefault: boolean;
    hidden: boolean;
    supportedReasoningEfforts?: Array<{
      reasoningEffort: string;
      description?: string;
    }>;
    defaultReasoningEffort?: string;
  }>;
  nextCursor: string | null;
};

const SUPPORTED_REASONING_EFFORTS: ReadonlySet<string> = new Set([
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
]);

export function normalizeCodexReasoningEffort(value?: string | null): ReasoningEffort | undefined {
  if (!value || !SUPPORTED_REASONING_EFFORTS.has(value)) {
    return undefined;
  }

  return value as ReasoningEffort;
}

export function mapCodexModel(raw: ModelListResponse['data'][number]): CodexModelInfo {
  const supportedReasoningEfforts =
    raw.supportedReasoningEfforts
      ?.map((entry) => normalizeCodexReasoningEffort(entry.reasoningEffort))
      .filter((effort): effort is ReasoningEffort => Boolean(effort)) || undefined;
  const defaultReasoningEffort = normalizeCodexReasoningEffort(raw.defaultReasoningEffort);

  return {
    id: raw.id,
    model: raw.model,
    displayName: raw.displayName,
    description: raw.description,
    isDefault: raw.isDefault,
    hidden: raw.hidden,
    supportedReasoningEfforts,
    defaultReasoningEffort,
  };
}

type CodexLoginStartResult = {
  launched: boolean;
  authUrl?: string;
  loginId?: string;
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

export function normalizeCodexTurnUsage(value: unknown): CodexTurnUsage | undefined {
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

export function extractCodexTokenUsageUpdate(
  params: unknown,
): { threadId?: string; usage?: CodexTurnUsage } | undefined {
  if (!params || typeof params !== 'object') {
    return undefined;
  }

  const payload = params as Record<string, unknown>;
  const threadObject = typeof payload.thread === 'object' ? (payload.thread as Record<string, unknown>) : null;
  const threadId =
    (typeof payload.threadId === 'string' ? payload.threadId : undefined) ||
    (typeof payload.thread_id === 'string' ? payload.thread_id : undefined) ||
    (threadObject && typeof threadObject.id === 'string' ? threadObject.id : undefined);

  const usage = normalizeCodexTurnUsage(
    payload.usage ??
      payload.tokenUsage ??
      payload.token_usage ??
      (threadObject ? threadObject.usage : undefined) ??
      (threadObject ? threadObject.tokenUsage : undefined),
  );

  if (!threadId && !usage) {
    return undefined;
  }

  return {
    threadId,
    usage,
  };
}

const CODEX_BRIDGE_EVENTS: ReadonlySet<string> = new Set([
  'item/agentMessage/delta',
  'turn/completed',
  'thread/tokenUsage/updated',
  'account/login/completed',
]);

class CodexAppServerBridge {
  private process: ChildProcessWithoutNullStreams | null = null;
  private processStartPromise: Promise<void> | null = null;
  private initialized = false;
  private nextRequestId = 1;
  private stdoutBuffer = '';
  private pendingRequests = new Map<JsonRpcId, PendingRequest>();
  private listeners = new Set<(event: CodexBridgeEvent) => void>();
  private activeThreadId: string | null = null;
  private activeTurnId: string | null = null;
  private activeLoginId: string | null = null;
  private cliPath: string | null = null;
  private latestUsageByThreadId = new Map<string, CodexTurnUsage>();
  private turnThreadIdByTurnId = new Map<string, string>();

  subscribe(listener: (event: CodexBridgeEvent) => void) {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  async getStatus(options?: { refreshToken?: boolean }): Promise<CodexAuthStatus> {
    try {
      await this.ensureStarted();
      const response = (await this.request('account/read', {
        refreshToken: options?.refreshToken ?? false,
      })) as AccountReadResponse;

      const account = response.account;
      const loginMethod =
        account?.type === 'chatgpt' ? 'chatgpt' : account?.type === 'apiKey' ? 'api_key' : ('unknown' as const);

      return {
        available: true,
        authenticated: Boolean(account),
        loginMethod,
        accountType: account?.type || 'unknown',
        requiresOpenaiAuth: response.requiresOpenaiAuth,
        email: account?.type === 'chatgpt' ? account.email : undefined,
        planType: account?.type === 'chatgpt' ? account.planType : undefined,
        cliPath: this.cliPath || undefined,
      };
    } catch (error: any) {
      return {
        available: false,
        authenticated: false,
        error: error?.message || 'codex_bridge_unavailable',
        cliPath: this.cliPath || undefined,
      };
    }
  }

  async startLogin(): Promise<CodexLoginStartResult> {
    const status = await this.getStatus({ refreshToken: false });

    if (status.authenticated) {
      return {
        launched: true,
        alreadyAuthenticated: true,
      };
    }

    try {
      const response = (await this.request('account/login/start', {
        type: 'chatgpt',
      })) as LoginResponse;

      if (response.type === 'chatgpt') {
        this.activeLoginId = response.loginId;
        return {
          launched: true,
          loginId: response.loginId,
          authUrl: response.authUrl,
        };
      }

      if (response.type === 'chatgptDeviceCode') {
        this.activeLoginId = response.loginId;
        return {
          launched: true,
          loginId: response.loginId,
          authUrl: response.verificationUrl,
        };
      }

      return {
        launched: false,
        error: 'account_login_flow_unavailable',
      };
    } catch (error: any) {
      return {
        launched: false,
        error: error?.message || 'account_login_start_failed',
      };
    }
  }

  async cancelLogin(loginId?: string) {
    const effectiveLoginId = loginId || this.activeLoginId;

    if (!effectiveLoginId) {
      return { cancelled: false, error: 'no_active_login' };
    }

    try {
      const response = (await this.request('account/login/cancel', {
        loginId: effectiveLoginId,
      })) as { status: string };
      this.activeLoginId = null;

      return { cancelled: true, status: response.status };
    } catch (error: any) {
      return { cancelled: false, error: error?.message || 'account_login_cancel_failed' };
    }
  }

  async listModels(options?: { limit?: number; includeHidden?: boolean }) {
    await this.ensureStarted();

    let cursor: string | null = null;
    const models: CodexModelInfo[] = [];

    do {
      const response = (await this.request('model/list', {
        cursor,
        limit: options?.limit ?? 100,
        includeHidden: options?.includeHidden ?? false,
      })) as ModelListResponse;

      models.push(...response.data.map(mapCodexModel));

      cursor = response.nextCursor;
    } while (cursor);

    return models;
  }

  async startTurn(params: { input: string; model?: string; cwd?: string; effort?: ReasoningEffort }) {
    const threadId = await this.ensureThread({
      model: params.model,
      cwd: params.cwd,
    });
    const response = (await this.request('turn/start', {
      threadId,
      input: [
        {
          type: 'text',
          text: params.input,
        },
      ],
      model: params.model || null,
      cwd: params.cwd || undefined,
      ...(params.effort ? { effort: params.effort } : {}),
    })) as TurnStartResponse;

    this.activeTurnId = response.turn.id;
    this.turnThreadIdByTurnId.set(response.turn.id, threadId);

    return {
      threadId,
      turnId: response.turn.id,
    };
  }

  async interruptTurn(params?: { threadId?: string; turnId?: string }) {
    const threadId = params?.threadId || this.activeThreadId;
    const turnId = params?.turnId || this.activeTurnId;

    if (!threadId || !turnId) {
      return { interrupted: false, error: 'no_active_turn' };
    }

    await this.request('turn/interrupt', {
      threadId,
      turnId,
    });

    return { interrupted: true };
  }

  async resetThread() {
    if (this.activeThreadId) {
      this.latestUsageByThreadId.delete(this.activeThreadId);
    }

    if (this.activeTurnId) {
      this.turnThreadIdByTurnId.delete(this.activeTurnId);
    }

    this.activeTurnId = null;
    this.activeThreadId = null;
  }

  private async ensureThread(options?: { model?: string; cwd?: string }) {
    await this.ensureStarted();

    if (this.activeThreadId) {
      return this.activeThreadId;
    }

    const response = (await this.request('thread/start', {
      cwd: options?.cwd || process.cwd(),
      approvalPolicy: 'never',
      sandbox: 'dangerFullAccess',
      model: options?.model || null,
      modelProvider: 'openai',
      experimentalRawEvents: false,
      persistExtendedHistory: false,
    })) as ThreadStartResponse;

    this.activeThreadId = response.thread.id;

    return response.thread.id;
  }

  private async ensureStarted() {
    if (this.process && this.initialized) {
      return;
    }

    if (this.processStartPromise) {
      return this.processStartPromise;
    }

    this.processStartPromise = this.startProcess();

    try {
      await this.processStartPromise;
    } finally {
      this.processStartPromise = null;
    }
  }

  private async startProcess() {
    this.cliPath = await this.resolveCliPath();

    if (!this.cliPath) {
      throw new Error('codex_cli_not_found');
    }

    this.process = spawn(this.cliPath, ['app-server', '--listen', 'stdio://'], {
      stdio: 'pipe',
      env: process.env,
    });
    this.process.stdout.setEncoding('utf8');
    this.process.stderr.setEncoding('utf8');

    this.process.stdout.on('data', (chunk: string) => {
      this.handleStdoutChunk(chunk);
    });

    this.process.stderr.on('data', (chunk: string) => {
      // App-server logs warnings to stderr even for recoverable states.
      console.warn('[codex-auth] app-server stderr:', chunk.trim());
    });

    this.process.on('exit', (code, signal) => {
      this.failAllPendingRequests(
        new Error(`codex app-server exited (code=${String(code)}, signal=${String(signal)})`),
      );
      this.process = null;
      this.initialized = false;
      this.activeTurnId = null;
      this.activeThreadId = null;
      this.activeLoginId = null;
      this.latestUsageByThreadId.clear();
      this.turnThreadIdByTurnId.clear();
    });

    this.process.on('error', (error) => {
      this.failAllPendingRequests(new Error(`codex app-server process error: ${error.message}`));
      this.process = null;
      this.initialized = false;
    });

    await this.requestInternal('initialize', {
      clientInfo: {
        name: 'bolt.diy-desktop',
        version: '1.0.0',
      },
      capabilities: null,
    });
    this.sendRaw({
      method: 'initialized',
      params: {},
    });

    this.initialized = true;
  }

  private async resolveCliPath() {
    const candidates = [process.env.CODEX_CLI_PATH, DEFAULT_CODEX_CLI_PATH, 'codex'].filter(Boolean) as string[];

    for (const candidate of candidates) {
      try {
        await execFileAsync(candidate, ['--version']);
        return candidate;
      } catch (error: any) {
        if (error?.code === 'ENOENT') {
          continue;
        }
      }
    }

    return null;
  }

  private handleStdoutChunk(chunk: string) {
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
        console.warn('[codex-auth] non-JSON app-server stdout:', trimmedLine);
        continue;
      }

      if ((typeof parsed?.id === 'number' || typeof parsed?.id === 'string') && typeof parsed?.method === 'string') {
        this.handleServerRequest(parsed as JsonRpcServerRequestMessage);
        continue;
      }

      if (typeof parsed?.id === 'number' || typeof parsed?.id === 'string') {
        this.handleResponse(parsed as JsonRpcResponseMessage);
        continue;
      }

      if (typeof parsed?.method === 'string') {
        this.handleNotification(parsed as JsonRpcNotificationMessage);
      }
    }
  }

  private handleResponse(message: JsonRpcResponseMessage) {
    const request = this.pendingRequests.get(message.id);

    if (!request) {
      return;
    }

    clearTimeout(request.timeout);
    this.pendingRequests.delete(message.id);

    if (message.error) {
      const errorMessage = message.error.message || `JSON-RPC error code ${String(message.error.code)}`;
      request.reject(new Error(errorMessage));
      return;
    }

    request.resolve(message.result);
  }

  private handleNotification(message: JsonRpcNotificationMessage) {
    if (message.method === 'thread/tokenUsage/updated') {
      const usageUpdate = extractCodexTokenUsageUpdate(message.params);

      if (usageUpdate?.threadId && usageUpdate.usage) {
        this.latestUsageByThreadId.set(usageUpdate.threadId, usageUpdate.usage);
      }
    }

    if (!CODEX_BRIDGE_EVENTS.has(message.method)) {
      return;
    }

    const event = {
      type: message.method,
      params: message.params,
    } as CodexBridgeEvent;

    if (event.type === 'thread/tokenUsage/updated') {
      const usageUpdate = extractCodexTokenUsageUpdate(message.params);
      event.params = {
        threadId: usageUpdate?.threadId || this.activeThreadId || '',
        usage: usageUpdate?.usage,
      };

      if (!event.params.threadId) {
        return;
      }
    }

    if (event.type === 'turn/completed') {
      const completedTurnId = event.params?.turn?.id;
      const threadId = event.params?.threadId;
      const turnUsage = normalizeCodexTurnUsage(event.params?.turn?.usage);
      const usageFromThread =
        (threadId && this.latestUsageByThreadId.get(threadId)) ||
        (completedTurnId
          ? this.latestUsageByThreadId.get(this.turnThreadIdByTurnId.get(completedTurnId) || '')
          : undefined);
      const mergedUsage = normalizeCodexTurnUsage({
        ...(usageFromThread || {}),
        ...(turnUsage || {}),
      });

      if (mergedUsage) {
        event.params.turn.usage = mergedUsage;
      }

      if (completedTurnId && completedTurnId === this.activeTurnId) {
        this.activeTurnId = null;
      }

      if (completedTurnId) {
        const completedThreadId = this.turnThreadIdByTurnId.get(completedTurnId);

        if (completedThreadId) {
          this.latestUsageByThreadId.delete(completedThreadId);
        }

        this.turnThreadIdByTurnId.delete(completedTurnId);
      }
    }

    if (event.type === 'account/login/completed') {
      if (!event.params?.loginId || event.params.loginId === this.activeLoginId) {
        this.activeLoginId = null;
      }
    }

    this.listeners.forEach((listener) => listener(event));
  }

  private handleServerRequest(message: JsonRpcServerRequestMessage) {
    const { id, method } = message;

    switch (method) {
      case 'item/commandExecution/requestApproval': {
        this.sendRaw({
          id,
          result: { decision: 'decline' },
        });
        return;
      }
      case 'item/fileChange/requestApproval': {
        this.sendRaw({
          id,
          result: { decision: 'decline' },
        });
        return;
      }
      case 'item/permissions/requestApproval': {
        this.sendRaw({
          id,
          result: {
            permissions: {},
            scope: 'turn',
          },
        });
        return;
      }
      case 'item/tool/requestUserInput': {
        this.sendRaw({
          id,
          result: {
            answers: {},
          },
        });
        return;
      }
      case 'item/tool/call': {
        this.sendRaw({
          id,
          result: {
            contentItems: [],
            success: false,
          },
        });
        return;
      }
      case 'mcpServer/elicitation/request': {
        this.sendRaw({
          id,
          result: {
            action: 'decline',
            content: null,
            _meta: null,
          },
        });
        return;
      }
      case 'applyPatchApproval':
      case 'execCommandApproval': {
        this.sendRaw({
          id,
          result: {
            decision: 'denied',
          },
        });
        return;
      }
      default: {
        this.sendRaw({
          id,
          error: {
            code: -32601,
            message: `Unsupported server request method: ${method}`,
          },
        });
      }
    }
  }

  private async request<T = unknown>(method: string, params: unknown): Promise<T> {
    await this.ensureStarted();
    return this.requestInternal<T>(method, params);
  }

  private async requestInternal<T = unknown>(method: string, params: unknown): Promise<T> {
    if (!this.process || !this.process.stdin.writable) {
      throw new Error('codex_app_server_unavailable');
    }

    const requestId = this.nextRequestId++;

    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Request timeout for ${method}`));
      }, RESPONSE_TIMEOUT_MS);

      this.pendingRequests.set(requestId, {
        resolve: (value) => resolve(value as T),
        reject,
        timeout,
      });
      this.sendRaw({
        id: requestId,
        method,
        params,
      });
    });
  }

  private sendRaw(payload: Record<string, unknown>) {
    if (!this.process || !this.process.stdin.writable) {
      throw new Error('codex_app_server_unavailable');
    }

    const message = JSON.stringify({
      jsonrpc: '2.0',
      ...payload,
    });
    this.process.stdin.write(`${message}\n`);
  }

  private failAllPendingRequests(error: Error) {
    this.pendingRequests.forEach((request) => {
      clearTimeout(request.timeout);
      request.reject(error);
    });
    this.pendingRequests.clear();
  }
}

const bridge = new CodexAppServerBridge();

export const subscribeCodexBridgeEvents = (listener: (event: CodexBridgeEvent) => void) => bridge.subscribe(listener);

export const getCodexAuthStatus = (options?: { refreshToken?: boolean }) => bridge.getStatus(options);

export const startCodexLogin = () => bridge.startLogin();

export const cancelCodexLogin = (loginId?: string) => bridge.cancelLogin(loginId);

export const listCodexModels = (options?: { limit?: number; includeHidden?: boolean }) => bridge.listModels(options);

export const startCodexTurn = (params: { input: string; model?: string; cwd?: string; effort?: ReasoningEffort }) =>
  bridge.startTurn(params);

export const interruptCodexTurn = (params?: { threadId?: string; turnId?: string }) => bridge.interruptTurn(params);

export const resetCodexThread = () => bridge.resetThread();
