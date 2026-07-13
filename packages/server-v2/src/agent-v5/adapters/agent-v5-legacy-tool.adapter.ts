import { Injectable } from '@nestjs/common';
import type { AgentV5AdapterResult } from '../agent-v5.types.js';

@Injectable()
export class AgentV5LegacyToolAdapter {
  unsupported(toolName: string): AgentV5AdapterResult {
    return {
      status: 'blocked',
      title: '旧版本入口不可直接调用',
      summary: `Agent V5 不直接调用 ${toolName} 的 Agent 运行入口。需要复用能力时，必须通过 V5 adapter 调用底层服务。`,
      evidence: {
        sources: ['AgentV5BoundaryPolicy'],
        domains: ['governance'],
        concepts: ['agent_version_boundary'],
        filters: [`blockedTool=${toolName}`],
        sampleSize: 0,
        limitations: ['禁止递归调用 /agent-v2、/agent-v3、/agent-v4 或旧 orchestrator。'],
      },
      renderedBlocks: [{
        kind: 'permission_notice',
        title: '版本边界阻断',
        message: `已阻断对 ${toolName} 的直接调用。`,
      }],
    };
  }
}
