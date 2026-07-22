import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { cancelBrainGovernanceReads } from '@/api/brain';
import { BrainEvalCenter } from './components/BrainEvalCenter';
import { BrainFeedbackBoard } from './components/BrainFeedbackBoard';
import { BrainInspectionGovernance } from './components/BrainInspectionGovernance';
import { BrainMemoryGovernance } from './components/BrainMemoryGovernance';
import { BrainModelPlanningGovernance } from './components/BrainModelPlanningGovernance';
import { BrainReleaseCenter } from './components/BrainReleaseCenter';
import { BrainRoleGovernance } from './components/BrainRoleGovernance';
import { BrainSemanticGovernance } from './components/BrainSemanticGovernance';
import { BrainSkillGovernance } from './components/BrainSkillGovernance';
import { resolveBrainGovernanceSection, type BrainGovernanceSectionKey } from './brainGovernanceNavigation';

export function BrainGovernanceCenter() {
  const location = useLocation();
  const activeSection = resolveBrainGovernanceSection(location.pathname);

  useEffect(() => () => cancelBrainGovernanceReads(), [activeSection]);

  return (
    <div className="h-full min-w-0 overflow-auto bg-background">
      <main className="min-w-0 p-4 lg:p-6">{renderSection(activeSection)}</main>
    </div>
  );
}

function renderSection(activeSection: BrainGovernanceSectionKey) {
  switch (activeSection) {
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
