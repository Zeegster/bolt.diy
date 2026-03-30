import type { FileMap } from '~/lib/stores/files';
import type {
  CheckReport,
  LoadedPublisherState,
  PageContract,
  SlotContract,
  ZoneContract,
  ZoneType,
} from '~/types/publisher';
import { requiredPublisherZones } from '~/types/publisher';
import {
  PUBLISHER_CHECKS_FILE,
  PUBLISHER_PAGES_DIR,
  PUBLISHER_PROJECT_FILE,
  PUBLISHER_REFERENCES_FILE,
  PUBLISHER_THEME_FILE,
} from './constants';
import {
  createJsonParseReport,
  createSchemaReport,
  validateCheckReports,
  validatePageContract,
  validatePublisherReferenceState,
  validateProjectContract,
  validateThemeContract,
} from './validator';
import type { PublisherBlockRegistry } from './block-registry';

export const reservedPublisherMetadataKeys = [
  'canonical',
  'canonicalurl',
  'canonicalpath',
  'robots',
  'schema',
  'schematype',
  'jsonld',
  'head',
  'favicon',
  'metaimage',
  'sitemap',
] as const;

function normalizePublisherMetadataKey(value: string) {
  return value.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

export function isReservedPublisherMetadataKey(key: string) {
  const normalized = normalizePublisherMetadataKey(key);
  return reservedPublisherMetadataKeys.some((reservedKey) => normalized === reservedKey);
}

export function sanitizePublisherSlotProps(props: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(props).filter(([key]) => !isReservedPublisherMetadataKey(key)));
}

export function resolveEffectiveZoneContract(
  page: PageContract,
  zone: ZoneType,
  sharedShell?: Partial<Record<ZoneType, ZoneContract>>,
) {
  const pageZone = page.zones[zone];

  if (pageZone?.enabled === false) {
    return pageZone;
  }

  if (pageZone && pageZone.slots.length > 0) {
    return pageZone;
  }

  if (page.usesProjectShell !== false && sharedShell?.[zone]) {
    return sharedShell[zone];
  }

  return pageZone;
}

function createGuardReport(report: CheckReport): CheckReport {
  return {
    gate: 'working',
    ...report,
  };
}

function validateSlotContract(
  page: PageContract,
  zone: ZoneType,
  slot: SlotContract,
  registry: PublisherBlockRegistry,
): CheckReport[] {
  const block = registry.getNormalizedMeta(slot.blockId);

  if (!block) {
    return [
      createGuardReport({
        name: 'missing-block',
        status: 'fail',
        message: `Unknown block "${slot.blockId}" referenced in ${page.name}.`,
        details: [`Zone: ${zone}`, `Slot: ${slot.id}`],
        pageId: page.id,
        zone,
      }),
    ];
  }

  const reports: CheckReport[] = [];
  const allowedZones = registry.getAllowedZones(slot.blockId);

  if (!allowedZones.includes(zone)) {
    reports.push(
      createGuardReport({
        name: 'block-zone-guard',
        status: 'fail',
        message: `Block "${block.name}" cannot be rendered inside zone "${zone}".`,
        details: [`Allowed zones: ${allowedZones.join(', ')}`],
        pageId: page.id,
        zone,
      }),
    );
  }

  const missingRequiredProps = block.slots
    .filter((definition) => definition.required)
    .filter((definition) => {
      const value = slot.props[definition.key];
      return value === undefined || value === null || `${value}`.trim() === '';
    });

  if (missingRequiredProps.length > 0) {
    reports.push(
      createGuardReport({
        name: 'missing-slot-props',
        status: 'fail',
        message: `Block "${block.name}" is missing required props.`,
        details: missingRequiredProps.map((prop) => `${page.name}/${zone}/${slot.id}: ${prop.key}`),
        pageId: page.id,
        zone,
      }),
    );
  }

  const reservedKeys = Object.keys(slot.props).filter((key) => isReservedPublisherMetadataKey(key));

  if (reservedKeys.length > 0) {
    reports.push(
      createGuardReport({
        name: 'metadata-ownership',
        status: 'fail',
        message: `Block "${block.name}" attempts to override app-owned metadata.`,
        details: [`Remove reserved slot props: ${reservedKeys.join(', ')}`],
        pageId: page.id,
        zone,
      }),
    );
  }

  if (block.deprecation?.status === 'deprecated') {
    reports.push(
      createGuardReport({
        name: 'deprecated-block',
        status: 'warn',
        message: `Block "${block.name}" is deprecated and should be replaced.`,
        details: [
          block.deprecation.message ?? 'Use the recommended replacement before release.',
          block.deprecation.replacementBlockId ? `Replacement: ${block.deprecation.replacementBlockId}` : '',
        ].filter(Boolean),
        pageId: page.id,
        zone,
      }),
    );
  }

  return reports;
}

function validateZoneCardinality(
  page: PageContract,
  zone: ZoneType,
  zoneContract: ZoneContract,
  registry: PublisherBlockRegistry,
) {
  const reports: CheckReport[] = [];
  const counts = new Map<string, number>();

  zoneContract.slots.forEach((slot) => {
    counts.set(slot.blockId, (counts.get(slot.blockId) ?? 0) + 1);
  });

  for (const [blockId, count] of counts) {
    const meta = registry.getNormalizedMeta(blockId);
    const cardinality = meta?.slotCardinality;

    if (!meta || !cardinality) {
      continue;
    }

    if (typeof cardinality.min === 'number' && count < cardinality.min) {
      reports.push(
        createGuardReport({
          name: 'slot-cardinality',
          status: 'fail',
          message: `Block "${meta.name}" does not meet the minimum required placements in zone "${zone}".`,
          details: [`Expected at least ${cardinality.min}, found ${count}.`],
          pageId: page.id,
          zone,
        }),
      );
    }

    if (typeof cardinality.max === 'number' && count > cardinality.max) {
      reports.push(
        createGuardReport({
          name: 'slot-cardinality',
          status: 'fail',
          message: `Block "${meta.name}" exceeds the allowed placements in zone "${zone}".`,
          details: [`Expected at most ${cardinality.max}, found ${count}.`],
          pageId: page.id,
          zone,
        }),
      );
    }
  }

  return reports;
}

export function validatePublisherContractGuards(
  state: LoadedPublisherState,
  registry: PublisherBlockRegistry,
): CheckReport[] {
  if (!state.project) {
    return [];
  }

  const reports: CheckReport[] = [];

  for (const page of state.pages) {
    for (const zone of requiredPublisherZones) {
      const zoneContract = resolveEffectiveZoneContract(page, zone, state.project.sharedShell);

      if (!zoneContract?.slots?.length) {
        reports.push(
          createGuardReport({
            name: 'missing-zone',
            status: 'fail',
            message: `Page "${page.name}" is missing required ${zone} content.`,
            details: [`Add at least one block to ${zone}.`],
            pageId: page.id,
            zone,
          }),
        );
      }
    }

    for (const zone of Object.keys(page.zones) as ZoneType[]) {
      const zoneContract = resolveEffectiveZoneContract(page, zone, state.project.sharedShell);

      if (!zoneContract?.slots?.length) {
        continue;
      }

      for (const slot of zoneContract.slots) {
        reports.push(...validateSlotContract(page, zone, slot, registry));
      }

      reports.push(...validateZoneCardinality(page, zone, zoneContract, registry));
    }
  }

  return reports;
}

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
  let referenceState: LoadedPublisherState['referenceState'];
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

  const referencesFile = files[PUBLISHER_REFERENCES_FILE];

  if (referencesFile?.type === 'file') {
    const parsed = parseJsonContent(PUBLISHER_REFERENCES_FILE, referencesFile.content);

    if (parsed.value) {
      const result = validatePublisherReferenceState(parsed.value);

      if (result.success) {
        referenceState = result.data;
      } else {
        issues.push(createSchemaReport(PUBLISHER_REFERENCES_FILE, result.error.issues));
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
    referenceState,
    checks,
    issues,
    pages: sortPages(pages, project?.pageOrder),
    availableFilePaths: Object.keys(files),
  };
}
