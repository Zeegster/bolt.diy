/*
 * @ts-nocheck
 * Preventing TS checks with files presented in the video for a better presentation.
 */
import type { JSONValue, Message } from 'ai';
import React, { type RefCallback, useEffect, useState } from 'react';
import { ClientOnly } from 'remix-utils/client-only';
import { Menu } from '~/components/sidebar/Menu.client';
import { IconButton } from '~/components/ui/IconButton';
import { Workbench } from '~/components/workbench/Workbench.client';
import { classNames } from '~/utils/classNames';
import { PROVIDER_LIST } from '~/utils/constants';
import { Messages } from './Messages.client';
import { SendButton } from './SendButton.client';
import { getApiKeysFromCookies } from './APIKeyManager';
import Cookies from 'js-cookie';
import * as Tooltip from '@radix-ui/react-tooltip';

import styles from './BaseChat.module.scss';
import { ExportChatButton } from '~/components/chat/chatExportAndImport/ExportChatButton';
import { ImportButtons } from '~/components/chat/chatExportAndImport/ImportButtons';
import { ExamplePrompts } from '~/components/chat/ExamplePrompts';
import GitCloneButton from './GitCloneButton';

import FilePreview from './FilePreview';
import { ModelSelector } from '~/components/chat/ModelSelector';
import { SpeechRecognitionButton } from '~/components/chat/SpeechRecognition';
import type { ProviderInfo } from '~/types/model';
import { ScreenshotStateManager } from './ScreenshotStateManager';
import { toast } from 'react-toastify';
import StarterTemplates from './StarterTemplates';
import type { ActionAlert, SupabaseAlert, DeployAlert } from '~/types/actions';
import DeployChatAlert from '~/components/deploy/DeployAlert';
import ChatAlert from './ChatAlert';
import type { ModelInfo, ReasoningEffort } from '~/lib/modules/llm/types';
import ProgressCompilation from './ProgressCompilation';
import type { ProgressAnnotation } from '~/types/context';
import type { ActionRunner } from '~/lib/runtime/action-runner';
import { LOCAL_PROVIDERS } from '~/lib/stores/settings';
import { SupabaseChatAlert } from '~/components/chat/SupabaseAlert';
import { SupabaseConnection } from './SupabaseConnection';
import { ExpoQrModal } from '~/components/workbench/ExpoQrModal';
import { expoUrlAtom } from '~/lib/stores/qrCodeStore';
import { useStore } from '@nanostores/react';
import { StickToBottom, useStickToBottomContext } from '~/lib/hooks';
import { useSettings } from '~/lib/hooks/useSettings';
import { getProviderRuntimeState } from '~/utils/providerRuntime';
import Popover from '~/components/ui/Popover';
import { ProviderSettingsPopover } from './ProviderSettingsPopover';
import {
  PublisherIntakeOnboarding,
  type PublisherIntakeOnboardingSubmitPayload,
} from '~/components/publisher/PublisherIntakeOnboarding';
import type { WorkspaceMode } from '~/types/publisher';

const TEXTAREA_MIN_HEIGHT = 76;

interface BaseChatProps {
  textareaRef?: React.RefObject<HTMLTextAreaElement> | undefined;
  messageRef?: RefCallback<HTMLDivElement> | undefined;
  scrollRef?: RefCallback<HTMLDivElement> | undefined;
  showChat?: boolean;
  chatStarted?: boolean;
  isStreaming?: boolean;
  onStreamingChange?: (streaming: boolean) => void;
  messages?: Message[];
  description?: string;
  enhancingPrompt?: boolean;
  promptEnhanced?: boolean;
  input?: string;
  model?: string;
  setModel?: (model: string) => void;
  provider?: ProviderInfo;
  setProvider?: (provider: ProviderInfo) => void;
  providerList?: ProviderInfo[];
  handleStop?: () => void;
  sendMessage?: (event: React.UIEvent, messageInput?: string) => void;
  handleInputChange?: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  enhancePrompt?: () => void;
  importChat?: (description: string, messages: Message[]) => Promise<void>;
  exportChat?: () => void;
  uploadedFiles?: File[];
  setUploadedFiles?: (files: File[]) => void;
  imageDataList?: string[];
  setImageDataList?: (dataList: string[]) => void;
  actionAlert?: ActionAlert;
  clearAlert?: () => void;
  supabaseAlert?: SupabaseAlert;
  clearSupabaseAlert?: () => void;
  deployAlert?: DeployAlert;
  clearDeployAlert?: () => void;
  data?: JSONValue[] | undefined;
  actionRunner?: ActionRunner;
  workspaceMode?: WorkspaceMode;
  publisherWorkspaceReady?: boolean;
  publisherOnboardingBusy?: boolean;
  onWorkspaceModeChange?: (mode: WorkspaceMode) => void;
  onPublisherOnboardingSubmit?: (payload: PublisherIntakeOnboardingSubmitPayload) => Promise<void> | void;
}

interface CodexAuthStatus {
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

interface CodexModelInfo {
  id: string;
  model: string;
  displayName: string;
  description: string;
  isDefault: boolean;
  hidden: boolean;
  supportedReasoningEfforts?: ReasoningEffort[];
  defaultReasoningEffort?: ReasoningEffort;
}

export const BaseChat = React.forwardRef<HTMLDivElement, BaseChatProps>(
  (
    {
      textareaRef,
      showChat = true,
      chatStarted = false,
      isStreaming = false,
      onStreamingChange,
      model,
      setModel,
      provider,
      setProvider,
      providerList,
      input = '',
      enhancingPrompt,
      handleInputChange,

      // promptEnhanced,
      enhancePrompt,
      sendMessage,
      handleStop,
      importChat,
      exportChat,
      uploadedFiles = [],
      setUploadedFiles,
      imageDataList = [],
      setImageDataList,
      messages,
      actionAlert,
      clearAlert,
      deployAlert,
      clearDeployAlert,
      supabaseAlert,
      clearSupabaseAlert,
      data,
      actionRunner,
      workspaceMode = 'default',
      publisherWorkspaceReady = false,
      publisherOnboardingBusy = false,
      onWorkspaceModeChange,
      onPublisherOnboardingSubmit,
    },
    ref,
  ) => {
    const TEXTAREA_MAX_HEIGHT = chatStarted ? 400 : 200;
    const { providers, updateProviderSettings } = useSettings();
    const [apiKeys, setApiKeys] = useState<Record<string, string>>(getApiKeysFromCookies());
    const [modelList, setModelList] = useState<ModelInfo[]>([]);
    const [providerEnvKeyStatus, setProviderEnvKeyStatus] = useState<Record<string, boolean>>({});
    const [openAIAccountStatus, setOpenAIAccountStatus] = useState<CodexAuthStatus>({
      available: false,
      authenticated: false,
    });
    const [anthropicAccountStatus, setAnthropicAccountStatus] = useState<{
      available: boolean;
      authenticated: boolean;
      error?: string;
    }>({
      available: false,
      authenticated: false,
    });
    const [isListening, setIsListening] = useState(false);
    const [recognition, setRecognition] = useState<SpeechRecognition | null>(null);
    const [transcript, setTranscript] = useState('');
    const [isModelLoading, setIsModelLoading] = useState<string | undefined>('all');
    const [progressAnnotations, setProgressAnnotations] = useState<ProgressAnnotation[]>([]);
    const expoUrl = useStore(expoUrlAtom);
    const [qrModalOpen, setQrModalOpen] = useState(false);

    useEffect(() => {
      if (expoUrl) {
        setQrModalOpen(true);
      }
    }, [expoUrl]);

    useEffect(() => {
      if (data) {
        const progressList = data.filter(
          (x) => typeof x === 'object' && (x as any).type === 'progress',
        ) as ProgressAnnotation[];
        setProgressAnnotations(progressList);
      }
    }, [data]);
    useEffect(() => {
      console.log(transcript);
    }, [transcript]);

    useEffect(() => {
      onStreamingChange?.(isStreaming);
    }, [isStreaming, onStreamingChange]);

    useEffect(() => {
      if (typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;

        recognition.onresult = (event) => {
          const transcript = Array.from(event.results)
            .map((result) => result[0])
            .map((result) => result.transcript)
            .join('');

          setTranscript(transcript);

          if (handleInputChange) {
            const syntheticEvent = {
              target: { value: transcript },
            } as React.ChangeEvent<HTMLTextAreaElement>;
            handleInputChange(syntheticEvent);
          }
        };

        recognition.onerror = (event) => {
          console.error('Speech recognition error:', event.error);
          setIsListening(false);
        };

        setRecognition(recognition);
      }
    }, []);

    useEffect(() => {
      if (typeof window !== 'undefined') {
        try {
          setApiKeys(getApiKeysFromCookies());
        } catch (error) {
          console.error('Error loading API keys from cookies:', error);
          Cookies.remove('apiKeys');
        }
      }
    }, []);

    const currentProviderSettings = provider ? providers[provider.name]?.settings : undefined;
    const currentProviderAuthMode = currentProviderSettings?.authMode || 'apiKey';
    const currentProviderReasoningEffort = currentProviderSettings?.reasoningEffort;
    const currentProviderCustomModelId = currentProviderSettings?.customModelId || '';
    const supportsProviderAccountAuth = provider?.supportsAccountAuth === true;
    const isProviderAccountMode = supportsProviderAccountAuth && currentProviderAuthMode === 'account';
    const isOpenAIAccountMode = isProviderAccountMode && provider?.name === 'OpenAI';
    const isAnthropicAccountMode = isProviderAccountMode && provider?.name === 'Anthropic';
    const currentProviderModels = modelList.filter((entry) => entry.provider === provider?.name);
    const openAIAccountBridgeAvailable =
      typeof window !== 'undefined' && Boolean(window.codexAuth?.getStatus && window.codexAuth?.startLogin);
    const anthropicAccountBridgeAvailable =
      typeof window !== 'undefined' && Boolean(window.anthropicAuth?.getStatus && window.anthropicAuth?.startLogin);
    const providerAccountBridgeAvailable =
      provider?.name === 'OpenAI'
        ? openAIAccountBridgeAvailable
        : provider?.name === 'Anthropic'
          ? anthropicAccountBridgeAvailable
          : false;
    const providerAccountConnected =
      provider?.name === 'OpenAI'
        ? openAIAccountStatus.authenticated
        : provider?.name === 'Anthropic'
          ? anthropicAccountStatus.authenticated
          : false;

    const refreshProviderEnvKeyStatus = async (providerName: string) => {
      try {
        const response = await fetch(`/api/check-env-key?provider=${encodeURIComponent(providerName)}`);
        const data = (await response.json()) as { isSet: boolean };
        setProviderEnvKeyStatus((prev) => ({ ...prev, [providerName]: data.isSet }));

        return data.isSet;
      } catch (error) {
        console.error('Failed to check provider auth status:', error);
        setProviderEnvKeyStatus((prev) => ({ ...prev, [providerName]: false }));

        return false;
      }
    };

    const refreshOpenAIAccountAuth = async () => {
      if (!window.codexAuth?.getStatus) {
        const unavailableStatus = { available: false, authenticated: false };
        setOpenAIAccountStatus(unavailableStatus);

        return unavailableStatus;
      }

      try {
        const status = (await window.codexAuth.getStatus()) as CodexAuthStatus;
        setOpenAIAccountStatus(status);

        return status;
      } catch (error) {
        console.error('Failed to get OpenAI account auth status:', error);

        const errorStatus = { available: true, authenticated: false, error: 'status_check_failed' } as CodexAuthStatus;
        setOpenAIAccountStatus(errorStatus);

        return errorStatus;
      }
    };

    const refreshAnthropicAccountAuth = async () => {
      if (!window.anthropicAuth?.getStatus) {
        const unavailableStatus = { available: false, authenticated: false };
        setAnthropicAccountStatus(unavailableStatus);

        return unavailableStatus;
      }

      try {
        const status = (await window.anthropicAuth.getStatus()) as {
          available: boolean;
          authenticated: boolean;
          error?: string;
        };
        setAnthropicAccountStatus(status);

        return status;
      } catch (error) {
        console.error('Failed to get Anthropic account auth status:', error);

        const errorStatus = { available: true, authenticated: false, error: 'status_check_failed' };
        setAnthropicAccountStatus(errorStatus);

        return errorStatus;
      }
    };

    const handleOpenAIAccountLogin = async () => {
      if (!window.codexAuth?.startLogin) {
        toast.error('Desktop OpenAI authentication is unavailable in this mode.');
        return;
      }

      const result = (await window.codexAuth.startLogin()) as {
        launched?: boolean;
        authUrl?: string;
        loginId?: string;
        error?: string;
        alreadyAuthenticated?: boolean;
      };

      if (!result?.launched) {
        toast.error(result?.error || 'Не удалось открыть окно аутентификации OpenAI.');
        return;
      }

      if (result.alreadyAuthenticated) {
        toast.success('OpenAI аккаунт уже подключен.');
      } else {
        toast.info('Окно аутентификации OpenAI открыто. Завершите вход и вернитесь в приложение.');
      }

      await refreshOpenAIAccountAuth();
    };

    const handleAnthropicAccountLogin = async () => {
      if (!window.anthropicAuth?.startLogin) {
        toast.error('Desktop Anthropic authentication is unavailable in this mode.');
        return;
      }

      const result = (await window.anthropicAuth.startLogin()) as {
        launched?: boolean;
        error?: string;
        alreadyAuthenticated?: boolean;
      };

      if (!result?.launched) {
        toast.error(result?.error || 'Не удалось открыть окно аутентификации Anthropic.');
        return;
      }

      if (result.alreadyAuthenticated) {
        toast.success('Anthropic аккаунт уже подключен.');
      } else {
        toast.info('Окно аутентификации Anthropic открыто. Завершите вход и вернитесь в приложение.');
      }

      await refreshAnthropicAccountAuth();
    };

    const refreshProviderModels = async (
      providerName: string,
      providerSettingsOverride?: {
        authMode?: 'apiKey' | 'account';
        reasoningEffort?: ReasoningEffort;
        customModelId?: string;
      },
    ) => {
      setIsModelLoading(providerName);

      try {
        const providerSettingsForModels =
          providerSettingsOverride ||
          (providerName === provider?.name ? currentProviderSettings : providers[providerName]?.settings);
        const isAccountMode = providerSettingsForModels?.authMode === 'account';
        const isOpenAIAccountModeForProvider = providerName === 'OpenAI' && isAccountMode;
        const isAnthropicAccountModeForProvider = providerName === 'Anthropic' && isAccountMode;

        if (isOpenAIAccountModeForProvider) {
          if (!window.codexAuth?.listModels) {
            setModelList((prevModels) => prevModels.filter((entry) => entry.provider !== providerName));
            return [];
          }

          const codexModels = (await window.codexAuth.listModels({ includeHidden: false })) as CodexModelInfo[];
          const providerModels: ModelInfo[] = codexModels.map((model) => ({
            name: model.model || model.id,
            label: model.displayName || model.model || model.id,
            provider: 'OpenAI',
            maxTokenAllowed: 128000,
            source: 'dynamic',
            supportedReasoningEfforts: model.supportedReasoningEfforts,
            defaultReasoningEffort: model.defaultReasoningEffort,
          }));

          setModelList((prevModels) => {
            const otherModels = prevModels.filter((entry) => entry.provider !== providerName);
            return [...otherModels, ...providerModels];
          });

          return providerModels;
        }

        if (isAnthropicAccountModeForProvider) {
          if (!window.anthropicAuth?.listModels) {
            setModelList((prevModels) => prevModels.filter((entry) => entry.provider !== providerName));
            return [];
          }

          const claudeModels = await window.anthropicAuth.listModels();
          const anthropicEffortOptions: ReasoningEffort[] = ['low', 'medium', 'high', 'max'];
          let providerModels: ModelInfo[] = claudeModels.map((model) => ({
            name: model.model || model.id,
            label: model.displayName || model.model || model.id,
            provider: 'Anthropic',
            maxTokenAllowed: 200000,
            source: 'dynamic',
            supportedReasoningEfforts: model.supportedReasoningEfforts || anthropicEffortOptions,
            defaultReasoningEffort: model.defaultReasoningEffort || 'medium',
          }));
          const customModelId = providerSettingsForModels?.customModelId?.trim();

          if (customModelId && !providerModels.some((entry) => entry.name === customModelId)) {
            providerModels = [
              ...providerModels,
              {
                name: customModelId,
                label: customModelId,
                provider: 'Anthropic',
                maxTokenAllowed: 200000,
                source: 'dynamic',
                supportedReasoningEfforts: anthropicEffortOptions,
                defaultReasoningEffort: 'medium',
              },
            ];
          }

          setModelList((prevModels) => {
            const otherModels = prevModels.filter((entry) => entry.provider !== providerName);
            return [...otherModels, ...providerModels];
          });

          return providerModels;
        }

        const response = await fetch(`/api/models/${encodeURIComponent(providerName)}`);
        const data = (await response.json()) as { modelList: ModelInfo[] };
        const providerModels = data.modelList || [];
        setModelList((prevModels) => {
          const otherModels = prevModels.filter((entry) => entry.provider !== providerName);
          return [...otherModels, ...providerModels];
        });

        return providerModels;
      } catch (error) {
        console.error('Error loading dynamic models for:', providerName, error);
        setModelList((prevModels) => prevModels.filter((entry) => entry.provider !== providerName));

        return [];
      } finally {
        setIsModelLoading(undefined);
      }
    };

    useEffect(() => {
      if (!provider?.name || typeof window === 'undefined') {
        return;
      }

      void refreshProviderEnvKeyStatus(provider.name);

      if (provider.name === 'OpenAI') {
        void refreshOpenAIAccountAuth();
      }

      if (provider.name === 'Anthropic') {
        void refreshAnthropicAccountAuth();
      }

      void refreshProviderModels(provider.name, currentProviderSettings);
    }, [provider?.name, currentProviderAuthMode, currentProviderCustomModelId]);

    useEffect(() => {
      if (!isProviderAccountMode || !providerAccountBridgeAvailable || providerAccountConnected) {
        return undefined;
      }

      const intervalId = window.setInterval(() => {
        if (provider?.name === 'OpenAI') {
          void refreshOpenAIAccountAuth();
        } else if (provider?.name === 'Anthropic') {
          void refreshAnthropicAccountAuth();
        }
      }, 1500);

      return () => {
        window.clearInterval(intervalId);
      };
    }, [isProviderAccountMode, providerAccountBridgeAvailable, providerAccountConnected, provider?.name]);

    useEffect(() => {
      if (isOpenAIAccountMode && window.codexAuth?.onEvent) {
        const unsubscribe = window.codexAuth.onEvent((event) => {
          if (event.type !== 'account/login/completed') {
            return;
          }

          void refreshOpenAIAccountAuth();

          if (provider?.name === 'OpenAI') {
            void refreshProviderModels('OpenAI');
          }
        });

        return () => {
          unsubscribe();
        };
      }

      if (isAnthropicAccountMode && window.anthropicAuth?.onEvent) {
        const unsubscribe = window.anthropicAuth.onEvent((event) => {
          if (event.type !== 'account/login/completed') {
            return;
          }

          void refreshAnthropicAccountAuth();

          if (provider?.name === 'Anthropic') {
            void refreshProviderModels('Anthropic');
          }
        });

        return () => {
          unsubscribe();
        };
      }

      return undefined;
    }, [isOpenAIAccountMode, isAnthropicAccountMode, provider?.name]);

    const onApiKeysChange = async (providerName: string, apiKey: string) => {
      const newApiKeys = { ...apiKeys, [providerName]: apiKey };
      setApiKeys(newApiKeys);
      Cookies.set('apiKeys', JSON.stringify(newApiKeys));
      await refreshProviderEnvKeyStatus(providerName);
      await refreshProviderModels(providerName);
    };

    useEffect(() => {
      if (!provider?.name || !setModel) {
        return;
      }

      if (!currentProviderModels.length) {
        if (model) {
          setModel('');
          Cookies.remove('selectedModel');
        }

        return;
      }

      if (!model || !currentProviderModels.some((entry) => entry.name === model)) {
        setModel(currentProviderModels[0].name);
      }
    }, [provider?.name, currentProviderModels, model, setModel]);

    const selectedProviderModel =
      currentProviderModels.find((entry) => entry.name === model) || currentProviderModels[0];
    const selectedModelEffortOptions = selectedProviderModel?.supportedReasoningEfforts || [];

    useEffect(() => {
      if (!provider?.name) {
        return;
      }

      const nextSettings = { ...currentProviderSettings };

      if (!isProviderAccountMode || selectedModelEffortOptions.length === 0) {
        if (nextSettings.reasoningEffort) {
          nextSettings.reasoningEffort = undefined;
          updateProviderSettings(provider.name, nextSettings);
        }

        return;
      }

      const hasConfiguredEffort =
        nextSettings.reasoningEffort && selectedModelEffortOptions.includes(nextSettings.reasoningEffort);

      if (hasConfiguredEffort) {
        return;
      }

      nextSettings.reasoningEffort = selectedProviderModel?.defaultReasoningEffort || selectedModelEffortOptions[0];
      updateProviderSettings(provider.name, nextSettings);
    }, [
      provider?.name,
      isProviderAccountMode,
      currentProviderAuthMode,
      model,
      selectedProviderModel?.name,
      selectedProviderModel?.defaultReasoningEffort,
      selectedModelEffortOptions.join(','),
      currentProviderReasoningEffort,
    ]);

    const runtimeState = provider
      ? getProviderRuntimeState({
          providerName: provider.name,
          providerSettings: currentProviderSettings,
          providerSupportsAccountAuth: provider.supportsAccountAuth,
          apiKeyConfigured: Boolean(apiKeys[provider.name] || providerEnvKeyStatus[provider.name]),
          accountConnected: providerAccountConnected,
          accountAuthAvailable: providerAccountBridgeAvailable,
          isLoading: isModelLoading === provider.name,
          hasModels: currentProviderModels.length > 0,
          modelsSource: currentProviderModels[0]?.source || 'unavailable',
        })
      : undefined;

    const providerName = provider?.name;
    const isCloudOrOpenAILikeProvider = providerName
      ? !LOCAL_PROVIDERS.includes(providerName) || providerName === 'OpenAILike'
      : false;
    const shouldShowProviderAuthControls =
      Boolean(providerName) && (providerList || []).length > 0 && isCloudOrOpenAILikeProvider;
    const shouldShowSettingsPopover = shouldShowProviderAuthControls;

    const startListening = () => {
      if (recognition) {
        recognition.start();
        setIsListening(true);
      }
    };

    const stopListening = () => {
      if (recognition) {
        recognition.stop();
        setIsListening(false);
      }
    };

    const handleSendMessage = (event: React.UIEvent, messageInput?: string) => {
      if (!provider?.name || !model || runtimeState?.modelsState !== 'ready') {
        toast.error(runtimeState?.warningMessage || 'Модели недоступны. Подключите API или войдите в аккаунт.');
        return;
      }

      if (sendMessage) {
        sendMessage(event, messageInput);

        if (recognition) {
          recognition.abort(); // Stop current recognition
          setTranscript(''); // Clear transcript
          setIsListening(false);

          // Clear the input by triggering handleInputChange with empty value
          if (handleInputChange) {
            const syntheticEvent = {
              target: { value: '' },
            } as React.ChangeEvent<HTMLTextAreaElement>;
            handleInputChange(syntheticEvent);
          }
        }
      }
    };

    const handleFileUpload = () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';

      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];

        if (file) {
          const reader = new FileReader();

          reader.onload = (e) => {
            const base64Image = e.target?.result as string;
            setUploadedFiles?.([...uploadedFiles, file]);
            setImageDataList?.([...imageDataList, base64Image]);
          };
          reader.readAsDataURL(file);
        }
      };

      input.click();
    };

    const handlePaste = async (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;

      if (!items) {
        return;
      }

      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();

          const file = item.getAsFile();

          if (file) {
            const reader = new FileReader();

            reader.onload = (e) => {
              const base64Image = e.target?.result as string;
              setUploadedFiles?.([...uploadedFiles, file]);
              setImageDataList?.([...imageDataList, base64Image]);
            };
            reader.readAsDataURL(file);
          }

          break;
        }
      }
    };

    const baseChat = (
      <div
        ref={ref}
        className={classNames(styles.BaseChat, 'relative flex h-full w-full overflow-hidden')}
        data-chat-visible={showChat}
      >
        <ClientOnly>{() => <Menu />}</ClientOnly>
        <div className="flex flex-col lg:flex-row overflow-y-auto w-full h-full">
          <div className={classNames(styles.Chat, 'flex flex-col flex-grow lg:min-w-[var(--chat-min-width)] h-full')}>
            {!chatStarted && workspaceMode === 'default' && (
              <div id="intro" className="mt-[16vh] max-w-chat mx-auto text-center px-4 lg:px-0">
                <h1 className="text-3xl lg:text-6xl font-bold text-bolt-elements-textPrimary mb-4 animate-fade-in">
                  Where ideas begin
                </h1>
                <p className="text-md lg:text-xl mb-8 text-bolt-elements-textSecondary animate-fade-in animation-delay-200">
                  Bring ideas to life in seconds or get help on existing projects.
                </p>
              </div>
            )}
            {!chatStarted && workspaceMode === 'publisher' && !publisherWorkspaceReady && (
              <div id="intro" className="mt-8 max-w-chat mx-auto text-center px-4 lg:px-0">
                <div className="inline-flex items-center rounded-full border border-accent-500/30 bg-accent-500/10 px-3 py-1 text-xs uppercase tracking-[0.18em] text-accent-400">
                  Publisher Mode
                </div>
                <h1 className="mt-4 text-3xl lg:text-5xl font-bold text-bolt-elements-textPrimary">
                  Bootstrap the site before the first prompt
                </h1>
                <p className="text-md lg:text-lg mt-4 text-bolt-elements-textSecondary">
                  Configure site settings, scan documents or an HTML source, and let Bolt work from reviewed contracts
                  instead of raw page markup.
                </p>
              </div>
            )}
            <StickToBottom
              className={classNames('pt-6 px-2 sm:px-6 relative', {
                'h-full flex flex-col modern-scrollbar': chatStarted || publisherWorkspaceReady,
              })}
              resize="smooth"
              initial="smooth"
            >
              <StickToBottom.Content className="flex flex-col gap-4">
                <ClientOnly>
                  {() => {
                    return chatStarted ? (
                      <Messages
                        className="flex flex-col w-full flex-1 max-w-chat pb-6 mx-auto z-1"
                        messages={messages}
                        isStreaming={isStreaming}
                      />
                    ) : null;
                  }}
                </ClientOnly>
              </StickToBottom.Content>
              <div
                className={classNames('my-auto flex flex-col gap-2 w-full max-w-chat mx-auto z-prompt mb-6', {
                  'sticky bottom-2': chatStarted,
                })}
              >
                <div className="flex flex-col gap-2">
                  {deployAlert && (
                    <DeployChatAlert
                      alert={deployAlert}
                      clearAlert={() => clearDeployAlert?.()}
                      postMessage={(message: string | undefined) => {
                        sendMessage?.({} as any, message);
                        clearSupabaseAlert?.();
                      }}
                    />
                  )}
                  {supabaseAlert && (
                    <SupabaseChatAlert
                      alert={supabaseAlert}
                      clearAlert={() => clearSupabaseAlert?.()}
                      postMessage={(message) => {
                        sendMessage?.({} as any, message);
                        clearSupabaseAlert?.();
                      }}
                    />
                  )}
                  {actionAlert && (
                    <ChatAlert
                      alert={actionAlert}
                      clearAlert={() => clearAlert?.()}
                      postMessage={(message) => {
                        sendMessage?.({} as any, message);
                        clearAlert?.();
                      }}
                    />
                  )}
                </div>
                <ScrollToBottom />
                {progressAnnotations && <ProgressCompilation data={progressAnnotations} />}
                <div
                  className={classNames(
                    'relative bg-bolt-elements-background-depth-2 p-3 rounded-lg border border-bolt-elements-borderColor relative w-full max-w-chat mx-auto z-prompt',

                    /*
                     * {
                     *   'sticky bottom-2': chatStarted,
                     * },
                     */
                  )}
                >
                  <svg className={classNames(styles.PromptEffectContainer)}>
                    <defs>
                      <linearGradient
                        id="line-gradient"
                        x1="20%"
                        y1="0%"
                        x2="-14%"
                        y2="10%"
                        gradientUnits="userSpaceOnUse"
                        gradientTransform="rotate(-45)"
                      >
                        <stop offset="0%" stopColor="#b44aff" stopOpacity="0%"></stop>
                        <stop offset="40%" stopColor="#b44aff" stopOpacity="80%"></stop>
                        <stop offset="50%" stopColor="#b44aff" stopOpacity="80%"></stop>
                        <stop offset="100%" stopColor="#b44aff" stopOpacity="0%"></stop>
                      </linearGradient>
                      <linearGradient id="shine-gradient">
                        <stop offset="0%" stopColor="white" stopOpacity="0%"></stop>
                        <stop offset="40%" stopColor="#ffffff" stopOpacity="80%"></stop>
                        <stop offset="50%" stopColor="#ffffff" stopOpacity="80%"></stop>
                        <stop offset="100%" stopColor="white" stopOpacity="0%"></stop>
                      </linearGradient>
                    </defs>
                    <rect className={classNames(styles.PromptEffectLine)} pathLength="100" strokeLinecap="round"></rect>
                    <rect className={classNames(styles.PromptShine)} x="48" y="24" width="70" height="1"></rect>
                  </svg>
                  <div>
                    <ClientOnly>
                      {() => (
                        <div>
                          <ModelSelector
                            key={provider?.name + ':' + modelList.length}
                            model={model}
                            setModel={setModel}
                            modelList={modelList}
                            provider={provider}
                            setProvider={setProvider}
                            providerList={providerList || (PROVIDER_LIST as ProviderInfo[])}
                            modelLoading={isModelLoading}
                            runtimeState={runtimeState}
                            settingsTrigger={
                              provider && shouldShowSettingsPopover ? (
                                <Popover
                                  side="bottom"
                                  align="end"
                                  sideOffset={6}
                                  alignOffset={0}
                                  collisionPadding={12}
                                  contentClassName="p-0"
                                  trigger={
                                    <button
                                      type="button"
                                      className="flex h-[52px] w-[52px] items-center justify-center rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-prompt-background text-bolt-elements-textSecondary transition-colors hover:text-bolt-elements-textPrimary"
                                      title="Model settings"
                                      aria-label="Open model settings"
                                    >
                                      <div className="i-ph:sliders-horizontal h-4 w-4" />
                                    </button>
                                  }
                                >
                                  <ProviderSettingsPopover
                                    provider={provider}
                                    apiKey={apiKeys[provider.name] || ''}
                                    authMode={currentProviderAuthMode}
                                    runtimeState={runtimeState}
                                    accountAuthAvailable={providerAccountBridgeAvailable}
                                    selectedModel={selectedProviderModel}
                                    reasoningEffort={currentProviderReasoningEffort}
                                    customModelId={currentProviderCustomModelId}
                                    onApiKeyChange={(key) => {
                                      void onApiKeysChange(provider.name, key);
                                    }}
                                    onAuthModeChange={async (authMode) => {
                                      const nextProviderSettings = { ...currentProviderSettings, authMode };
                                      updateProviderSettings(provider.name, nextProviderSettings);

                                      if (provider.name === 'OpenAI' && authMode === 'account') {
                                        await refreshOpenAIAccountAuth();
                                      }

                                      if (provider.name === 'Anthropic' && authMode === 'account') {
                                        await refreshAnthropicAccountAuth();
                                      }

                                      await refreshProviderModels(provider.name, nextProviderSettings);
                                    }}
                                    onAccountLogin={async () => {
                                      if (provider.name === 'OpenAI') {
                                        await handleOpenAIAccountLogin();
                                        return;
                                      }

                                      if (provider.name === 'Anthropic') {
                                        await handleAnthropicAccountLogin();
                                      }
                                    }}
                                    onRefreshStatus={async () => {
                                      await refreshProviderEnvKeyStatus(provider.name);

                                      if (provider.name === 'OpenAI') {
                                        await refreshOpenAIAccountAuth();
                                      }

                                      if (provider.name === 'Anthropic') {
                                        await refreshAnthropicAccountAuth();
                                      }

                                      await refreshProviderModels(provider.name, currentProviderSettings);
                                    }}
                                    onProviderAuthChange={async () => {
                                      await refreshProviderEnvKeyStatus(provider.name);
                                      await refreshProviderModels(provider.name, currentProviderSettings);
                                    }}
                                    onReasoningEffortChange={(reasoningEffort) => {
                                      updateProviderSettings(provider.name, {
                                        ...currentProviderSettings,
                                        reasoningEffort,
                                      });
                                    }}
                                    onCustomModelIdSave={async (customModelId) => {
                                      const nextProviderSettings = {
                                        ...currentProviderSettings,
                                        customModelId,
                                      };
                                      updateProviderSettings(provider.name, nextProviderSettings);
                                      await refreshProviderModels(provider.name, nextProviderSettings);
                                    }}
                                  />
                                </Popover>
                              ) : undefined
                            }
                          />
                        </div>
                      )}
                    </ClientOnly>
                  </div>
                  <FilePreview
                    files={uploadedFiles}
                    imageDataList={imageDataList}
                    onRemove={(index) => {
                      setUploadedFiles?.(uploadedFiles.filter((_, i) => i !== index));
                      setImageDataList?.(imageDataList.filter((_, i) => i !== index));
                    }}
                  />
                  <ClientOnly>
                    {() => (
                      <ScreenshotStateManager
                        setUploadedFiles={setUploadedFiles}
                        setImageDataList={setImageDataList}
                        uploadedFiles={uploadedFiles}
                        imageDataList={imageDataList}
                      />
                    )}
                  </ClientOnly>
                  <div
                    className={classNames(
                      'relative shadow-xs border border-bolt-elements-borderColor backdrop-blur rounded-lg',
                    )}
                  >
                    <textarea
                      ref={textareaRef}
                      className={classNames(
                        'w-full pl-4 pt-4 pr-16 outline-none resize-none text-bolt-elements-textPrimary placeholder-bolt-elements-textTertiary bg-transparent text-sm',
                        'transition-all duration-200',
                        'hover:border-bolt-elements-focus',
                      )}
                      onDragEnter={(e) => {
                        e.preventDefault();
                        e.currentTarget.style.border = '2px solid #1488fc';
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.currentTarget.style.border = '2px solid #1488fc';
                      }}
                      onDragLeave={(e) => {
                        e.preventDefault();
                        e.currentTarget.style.border = '1px solid var(--bolt-elements-borderColor)';
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.currentTarget.style.border = '1px solid var(--bolt-elements-borderColor)';

                        const files = Array.from(e.dataTransfer.files);
                        files.forEach((file) => {
                          if (file.type.startsWith('image/')) {
                            const reader = new FileReader();

                            reader.onload = (e) => {
                              const base64Image = e.target?.result as string;
                              setUploadedFiles?.([...uploadedFiles, file]);
                              setImageDataList?.([...imageDataList, base64Image]);
                            };
                            reader.readAsDataURL(file);
                          }
                        });
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          if (event.shiftKey) {
                            return;
                          }

                          event.preventDefault();

                          if (isStreaming) {
                            handleStop?.();
                            return;
                          }

                          // ignore if using input method engine
                          if (event.nativeEvent.isComposing) {
                            return;
                          }

                          handleSendMessage?.(event);
                        }
                      }}
                      value={input}
                      onChange={(event) => {
                        handleInputChange?.(event);
                      }}
                      onPaste={handlePaste}
                      style={{
                        minHeight: TEXTAREA_MIN_HEIGHT,
                        maxHeight: TEXTAREA_MAX_HEIGHT,
                      }}
                      placeholder={
                        workspaceMode === 'publisher'
                          ? 'Describe the next publisher change or ask for a zone/block update…'
                          : 'How can Bolt help you today?'
                      }
                      translate="no"
                    />
                    <ClientOnly>
                      {() => (
                        <SendButton
                          show={input.length > 0 || isStreaming || uploadedFiles.length > 0}
                          isStreaming={isStreaming}
                          disabled={!providerList || providerList.length === 0}
                          onClick={(event) => {
                            if (isStreaming) {
                              handleStop?.();
                              return;
                            }

                            if (input.length > 0 || uploadedFiles.length > 0) {
                              handleSendMessage?.(event);
                            }
                          }}
                        />
                      )}
                    </ClientOnly>
                    <div className="flex justify-between items-center text-sm p-4 pt-2">
                      <div className="flex gap-1 items-center">
                        <IconButton title="Upload file" className="transition-all" onClick={() => handleFileUpload()}>
                          <div className="i-ph:paperclip text-xl"></div>
                        </IconButton>
                        <IconButton
                          title="Enhance prompt"
                          disabled={input.length === 0 || enhancingPrompt}
                          className={classNames('transition-all', enhancingPrompt ? 'opacity-100' : '')}
                          onClick={() => {
                            enhancePrompt?.();
                            toast.success('Prompt enhanced!');
                          }}
                        >
                          {enhancingPrompt ? (
                            <div className="i-svg-spinners:90-ring-with-bg text-bolt-elements-loader-progress text-xl animate-spin"></div>
                          ) : (
                            <div className="i-bolt:stars text-xl"></div>
                          )}
                        </IconButton>

                        <SpeechRecognitionButton
                          isListening={isListening}
                          onStart={startListening}
                          onStop={stopListening}
                          disabled={isStreaming}
                        />
                        {(chatStarted || publisherWorkspaceReady) && (
                          <ClientOnly>{() => <ExportChatButton exportChat={exportChat} />}</ClientOnly>
                        )}
                      </div>
                      {input.length > 3 ? (
                        <div className="text-xs text-bolt-elements-textTertiary">
                          Use <kbd className="kdb px-1.5 py-0.5 rounded bg-bolt-elements-background-depth-2">Shift</kbd>{' '}
                          + <kbd className="kdb px-1.5 py-0.5 rounded bg-bolt-elements-background-depth-2">Return</kbd>{' '}
                          a new line
                        </div>
                      ) : null}
                      <SupabaseConnection />
                      <ExpoQrModal open={qrModalOpen} onClose={() => setQrModalOpen(false)} />
                    </div>
                  </div>
                </div>
              </div>
            </StickToBottom>
            <div className="flex flex-col justify-center">
              {!chatStarted && (
                <div className="flex flex-col gap-4 max-w-chat mx-auto w-full px-4">
                  <div className="flex justify-center">
                    <div className="inline-flex items-center gap-1 rounded-full border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-1">
                      {(['default', 'publisher'] as WorkspaceMode[]).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => onWorkspaceModeChange?.(mode)}
                          className={classNames(
                            'rounded-full px-3 py-1.5 text-sm transition-colors',
                            workspaceMode === mode
                              ? 'bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent'
                              : 'text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary',
                          )}
                        >
                          {mode === 'default' ? 'Default Bolt' : 'Publisher'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {workspaceMode === 'default' ? (
                    <div className="flex justify-center gap-2">
                      {ImportButtons(importChat)}
                      <GitCloneButton importChat={importChat} />
                    </div>
                  ) : null}

                  {workspaceMode === 'publisher' && !publisherWorkspaceReady ? (
                    <PublisherIntakeOnboarding
                      busy={publisherOnboardingBusy}
                      onSubmit={(payload) => onPublisherOnboardingSubmit?.(payload)}
                    />
                  ) : null}
                </div>
              )}
              <div className="flex flex-col gap-5">
                {!chatStarted &&
                  workspaceMode === 'default' &&
                  ExamplePrompts((event, messageInput) => {
                    if (isStreaming) {
                      handleStop?.();
                      return;
                    }

                    handleSendMessage?.(event, messageInput);
                  })}
                {!chatStarted && workspaceMode === 'default' && <StarterTemplates />}
                {!chatStarted && workspaceMode === 'publisher' && publisherWorkspaceReady ? (
                  <div className="max-w-chat mx-auto w-full rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4 text-sm text-bolt-elements-textSecondary">
                    Publisher workspace is ready. Open the Structure view, inspect generated contracts, or send a prompt
                    to regenerate zones and slots.
                  </div>
                ) : null}
              </div>
            </div>
          </div>
          <ClientOnly>
            {() => (
              <Workbench
                actionRunner={actionRunner ?? ({} as ActionRunner)}
                chatStarted={chatStarted || publisherWorkspaceReady}
                isStreaming={isStreaming}
              />
            )}
          </ClientOnly>
        </div>
      </div>
    );

    return <Tooltip.Provider delayDuration={200}>{baseChat}</Tooltip.Provider>;
  },
);

function ScrollToBottom() {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();

  return (
    !isAtBottom && (
      <button
        className="absolute z-50 top-[0%] translate-y-[-100%] text-4xl rounded-lg left-[50%] translate-x-[-50%] px-1.5 py-0.5 flex items-center gap-2 bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor text-bolt-elements-textPrimary text-sm"
        onClick={() => scrollToBottom()}
      >
        Go to last message
        <span className="i-ph:arrow-down animate-bounce" />
      </button>
    )
  );
}
