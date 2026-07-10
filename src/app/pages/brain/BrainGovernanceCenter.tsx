import { BrainEvalCenter } from './components/BrainEvalCenter';
import { BrainFeedbackBoard } from './components/BrainFeedbackBoard';
import { BrainReleaseCenter } from './components/BrainReleaseCenter';
import { BrainRoleGovernance } from './components/BrainRoleGovernance';
import { BrainSemanticGovernance } from './components/BrainSemanticGovernance';
import { BrainSkillGovernance } from './components/BrainSkillGovernance';
import { BrainTraceViewer } from './components/BrainTraceViewer';

const tabs = ['会话追踪', '语义治理', '角色治理', '技能治理', '巡检治理', '评测中心', '发布中心', '反馈指标'];

export function BrainGovernanceCenter() {
  return (
    <div className="h-full overflow-auto bg-background p-6">
      <h1 className="text-xl font-semibold">Ami Brain 治理中心</h1>
      <div className="mt-6 grid grid-cols-4 gap-2 border-b border-border text-sm">
        {tabs.map((tab) => (
          <button key={tab} className="px-3 py-2 text-left hover:bg-muted">
            {tab}
          </button>
        ))}
      </div>
      <div className="mt-6 grid gap-6">
        <BrainTraceViewer />
        <BrainSemanticGovernance />
        <BrainRoleGovernance />
        <BrainSkillGovernance />
        <BrainEvalCenter />
        <BrainReleaseCenter />
        <BrainFeedbackBoard />
      </div>
    </div>
  );
}
