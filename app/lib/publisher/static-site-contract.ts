import {
  PUBLISHER_GENERATED_CSS_FILE,
  PUBLISHER_GENERATED_JS_FILE,
  PUBLISHER_MANIFEST_FILE,
  PUBLISHER_ROBOTS_FILE,
  PUBLISHER_SITEMAP_FILE,
} from './constants';

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
