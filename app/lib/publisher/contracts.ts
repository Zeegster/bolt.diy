import type { FileMap } from '~/lib/stores/files';
import type { CheckReport, LoadedPublisherState, PageContract } from '~/types/publisher';
import { PUBLISHER_CHECKS_FILE, PUBLISHER_PAGES_DIR, PUBLISHER_PROJECT_FILE, PUBLISHER_THEME_FILE } from './constants';
import {
  createJsonParseReport,
  createSchemaReport,
  validateCheckReports,
  validatePageContract,
  validateProjectContract,
  validateThemeContract,
} from './validator';

function parseJsonContent(filePath: string, content: string): { value?: unknown; issues: CheckReport[] } {
  try {
    return {
      value: JSON.parse(content),
      issues: [],
    };
  } catch (error) {
    return {
      issues: [createJsonParseReport(filePath, error)],
    };
  }
}

function sortPages(pages: PageContract[], pageOrder?: string[]) {
  if (!pageOrder?.length) {
    return [...pages].sort((left, right) => left.path.localeCompare(right.path));
  }

  const orderMap = new Map(pageOrder.map((id, index) => [id, index]));

  return [...pages].sort((left, right) => {
    const leftIndex = orderMap.get(left.id) ?? Number.MAX_SAFE_INTEGER;
    const rightIndex = orderMap.get(right.id) ?? Number.MAX_SAFE_INTEGER;

    return leftIndex - rightIndex || left.path.localeCompare(right.path);
  });
}

export function loadPublisherState(files: FileMap): LoadedPublisherState {
  const issues: CheckReport[] = [];
  let checks: CheckReport[] = [];
  let project: LoadedPublisherState['project'];
  let theme: LoadedPublisherState['theme'];
  const pages: PageContract[] = [];

  const projectFile = files[PUBLISHER_PROJECT_FILE];

  if (projectFile?.type === 'file') {
    const parsed = parseJsonContent(PUBLISHER_PROJECT_FILE, projectFile.content);

    if (parsed.value) {
      const result = validateProjectContract(parsed.value);

      if (result.success) {
        project = result.data;
      } else {
        issues.push(createSchemaReport(PUBLISHER_PROJECT_FILE, result.error.issues));
      }
    } else {
      issues.push(...parsed.issues);
    }
  }

  const themeFile = files[PUBLISHER_THEME_FILE];

  if (themeFile?.type === 'file') {
    const parsed = parseJsonContent(PUBLISHER_THEME_FILE, themeFile.content);

    if (parsed.value) {
      const result = validateThemeContract(parsed.value);

      if (result.success) {
        theme = result.data;
      } else {
        issues.push(createSchemaReport(PUBLISHER_THEME_FILE, result.error.issues));
      }
    } else {
      issues.push(...parsed.issues);
    }
  }

  const checksFile = files[PUBLISHER_CHECKS_FILE];

  if (checksFile?.type === 'file') {
    const parsed = parseJsonContent(PUBLISHER_CHECKS_FILE, checksFile.content);

    if (parsed.value) {
      const result = validateCheckReports(parsed.value);

      if (result.success) {
        checks = result.data;
      } else {
        issues.push(createSchemaReport(PUBLISHER_CHECKS_FILE, result.error.issues));
      }
    } else {
      issues.push(...parsed.issues);
    }
  }

  for (const [filePath, file] of Object.entries(files)) {
    if (file?.type !== 'file' || !filePath.startsWith(`${PUBLISHER_PAGES_DIR}/`) || !filePath.endsWith('.json')) {
      continue;
    }

    const parsed = parseJsonContent(filePath, file.content);

    if (!parsed.value) {
      issues.push(...parsed.issues);
      continue;
    }

    const result = validatePageContract(parsed.value);

    if (result.success) {
      pages.push(result.data);
    } else {
      issues.push(createSchemaReport(filePath, result.error.issues));
    }
  }

  return {
    project,
    theme,
    checks,
    issues,
    pages: sortPages(pages, project?.pageOrder),
  };
}
