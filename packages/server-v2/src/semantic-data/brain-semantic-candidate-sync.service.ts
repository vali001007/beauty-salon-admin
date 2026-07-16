import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateBusinessDefinitionDraftInput } from './business-definition.dto.js';
import {
  BusinessDefinitionRegistryService,
  createBusinessDefinitionDraftFingerprint,
} from './business-definition-registry.service.js';

interface SyncableSemanticCandidate {
  status: 'draft' | 'blocked';
  blockedReasons: string[];
  draftInput?: Omit<CreateBusinessDefinitionDraftInput, 'createdBy' | 'candidateDiagnostics'>;
}

@Injectable()
export class BrainSemanticCandidateSyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: BusinessDefinitionRegistryService,
  ) {}

  async sync(input: { candidates: readonly SyncableSemanticCandidate[]; createdBy: number; source: string }) {
    if (!Number.isInteger(input.createdBy) || input.createdBy < 1) {
      throw new BadRequestException('semantic_candidate_sync_created_by_invalid');
    }
    if (!input.source.trim()) throw new BadRequestException('semantic_candidate_sync_source_required');
    const items: Array<{
      definitionKey?: string;
      status: 'created' | 'unchanged' | 'blocked_without_proposal';
      versionId?: number;
      version?: number;
      blockedReasons: string[];
    }> = [];

    for (const candidate of input.candidates) {
      const blockedReasons = [...new Set(candidate.blockedReasons)].sort();
      if (!candidate.draftInput) {
        items.push({ status: 'blocked_without_proposal', blockedReasons });
        continue;
      }
      const generatedDraftInput: CreateBusinessDefinitionDraftInput = {
        ...structuredClone(candidate.draftInput),
        lifecycleStatus: candidate.status === 'blocked' ? 'candidate' : 'draft',
        createdBy: input.createdBy,
        candidateDiagnostics:
          candidate.status === 'blocked' ? { source: input.source.trim(), blockedReasons } : undefined,
      };
      const existingDefinition = await this.prisma.businessDefinition.findUnique({
        where: {
          kind_definitionKey: {
            kind: generatedDraftInput.kind,
            definitionKey: generatedDraftInput.definitionKey,
          },
        },
        select: { domain: true, name: true, ownerType: true, ownerId: true },
      });
      const draftInput: CreateBusinessDefinitionDraftInput = existingDefinition
        ? {
            ...generatedDraftInput,
            domain: existingDefinition.domain,
            name: existingDefinition.name,
            ownerType: existingDefinition.ownerType,
            ownerId: existingDefinition.ownerId ?? undefined,
          }
        : generatedDraftInput;
      const fingerprint = createBusinessDefinitionDraftFingerprint(draftInput);
      const existing = await this.prisma.businessDefinitionVersion.findFirst({
        where: {
          fingerprint,
          definition: {
            is: {
              definitionKey: draftInput.definitionKey,
              kind: draftInput.kind,
            },
          },
        },
        select: { id: true, version: true },
      });
      if (existing) {
        items.push({
          definitionKey: draftInput.definitionKey,
          status: 'unchanged',
          versionId: existing.id,
          version: existing.version,
          blockedReasons,
        });
        continue;
      }
      const created = await this.registry.createDraft(draftInput);
      items.push({
        definitionKey: draftInput.definitionKey,
        status: 'created',
        versionId: created.id,
        version: created.version,
        blockedReasons,
      });
    }

    return {
      summary: {
        total: input.candidates.length,
        created: items.filter((item) => item.status === 'created').length,
        unchanged: items.filter((item) => item.status === 'unchanged').length,
        blockedWithoutProposal: items.filter((item) => item.status === 'blocked_without_proposal').length,
      },
      items,
    };
  }
}
