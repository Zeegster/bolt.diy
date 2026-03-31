import { useEffect, useRef, useState } from 'react';

interface ImageAssetInputProps {
  label: string;
  accept: string;
  shape?: 'square' | 'landscape';
  previewUrl?: string;
  fallbackText?: string;
  valueLabel?: string;
  onChange: (file?: File) => void;
  onClear?: () => void;
  disabled?: boolean;
}

function getShapeClasses(shape: ImageAssetInputProps['shape']) {
  return shape === 'landscape' ? 'aspect-[16/9]' : 'aspect-square';
}

export function ImageAssetInput({
  label,
  accept,
  shape = 'square',
  previewUrl,
  fallbackText = 'No asset selected',
  valueLabel,
  onChange,
  onClear,
  disabled = false,
}: ImageAssetInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isHover, setIsHover] = useState(false);
  const [objectUrl, setObjectUrl] = useState<string>();

  useEffect(() => {
    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [objectUrl]);

  const hasPreview = Boolean(previewUrl);

  return (
    <div className="rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3">
      <div className="mb-2 text-sm font-medium text-bolt-elements-textPrimary">{label}</div>
      <div
        className={`group relative overflow-hidden rounded-lg border border-bolt-elements-borderColor bg-black/20 ${getShapeClasses(shape)}`}
        onMouseEnter={() => setIsHover(true)}
        onMouseLeave={() => setIsHover(false)}
      >
        {hasPreview ? (
          <img src={previewUrl} alt={label} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center px-3 text-center text-xs text-bolt-elements-textSecondary">
            {fallbackText}
          </div>
        )}

        <div
          className={`absolute inset-0 flex items-center justify-center gap-2 bg-black/45 transition-opacity ${
            isHover ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <button
            type="button"
            disabled={disabled}
            className="rounded-md border border-white/30 bg-white/15 px-2.5 py-1.5 text-xs text-white hover:bg-white/25 disabled:opacity-50"
            onClick={() => inputRef.current?.click()}
          >
            Upload
          </button>
          <button
            type="button"
            disabled={disabled || !hasPreview}
            className="rounded-md border border-red-300/40 bg-red-500/20 px-2.5 py-1.5 text-xs text-red-100 hover:bg-red-500/30 disabled:opacity-40"
            onClick={() => {
              onClear?.();
              onChange(undefined);

              if (inputRef.current) {
                inputRef.current.value = '';
              }
            }}
          >
            Remove
          </button>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];

          if (!file) {
            return;
          }

          if (objectUrl) {
            URL.revokeObjectURL(objectUrl);
          }

          const nextUrl = URL.createObjectURL(file);

          setObjectUrl(nextUrl);
          onChange(file);
        }}
      />

      <div className="mt-2 truncate text-xs text-bolt-elements-textSecondary">{valueLabel ?? 'Not set yet'}</div>
    </div>
  );
}
