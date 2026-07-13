import { useState } from 'react';
import { BrainEvalCenter } from './components/BrainEvalCenter';
import { BrainFeedbackBoard } from './components/BrainFeedbackBoard';
import { BrainInspectionGovernance } from './components/BrainInspectionGovernance';
import { BrainReleaseCenter } from './components/BrainReleaseCenter';
import { BrainRoleGovernance } from './components/BrainRoleGovernance';
import { BrainSemanticGovernance } from './components/BrainSemanticGovernance';
import { BrainSkillGovernance } from './components/BrainSkillGovernance';
import { BrainTraceViewer } from './components/BrainTraceViewer';
import { BrainMemoryGovernance } from './components/BrainMemoryGovernance';

const tabs = [
  ['trace', '会话追踪'], ['semantic', '语义治理'], ['roles', '角色治理'], ['skills', '技能治理'], ['memory', '记忆治理'],
  ['inspection', '巡检治理'], ['eval', '评测中心'], ['release', '发布中心'], ['feedback', '反馈指标'],
] as const;
type TabKey = typeof tabs[number][0];

export function BrainGovernanceCenter() {
  const [activeTab, setActiveTab] = useState<TabKey>('trace');
  const content = activeTab === 'trace' ? <BrainTraceViewer />
    : activeTab === 'semantic' ? <BrainSemanticGovernance />
      : activeTab === 'roles' ? <BrainRoleGovernance />
        : activeTab === 'skills' ? <BrainSkillGovernance />
          : activeTab === 'memory' ? <BrainMemoryGovernance />
            : activeTab === 'inspection' ? <BrainInspectionGovernance />
              : activeTab === 'eval' ? <BrainEvalCenter />
                : activeTab === 'release' ? <BrainReleaseCenter />
                  : <BrainFeedbackBoard />;
  return <div className="h-full overflow-auto bg-background"><div className="border-b border-border px-4 py-4 lg:px-6"><h1 className="text-xl font-semibold">Ami Brain 治理中心</h1><p className="mt-1 text-sm text-muted-foreground">资源版本、评测门禁、灰度发布、巡检与反馈闭环</p></div><div className="overflow-x-auto border-b border-border px-4 lg:px-6"><div className="flex min-w-max gap-1">{tabs.map(([key, label]) => <button key={key} type="button" className={`px-3 py-3 text-sm ${activeTab === key ? 'border-b-2 border-primary text-foreground' : 'text-muted-foreground hover:text-foreground'}`} onClick={() => setActiveTab(key)}>{label}</button>)}</div></div><div className="p-4 lg:p-6">{content}</div></div>;
}
