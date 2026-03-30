import { useEffect, useMemo, useState } from 'react';
import type { AssetRef, PublisherMarkdownSource, PublisherSiteSettings } from '~/types/publisher';
import { IntakeAssetField } from './IntakeAssetField';

interface AssetDraftState {
  current?: AssetRef;
  nextFile?: File;
}

export interface PublisherSiteSettingsSubmitPayload {
  settings: PublisherSiteSettings;
  assets: {
    favicon?: File;
    metaImage?: File;
    logo?: File;
  };
  markdownFiles: File[];
}

interface PublisherSiteSettingsEditorProps {
  title: string;
  description: string;
  submitLabel: string;
  mode: 'onboarding' | 'settings';
  initialSettings?: Partial<PublisherSiteSettings>;
  markdownSources?: PublisherMarkdownSource[];
  busy?: boolean;
  onSubmit: (payload: PublisherSiteSettingsSubmitPayload) => Promise<void> | void;
}

function normalizeLanguageEntries(defaultLanguage: string, multilingual: boolean, languagesInput: string) {
  const parsed = languagesInput
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  const next = new Set(parsed);
  const normalizedDefault = defaultLanguage.trim().toLowerCase();

  if (normalizedDefault) {
    next.add(normalizedDefault);
  }

  return multilingual ? [...next] : [normalizedDefault];
}

export function PublisherSiteSettingsEditor({
  title,
  description,
  submitLabel,
  mode,
  initialSettings,
  markdownSources = [],
  busy = false,
  onSubmit,
}: PublisherSiteSettingsEditorProps) {
  const [name, setName] = useState(initialSettings?.name ?? '');
  const [domain, setDomain] = useState(initialSettings?.domain ?? '');
  const [defaultLanguage, setDefaultLanguage] = useState(initialSettings?.defaultLanguage ?? 'en');
  const [multilingual, setMultilingual] = useState(initialSettings?.multilingual ?? false);
  const [languagesInput, setLanguagesInput] = useState(
    (initialSettings?.languages ?? [initialSettings?.defaultLanguage ?? 'en']).join(', '),
  );
  const [favicon, setFavicon] = useState<AssetDraftState>({ current: initialSettings?.favicon });
  const [metaImage, setMetaImage] = useState<AssetDraftState>({ current: initialSettings?.metaImage });
  const [logo, setLogo] = useState<AssetDraftState>({ current: initialSettings?.logo });
  const [markdownFiles, setMarkdownFiles] = useState<File[]>([]);
  const [error, setError] = useState<string>();

  useEffect(() => {
    setName(initialSettings?.name ?? '');
    setDomain(initialSettings?.domain ?? '');
    setDefaultLanguage(initialSettings?.defaultLanguage ?? 'en');
    setMultilingual(initialSettings?.multilingual ?? false);
    setLanguagesInput((initialSettings?.languages ?? [initialSettings?.defaultLanguage ?? 'en']).join(', '));
    setFavicon({ current: initialSettings?.favicon });
    setMetaImage({ current: initialSettings?.metaImage });
    setLogo({ current: initialSettings?.logo });
  }, [
    initialSettings?.defaultLanguage,
    initialSettings?.domain,
    initialSettings?.favicon,
    initialSettings?.languages,
    initialSettings?.logo,
    initialSettings?.metaImage,
    initialSettings?.multilingual,
    initialSettings?.name,
  ]);

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

    if (mode === 'onboarding' && markdownFiles.length === 0) {
      setError('Upload at least one markdown document to bootstrap the site.');
      return;
    }

    await onSubmit({
      settings: {
        name: name.trim(),
        domain: domain.trim() || undefined,
        defaultLanguage: defaultLanguage.trim().toLowerCase(),
        multilingual,
        languages: normalizedLanguages,
        favicon: favicon.current,
        metaImage: metaImage.current,
        logo: logo.current,
      },
      assets: {
        favicon: favicon.nextFile,
        metaImage: metaImage.nextFile,
        logo: logo.nextFile,
      },
      markdownFiles,
    });
  };

  return (
    <form
      className="rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4"
      onSubmit={handleSubmit}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="mt-1 text-xs text-bolt-elements-textSecondary">{description}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <label className="flex flex-col gap-2 text-sm">
          <span className="text-bolt-elements-textPrimary">Site name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2"
            placeholder="Atlas Studio"
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
            placeholder="en, de"
          />
          <span className="text-xs text-bolt-elements-textSecondary">
            Comma-separated language codes. Default language is always included.
          </span>
        </label>

        <IntakeAssetField
          label="Favicon"
          accept="image/*,.ico,.png,.svg"
          currentAsset={favicon.current}
          selectedFile={favicon.nextFile}
          shape="square"
          onFileChange={(file) => setFavicon((current) => ({ ...current, nextFile: file }))}
        />
        <IntakeAssetField
          label="Meta image"
          accept="image/*"
          currentAsset={metaImage.current}
          selectedFile={metaImage.nextFile}
          shape="landscape"
          onFileChange={(file) => setMetaImage((current) => ({ ...current, nextFile: file }))}
        />
        <IntakeAssetField
          label="Logo"
          accept="image/*,.svg"
          currentAsset={logo.current}
          selectedFile={logo.nextFile}
          shape="square"
          onFileChange={(file) => setLogo((current) => ({ ...current, nextFile: file }))}
        />

        {mode === 'onboarding' ? (
          <label className="flex flex-col gap-2 text-sm xl:col-span-2">
            <span className="text-bolt-elements-textPrimary">Markdown documents</span>
            <input
              type="file"
              multiple
              accept=".md,.markdown,text/markdown"
              className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2"
              onChange={(event) => setMarkdownFiles(Array.from(event.target.files ?? []))}
            />
            <span className="text-xs text-bolt-elements-textSecondary">
              {markdownFiles.length > 0
                ? `${markdownFiles.length} file${markdownFiles.length > 1 ? 's' : ''} selected`
                : 'Upload the source markdown used to bootstrap page contracts.'}
            </span>
          </label>
        ) : (
          <div className="xl:col-span-2 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3">
            <div className="text-sm font-medium">Imported markdown sources</div>
            <div className="mt-2 space-y-1 text-xs text-bolt-elements-textSecondary">
              {markdownSources.length > 0 ? (
                markdownSources.map((source) => (
                  <div key={source.sourcePath}>
                    {source.name} {source.pagePath ? `→ ${source.pagePath}` : ''}
                  </div>
                ))
              ) : (
                <div>No markdown sources recorded yet.</div>
              )}
            </div>
          </div>
        )}
      </div>

      {error ? <div className="mt-4 text-sm text-red-400">{error}</div> : null}

      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="text-xs text-bolt-elements-textSecondary">
          {multilingual ? `${normalizedLanguages.length} languages configured` : 'Single-language project'}
        </div>
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-accent-500/15 px-3 py-2 text-sm text-accent-400 hover:bg-accent-500/20 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
