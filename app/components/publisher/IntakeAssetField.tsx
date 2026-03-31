import { useEffect, useMemo, useState } from 'react';
import type { AssetRef, IntakeAssetDraft } from '~/types/publisher';
import { ImageAssetInput } from '~/components/ui/ImageAssetInput';

export interface IntakeAssetFieldProps {
  id?: string;
  label: string;
  shape?: 'square' | 'landscape';
  helperText?: string;
  error?: string;
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

export function IntakeAssetField({
  id,
  label,
  shape = 'square',
  helperText,
  error,
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
    <div>
      <ImageAssetInput
        id={id}
        label={label}
        accept={accept}
        shape={shape}
        previewUrl={resolvedPreviewUrl}
        fallbackText={previewFallback}
        valueLabel={
          selectedFile?.name ??
          ('storedPath' in (currentAsset ?? {}) ? currentAsset?.storedPath : undefined) ??
          currentAsset?.path ??
          'Not set yet'
        }
        onChange={onFileChange}
        onClear={onClear}
        hint={helperText}
        error={error}
      />

      {canEditLabel && onLabelChange ? (
        <label className="mt-2 block text-xs">
          <span className="text-bolt-elements-textSecondary">Display name</span>
          <input
            value={displayLabel}
            onChange={(event) => onLabelChange(event.target.value)}
            className="mt-1 w-full rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm"
            placeholder={label}
          />
        </label>
      ) : null}
    </div>
  );
}
