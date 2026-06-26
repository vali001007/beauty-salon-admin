export type AgentE2eGroup = 'all' | 'memory_archive' | 'automation_engine';

export type AgentE2eEndpointCheck = {
  key: string;
  method: 'GET' | 'POST';
  path: string;
  task: 'T6.7' | 'T7.13' | 'T6.7/T7.13';
  group: AgentE2eGroup;
};

export const agentE2eReadChecks: AgentE2eEndpointCheck[] = [
  { key: 'schema-readiness', method: 'GET', path: '/agent/schema-readiness', task: 'T6.7/T7.13', group: 'all' },
  { key: 'memories', method: 'GET', path: '/agent/memories?personaCode={personaCode}&limit=5', task: 'T6.7', group: 'memory_archive' },
  { key: 'daily-archives', method: 'GET', path: '/agent/daily-archives?personaCode={personaCode}&pageSize=3', task: 'T6.7', group: 'memory_archive' },
  { key: 'quality-report', method: 'GET', path: '/agent/quality-report?personaCode={personaCode}&days=7', task: 'T6.7', group: 'memory_archive' },
  { key: 'automation-triggers', method: 'GET', path: '/agent/automations/triggers', task: 'T7.13', group: 'automation_engine' },
  { key: 'automations', method: 'GET', path: '/agent/automations?personaCode={personaCode}&pageSize=3', task: 'T7.13', group: 'automation_engine' },
  { key: 'automation-runs', method: 'GET', path: '/agent/automations/runs?personaCode={personaCode}&pageSize=3', task: 'T7.13', group: 'automation_engine' },
  { key: 'automation-effects', method: 'GET', path: '/agent/automations/effects?pageSize=3', task: 'T7.13', group: 'automation_engine' },
];

export const agentE2eWriteChecks: AgentE2eEndpointCheck[] = [
  { key: 'create-memory', method: 'POST', path: '/agent/memories', task: 'T6.7', group: 'memory_archive' },
  { key: 'generate-archive', method: 'POST', path: '/agent/daily-archives/generate', task: 'T6.7', group: 'memory_archive' },
  { key: 'create-automation-draft', method: 'POST', path: '/agent/automations/drafts', task: 'T7.13', group: 'automation_engine' },
  { key: 'manual-run-automation', method: 'POST', path: '/agent/automations/{id}/run', task: 'T7.13', group: 'automation_engine' },
  { key: 'list-pending-approvals', method: 'GET', path: '/agent/automations/pending-approvals', task: 'T7.13', group: 'automation_engine' },
  { key: 'approve-automation-run', method: 'POST', path: '/agent/automations/runs/{id}/approve', task: 'T7.13', group: 'automation_engine' },
  { key: 'reject-automation-run', method: 'POST', path: '/agent/automations/runs/{id}/reject', task: 'T7.13', group: 'automation_engine' },
  { key: 'recover-automation', method: 'POST', path: '/agent/automations/{id}/recover', task: 'T7.13', group: 'automation_engine' },
  { key: 'attribute-automation-effect', method: 'POST', path: '/agent/automations/effects/attribute', task: 'T7.13', group: 'automation_engine' },
  { key: 'run-due-automations', method: 'POST', path: '/agent/automations/due/run', task: 'T7.13', group: 'automation_engine' },
  { key: 'evaluate-automation-event', method: 'POST', path: '/agent/automations/events/evaluate', task: 'T7.13', group: 'automation_engine' },
];

export function filterAgentE2eChecks(checks: AgentE2eEndpointCheck[], group: AgentE2eGroup) {
  return checks.filter((check) => check.group === 'all' || group === 'all' || check.group === group);
}
