import {
  requiredPublisherZones,
  type CheckReport,
  type LoadedPublisherState,
  type PageContract,
  type SlotContract,
  type ZoneContract,
  type ZoneType,
} from '~/types/publisher';
import type { PublisherBlockRegistry } from './block-registry';
import { hasNavigationTag } from './validator';
import { normalizeTokens } from './token-engine';

function resolveZone(page: PageContract, zone: ZoneType, sharedShell?: Partial<Record<ZoneType, ZoneContract>>) {
  const pageZone = page.zones[zone];

  if (pageZone && pageZone.enabled === false) {
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

function createReport(report: CheckReport): CheckReport {
  return {
    gate: 'working',
    ...report,
  };
}

export function runPublisherChecks(state: LoadedPublisherState, registry: PublisherBlockRegistry): CheckReport[] {
  const reports: CheckReport[] = [...state.issues, ...state.checks];
  const themeTokens = normalizeTokens(state.theme);

  if (!state.project) {
    return [
      ...reports,
      createReport({
        name: 'publisher-project',
        status: 'warn',
        message: 'Publisher contract has not been created yet.',
        details: ['Create .bolt/publisher/project.json and at least one page contract.'],
      }),
    ];
  }

  if (state.pages.length === 0) {
    reports.push(
      createReport({
        name: 'publisher-pages',
        status: 'fail',
        message: 'No page contracts found.',
        details: ['Add at least one file under .bolt/publisher/pages/*.json.'],
      }),
    );
  }

  const seenPaths = new Map<string, string>();

  for (const page of state.pages) {
    if (seenPaths.has(page.path)) {
      reports.push(
        createReport({
          name: 'page-path-collision',
          status: 'fail',
          message: `Duplicate page path "${page.path}" detected.`,
          details: [seenPaths.get(page.path) || '', page.id],
          pageId: page.id,
        }),
      );
    } else {
      seenPaths.set(page.path, page.id);
    }

    for (const zone of requiredPublisherZones) {
      const zoneContract = resolveZone(page, zone, state.project.sharedShell);

      if (!zoneContract?.slots?.length) {
        reports.push(
          createReport({
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

    const headerHasNavigation = resolveZone(page, 'header', state.project.sharedShell)?.slots.some(
      (slot: SlotContract) => hasNavigationTag(registry.getById(slot.blockId)),
    );
    const sidebarHasNavigation = resolveZone(page, 'sidebar', state.project.sharedShell)?.slots.some(
      (slot: SlotContract) => hasNavigationTag(registry.getById(slot.blockId)),
    );

    if (headerHasNavigation && sidebarHasNavigation) {
      reports.push(
        createReport({
          name: 'navigation-guard',
          status: 'warn',
          message: `Page "${page.name}" defines navigation in both header and sidebar.`,
          details: ['Choose one primary navigation surface to avoid duplicate menu UX.'],
          pageId: page.id,
        }),
      );
    }

    for (const [zone, zoneContract] of Object.entries(page.zones) as Array<
      [ZoneType, NonNullable<PageContract['zones'][ZoneType]>]
    >) {
      for (const slot of zoneContract.slots) {
        const block = registry.getById(slot.blockId);

        if (!block) {
          reports.push(
            createReport({
              name: 'missing-block',
              status: 'fail',
              message: `Unknown block "${slot.blockId}" referenced in ${page.name}.`,
              details: [`Zone: ${zone}`, `Slot: ${slot.id}`],
              pageId: page.id,
              zone,
            }),
          );
          continue;
        }

        const missingRequiredProps = block.slots
          .filter((definition) => definition.required)
          .filter((definition) => {
            const value = slot.props[definition.key];
            return value === undefined || value === null || `${value}`.trim() === '';
          });

        if (missingRequiredProps.length > 0) {
          reports.push(
            createReport({
              name: 'missing-slot-props',
              status: 'fail',
              message: `Block "${block.name}" is missing required props.`,
              details: missingRequiredProps.map((prop) => `${page.name}/${zone}/${slot.id}: ${prop.key}`),
              pageId: page.id,
              zone,
            }),
          );
        }

        const assetWarnings = Object.entries(slot.props)
          .filter(([key]) => key.toLowerCase().includes('image') || key.toLowerCase().includes('logo'))
          .filter(([_key, value]) => typeof value !== 'string' || value.trim().length === 0);

        if (assetWarnings.length > 0) {
          reports.push(
            createReport({
              name: 'asset-sanity',
              status: 'warn',
              message: `Block "${block.name}" has empty asset references.`,
              details: assetWarnings.map(([key]) => `${page.name}/${slot.id}: ${key}`),
              pageId: page.id,
              zone,
            }),
          );
        }
      }
    }
  }

  const usedTokenKeys = new Set<string>();

  for (const page of state.pages) {
    for (const zoneContract of Object.values(page.zones)) {
      zoneContract?.slots.forEach((slot) => {
        const block = registry.getById(slot.blockId);
        block?.tokenKeys.forEach((tokenKey) => usedTokenKeys.add(tokenKey));
      });
    }
  }

  const missingTokens = [...usedTokenKeys].filter((tokenKey) => !(tokenKey in themeTokens));

  if (missingTokens.length > 0) {
    reports.push(
      createReport({
        name: 'missing-tokens',
        status: 'warn',
        message: 'Some block token keys are not explicitly defined in theme.json.',
        details: missingTokens,
      }),
    );
  }

  if (!reports.some((report) => report.status === 'pass')) {
    reports.push(
      createReport({
        name: 'working-gate',
        status: reports.some((report) => report.status === 'fail') ? 'warn' : 'pass',
        message: reports.some((report) => report.status === 'fail')
          ? 'Publisher working gate found issues that should be fixed before export.'
          : 'Publisher working gate passed.',
      }),
    );
  }

  return reports;
}
