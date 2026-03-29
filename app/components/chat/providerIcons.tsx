import type { IconType } from 'react-icons';
import { BsCloud, BsRobot } from 'react-icons/bs';
import { FaBrain, FaCloud } from 'react-icons/fa';
import { BiChip, BiCodeBlock } from 'react-icons/bi';
import { SiAmazon, SiGithub, SiGoogle, SiHuggingface, SiOpenai, SiPerplexity } from 'react-icons/si';
import { TbBrain, TbCloudComputing, TbCpu, TbPlugConnected } from 'react-icons/tb';

const FALLBACK_PROVIDER_ICON = BsRobot;

const PROVIDER_ICON_MAP: Record<string, IconType> = {
  AmazonBedrock: SiAmazon,
  Anthropic: FaBrain,
  Cohere: BiChip,
  Deepseek: BiCodeBlock,
  Github: SiGithub,
  Google: SiGoogle,
  Groq: BsCloud,
  HuggingFace: SiHuggingface,
  Hyperbolic: TbCloudComputing,
  LMStudio: TbCpu,
  Mistral: TbBrain,
  Ollama: TbCpu,
  OpenAI: SiOpenai,
  OpenAILike: TbPlugConnected,
  OpenRouter: FaCloud,
  Perplexity: SiPerplexity,
  Together: BsCloud,
  XAI: BsRobot,
};

export function getProviderIcon(providerName?: string): IconType {
  if (!providerName) {
    return FALLBACK_PROVIDER_ICON;
  }

  return PROVIDER_ICON_MAP[providerName] || FALLBACK_PROVIDER_ICON;
}

interface ProviderIconProps {
  providerName?: string;
  className?: string;
  title?: string;
}

export function ProviderIcon({ providerName, className = 'w-4 h-4', title }: ProviderIconProps) {
  const Icon = getProviderIcon(providerName);
  const defaultTitle = providerName ? `${providerName} provider` : 'Provider';

  return <Icon className={className} aria-hidden={title ? undefined : true} title={title || defaultTitle} />;
}
