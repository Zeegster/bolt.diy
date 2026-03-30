import { atom, map } from 'nanostores';
import type { IntakeAiSuggestion } from '~/types/publisher';

export const intakeSelectedPageId = atom<string | undefined>(undefined);
export const intakeSourceModalPath = atom<string | undefined>(undefined);
export const intakeBusyByPage = map<Record<string, boolean>>({});
export const intakeSuggestionByPage = map<Record<string, IntakeAiSuggestion | undefined>>({});

export function setIntakePageBusy(pageId: string, busy: boolean) {
  intakeBusyByPage.setKey(pageId, busy);
}

export function setIntakeSuggestion(pageId: string, suggestion: IntakeAiSuggestion | undefined) {
  intakeSuggestionByPage.setKey(pageId, suggestion);
}
