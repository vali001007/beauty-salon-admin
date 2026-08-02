import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ASK_DATA_FREE_SQL_VIEWS } from './ask-data-free-sql.catalog.js';

describe('Ask Data Free SQL catalog and independence', () => {
  it('registers 34 governed views with store and permission policies', () => {
    expect(ASK_DATA_FREE_SQL_VIEWS).toHaveLength(34);
    expect(new Set(ASK_DATA_FREE_SQL_VIEWS.map((view) => view.viewName)).size).toBe(34);
    for (const view of ASK_DATA_FREE_SQL_VIEWS) {
      expect(view.requiredPermissions.length).toBeGreaterThan(0);
      expect(view.storeScopeField).toBe('store_id');
      expect(view.fields.some((field) => field.name === 'store_id')).toBe(true);
      expect(view.keywords?.length).toBeGreaterThan(0);
      expect(view.dataPolicy?.length).toBeGreaterThan(0);
      expect(view.defaultTimeField || view.requiresTimeScope === false).toBeTruthy();
    }
  });

  it('keeps sensitive customer fields outside the queryable field surface', () => {
    const customerProfile = ASK_DATA_FREE_SQL_VIEWS.find(
      (view) => view.viewName === 'ask_data_customer_profile_summary_view',
    );
    expect(customerProfile?.fields.map((field) => field.name)).not.toEqual(
      expect.arrayContaining(['phone', 'phone_last4', 'tags_summary', 'health_profile']),
    );

    const feedback = ASK_DATA_FREE_SQL_VIEWS.find((view) => view.viewName === 'ask_data_customer_feedback_view');
    expect(feedback?.fields.map((field) => field.name)).not.toEqual(
      expect.arrayContaining(['content', 'resolution_note', 'phone', 'source_channel']),
    );
  });

  it('uses current management permissions instead of retired Agent permission keys', () => {
    const permissions = ASK_DATA_FREE_SQL_VIEWS.flatMap((view) => view.requiredPermissions);
    expect(permissions).not.toEqual(
      expect.arrayContaining(['core:card:view', 'core:schedule:view', 'core:service:view']),
    );
  });

  it('does not import Brain or Agent runtime modules', () => {
    const files = [
      'ask-data-free-sql.service.ts',
      'ask-data-free-sql.module.ts',
      'ask-data-free-sql.controller.ts',
      'ask-data-free-sql-view-selector.ts',
    ];
    for (const file of files) {
      const source = readFileSync(resolve(__dirname, file), 'utf8');
      expect(source).not.toMatch(/from ['"].*\/brain\//);
      expect(source).not.toMatch(/from ['"].*\/agent-v\d\//);
      expect(source).not.toContain('BrainRelease');
      expect(source).not.toContain('AgentV3SemanticViewRegistryService');
    }
  });
});
