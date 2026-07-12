import { useState } from 'react';
import { createBrainSemanticResource, listBrainSemanticResource, updateBrainSemanticResource } from '@/api/brain';
import { BrainResourceGovernancePanel } from './BrainResourceGovernancePanel';

const resources = {
  metrics: {
    title: '指标版本',
    resourceType: 'metric',
    keyField: 'metricKey',
    example: { metricKey: 'new_metric', name: '新指标', domain: 'store', formula: { operation: 'sum' }, sourceTables: ['Table'], permissions: ['core:dashboard:view'], description: '指标定义' },
  },
  entities: {
    title: '实体版本',
    resourceType: 'ontology_entity',
    keyField: 'entityKey',
    example: { entityKey: 'new_entity', name: '新实体', domain: 'store', synonyms: [], attributes: {}, tableMap: { table: 'Table' } },
  },
  relations: {
    title: '关系版本',
    resourceType: 'ontology_relation',
    keyField: 'relationKey',
    example: { relationKey: 'entity_relation', name: '实体关系', fromEntityKey: 'from', toEntityKey: 'to', joinPath: {} },
  },
} as const;

export function BrainSemanticGovernance() {
  const [resource, setResource] = useState<keyof typeof resources>('metrics');
  const config = resources[resource];
  return (
    <div>
      <div className="mb-4 flex gap-1 border-b border-border">
        {Object.keys(resources).map((key) => (
          <button key={key} type="button" className={`px-3 py-2 text-sm ${resource === key ? 'border-b-2 border-primary text-foreground' : 'text-muted-foreground'}`} onClick={() => setResource(key as keyof typeof resources)}>
            {resources[key as keyof typeof resources].title}
          </button>
        ))}
      </div>
      <BrainResourceGovernancePanel
        title={config.title}
        description="修改会创建新草稿版本，已发布版本不会被覆盖。"
        resourceType={config.resourceType}
        keyField={config.keyField}
        example={config.example}
        loadActive={() => listBrainSemanticResource(resource)}
        createResource={(payload) => createBrainSemanticResource(resource, payload)}
        updateResource={(key, payload) => updateBrainSemanticResource(resource, key, payload)}
      />
    </div>
  );
}
