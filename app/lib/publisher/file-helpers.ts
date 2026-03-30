import type { AssetRef } from '~/types/publisher';
import { PUBLISHER_ASSETS_DIR, PUBLISHER_GENERATED_SITE_ASSETS_DIR, PUBLISHER_INTAKE_DIR } from './constants';

function sanitizeFileName(fileName: string) {
  return fileName
    .trim()
    .toLowerCase()
    .replaceAll(' ', '-')
    .replace(/[^a-z0-9._-]/g, '');
}

function splitFileName(fileName: string) {
  const sanitized = sanitizeFileName(fileName);
  const lastDot = sanitized.lastIndexOf('.');

  if (lastDot <= 0) {
    return {
      stem: sanitized || 'asset',
      extension: '',
    };
  }

  return {
    stem: sanitized.slice(0, lastDot) || 'asset',
    extension: sanitized.slice(lastDot),
  };
}

export function fingerprintBytes(bytes: Uint8Array) {
  let hash = 5381;

  for (const value of bytes) {
    hash = (hash * 33) ^ value;
  }

  return `a${(hash >>> 0).toString(16)}`;
}

export async function fileToUint8Array(file: File) {
  const buffer = await file.arrayBuffer();
  return new Uint8Array(buffer);
}

export async function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file as data URL'));
    reader.readAsDataURL(file);
  });
}

export async function readImageDimensions(file: File) {
  if (!file.type.startsWith('image/')) {
    return undefined;
  }

  return new Promise<{ width: number; height: number } | undefined>((resolve) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      resolve({
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
      URL.revokeObjectURL(objectUrl);
    };

    image.onerror = () => {
      resolve(undefined);
      URL.revokeObjectURL(objectUrl);
    };

    image.src = objectUrl;
  });
}

export function createPublisherAssetRef(
  kind: 'favicon' | 'metaImage' | 'logo',
  fileName: string,
  mimeType?: string,
  options?: {
    bytes?: Uint8Array;
    width?: number;
    height?: number;
  },
): AssetRef {
  const { stem, extension } = splitFileName(fileName);
  const contentHash = options?.bytes ? fingerprintBytes(options.bytes) : undefined;
  const deterministicName = contentHash ? `${kind}-${stem}-${contentHash}${extension}` : `${kind}-${stem}${extension}`;

  return {
    path: `${PUBLISHER_ASSETS_DIR}/${deterministicName}`,
    publicPath: `/assets/site/${deterministicName}`,
    mimeType,
    label: fileName,
    contentHash,
    width: options?.width,
    height: options?.height,
  };
}

export function getGeneratedAssetPath(asset: AssetRef) {
  const fileName = asset.publicPath?.split('/').filter(Boolean).pop();
  return fileName ? `${PUBLISHER_GENERATED_SITE_ASSETS_DIR}/${fileName}` : undefined;
}

export function createPublisherMarkdownPath(fileName: string) {
  const safeName = sanitizeFileName(fileName) || `source-${Date.now().toString(36)}.md`;
  return `${PUBLISHER_INTAKE_DIR}/${safeName}`;
}
