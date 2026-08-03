import { type ReactNode } from 'react';
import { Settings } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router';
import { cancelBrainGovernanceReads } from '@/api/brain';
import { Button } from '@/app/components/ui/button';
import { useStoreStore } from '@/stores/storeStore';
import { BrainEvalCenter } from './components/BrainEvalCenter';
import { BrainFeedbackBoard } from './components/BrainFeedbackBoard';
import { BrainInspectionGovernance } from './components/BrainInspectionGovernance';
import { BrainMemoryGovernance } from './components/BrainMemoryGovernance';
import { BrainReleaseCenter } from './components/BrainReleaseCenter';
import { BrainRolloutSequencePage } from './components/BrainRolloutSequencePage';
import { BrainRoleGovernance } from './components/BrainRoleGovernance';
import { BrainSemanticGovernance } from './components/BrainSemanticGovernance';
import { BrainQualityLatencyPanel } from './components/BrainQualityLatencyPanel';
import {
  BrainCapabilityGovernancePage,
  BrainGovernanceOverviewPage,
  BrainGovernanceTasksPage,
  BrainPolicySnapshotsPage,
} from './components/BrainGovernanceWorkbench';

const workbenchTabs = [
  { key: 'overview', label: '总览' },
  { key: 'capabilities', label: '能力' },
  { key: 'tasks', label: '任务' },
  { key: 'inspection', label: '巡检' },
] as const;

const qualityTabs = [
  { key: 'semantic', label: '语义' },
  { key: 'eval', label: '评测' },
  { key: 'feedback', label: '反馈' },
  { key: 'latency', label: '问答耗时' },
] as const;

const releaseTabs = [
  { key: 'policy', label: '治理策略（GP）' },
  { key: 'runtime', label: '运行版本（RT）' },
] as const;

const settingsTabs = [
  { key: 'roles', label: '角色与权限' },
  { key: 'memory', label: '记忆治理' },
] as const;

export function BrainGovernanceWorkbenchPage() {
  const navigate = useNavigate();
  const { activeTab, tabs } = useGovernanceTabs(workbenchTabs, 'overview');
  const currentStoreId = useStoreStore((state) => state.currentStoreId);

  return (
    <GovernanceContainer
      title="治理工作台"
      description="集中处理治理待办、能力准入、异步任务和巡检问题。"
      tabs={tabs}
      action={(
        <Button variant="outline" onClick={() => navigate('/brain-governance/settings?tab=roles')}>
          <Settings />
          高级设置
        </Button>
      )}
    >
      {activeTab === 'overview' ? <BrainGovernanceOverviewPage /> : null}
      {activeTab === 'capabilities' ? <BrainCapabilityGovernancePage /> : null}
      {activeTab === 'tasks' ? <BrainGovernanceTasksPage /> : null}
      {activeTab === 'inspection' && currentStoreId === null ? <StoreScopeRequiredPanel /> : null}
      {activeTab === 'inspection' && currentStoreId !== null ? <BrainInspectionGovernance /> : null}
    </GovernanceContainer>
  );
}

export function BrainGovernanceQualityPage() {
  const { activeTab, tabs } = useGovernanceTabs(qualityTabs, 'semantic');
  const currentStoreId = useStoreStore((state) => state.currentStoreId);
  return (
    <GovernanceContainer title="质量中心" description="统一管理语义口径、评测结果、用户反馈和真实问答耗时。" tabs={tabs}>
      {currentStoreId === null && activeTab !== 'latency' ? <StoreScopeRequiredPanel /> : null}
      {currentStoreId !== null && activeTab === 'semantic' ? <BrainSemanticGovernance /> : null}
      {currentStoreId !== null && activeTab === 'eval' ? <BrainEvalCenter /> : null}
      {currentStoreId !== null && activeTab === 'feedback' ? <BrainFeedbackBoard /> : null}
      {activeTab === 'latency' ? <BrainQualityLatencyPanel storeId={currentStoreId} /> : null}
    </GovernanceContainer>
  );
}

export function BrainGovernanceReleasesPage() {
  const { activeTab, tabs } = useGovernanceTabs(releaseTabs, 'policy');
  const [params] = useSearchParams();
  const legacyRuntime = params.get('legacy') === '1';
  return (
    <GovernanceContainer
      title="治理策略与运行版本"
      description="治理策略（GP）决定允许与禁止边界；运行版本（RT）决定用户问答实际装载的能力。两条编号线独立演进、组合切换。"
      tabs={tabs}
    >
      {activeTab === 'policy' ? <BrainPolicySnapshotsPage /> : null}
      {activeTab === 'runtime' && legacyRuntime ? <BrainReleaseCenter /> : null}
      {activeTab === 'runtime' && !legacyRuntime ? <BrainRolloutSequencePage /> : null}
    </GovernanceContainer>
  );
}

export function BrainGovernanceSettingsPage() {
  const { activeTab, tabs } = useGovernanceTabs(settingsTabs, 'roles');
  const currentStoreId = useStoreStore((state) => state.currentStoreId);
  return (
    <GovernanceContainer title="高级设置" description="低频治理配置集中管理，不占用日常治理侧栏。" tabs={tabs}>
      {activeTab === 'roles' ? <BrainRoleGovernance /> : null}
      {activeTab === 'memory' && currentStoreId === null ? <StoreScopeRequiredPanel /> : null}
      {activeTab === 'memory' && currentStoreId !== null ? <BrainMemoryGovernance /> : null}
    </GovernanceContainer>
  );
}

function StoreScopeRequiredPanel() {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 px-6 text-center" role="status">
      <h2 className="text-base font-medium">请先选择一个门店</h2>
      <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">当前处于“全部门店”上下文。该页面依赖门店语义、评测或记忆数据，选择门店后才会发送请求，避免出现必然失败的 X-Store-Id 错误。</p>
    </div>
  );
}

function GovernanceContainer({
  title,
  description,
  tabs,
  action,
  children,
}: {
  title: string;
  description: string;
  tabs: Array<{ key: string; label: string; active: boolean; onClick: () => void }>;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0 space-y-5">
      <header className="flex flex-col gap-4 border-b border-border pb-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>
      <div className="overflow-x-auto">
        <div className="inline-flex min-w-full gap-1 rounded-lg bg-muted p-1 sm:min-w-0" role="tablist" aria-label={`${title}页面`}>
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={tab.active}
              className={`min-w-24 flex-1 whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium transition sm:flex-none ${
                tab.active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={tab.onClick}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      <div className="min-w-0" role="tabpanel">{children}</div>
    </section>
  );
}

function useGovernanceTabs<const T extends readonly { key: string; label: string }[]>(tabs: T, defaultTab: T[number]['key']) {
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab');
  const activeTab = (tabs.some((tab) => tab.key === requested) ? requested : defaultTab) as T[number]['key'];
  return {
    activeTab,
    tabs: tabs.map((tab) => ({
      ...tab,
      active: activeTab === tab.key,
      onClick: () => {
        if (activeTab === tab.key) return;
        cancelBrainGovernanceReads();
        const next = new URLSearchParams(params);
        next.set('tab', tab.key);
        next.delete('page');
        next.delete('selectedId');
        setParams(next);
      },
    })),
  };
}
