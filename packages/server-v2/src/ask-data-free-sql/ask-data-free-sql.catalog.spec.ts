import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ASK_DATA_FREE_SQL_VIEWS } from './ask-data-free-sql.catalog.js';

describe('Ask Data Free SQL catalog and independence', () => {
  it('registers 13 governed views with store and permission policies', () => {
    expect(ASK_DATA_FREE_SQL_VIEWS).toHaveLength(13);
    expect(new Set(ASK_DATA_FREE_SQL_VIEWS.map((view) => view.viewName)).size).toBe(13);
    for (const view of ASK_DATA_FREE_SQL_VIEWS) {
      expect(view.requiredPermissions.length).toBeGreaterThan(0);
      expect(view.storeScopeField).toBe('store_id');
      expect(view.fields.some((field) => field.name === 'store_id')).toBe(true);
    }
  });

  it('does not import Brain or Agent runtime modules', () => {
    const files = ['ask-data-free-sql.service.ts', 'ask-data-free-sql.module.ts', 'ask-data-free-sql.controller.ts'];
    for (const file of files) {
      const source = readFileSync(resolve(__dirname, file), 'utf8');
      expect(source).not.toMatch(/from ['"].*\/brain\//);
      expect(source).not.toMatch(/from ['"].*\/agent-v\d\//);
      expect(source).not.toContain('BrainRelease');
    }
  });
});
