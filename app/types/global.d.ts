interface Window {
  showDirectoryPicker(): Promise<FileSystemDirectoryHandle>;
  webkitSpeechRecognition: typeof SpeechRecognition;
  SpeechRecognition: typeof SpeechRecognition;
  ipc?: {
    invoke: (channel: string, payload?: unknown) => Promise<any>;
    on: (channel: string, func: (...args: unknown[]) => void) => () => void;
  };
  codexAuth?: {
    getStatus: () => Promise<{
      available: boolean;
      authenticated: boolean;
      loginMethod?: 'chatgpt' | 'api_key' | 'unknown';
      accountType?: 'chatgpt' | 'apiKey' | 'unknown';
      requiresOpenaiAuth?: boolean;
      email?: string;
      planType?: string;
      cliPath?: string;
      error?: string;
    }>;
    startLogin: () => Promise<{
      launched: boolean;
      authUrl?: string;
      loginId?: string;
      error?: string;
      alreadyAuthenticated?: boolean;
    }>;
    cancelLogin: (payload?: { loginId?: string }) => Promise<{
      cancelled: boolean;
      status?: string;
      error?: string;
    }>;
    listModels: (payload?: { limit?: number; includeHidden?: boolean }) => Promise<
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
    >;
    startTurn: (payload: { input: string; model?: string; cwd?: string; effort?: ReasoningEffort }) => Promise<{
      threadId: string;
      turnId: string;
    }>;
    interruptTurn: (payload?: { threadId?: string; turnId?: string }) => Promise<{
      interrupted: boolean;
      error?: string;
    }>;
    resetThread: () => Promise<{ ok: boolean }>;
    onEvent: (listener: (event: CodexAuthEvent) => void) => () => void;
  };
  anthropicAuth?: {
    getStatus: () => Promise<{
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
    }>;
    startLogin: () => Promise<{
      launched: boolean;
      error?: string;
      alreadyAuthenticated?: boolean;
    }>;
    listModels: (payload?: { includeHidden?: boolean }) => Promise<
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
    >;
    startTurn: (payload: { input: string; model?: string; cwd?: string; effort?: ReasoningEffort }) => Promise<{
      threadId: string;
      turnId: string;
    }>;
    interruptTurn: (payload?: { threadId?: string; turnId?: string }) => Promise<{
      interrupted: boolean;
      error?: string;
    }>;
    resetThread: () => Promise<{ ok: boolean }>;
    onEvent: (listener: (event: CodexAuthEvent) => void) => () => void;
  };
}

type CodexAuthEvent =
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

interface Performance {
  memory?: {
    jsHeapSizeLimit: number;
    totalJSHeapSize: number;
    usedJSHeapSize: number;
  };
}
