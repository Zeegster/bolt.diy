import { useId, useMemo, useState } from 'react';
import { classNames } from '~/utils/classNames';

interface TagInputProps {
  id?: string;
  label?: string;
  placeholder?: string;
  options: string[];
  mode: 'single' | 'multiple';
  value: string | string[];
  onChange: (next: string | string[]) => void;
  disabled?: boolean;
  required?: boolean;
  hint?: string;
  error?: string;
  ariaDescribedBy?: string;
}

function normalizeToken(value: string) {
  return value.trim().toLowerCase();
}

function normalizeOptions(options: string[]) {
  return Array.from(new Set(options.map((item) => normalizeToken(item)).filter(Boolean)));
}

export function TagInput({
  id,
  label,
  placeholder = 'Type to search…',
  options,
  mode,
  value,
  onChange,
  disabled = false,
  required = false,
  hint,
  error,
  ariaDescribedBy,
}: TagInputProps) {
  const fallbackId = useId();
  const inputId = id ?? `tag-input-${fallbackId}`;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy = [ariaDescribedBy, hintId, errorId].filter(Boolean).join(' ') || undefined;
  const [query, setQuery] = useState('');
  const normalizedOptions = useMemo(() => normalizeOptions(options), [options]);
  const selectedValues = useMemo(() => {
    if (mode === 'single') {
      const normalized = typeof value === 'string' ? normalizeToken(value) : normalizeToken(value[0] || '');
      return normalized ? [normalized] : [];
    }

    return (Array.isArray(value) ? value : [value]).map((item) => normalizeToken(item)).filter(Boolean);
  }, [mode, value]);

  const suggestions = useMemo(() => {
    const normalizedQuery = normalizeToken(query);

    if (!normalizedQuery) {
      return normalizedOptions.filter((option) => !selectedValues.includes(option)).slice(0, 8);
    }

    return normalizedOptions
      .filter((option) => option.includes(normalizedQuery) && !selectedValues.includes(option))
      .slice(0, 8);
  }, [normalizedOptions, query, selectedValues]);

  const applySelection = (rawValue: string) => {
    const nextValue = normalizeToken(rawValue);

    if (!nextValue) {
      return;
    }

    if (mode === 'single') {
      onChange(nextValue);
      setQuery('');

      return;
    }

    if (selectedValues.includes(nextValue)) {
      return;
    }

    onChange([...selectedValues, nextValue]);

    setQuery('');
  };

  const removeSelection = (item: string) => {
    if (mode === 'single') {
      onChange('');
      return;
    }

    onChange(selectedValues.filter((entry) => entry !== item));
  };

  return (
    <div className="flex flex-col gap-2">
      {label ? (
        <label htmlFor={inputId} className="text-sm text-bolt-elements-textPrimary">
          {label}
          {required ? ' *' : ''}
        </label>
      ) : null}

      <div
        className={classNames(
          'rounded-lg border bg-bolt-elements-background-depth-2 p-2',
          error ? 'border-red-500/40' : 'border-bolt-elements-borderColor',
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          {selectedValues.map((item) => (
            <span
              key={item}
              className="inline-flex items-center gap-1 rounded-full border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-2 py-1 text-xs"
            >
              <span>{item}</span>
              <button
                type="button"
                className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary"
                onClick={() => removeSelection(item)}
                disabled={disabled}
              >
                <span className="i-ph:x text-xs" />
              </button>
            </span>
          ))}

          <input
            id={inputId}
            value={query}
            disabled={disabled}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                applySelection(query);
              }
            }}
            className="min-w-[140px] flex-1 bg-transparent px-1 py-1 text-sm outline-none"
            placeholder={placeholder}
            aria-invalid={Boolean(error)}
            aria-describedby={describedBy}
          />
        </div>

        {suggestions.length > 0 ? (
          <div className="mt-2 grid gap-1 border-t border-bolt-elements-borderColor pt-2">
            {suggestions.map((option) => (
              <button
                key={option}
                type="button"
                disabled={disabled}
                onClick={() => applySelection(option)}
                className={classNames(
                  'rounded-md px-2 py-1 text-left text-xs text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-1 hover:text-bolt-elements-textPrimary',
                  mode === 'single' && selectedValues.includes(option)
                    ? 'bg-bolt-elements-background-depth-1'
                    : undefined,
                )}
              >
                {option}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {hint ? (
        <span id={hintId} className="text-xs text-bolt-elements-textSecondary">
          {hint}
        </span>
      ) : null}
      {error ? (
        <span id={errorId} className="text-xs text-red-300">
          {error}
        </span>
      ) : null}
    </div>
  );
}
