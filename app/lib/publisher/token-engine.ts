import type { DesignTokenSet, ThemeContract } from '~/types/publisher';

const defaultTokens: DesignTokenSet = {
  'color.background': '#f5f1e8',
  'color.surface': '#fffaf2',
  'color.surfaceMuted': '#efe7db',
  'color.text': '#1f2937',
  'color.textMuted': '#6b7280',
  'color.primary': '#0f766e',
  'color.primaryText': '#f8fffe',
  'color.accent': '#d97706',
  'color.accentText': '#fff7ed',
  'color.border': '#d6c7b2',
};

export function normalizeTokens(theme?: ThemeContract): DesignTokenSet {
  return {
    ...defaultTokens,
    ...(theme?.tokens ?? {}),
  };
}

export function tokenKeyToCssVariable(tokenKey: string) {
  return `--${tokenKey.replaceAll('.', '-')}`;
}

export function getTokenValue(tokenKey: string, tokens: DesignTokenSet) {
  return tokens[tokenKey] ?? defaultTokens[tokenKey] ?? '';
}

export function tokensToCssVariables(tokens: DesignTokenSet) {
  const lines = Object.entries(tokens).map(
    ([tokenKey, tokenValue]) => `  ${tokenKeyToCssVariable(tokenKey)}: ${tokenValue};`,
  );
  return `:root {\n${lines.join('\n')}\n}`;
}

export function getDefaultTokens() {
  return { ...defaultTokens };
}
