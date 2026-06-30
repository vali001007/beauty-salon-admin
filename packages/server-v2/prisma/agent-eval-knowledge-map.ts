import {
  applyKnowledgeMapGate,
  readKnowledgeMapEvalReport,
  runKnowledgeMapEval,
  writeKnowledgeMapEvalReport,
} from '../src/agent/agent-eval-knowledge-map.js';
import type { KnowledgeMapGateLevel } from '../src/agent/agent-eval-knowledge-map.js';
import type { AgentPersonaCode } from '../src/agent/agent.types.js';

type Args = {
  persona?: AgentPersonaCode;
  capability?: string;
  gate?: KnowledgeMapGateLevel;
  baseline?: string;
  output?: string;
};

async function main() {
  const args = parseArgs();
  const baselineReport = args.gate === 'p2'
    ? readKnowledgeMapEvalReport(args.baseline ?? args.output)
    : null;
  let report = await runKnowledgeMapEval({
    persona: args.persona,
    capability: args.capability,
  });
  if (args.gate) {
    report = applyKnowledgeMapGate(report, {
      level: args.gate,
      baselineReport,
    });
  }
  const outputPath = writeKnowledgeMapEvalReport(report, args.output);
  console.log(
    JSON.stringify(
      {
        summary: report.summary,
        gate: report.gate,
        filters: report.filters,
        improvementBacklogCount: report.improvementBacklog.length,
        outputPath,
      },
      null,
      2,
    ),
  );
  if (report.summary.failed > 0 || report.gate?.passed === false) process.exitCode = 1;
}

function parseArgs(): Args {
  const values = new Map<string, string>();
  for (const raw of process.argv.slice(2)) {
    if (!raw.startsWith('--') || !raw.includes('=')) continue;
    const [key, ...rest] = raw.replace(/^--/, '').split('=');
    values.set(key, rest.join('='));
  }
  const persona = values.get('persona') as AgentPersonaCode | undefined;
  const supportedPersonas: AgentPersonaCode[] = ['manager', 'marketing', 'reception', 'beautician', 'inventory', 'finance'];
  if (persona && !supportedPersonas.includes(persona)) {
    throw new Error(`--persona must be one of ${supportedPersonas.join(', ')}`);
  }
  const gate = values.get('gate') as KnowledgeMapGateLevel | undefined;
  const supportedGates: KnowledgeMapGateLevel[] = ['p0', 'p1', 'p2'];
  if (gate && !supportedGates.includes(gate)) {
    throw new Error(`--gate must be one of ${supportedGates.join(', ')}`);
  }
  return {
    persona,
    capability: values.get('capability'),
    gate,
    baseline: values.get('baseline'),
    output: values.get('output'),
  };
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
