import { useEffect, useMemo, useState } from 'react';
import type { AssetRef, IntakeAssetDraft } from '~/types/publisher';

export interface IntakeAssetFieldProps {
  label: string;
  shape?: 'square' | 'landscape';
  helperText?: string;
  accept: string;
  currentAsset?: AssetRef | IntakeAssetDraft;
  selectedFile?: File;
  previewUrl?: string;
  labelValue?: string;
  editableLabel?: boolean;
  onLabelChange?: (nextValue: string) => void;
  onFileChange: (file?: File) => void;
  onClear?: () => void;
}

function getShapeClasses(shape: IntakeAssetFieldProps['shape']) {
  return shape === 'landscape' ? 'aspect-[16/9]' : 'aspect-square';
}

export function IntakeAssetField({
  label,
  shape = 'square',
  helperText,
  accept,
  currentAsset,
  selectedFile,
  previewUrl,
  labelValue,
  onLabelChange,
  onFileChange,
  onClear,
}: IntakeAssetFieldProps) {
  const [objectUrl, setObjectUrl] = useState<string>();
  const canEditLabel = Boolean(onLabelChange);

  useEffect(() => {
    if (!selectedFile) {
      setObjectUrl(undefined);
      return undefined;
    }

    const nextUrl = URL.createObjectURL(selectedFile);
    setObjectUrl(nextUrl);

    return () => URL.revokeObjectURL(nextUrl);
  }, [selectedFile]);

  const displayLabel = labelValue ?? currentAsset?.label ?? '';
  const resolvedPreviewUrl =
    objectUrl ??
    previewUrl ??
    ('previewPath' in (currentAsset ?? {}) ? currentAsset?.previewPath : undefined) ??
    ('publicPath' in (currentAsset ?? {}) ? currentAsset?.publicPath : undefined);
  const previewFallback = useMemo(() => {
    return (
      ('storedPath' in (currentAsset ?? {}) ? currentAsset?.storedPath : undefined) ??
      currentAsset?.path ??
      selectedFile?.name ??
      'No asset selected'
    );
  }, [currentAsset, selectedFile?.name]);

  return (
    <div className="rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-bolt-elements-textPrimary">{label}</div>
          {helperText ? <p className="mt-1 text-xs text-bolt-elements-textSecondary">{helperText}</p> : null}
        </div>
        {onClear ? (
          <button
            type="button"
            className="rounded-md border border-bolt-elements-borderColor px-2 py-1 text-xs text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary"
            onClick={onClear}
          >
            Clear
          </button>
        ) : null}
      </div>

      <div
        className={`mt-3 overflow-hidden rounded-lg border border-bolt-elements-borderColor bg-black/20 ${getShapeClasses(shape)}`}
      >
        {resolvedPreviewUrl ? (
          <img src={resolvedPreviewUrl} alt={displayLabel || label} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center px-3 text-center text-xs text-bolt-elements-textSecondary">
            {previewFallback}
          </div>
        )}
      </div>

      {canEditLabel && onLabelChange ? (
        <label className="mt-3 block text-xs">
          <span className="text-bolt-elements-textSecondary">Display name</span>
          <input
            value={displayLabel}
            onChange={(event) => onLabelChange(event.target.value)}
            className="mt-1 w-full rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm"
            placeholder={label}
          />
        </label>
      ) : displayLabel ? (
        <div className="mt-3 text-xs text-bolt-elements-textSecondary">
          <span className="text-bolt-elements-textSecondary">Label:</span>{' '}
          <span className="text-bolt-elements-textPrimary">{displayLabel}</span>
        </div>
      ) : null}

      <label className="mt-3 block text-xs">
        <span className="text-bolt-elements-textSecondary">File</span>
        <input
          type="file"
          accept={accept}
          className="mt-1 block w-full rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm"
          onChange={(event) => onFileChange(event.target.files?.[0])}
        />
      </label>

      <div className="mt-2 flex items-center justify-between gap-2 text-xs text-bolt-elements-textSecondary">
        <span className="truncate">
          {selectedFile?.name ??
            ('storedPath' in (currentAsset ?? {}) ? currentAsset?.storedPath : undefined) ??
            currentAsset?.path ??
            'Not set yet'}
        </span>
        <span>{currentAsset?.mimeType ?? selectedFile?.type ?? ''}</span>
      </div>
    </div>
  );
}
