import { useState } from 'react';
import { BrainEvalCenter } from './components/BrainEvalCenter';
import { BrainFeedbackBoard } from './components/BrainFeedbackBoard';
import { BrainInspectionGovernance } from './components/BrainInspectionGovernance';
import { BrainMemoryGovernance } from './components/BrainMemoryGovernance';
import { BrainModelPlanningGovernance } from './components/BrainModelPlanningGovernance';
import { BrainReleaseCenter } from './components/BrainReleaseCenter';
import { BrainRoleGovernance } from './components/BrainRoleGovernance';
import { BrainSemanticGovernance } from './components/BrainSemanticGovernance';
import { BrainSkillGovernance } from './components/BrainSkillGovernance';
import { BrainTraceViewer } from './components/BrainTraceViewer';

const tabs = [
  ['trace', '会话追踪'],
  ['planning', '模型规划'],
  ['semantic', '语义治理'],
  ['roles', '角色治理'],
  ['skills', '技能治理'],
  ['memory', '记忆治理'],
  ['inspection', '巡检治理'],
  ['eval', '评测中心'],
  ['release', '发布中心'],
  ['feedback', '反馈指标'],
] as const;

type TabKey = (typeof tabs)[number][0];

export function BrainGovernanceCenter() {
  const [activeTab, setActiveTab] = useState<TabKey>('trace');

  return (
    <div className="h-full min-w-0 overflow-auto bg-background">
      <header className="border-b border-border px-4 py-4 lg:px-6">
        <h1 className="text-xl font-semibold">Ami Brain 治理中心</h1>
        <p className="mt-1 text-sm text-muted-foreground">模型规划、能力审批、评测门禁、灰度发布、巡检与反馈闭环</p>
      </header>
      <nav aria-label="Ami Brain 治理工作区" className="border-b border-border px-4 py-2 lg:px-6">
        <div className="grid min-w-0 grid-cols-2 gap-1 sm:grid-cols-3 md:grid-cols-5 xl:grid-cols-10">
          {tabs.map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={activeTab === key}
              className={`min-w-0 rounded-md px-2 py-2 text-sm ${
                activeTab === key
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
              onClick={() => setActiveTab(key)}
            >
              <span className="block break-words">{label}</span>
            </button>
          ))}
        </div>
      </nav>
      <main className="min-w-0 p-4 lg:p-6">{renderTab(activeTab)}</main>
    </div>
  );
}

function renderTab(activeTab: TabKey) {
  switch (activeTab) {
    case 'trace':
      return <BrainTraceViewer />;
    case 'planning':
      return <BrainModelPlanningGovernance />;
    case 'semantic':
      return <BrainSemanticGovernance />;
    case 'roles':
      return <BrainRoleGovernance />;
    case 'skills':
      return <BrainSkillGovernance />;
    case 'memory':
      return <BrainMemoryGovernance />;
    case 'inspection':
      return <BrainInspectionGovernance />;
    case 'eval':
      return <BrainEvalCenter />;
    case 'release':
      return <BrainReleaseCenter />;
    case 'feedback':
      return <BrainFeedbackBoard />;
  }
}
