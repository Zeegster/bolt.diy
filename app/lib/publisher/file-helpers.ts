import type { AssetRef } from '~/types/publisher';
import { PUBLISHER_ASSETS_DIR, PUBLISHER_GENERATED_SITE_ASSETS_DIR, PUBLISHER_INTAKE_DIR } from './constants';

function sanitizeFileName(fileName: string) {
  return fileName
    .trim()
    .toLowerCase()
    .replaceAll(' ', '-')
    .replace(/[^a-z0-9._-]/g, '');
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

export function createPublisherAssetRef(
  kind: 'favicon' | 'metaImage' | 'logo',
  fileName: string,
  mimeType?: string,
): AssetRef {
  const safeName = sanitizeFileName(fileName) || `${kind}.bin`;
  return {
    path: `${PUBLISHER_ASSETS_DIR}/${kind}-${safeName}`,
    publicPath: `/assets/site/${kind}-${safeName}`,
    mimeType,
    label: fileName,
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
