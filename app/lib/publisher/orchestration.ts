import { z } from 'zod';

const qualityExtensionSchema = z.object({
  kind: z.enum(['lighthouse', 'export-verifier']),
  profile: z.enum(['mobile', 'desktop']).optional(),
  minScore: z.number().min(0).max(1).optional(),
  optional: z.boolean().default(true),
});

const orchestrationActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('enqueue-intake-review'),
    projectId: z.string().min(1),
    intakeSessionId: z.string().min(1).optional(),
  }),
  z.object({
    action: z.literal('rebuild-preview'),
    projectId: z.string().min(1),
    pageId: z.string().min(1).optional(),
  }),
  z.object({
    action: z.literal('run-release-checks'),
    projectId: z.string().min(1),
  }),
  z.object({
    action: z.literal('publish-export'),
    projectId: z.string().min(1),
  }),
  z.object({
    action: z.literal('retry-repair-loop'),
    projectId: z.string().min(1),
    checkName: z.string().min(1).optional(),
    pageId: z.string().min(1).optional(),
  }),
]);

export type PublisherQualityExtension = z.infer<typeof qualityExtensionSchema>;
export type PublisherOrchestrationAction = z.infer<typeof orchestrationActionSchema>;

export interface PublisherOrchestrationEnvelope {
  transport: 'local';
  requestedAt: string;
  action: PublisherOrchestrationAction;
  qualityExtensions: PublisherQualityExtension[];
}

export function parsePublisherOrchestrationAction(input: unknown): PublisherOrchestrationAction {
  return orchestrationActionSchema.parse(input);
}

export function safeParsePublisherOrchestrationAction(input: unknown) {
  return orchestrationActionSchema.safeParse(input);
}

export function createPublisherOrchestrationEnvelope(
  action: PublisherOrchestrationAction,
  options?: {
    requestedAt?: string;
    qualityExtensions?: PublisherQualityExtension[];
  },
): PublisherOrchestrationEnvelope {
  return {
    transport: 'local',
    requestedAt: options?.requestedAt ?? new Date().toISOString(),
    action,
    qualityExtensions: (options?.qualityExtensions ?? []).map((extension) => qualityExtensionSchema.parse(extension)),
  };
}
