import { extractBrainReleaseDefinitionVersionIds } from './brain-release-definition-versions.js';

describe('extractBrainReleaseDefinitionVersionIds', () => {
  it('merges direct definition refs with the frozen evaluation ontology set', () => {
    expect(
      extractBrainReleaseDefinitionVersionIds([
        {
          definitionRefs: [{ versionId: 170 }, { versionId: 46 }],
          ontologyDefinitionVersionIds: [43, 46, 168, 170, 171, 172],
        } as never,
        {
          definitionRefs: [{ versionId: 49 }, { versionId: '48' }],
          ontologyDefinitionVersionIds: [0, -1, 'invalid'],
        } as never,
      ]),
    ).toEqual([43, 46, 48, 49, 168, 170, 171, 172]);
  });
});
