import { useEffect } from 'react';
import { Link, Navigate, useLocation } from 'react-router';
import { cancelBrainGovernanceReads } from '@/api/brain';
import { Badge } from '@/app/components/ui/badge';
import {
  BrainGovernanceQualityPage,
  BrainGovernanceReleasesPage,
  BrainGovernanceSettingsPage,
  BrainGovernanceWorkbenchPage,
} from './BrainGovernanceContainerPages';
import { BrainEvalCenter } from './components/BrainEvalCenter';
import { BrainFeedbackBoard } from './components/BrainFeedbackBoard';
import { BrainInspectionGovernance } from './components/BrainInspectionGovernance';
import { BrainMemoryGovernance } from './components/BrainMemoryGovernance';
import { BrainModelPlanningGovernance } from './components/BrainModelPlanningGovernance';
import { BrainReleaseCenter } from './components/BrainReleaseCenter';
import { BrainRoleGovernance } from './components/BrainRoleGovernance';
import { BrainSemanticGovernance } from './components/BrainSemanticGovernance';
import { BrainSkillGovernance } from './components/BrainSkillGovernance';
import {
  BrainCapabilityGovernancePage,
  BrainGovernanceOverviewPage,
  BrainGovernanceTasksPage,
  BrainPolicySnapshotsPage,
} from './components/BrainGovernanceWorkbench';
import {
  BRAIN_GOVERNANCE_UI_MODE,
  BRAIN_GOVERNANCE_UI_MODE_SOURCE,
  resolveBrainGovernanceRoute,
  type BrainGovernanceRouteResolution,
  type BrainGovernanceSectionKey,
} from './brainGovernanceNavigation';

export function BrainGovernanceCenter() {
  const location = useLocation();
  const resolution = resolveBrainGovernanceRoute(location.pathname, location.search);
  const routeIdentity = resolution.type === 'render' ? resolution.section : resolution.to;
  const isLegacyDirect = resolution.type === 'render' && resolution.legacy;

  useEffect(() => () => cancelBrainGovernanceReads(), [routeIdentity]);
  useEffect(() => {
    if (isLegacyDirect) {
      recordLegacyGovernanceAccess({
        sourceRoute: location.pathname,
        targetRoute: location.pathname,
        accessMode: 'direct',
      });
    }
  }, [isLegacyDirect, location.pathname]);

  if (resolution.type === 'redirect') {
    return <LegacyGovernanceRedirect resolution={resolution} />;
  }

  const content = renderSection(resolution.section, resolution.legacy);
  const redirectTarget = resolution.legacy
    ? resolveBrainGovernanceRoute(location.pathname, location.search, 'redirect')
    : null;

  return (
    <div className="h-full min-w-0 overflow-auto bg-background">
      <main className="min-w-0 p-4 lg:p-6">
        <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground" aria-label="治理界面模式">
          <span>治理界面模式</span>
          <Badge variant={BRAIN_GOVERNANCE_UI_MODE === 'manage' ? 'default' : 'secondary'}>
            {BRAIN_GOVERNANCE_UI_MODE === 'manage' ? 'Manage 管理' : BRAIN_GOVERNANCE_UI_MODE === 'legacy' ? 'Legacy 回滚' : 'Shadow 只读'}
          </Badge>
          <span>{BRAIN_GOVERNANCE_UI_MODE_SOURCE === 'explicit' ? '环境变量显式配置' : BRAIN_GOVERNANCE_UI_MODE_SOURCE === 'default_invalid' ? '配置值无效，已安全回退' : '未配置，已安全回退'}</span>
        </div>
        {resolution.legacy && redirectTarget?.type === 'redirect' ? (
          <div className="mb-4 flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between" role="status">
            <span>这是旧版治理直达入口，仅用于灰度回滚；对应功能已迁入新的治理工作台。</span>
            <Link className="shrink-0 font-medium underline underline-offset-2" to={redirectTarget.to}>前往合并页面</Link>
          </div>
        ) : null}
        {content}
      </main>
    </div>
  );
}

function renderSection(activeSection: BrainGovernanceSectionKey, legacy = false) {
  switch (activeSection) {
    case 'workbench':
      return <BrainGovernanceWorkbenchPage />;
    case 'quality':
      return <BrainGovernanceQualityPage />;
    case 'releases':
      return <BrainGovernanceReleasesPage />;
    case 'settings':
      return <BrainGovernanceSettingsPage />;
    case 'overview':
      return <BrainGovernanceOverviewPage />;
    case 'capabilities':
      return <BrainCapabilityGovernancePage />;
    case 'tasks':
      return <BrainGovernanceTasksPage />;
    case 'policy-snapshots':
      return <BrainPolicySnapshotsPage />;
    case 'runtime-releases':
      return <BrainReleaseCenter historicalOnly={legacy} />;
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
      return <BrainReleaseCenter historicalOnly={legacy} />;
    case 'feedback':
      return <BrainFeedbackBoard />;
  }
}

function LegacyGovernanceRedirect({ resolution }: { resolution: Extract<BrainGovernanceRouteResolution, { type: 'redirect' }> }) {
  useEffect(() => {
    recordLegacyGovernanceAccess({
      sourceRoute: resolution.source,
      targetRoute: resolution.to,
      accessMode: 'redirect',
    });
  }, [resolution.source, resolution.to]);

  return <Navigate to={resolution.to} replace state={{ legacyGovernanceSource: resolution.source }} />;
}

function recordLegacyGovernanceAccess(input: {
  sourceRoute: string;
  targetRoute: string;
  accessMode: 'direct' | 'redirect';
}) {
  try {
    const key = 'ami-brain-governance-legacy-route-events';
    const current = JSON.parse(window.sessionStorage.getItem(key) ?? '[]') as unknown;
    const events = Array.isArray(current) ? current.slice(-49) : [];
    const event = {
      ...input,
      automated: Boolean(window.navigator.webdriver),
      createdAt: new Date().toISOString(),
    };
    events.push(event);
    window.sessionStorage.setItem(key, JSON.stringify(events));
    window.dispatchEvent(new window.CustomEvent('brain-governance:legacy-route', { detail: event }));
  } catch {
    // 兼容统计失败不能阻断治理页面访问。
  }
}
