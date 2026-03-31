import {
  PUBLISHER_GENERATED_CSS_FILE,
  PUBLISHER_GENERATED_JS_FILE,
  PUBLISHER_MANIFEST_FILE,
  PUBLISHER_ROBOTS_FILE,
  PUBLISHER_SITEMAP_FILE,
} from './constants';
import type { ZoneType } from '~/types/publisher';

export const REQUIRED_STATIC_OUTPUT_FILES = [
  PUBLISHER_GENERATED_CSS_FILE,
  PUBLISHER_GENERATED_JS_FILE,
  PUBLISHER_MANIFEST_FILE,
  PUBLISHER_ROBOTS_FILE,
  PUBLISHER_SITEMAP_FILE,
] as const;

export const STATIC_SHELL_LINKS = {
  manifestHref: '/site.webmanifest',
  cssHref: '/assets/css/main.css',
  jsSrc: '/assets/js/main.js',
} as const;

export interface ZoneLinkPolicy {
  allowedProtocols: readonly string[];
  forbiddenProtocols: readonly string[];
  enforceKnownInternal: boolean;
  enforceDecorativeAmbiguousHost: boolean;
}

const DEFAULT_ALLOWED_PROTOCOLS = ['https://', 'mailto:', 'tel:', '#', '/'] as const;
const DEFAULT_FORBIDDEN_PROTOCOLS = ['javascript:', 'data:text/html'] as const;

export const ZONE_LINK_POLICY: Record<ZoneType, ZoneLinkPolicy> = {
  header: {
    allowedProtocols: DEFAULT_ALLOWED_PROTOCOLS,
    forbiddenProtocols: DEFAULT_FORBIDDEN_PROTOCOLS,
    enforceKnownInternal: false,
    enforceDecorativeAmbiguousHost: true,
  },
  beforeContent: {
    allowedProtocols: DEFAULT_ALLOWED_PROTOCOLS,
    forbiddenProtocols: DEFAULT_FORBIDDEN_PROTOCOLS,
    enforceKnownInternal: false,
    enforceDecorativeAmbiguousHost: true,
  },
  sidebar: {
    allowedProtocols: DEFAULT_ALLOWED_PROTOCOLS,
    forbiddenProtocols: DEFAULT_FORBIDDEN_PROTOCOLS,
    enforceKnownInternal: false,
    enforceDecorativeAmbiguousHost: true,
  },
  afterContent: {
    allowedProtocols: DEFAULT_ALLOWED_PROTOCOLS,
    forbiddenProtocols: DEFAULT_FORBIDDEN_PROTOCOLS,
    enforceKnownInternal: false,
    enforceDecorativeAmbiguousHost: true,
  },
  footer: {
    allowedProtocols: DEFAULT_ALLOWED_PROTOCOLS,
    forbiddenProtocols: DEFAULT_FORBIDDEN_PROTOCOLS,
    enforceKnownInternal: false,
    enforceDecorativeAmbiguousHost: true,
  },
  content: {
    allowedProtocols: DEFAULT_ALLOWED_PROTOCOLS,
    forbiddenProtocols: DEFAULT_FORBIDDEN_PROTOCOLS,
    enforceKnownInternal: true,
    enforceDecorativeAmbiguousHost: false,
  },
};
