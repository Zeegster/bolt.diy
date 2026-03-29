import { ipcRenderer, contextBridge, type IpcRendererEvent } from 'electron';

console.debug('start preload.', ipcRenderer);

const ipc = {
  invoke(channel: string, payload?: unknown) {
    return ipcRenderer.invoke(channel, payload);
  },
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  on(channel: string, func: Function) {
    const f = (event: IpcRendererEvent, ...args: any[]) => func(...[event, ...args]);
    console.debug('register listener', channel, f);
    ipcRenderer.on(channel, f);

    return () => {
      console.debug('remove listener', channel, f);
      ipcRenderer.removeListener(channel, f);
    };
  },
};

contextBridge.exposeInMainWorld('ipc', ipc);

type CodexBridgeEvent =
  | {
      type: 'thread/tokenUsage/updated';
      params: {
        threadId: string;
        usage?: {
          inputTokens?: number;
          cachedInputTokens?: number;
          outputTokens?: number;
          totalTokens?: number;
          totalCostUsd?: number;
          durationMs?: number;
          cacheCreationInputTokens?: number;
          cacheReadInputTokens?: number;
        };
      };
    }
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
          usage?: {
            inputTokens?: number;
            cachedInputTokens?: number;
            outputTokens?: number;
            totalTokens?: number;
            totalCostUsd?: number;
            durationMs?: number;
            cacheCreationInputTokens?: number;
            cacheReadInputTokens?: number;
          };
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

type ReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';

const codexAuth = {
  getStatus: () =>
    ipcRenderer.invoke('codex-auth:get-status') as Promise<{
      available: boolean;
      authenticated: boolean;
      loginMethod?: 'chatgpt' | 'api_key' | 'unknown';
      accountType?: 'chatgpt' | 'apiKey' | 'unknown';
      requiresOpenaiAuth?: boolean;
      email?: string;
      planType?: string;
      cliPath?: string;
      error?: string;
    }>,
  startLogin: () =>
    ipcRenderer.invoke('codex-auth:start-login') as Promise<{
      launched: boolean;
      authUrl?: string;
      loginId?: string;
      error?: string;
      alreadyAuthenticated?: boolean;
    }>,
  cancelLogin: (payload?: { loginId?: string }) => ipcRenderer.invoke('codex-auth:cancel-login', payload),
  listModels: (payload?: { limit?: number; includeHidden?: boolean }) =>
    ipcRenderer.invoke('codex-auth:list-models', payload) as Promise<
      Array<{
        id: string;
        model: string;
        displayName: string;
        description: string;
        isDefault: boolean;
        hidden: boolean;
        supportedReasoningEfforts?: ReasoningEffort[];
        defaultReasoningEffort?: ReasoningEffort;
      }>
    >,
  startTurn: (payload: { input: string; model?: string; cwd?: string; effort?: ReasoningEffort }) =>
    ipcRenderer.invoke('codex-auth:turn-start', payload) as Promise<{
      threadId: string;
      turnId: string;
    }>,
  interruptTurn: (payload?: { threadId?: string; turnId?: string }) =>
    ipcRenderer.invoke('codex-auth:turn-interrupt', payload) as Promise<{
      interrupted: boolean;
      error?: string;
    }>,
  resetThread: () => ipcRenderer.invoke('codex-auth:thread-reset'),
  onEvent: (listener: (event: CodexBridgeEvent) => void) => {
    const wrapped = (_event: IpcRendererEvent, event: CodexBridgeEvent) => listener(event);
    ipcRenderer.on('codex-auth:event', wrapped);

    return () => {
      ipcRenderer.removeListener('codex-auth:event', wrapped);
    };
  },
};

contextBridge.exposeInMainWorld('codexAuth', codexAuth);

const anthropicAuth = {
  getStatus: () =>
    ipcRenderer.invoke('claude-auth:get-status') as Promise<{
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
    }>,
  startLogin: () =>
    ipcRenderer.invoke('claude-auth:start-login') as Promise<{
      launched: boolean;
      error?: string;
      alreadyAuthenticated?: boolean;
    }>,
  listModels: (payload?: { includeHidden?: boolean }) =>
    ipcRenderer.invoke('claude-auth:list-models', payload) as Promise<
      Array<{
        id: string;
        model: string;
        displayName: string;
        description: string;
        isDefault: boolean;
        hidden: boolean;
        supportedReasoningEfforts?: ReasoningEffort[];
        defaultReasoningEffort?: ReasoningEffort;
      }>
    >,
  startTurn: (payload: { input: string; model?: string; cwd?: string; effort?: ReasoningEffort }) =>
    ipcRenderer.invoke('claude-auth:turn-start', payload) as Promise<{
      threadId: string;
      turnId: string;
    }>,
  interruptTurn: (payload?: { threadId?: string; turnId?: string }) =>
    ipcRenderer.invoke('claude-auth:turn-interrupt', payload) as Promise<{
      interrupted: boolean;
      error?: string;
    }>,
  resetThread: () => ipcRenderer.invoke('claude-auth:thread-reset'),
  onEvent: (listener: (event: CodexBridgeEvent) => void) => {
    const wrapped = (_event: IpcRendererEvent, event: CodexBridgeEvent) => listener(event);
    ipcRenderer.on('claude-auth:event', wrapped);

    return () => {
      ipcRenderer.removeListener('claude-auth:event', wrapped);
    };
  },
};

contextBridge.exposeInMainWorld('anthropicAuth', anthropicAuth);
