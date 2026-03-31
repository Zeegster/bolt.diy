function hasClass(classValue: string, className: string) {
  return classValue
    .split(/\s+/)
    .map((value) => value.trim())
    .filter(Boolean)
    .includes(className);
}

function ensureClass(attributes: string, className: string) {
  const classMatch = /\bclass\s*=\s*("([^"]*)"|'([^']*)')/i.exec(attributes);

  if (!classMatch) {
    return `${attributes} class="${className}"`;
  }

  const fullMatch = classMatch[0];
  const classValue = classMatch[2] ?? classMatch[3] ?? '';

  if (hasClass(classValue, className)) {
    return attributes;
  }

  const nextClassValue = `${classValue} ${className}`.trim();

  return attributes.replace(fullMatch, `class="${nextClassValue}"`);
}

function ensureAttribute(attributes: string, name: string, value: string) {
  const attributePattern = new RegExp(`\\b${name}\\s*=\\s*(".*?"|'.*?'|[^\\s"'>]+)`, 'i');

  if (attributePattern.test(attributes)) {
    return attributes;
  }

  return `${attributes} ${name}="${value}"`;
}

function normalizeTagAttributes(attributes: string) {
  const trimmed = attributes.trim();
  return trimmed.length > 0 ? ` ${trimmed}` : '';
}

function wrapRawTables(html: string) {
  return html.replace(/<table\b([^>]*)>([\s\S]*?)<\/table>/gi, (_match, rawAttributes: string, inner: string) => {
    const attributes = ensureClass(rawAttributes ?? '', 'publisher-table');
    return `<div class="publisher-table-scroll" data-contract="table-scroll"><table${normalizeTagAttributes(attributes)}>${inner}</table></div>`;
  });
}

function normalizeImages(html: string) {
  return html.replace(/<img\b([^>]*?)(\/?)>/gi, (_match, rawAttributes: string, closingSlash: string) => {
    let attributes = rawAttributes ?? '';
    attributes = ensureClass(attributes, 'publisher-rich-media');
    attributes = ensureAttribute(attributes, 'loading', 'lazy');
    attributes = ensureAttribute(attributes, 'decoding', 'async');

    const selfClosing = closingSlash?.trim() === '/' ? ' /' : '';

    return `<img${normalizeTagAttributes(attributes)}${selfClosing}>`;
  });
}

export function normalizeRichContentHtml(html: string): string {
  if (!html || !html.trim()) {
    return html;
  }

  const existingWrappers: string[] = [];
  const protectedHtml = html.replace(
    /<div\b[^>]*class\s*=\s*("([^"]*\bpublisher-table-scroll\b[^"]*)"|'([^']*\bpublisher-table-scroll\b[^']*)')[^>]*>[\s\S]*?<\/div>/gi,
    (match) => {
      existingWrappers.push(match);
      return `__PUBLISHER_TABLE_WRAPPER_${existingWrappers.length - 1}__`;
    },
  );

  const normalizedTables = wrapRawTables(protectedHtml);
  const restoredTables = normalizedTables.replace(/__PUBLISHER_TABLE_WRAPPER_(\d+)__/g, (_match, index) => {
    const wrapper = existingWrappers[Number(index)] ?? '';
    return wrapper.replace(/<table\b([^>]*)>/gi, (_tableMatch, rawAttributes: string) => {
      const attributes = ensureClass(rawAttributes ?? '', 'publisher-table');
      return `<table${normalizeTagAttributes(attributes)}>`;
    });
  });

  return normalizeImages(restoredTables);
}
