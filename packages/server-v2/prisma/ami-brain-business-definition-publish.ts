import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { loadWorkspaceEnvironment } from '../src/brain/capability/brain-capability-cli.helpers.js';
import { BrainInventorySkillsService } from '../src/brain/skills/brain-inventory-skills.service.js';
import { BrainFinanceSkillsService } from '../src/brain/skills/brain-finance-skills.service.js';
import { BrainManagerSkillsService } from '../src/brain/skills/brain-manager-skills.service.js';
import { BrainMarketingSkillsService } from '../src/brain/skills/brain-marketing-skills.service.js';
import { BrainCustomerFactResolverService } from '../src/brain/domain/brain-customer-fact-resolver.service.js';
import { CustomerLifecycleOntologyService } from '../src/marketing/customer-lifecycle-ontology.service.js';
import { CustomerFeedbackService } from '../src/customer-feedback/customer-feedback.service.js';
import { CustomerWaitingService } from '../src/reservations/customer-waiting.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { BusinessDefinitionModule } from '../src/semantic-data/business-definition.module.js';
import { createBusinessDefinitionFixtureArtifactFingerprint } from '../src/semantic-data/business-definition-fixture-source.service.js';
import { BusinessDefinitionRegistryService } from '../src/semantic-data/business-definition-registry.service.js';
import { BusinessDefinitionSemanticQueryAdapter } from '../src/semantic-data/business-definition-semantic-query.adapter.js';
import { BusinessDefinitionCandidateRuntimeQueryAdapter } from '../src/semantic-data/business-definition-candidate-runtime-query.adapter.js';

async function main() {
  const args = process.argv.slice(2);
  const value = (name: string) => args.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3);
  const workspaceRoot = resolve(value('workspace-root') ?? (await detectWorkspaceRoot()));
  loadWorkspaceEnvironment(workspaceRoot);
  const versionIds = (value('version-ids') ?? '')
    .split(',')
    .map(Number)
    .filter((item) => Number.isInteger(item) && item > 0);
  const storeId = Number(value('store-id') ?? 6);
  const actorId = Number(value('actor-id') ?? process.env.BRAIN_GOVERNANCE_SYSTEM_USER_ID);
  const apply = args.includes('--apply');
  const yes = args.includes('--yes');
  const validateOnly = args.includes('--validate-only');
  if (!versionIds.length) throw new Error('business_definition_publish_version_ids_required');
  if (!Number.isInteger(storeId) || storeId < 1) throw new Error('business_definition_publish_store_id_invalid');
  if (!Number.isInteger(actorId) || actorId < 1) throw new Error('business_definition_publish_actor_id_invalid');
  if (apply && !yes) throw new Error('business_definition_publish_confirmation_required');

  const app = await NestFactory.createApplicationContext(BusinessDefinitionModule, { logger: false });
  try {
    const prisma = app.get(PrismaService);
    const registry = app.get(BusinessDefinitionRegistryService);
    const managerSkills = new BrainManagerSkillsService(prisma);
    const inventorySkills = new BrainInventorySkillsService(prisma);
    const financeSkills = new BrainFinanceSkillsService(prisma);
    const marketingSkills = new BrainMarketingSkillsService(prisma);
    const customerFacts = new BrainCustomerFactResolverService(prisma);
    const customerFeedback = new CustomerFeedbackService(prisma);
    const customerWaiting = new CustomerWaitingService(prisma);
    const customerLifecycle = new CustomerLifecycleOntologyService(prisma);
    const candidateAdapter = app.get(BusinessDefinitionCandidateRuntimeQueryAdapter).useResolverRowSource({
      async loadRows(input) {
        if (input.resolverKey === 'manager_staff_analysis') {
          const result = await managerSkills.buildStaffAnalysis({
            storeId: input.storeId,
            startDate: input.startDate,
            endDate: new Date(input.endExclusive.getTime() - 1),
          });
          return result.staff as unknown as Record<string, unknown>[];
        }
        if (input.resolverKey === 'inventory_risk_summary') {
          const result = await inventorySkills.buildInventoryRiskSummary({
            storeId: input.storeId,
            expiringBefore: new Date(input.endExclusive.getTime() - 1),
          });
          return result.lowStockProducts as unknown as Record<string, unknown>[];
        }
        if (input.resolverKey === 'inventory_consumption_rows') {
          const result = await inventorySkills.buildInventoryDetailAnalysis({
            storeId: input.storeId,
            startDate: input.startDate,
            endDate: new Date(input.endExclusive.getTime() - 1),
          });
          return result.products as unknown as Record<string, unknown>[];
        }
        if (input.resolverKey === 'product_margin_rows') {
          const result = await financeSkills.buildProductMarginAnalysis({
            storeId: input.storeId,
            startDate: input.startDate,
            endDate: new Date(input.endExclusive.getTime() - 1),
          });
          return result.rows as unknown as Record<string, unknown>[];
        }
        if (input.resolverKey === 'customer_retention_summary') {
          const result = await customerFacts.getCustomerRetentionSummary({
            storeId: input.storeId,
            startDate: input.startDate,
            endDate: new Date(input.endExclusive.getTime() - 1),
          });
          return [result as unknown as Record<string, unknown>];
        }
        if (input.resolverKey === 'customer_acquisition_conversion_summary') {
          const result = await customerFacts.getNewCustomerConversionSummary({
            storeId: input.storeId,
            startDate: input.startDate,
            endDate: new Date(input.endExclusive.getTime() - 1),
          });
          return [result as unknown as Record<string, unknown>];
        }
        if (
          input.resolverKey === 'customer_service_feedback_summary' ||
          input.resolverKey === 'customer_service_feedback_by_staff'
        ) {
          const result = await customerFeedback.analytics(input.storeId, {
            startDate: input.startDate.toISOString(),
            endDate: new Date(input.endExclusive.getTime() - 1).toISOString(),
          });
          return input.resolverKey === 'customer_service_feedback_summary'
            ? [result.summary as unknown as Record<string, unknown>]
            : result.staff as unknown as Record<string, unknown>[];
        }
        if (input.resolverKey === 'customer_waiting_summary') {
          const result = await customerWaiting.analytics(input.storeId, {
            startDate: input.startDate.toISOString(),
            endDate: new Date(input.endExclusive.getTime() - 1).toISOString(),
          });
          return [result.summary as unknown as Record<string, unknown>];
        }
        if (input.resolverKey === 'customer_dormant_reactivation_rows') {
          const result = await customerLifecycle.getDormantReactivationEvidence(input.storeId, {
            startDate: input.startDate,
            endDate: new Date(input.endExclusive.getTime() - 1),
            limit: 50,
          });
          return result.rows as unknown as Record<string, unknown>[];
        }
        return marketingSkills.buildFollowUpPriorityRows({
          storeId: input.storeId,
          asOf: new Date(Math.min(Date.now(), input.endExclusive.getTime() - 1)),
        });
      },
    });
    const legacyAdapter = app.get(BusinessDefinitionSemanticQueryAdapter);
    const items = [];
    for (const versionId of versionIds) {
      const version = await prisma.businessDefinitionVersion.findUnique({
        where: { id: versionId },
        include: { definition: true, evidence: true, projections: true },
      });
      if (!version) throw new Error(`business_definition_publish_version_missing:${versionId}`);
      const definitionKey = version.definition.definitionKey;
      if (version.lifecycleStatus === 'published') {
        items.push({ versionId, definitionKey, status: 'already_published' });
        continue;
      }
      let fixturePrepared = false;
      if (version.definition.kind === 'metric') {
        if (!version.canonicalQueryRef || !version.fixtureSetKey) {
          throw new Error(`business_definition_publish_metric_fixture_binding_missing:${definitionKey}`);
        }
        const fixtureCase = {
          caseKey: `${definitionKey}.store_${storeId}`,
          input: {
            caseKey: `${definitionKey}.store_${storeId}`,
            storeId,
            operatorId: actorId,
            role: 'manager',
            timeRange: {
              preset: 'custom',
              startDate: '2026-07-01',
              endDate: '2026-08-01',
              label: '2026年7月',
            },
            limit: 20,
          },
          expected: await (candidateAdapter.supports(version.canonicalQueryRef) ? candidateAdapter : legacyAdapter).execute({
            canonicalQueryRef: version.canonicalQueryRef,
            version: version as never,
            fixtureCase: {
              caseKey: `${definitionKey}.store_${storeId}`,
              input: {
                caseKey: `${definitionKey}.store_${storeId}`,
                storeId,
                operatorId: actorId,
                role: 'manager',
                timeRange: {
                  preset: 'custom',
                  startDate: '2026-07-01',
                  endDate: '2026-08-01',
                  label: '2026年7月',
                },
                limit: 20,
              },
              expected: null,
            },
            timezone: version.timezone,
            storeScope: version.storeScope,
          }),
        };
        const payload = { fixtureSetKey: version.fixtureSetKey, cases: [fixtureCase] };
        fixturePrepared = true;
        if (apply) {
          await prisma.$transaction(
            async (tx) => {
              const fingerprint = createBusinessDefinitionFixtureArtifactFingerprint(payload);
              const active = await tx.businessDefinitionFixtureArtifact.findFirst({
                where: { fixtureSetKey: version.fixtureSetKey!, status: 'active' },
                orderBy: { version: 'desc' },
              });
              if (active) {
                if (active.fingerprint !== fingerprint) {
                  throw new Error(`business_definition_fixture_drift_requires_new_key:${version.fixtureSetKey}`);
                }
                return;
              }
              const latest = await tx.businessDefinitionFixtureArtifact.aggregate({
                where: { fixtureSetKey: version.fixtureSetKey! },
                _max: { version: true },
              });
              await tx.businessDefinitionFixtureArtifact.create({
                data: {
                  fixtureSetKey: version.fixtureSetKey!,
                  version: (latest._max.version ?? 0) + 1,
                  status: 'active',
                  payload: payload as Prisma.InputJsonValue,
                  fingerprint,
                  createdBy: actorId,
                },
              });
            },
            { timeout: 30_000 },
          );
        }
      }
      if (!apply) {
        items.push({ versionId, definitionKey, status: 'ready', fixturePrepared });
        continue;
      }
      const validated = validateOnly
        ? await registry.validateVersionForEvaluation(versionId, { validatedBy: actorId })
        : await registry.validateVersion(versionId, { validatedBy: actorId });
      if (validated.validationStatus !== 'passed') {
        throw new Error(
          `business_definition_publish_validation_failed:${definitionKey}:${JSON.stringify(validated.validationReport)}`,
        );
      }
      if (validateOnly) {
        items.push({ versionId, definitionKey, status: 'validated_candidate', fixturePrepared });
        continue;
      }
      const published = await registry.publishVersion(versionId, {
        publishedBy: actorId,
        expectedCurrentVersionId: version.definition.currentPublishedVersionId ?? undefined,
      });
      items.push({
        versionId,
        definitionKey,
        status: 'published',
        fixturePrepared,
        publishedVersion: published.version,
      });
    }
    process.stdout.write(`${JSON.stringify({ mode: apply ? 'applied' : 'dry_run', storeId, items }, null, 2)}\n`);
  } finally {
    await app.close();
  }
}

async function detectWorkspaceRoot(): Promise<string> {
  for (const candidate of [process.cwd(), resolve(process.cwd(), '..', '..')]) {
    try {
      await access(resolve(candidate, 'packages/server-v2/prisma/schema.prisma'));
      return candidate;
    } catch {
      // Continue searching from npm --prefix working directories.
    }
  }
  throw new Error('business_definition_publish_workspace_root_not_found');
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
