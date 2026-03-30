import { useMemo, useRef, useState } from 'react';
import type { PublisherSiteSettings } from '~/types/publisher';
import { IntakeAssetField } from './IntakeAssetField';

interface AssetDraftState {
  currentLabel?: string;
  nextFile?: File;
}

export interface PublisherIntakeOnboardingSubmitPayload {
  settings: PublisherSiteSettings;
  assets: {
    favicon?: File;
    metaImage?: File;
    logo?: File;
  };
  importKind: 'document' | 'html';
  sourceFiles: File[];
  sourceLabel: string;
}

interface PublisherIntakeOnboardingProps {
  busy?: boolean;
  onSubmit: (payload: PublisherIntakeOnboardingSubmitPayload) => Promise<void> | void;
}

function normalizeLanguageEntries(defaultLanguage: string, multilingual: boolean, languagesInput: string) {
  const normalizedDefault = defaultLanguage.trim().toLowerCase();
  const entries = languagesInput
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  const set = new Set(entries);

  if (normalizedDefault) {
    set.add(normalizedDefault);
  }

  return multilingual ? [...set] : [normalizedDefault];
}

function inferSourceLabel(files: File[]) {
  const first = files[0];

  if (!first) {
    return 'intake-source';
  }

  const relativePath = first.webkitRelativePath || first.name;

  return relativePath.split('/').filter(Boolean)[0] || 'intake-source';
}

export function PublisherIntakeOnboarding({ busy = false, onSubmit }: PublisherIntakeOnboardingProps) {
  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');
  const [defaultLanguage, setDefaultLanguage] = useState('en');
  const [multilingual, setMultilingual] = useState(false);
  const [languagesInput, setLanguagesInput] = useState('en');
  const [importKind, setImportKind] = useState<'document' | 'html'>('document');
  const [sourceFiles, setSourceFiles] = useState<File[]>([]);
  const [favicon, setFavicon] = useState<AssetDraftState>({});
  const [metaImage, setMetaImage] = useState<AssetDraftState>({});
  const [logo, setLogo] = useState<AssetDraftState>({});
  const [error, setError] = useState<string>();
  const folderInputRef = useRef<HTMLInputElement>(null);
  const filesInputRef = useRef<HTMLInputElement>(null);

  const normalizedLanguages = useMemo(
    () => normalizeLanguageEntries(defaultLanguage, multilingual, languagesInput),
    [defaultLanguage, multilingual, languagesInput],
  );

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(undefined);

    if (!name.trim()) {
      setError('Site name is required.');
      return;
    }

    if (!defaultLanguage.trim()) {
      setError('Default language is required.');
      return;
    }

    if (multilingual && normalizedLanguages.length < 2) {
      setError('Multilingual mode requires at least two language codes.');
      return;
    }

    if (sourceFiles.length === 0) {
      setError(importKind === 'html' ? 'Select the source site folder.' : 'Select at least one document to import.');
      return;
    }

    await onSubmit({
      settings: {
        name: name.trim(),
        domain: domain.trim() || undefined,
        defaultLanguage: defaultLanguage.trim().toLowerCase(),
        multilingual,
        languages: normalizedLanguages,
      },
      assets: {
        favicon: favicon.nextFile,
        metaImage: metaImage.nextFile,
        logo: logo.nextFile,
      },
      importKind,
      sourceFiles,
      sourceLabel: inferSourceLabel(sourceFiles),
    });
  };

  return (
    <form
      className="rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4"
      onSubmit={handleSubmit}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold">Site onboarding</h3>
          <p className="mt-1 text-xs text-bolt-elements-textSecondary">
            Define project metadata, choose an intake path, scan the source, and review the extracted pages before
            contracts are applied.
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <label className="flex flex-col gap-2 text-sm">
          <span className="text-bolt-elements-textPrimary">Site name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2"
            placeholder="Spinaura Casino"
          />
        </label>

        <label className="flex flex-col gap-2 text-sm">
          <span className="text-bolt-elements-textPrimary">Domain</span>
          <input
            value={domain}
            onChange={(event) => setDomain(event.target.value)}
            className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2"
            placeholder="example.com"
          />
        </label>

        <label className="flex flex-col gap-2 text-sm">
          <span className="text-bolt-elements-textPrimary">Default language</span>
          <input
            value={defaultLanguage}
            onChange={(event) => setDefaultLanguage(event.target.value)}
            className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2"
            placeholder="en"
          />
        </label>

        <label className="flex items-center gap-3 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2 text-sm">
          <input type="checkbox" checked={multilingual} onChange={(event) => setMultilingual(event.target.checked)} />
          <span>Enable multilingual mode</span>
        </label>

        <label className="flex flex-col gap-2 text-sm xl:col-span-2">
          <span className="text-bolt-elements-textPrimary">Languages list</span>
          <input
            value={languagesInput}
            onChange={(event) => setLanguagesInput(event.target.value)}
            className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2"
            placeholder="en, fr"
          />
          <span className="text-xs text-bolt-elements-textSecondary">
            Comma-separated language codes. Default language is always included.
          </span>
        </label>

        <div className="xl:col-span-2 rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3">
          <div className="text-sm font-medium text-bolt-elements-textPrimary">Import path</div>
          <p className="mt-1 text-xs text-bolt-elements-textSecondary">
            Choose one active source family for v1. If the folder is hybrid, the scanner will keep the second family as
            reference.
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            {(
              [
                ['document', 'Documents'],
                ['html', 'HTML site'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`rounded-full border px-3 py-1.5 text-xs uppercase tracking-[0.16em] ${
                  importKind === value
                    ? 'border-accent-500/40 bg-accent-500/15 text-accent-300'
                    : 'border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 text-bolt-elements-textSecondary'
                }`}
                onClick={() => {
                  setImportKind(value);
                  setSourceFiles([]);
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm hover:bg-bolt-elements-background-depth-3"
              onClick={() => {
                if (importKind === 'html') {
                  folderInputRef.current?.click();
                } else {
                  filesInputRef.current?.click();
                }
              }}
            >
              {importKind === 'html' ? 'Select site folder' : 'Select documents'}
            </button>
            <span className="text-xs text-bolt-elements-textSecondary">
              {sourceFiles.length > 0
                ? `${sourceFiles.length} file${sourceFiles.length > 1 ? 's' : ''} selected from ${inferSourceLabel(sourceFiles)}`
                : importKind === 'html'
                  ? 'Choose a source root containing index.html, pages, and assets.'
                  : 'Choose markdown-like or text documents for structured extraction.'}
            </span>
          </div>

          <input
            ref={filesInputRef}
            type="file"
            multiple
            accept=".md,.markdown,.txt,text/plain,text/markdown"
            className="hidden"
            onChange={(event) => setSourceFiles(Array.from(event.target.files ?? []))}
          />
          <input
            ref={folderInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(event) => setSourceFiles(Array.from(event.target.files ?? []))}
            {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
          />
        </div>

        <IntakeAssetField
          label="Favicon"
          accept="image/*,.ico,.png,.svg"
          shape="square"
          selectedFile={favicon.nextFile}
          onFileChange={(file) => setFavicon({ currentLabel: file?.name, nextFile: file })}
        />
        <IntakeAssetField
          label="Meta image"
          accept="image/*"
          shape="landscape"
          selectedFile={metaImage.nextFile}
          onFileChange={(file) => setMetaImage({ currentLabel: file?.name, nextFile: file })}
        />
        <IntakeAssetField
          label="Logo"
          accept="image/*,.svg"
          shape="square"
          selectedFile={logo.nextFile}
          onFileChange={(file) => setLogo({ currentLabel: file?.name, nextFile: file })}
        />
      </div>

      {error ? <div className="mt-4 text-sm text-red-400">{error}</div> : null}

      <div className="mt-4 flex justify-end">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-accent-500 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? 'Scanning source…' : 'Scan source'}
        </button>
      </div>
    </form>
  );
}
