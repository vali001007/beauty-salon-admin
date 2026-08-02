import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ACTION_PREDICATE_EFFECT_SCHEMA_VERSION,
  CURATED_ACTION_EFFECT_CATALOG,
  CURATED_ACTION_PREDICATE_CATALOG,
} from './brain-action-predicate-effect-catalog.js';

describe('Ami Brain Action Predicate/Effect manifest', () => {
  it('matches the runtime catalog exactly', () => {
    const manifest = JSON.parse(
      readFileSync(
        resolve(process.cwd(), 'scripts/fixtures/ami-brain-action-predicate-effect-manifest-v1.json'),
        'utf8',
      ),
    ) as {
      schemaVersion: string;
      catalogSchemaVersion: string;
      catalogSource: { path: string; checksum: string };
      evaluatorSource: { path: string; checksum: string };
      predicates: Array<{ key: string; version: number; fingerprint: string }>;
      effects: Array<{ key: string; version: number; fingerprint: string }>;
    };

    expect(manifest.schemaVersion).toBe('ami-brain-action-predicate-effect-manifest/v1');
    expect(manifest.catalogSchemaVersion).toBe(ACTION_PREDICATE_EFFECT_SCHEMA_VERSION);
    for (const source of [manifest.catalogSource, manifest.evaluatorSource]) {
      expect(
        createHash('sha256')
          .update(readFileSync(resolve(process.cwd(), '../..', source.path)))
          .digest('hex'),
      ).toBe(source.checksum);
    }
    expect(manifest.predicates).toEqual(
      CURATED_ACTION_PREDICATE_CATALOG.map(({ key, version, fingerprint }) => ({ key, version, fingerprint })),
    );
    expect(manifest.effects).toEqual(
      CURATED_ACTION_EFFECT_CATALOG.map(({ key, version, fingerprint }) => ({ key, version, fingerprint })),
    );
  });
});
