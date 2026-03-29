import { map } from 'nanostores';

export const chatStore = map({
  started: false,
  aborted: false,
  showChat: true,
  draftPrefill: null as {
    message: string;
    replaceRequested: boolean;
    source?: 'slot' | 'page' | 'rebuild';
  } | null,
});
