import { WORK_DIR } from '~/utils/constants';

export const PUBLISHER_ROOT = `${WORK_DIR}/.bolt/publisher`;
export const PUBLISHER_PROJECT_FILE = `${PUBLISHER_ROOT}/project.json`;
export const PUBLISHER_THEME_FILE = `${PUBLISHER_ROOT}/theme.json`;
export const PUBLISHER_CHECKS_FILE = `${PUBLISHER_ROOT}/checks.json`;
export const PUBLISHER_PAGES_DIR = `${PUBLISHER_ROOT}/pages`;
export const PUBLISHER_GENERATED_DIR = `${PUBLISHER_ROOT}/generated`;
export const PUBLISHER_GENERATED_ASSETS_DIR = `${PUBLISHER_GENERATED_DIR}/assets`;
export const PUBLISHER_GENERATED_CSS_FILE = `${PUBLISHER_GENERATED_ASSETS_DIR}/css/main.css`;
export const PUBLISHER_GENERATED_JS_FILE = `${PUBLISHER_GENERATED_ASSETS_DIR}/js/main.js`;
export const PUBLISHER_STATE_FILE = `${PUBLISHER_ROOT}/state.json`;
export const PUBLISHER_MANIFEST_FILE = `${PUBLISHER_GENERATED_DIR}/site.webmanifest`;
export const PUBLISHER_ROBOTS_FILE = `${PUBLISHER_GENERATED_DIR}/robots.txt`;
export const PUBLISHER_SITEMAP_FILE = `${PUBLISHER_GENERATED_DIR}/sitemap.xml`;

export function getPublisherPageFilePath(slug: string) {
  return `${PUBLISHER_PAGES_DIR}/${slug}.json`;
}
