import { Suspense } from 'react';
import { Navigate, createBrowserRouter } from 'react-router';
import { Layout } from './components/Layout';
import { AuthGuard } from './components/AuthGuard';
import { PermissionGuard } from './components/PermissionGuard';
import { lazyWithRetry } from './components/LazyRetry';
import { PageSkeleton } from '@/app/components/ui/loading-skeleton';
import { RouteErrorPage } from './pages/RouteErrorPage';

// Lazy-loaded page components
const LoginPage = lazyWithRetry(() => import('./pages/LoginPage').then(m => ({ default: m.LoginPage })), 'LoginPage');
const RegisterPage = lazyWithRetry(() => import('./pages/RegisterPage').then(m => ({ default: m.RegisterPage })), 'RegisterPage');
const Dashboard = lazyWithRetry(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })), 'Dashboard');
const AskDataWorkbench = lazyWithRetry(() => import('./pages/ask-data/AskDataWorkbench').then(m => ({ default: m.AskDataWorkbench })), 'AskDataWorkbench');
const BrainWorkspace = lazyWithRetry(() => import('./pages/brain/BrainWorkspace').then(m => ({ default: m.BrainWorkspace })), 'BrainWorkspace');
const BrainGovernanceCenter = lazyWithRetry(() => import('./pages/brain/BrainGovernanceCenter').then(m => ({ default: m.BrainGovernanceCenter })), 'BrainGovernanceCenter');
const CustomerData = lazyWithRetry(() => import('./pages/CustomerData').then(m => ({ default: m.CustomerData })), 'CustomerData');
const CustomerFeedbackWorkbench = lazyWithRetry(() => import('./pages/CustomerFeedbackWorkbench').then(m => ({ default: m.CustomerFeedbackWorkbench })), 'CustomerFeedbackWorkbench');
const CustomerInvitationScript = lazyWithRetry(() => import('./pages/CustomerInvitationScript').then(m => ({ default: m.CustomerInvitationScript })), 'CustomerInvitationScript');
const ProjectManagement = lazyWithRetry(() => import('./pages/ProjectManagement').then(m => ({ default: m.ProjectManagement })), 'ProjectManagement');
const Scheduling = lazyWithRetry(() => import('./pages/Scheduling').then(m => ({ default: m.Scheduling })), 'Scheduling');
const CardManagement = lazyWithRetry(() => import('./pages/CardManagement').then(m => ({ default: m.CardManagement })), 'CardManagement');
const CardOrderManagement = lazyWithRetry(() => import('./pages/CardOrderManagement').then(m => ({ default: m.CardOrderManagement })), 'CardOrderManagement');
const ProjectTypeManagement = lazyWithRetry(() => import('./pages/ProjectTypeManagement').then(m => ({ default: m.ProjectTypeManagement })), 'ProjectTypeManagement');
const BeauticianManagement = lazyWithRetry(() => import('./pages/BeauticianManagement').then(m => ({ default: m.BeauticianManagement })), 'BeauticianManagement');
const BeauticianLevelSettings = lazyWithRetry(() => import('./pages/BeauticianLevelSettings').then(m => ({ default: m.BeauticianLevelSettings })), 'BeauticianLevelSettings');
const UserProfile = lazyWithRetry(() => import('./pages/UserProfile').then(m => ({ default: m.UserProfile })), 'UserProfile');
const ProjectReservation = lazyWithRetry(() => import('./pages/ProjectReservation').then(m => ({ default: m.ProjectReservation })), 'ProjectReservation');
const CardVerification = lazyWithRetry(() => import('./pages/CardVerification').then(m => ({ default: m.CardVerification })), 'CardVerification');
const ProductManagement = lazyWithRetry(() => import('./pages/ProductManagement').then(m => ({ default: m.ProductManagement })), 'ProductManagement');
const GoodsProductManagement = lazyWithRetry(() => import('./pages/GoodsProductManagement').then(m => ({ default: m.GoodsProductManagement })), 'GoodsProductManagement');
const StockManagement = lazyWithRetry(() => import('./pages/StockManagement').then(m => ({ default: m.StockManagement })), 'StockManagement');
const PurchaseManagement = lazyWithRetry(() => import('./pages/PurchaseManagement').then(m => ({ default: m.PurchaseManagement })), 'PurchaseManagement');
const ExpiryManagement = lazyWithRetry(() => import('./pages/ExpiryManagement').then(m => ({ default: m.ExpiryManagement })), 'ExpiryManagement');
const StoreTransfer = lazyWithRetry(() => import('./pages/StoreTransfer').then(m => ({ default: m.StoreTransfer })), 'StoreTransfer');
const ServiceConsumption = lazyWithRetry(() => import('./pages/ServiceConsumption').then(m => ({ default: m.ServiceConsumption })), 'ServiceConsumption');
const MarketingStrategy = lazyWithRetry(() => import('./pages/MarketingStrategy').then(m => ({ default: m.MarketingStrategy })), 'MarketingStrategy');
const MarketingWorkbench = lazyWithRetry(() => import('./pages/MarketingWorkbench').then(m => ({ default: m.MarketingWorkbench })), 'MarketingWorkbench');
const MarketingRecommendation = lazyWithRetry(() => import('./pages/MarketingRecommendation').then(m => ({ default: m.MarketingRecommendation })), 'MarketingRecommendation');
const MarketingPageManagement = lazyWithRetry(() => import('./pages/MarketingPageManagement').then(m => ({ default: m.MarketingPageManagement })), 'MarketingPageManagement');
const PromotionManagement = lazyWithRetry(() => import('./pages/PromotionManagement').then(m => ({ default: m.PromotionManagement })), 'PromotionManagement');
const AmiGlowManagement = lazyWithRetry(() => import('./pages/AmiGlowManagement').then(m => ({ default: m.AmiGlowManagement })), 'AmiGlowManagement');
const MarketingAssets = lazyWithRetry(() => import('./pages/MarketingAssets').then(m => ({ default: m.MarketingAssets })), 'MarketingAssets');
const CreateMarketing = lazyWithRetry(() => import('./pages/CreateMarketing').then(m => ({ default: m.CreateMarketing })), 'CreateMarketing');
const MarketingRuleLibrary = lazyWithRetry(() => import('./pages/MarketingRuleLibrary').then(m => ({ default: m.MarketingRuleLibrary })), 'MarketingRuleLibrary');
const MarketingAnalytics = lazyWithRetry(() => import('./pages/MarketingAnalytics').then(m => ({ default: m.MarketingAnalytics })), 'MarketingAnalytics');
const MarketingActivityEffect = lazyWithRetry(() => import('./pages/MarketingActivityEffect').then(m => ({ default: m.MarketingActivityEffect })), 'MarketingActivityEffect');
const GoodsTypeManagement = lazyWithRetry(() => import('./pages/GoodsTypeManagement').then(m => ({ default: m.GoodsTypeManagement })), 'GoodsTypeManagement');
const ProductOrderManagement = lazyWithRetry(() => import('./pages/ProductOrderManagement').then(m => ({ default: m.ProductOrderManagement })), 'ProductOrderManagement');
const ProjectOrderManagement = lazyWithRetry(() => import('./pages/ProjectOrderManagement').then(m => ({ default: m.ProjectOrderManagement })), 'ProjectOrderManagement');
const MemberCardManagement = lazyWithRetry(() => import('./pages/MemberCardManagement').then(m => ({ default: m.MemberCardManagement })), 'MemberCardManagement');
const MemberCardDeductRecords = lazyWithRetry(() => import('./pages/MemberCardDeductRecords').then(m => ({ default: m.MemberCardDeductRecords })), 'MemberCardDeductRecords');
const UserManagement = lazyWithRetry(() => import('./pages/system/UserManagement').then(m => ({ default: m.UserManagement })), 'UserManagement');
const RoleManagement = lazyWithRetry(() => import('./pages/system/RoleManagement').then(m => ({ default: m.RoleManagement })), 'RoleManagement');
const PermissionManagement = lazyWithRetry(() => import('./pages/system/PermissionManagement').then(m => ({ default: m.PermissionManagement })), 'PermissionManagement');
const StoreSettings = lazyWithRetry(() => import('./pages/system/StoreSettings').then(m => ({ default: m.StoreSettings })), 'StoreSettings');
const DeviceManagement = lazyWithRetry(() => import('./pages/system/DeviceManagement').then(m => ({ default: m.DeviceManagement })), 'DeviceManagement');
const AiAuditPage = lazyWithRetry(() => import('./pages/system/AiAuditPage').then(m => ({ default: m.AiAuditPage })), 'AiAuditPage');
const AgentGovernanceCenter = lazyWithRetry(() => import('./pages/system/AgentGovernanceCenter').then(m => ({ default: m.AgentGovernanceCenter })), 'AgentGovernanceCenter');
const AgentCapabilityCenter = lazyWithRetry(() => import('./pages/system/AgentCapabilityCenter').then(m => ({ default: m.AgentCapabilityCenter })), 'AgentCapabilityCenter');
const BusinessDefinitionCenter = lazyWithRetry(() => import('./pages/system/BusinessDefinitionCenter').then(m => ({ default: m.BusinessDefinitionCenter })), 'BusinessDefinitionCenter');
const AmiAgentWorkspace = lazyWithRetry(() => import('./pages/ami-agent/AmiAgentWorkspace').then(m => ({ default: m.AmiAgentWorkspace })), 'AmiAgentWorkspace');
const FinanceOverview = lazyWithRetry(() => import('./pages/finance/FinanceOverview').then(m => ({ default: m.FinanceOverview })), 'FinanceOverview');
const CashierReconciliation = lazyWithRetry(() => import('./pages/finance/CashierReconciliation').then(m => ({ default: m.CashierReconciliation })), 'CashierReconciliation');
const StaffCommissionWorkbench = lazyWithRetry(() => import('./pages/finance/StaffCommissionWorkbench').then(m => ({ default: m.StaffCommissionWorkbench })), 'StaffCommissionWorkbench');
const ProfitWorkbench = lazyWithRetry(() => import('./pages/finance/ProfitWorkbench').then(m => ({ default: m.ProfitWorkbench })), 'ProfitWorkbench');
const MemberAssets = lazyWithRetry(() => import('./pages/finance/MemberAssets').then(m => ({ default: m.MemberAssets })), 'MemberAssets');
const CommissionRules = lazyWithRetry(() => import('./pages/finance/CommissionRules').then(m => ({ default: m.CommissionRules })), 'CommissionRules');
const CommissionRecords = lazyWithRetry(() => import('./pages/finance/CommissionRecords').then(m => ({ default: m.CommissionRecords })), 'CommissionRecords');
const MonthlySettlement = lazyWithRetry(() => import('./pages/finance/MonthlySettlement').then(m => ({ default: m.MonthlySettlement })), 'MonthlySettlement');
const DailySettlement = lazyWithRetry(() => import('./pages/finance/DailySettlement').then(m => ({ default: m.DailySettlement })), 'DailySettlement');
const DailyClose = lazyWithRetry(() => import('./pages/finance/DailyClose').then(m => ({ default: m.DailyClose })), 'DailyClose');
const AmiPerformance = lazyWithRetry(() => import('./pages/finance/AmiPerformance').then(m => ({ default: m.AmiPerformance })), 'AmiPerformance');
const AmiBilling = lazyWithRetry(() => import('./pages/finance/AmiBilling').then(m => ({ default: m.AmiBilling })), 'AmiBilling');
const PlatformRevenue = lazyWithRetry(() => import('./pages/finance/PlatformRevenue').then(m => ({ default: m.PlatformRevenue })), 'PlatformRevenue');
const OperationProfitOverview = lazyWithRetry(() => import('./pages/operation-profit/OperationProfitOverview').then(m => ({ default: m.OperationProfitOverview })), 'OperationProfitOverview');
const ProductMarginAnalysis = lazyWithRetry(() => import('./pages/operation-profit/ProductMarginAnalysis').then(m => ({ default: m.ProductMarginAnalysis })), 'ProductMarginAnalysis');
const ProjectMarginAnalysis = lazyWithRetry(() => import('./pages/operation-profit/ProjectMarginAnalysis').then(m => ({ default: m.ProjectMarginAnalysis })), 'ProjectMarginAnalysis');
const PrepaidLiabilityAnalysis = lazyWithRetry(() => import('./pages/operation-profit/PrepaidLiabilityAnalysis').then(m => ({ default: m.PrepaidLiabilityAnalysis })), 'PrepaidLiabilityAnalysis');
const CardPackageLiabilityAnalysis = lazyWithRetry(() => import('./pages/operation-profit/PrepaidLiabilityAnalysis').then(m => ({ default: m.CardPackageLiabilityAnalysis })), 'CardPackageLiabilityAnalysis');
const BeauticianPerformance = lazyWithRetry(() => import('./pages/operation-profit/BeauticianPerformance').then(m => ({ default: m.BeauticianPerformance })), 'BeauticianPerformance');
const OperationCostSettings = lazyWithRetry(() => import('./pages/operation-profit/OperationCostSettings').then(m => ({ default: m.OperationCostSettings })), 'OperationCostSettings');
const SupplyPlatformMvp = lazyWithRetry(() => import('./pages/supply-platform/SupplyPlatformMvp').then(m => ({ default: m.SupplyPlatformMvp })), 'SupplyPlatformMvp');
const IndustryServiceTemplates = lazyWithRetry(() => import('./pages/IndustryDataPlatform').then(m => ({ default: m.IndustryServiceTemplates })), 'IndustryServiceTemplates');
const IndustryProductTemplates = lazyWithRetry(() => import('./pages/IndustryDataPlatform').then(m => ({ default: m.IndustryProductTemplates })), 'IndustryProductTemplates');
const IndustryBomTemplates = lazyWithRetry(() => import('./pages/IndustryDataPlatform').then(m => ({ default: m.IndustryBomTemplates })), 'IndustryBomTemplates');
const IndustryKnowledge = lazyWithRetry(() => import('./pages/IndustryDataPlatform').then(m => ({ default: m.IndustryKnowledge })), 'IndustryKnowledge');
const IndustrySalaryBenchmarks = lazyWithRetry(() => import('./pages/IndustryDataPlatform').then(m => ({ default: m.IndustrySalaryBenchmarks })), 'IndustrySalaryBenchmarks');
const IndustryDataSources = lazyWithRetry(() => import('./pages/IndustryDataPlatform').then(m => ({ default: m.IndustryDataSources })), 'IndustryDataSources');
const IndustryAdoptions = lazyWithRetry(() => import('./pages/IndustryDataPlatform').then(m => ({ default: m.IndustryAdoptions })), 'IndustryAdoptions');

// Placeholder for unbuilt pages
const Placeholder = ({ title }: { title: string }) => (
  <div className="flex h-full min-h-[420px] items-center justify-center">
    <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 text-center shadow-sm">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-sm font-semibold text-primary">
        Ami
      </div>
      <h2 className="text-2xl font-semibold text-foreground mb-2">{title}</h2>
      <p className="text-sm text-muted-foreground">该功能正在接入，请先返回工作台处理当前可用业务。</p>
    </div>
  </div>
);

// Helper to wrap a lazy component with Suspense
const withSuspense = (Component: React.ComponentType) => (
  <Suspense fallback={<PageSkeleton />}>
    <Component />
  </Suspense>
);

// Helper to wrap a lazy component with Suspense and PermissionGuard
const withGuard = (permission: string, Component: React.ComponentType) => (
  <PermissionGuard permission={permission}>
    <Suspense fallback={<PageSkeleton />}>
      <Component />
    </Suspense>
  </PermissionGuard>
);

// Wrapper that applies AuthGuard around Layout
const ProtectedLayout = () => (
  <AuthGuard>
    <Layout />
  </AuthGuard>
);

export const router = createBrowserRouter([
  // Login route - NOT wrapped by AuthGuard
  {
    path: '/login',
    element: withSuspense(LoginPage),
    errorElement: <RouteErrorPage />,
  },
  // Register route - NOT wrapped by AuthGuard
  {
    path: '/register',
    element: withSuspense(RegisterPage),
    errorElement: <RouteErrorPage />,
  },
  // Protected routes - wrapped by AuthGuard
  {
    path: '/',
    Component: ProtectedLayout,
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: withSuspense(Dashboard) }, // Default route

      // Dashboard
      { path: 'dashboard', element: withSuspense(Dashboard) },
      { path: 'ask-data', element: withGuard('core:dashboard:view', AskDataWorkbench) },
      { path: 'brain', element: withGuard('core:brain:use', BrainWorkspace) },

      // Customers
      { path: 'customers/data', element: withGuard('core:customer:view', CustomerData) },
      { path: 'customers/feedback', element: withGuard('core:customer:view', CustomerFeedbackWorkbench) },
      { path: 'customers/profile', element: withGuard('core:customer:profile', UserProfile) },
      { path: 'customers/script', element: withGuard('core:customer:script', CustomerInvitationScript) },

      // Customer Marketing
      { path: 'customer-marketing/activity-management', element: withGuard('core:marketing:view', MarketingStrategy) },
      { path: 'customer-marketing', element: withGuard('core:marketing:view', MarketingWorkbench) },
      { path: 'customer-marketing/workbench', element: withGuard('core:marketing:view', MarketingWorkbench) },
      { path: 'customer-marketing/ami-glow', element: withGuard('core:marketing:view', AmiGlowManagement) },
      { path: 'customer-marketing/pages', element: withGuard('core:marketing:view', MarketingPageManagement) },
      { path: 'customer-marketing/promotions', element: withGuard('core:marketing:view', PromotionManagement) },
      { path: 'customer-marketing/activity-effect/:id', element: withGuard('core:marketing:view', MarketingActivityEffect) },
      { path: 'customer-marketing/intelligent-recommendation', element: withGuard('core:marketing:view', MarketingRecommendation) },
      { path: 'customer-marketing/assets', element: withGuard('core:marketing:view', MarketingAssets) },
      { path: 'customer-marketing/automation', element: withGuard('core:marketing:view', CreateMarketing) },
      { path: 'customer-marketing/strategy-templates', element: withGuard('core:marketing:template', CreateMarketing) },
      { path: 'customer-marketing/rule-library', element: withGuard('core:marketing:template', MarketingRuleLibrary) },
      { path: 'customer-marketing/effect-analysis', element: withGuard('core:marketing:analytics', MarketingAnalytics) },

      // Stores
      { path: 'stores/project-types', element: withGuard('core:store:project-types', ProjectTypeManagement) },
      { path: 'stores/projects', element: withGuard('core:store:projects', ProjectManagement) },
      { path: 'stores/beauticians', element: withGuard('core:store:beauticians', BeauticianManagement) },
      { path: 'stores/beautician-levels', element: withGuard('core:store:beautician-levels', BeauticianLevelSettings) },
      { path: 'stores/scheduling', element: withGuard('core:store:scheduling', Scheduling) },
      { path: 'stores/reservations', element: withGuard('core:store:reservations', ProjectReservation) },

      // Goods
      { path: 'goods/types', element: withGuard('core:goods:types', GoodsTypeManagement) },
      { path: 'goods/products', element: withGuard('core:goods:products', GoodsProductManagement) },
      { path: 'goods/cards', element: withGuard('core:goods:cards', CardManagement) },

      // Orders
      { path: 'orders/products', element: withGuard('core:order:products', ProductOrderManagement) },
      { path: 'orders/projects', element: withGuard('core:order:projects', ProjectOrderManagement) },
      { path: 'orders/member-cards', element: withGuard('core:order:member-cards', MemberCardManagement) },
      { path: 'orders/member-card-deducts', element: withGuard('core:order:member-cards', MemberCardDeductRecords) },
      { path: 'orders/card-orders', element: withGuard('core:order:card-orders', CardOrderManagement) },
      { path: 'orders/card-usage', element: withGuard('core:order:card-usage', CardVerification) },

      // Inventory
      { path: 'inventory/products', element: withGuard('core:inventory:products', ProductManagement) },
      { path: 'inventory/stock', element: withGuard('core:inventory:stock', StockManagement) },
      { path: 'inventory/purchase', element: withGuard('core:inventory:purchase', PurchaseManagement) },
      { path: 'inventory/expiry', element: withGuard('core:inventory:expiry', ExpiryManagement) },
      { path: 'inventory/transfer', element: withGuard('core:inventory:transfer', StoreTransfer) },
      { path: 'inventory/consumption', element: withGuard('core:inventory:consumption', ServiceConsumption) },

      // Finance
      { path: 'finance', element: withGuard('core:finance:view', FinanceOverview) },
      { path: 'finance/reconciliation', element: withGuard('core:finance:view', CashierReconciliation) },
      { path: 'finance/staff-commission', element: withGuard('core:finance:view', StaffCommissionWorkbench) },
      { path: 'finance/profit', element: withGuard('core:operation-profit:view', ProfitWorkbench) },
      { path: 'finance/member-assets', element: withGuard('core:prepaid-liability:view', MemberAssets) },
        { path: 'finance/daily-settlement', element: withGuard('core:finance:view', DailyClose) },
      { path: 'finance/commission-rules', element: withGuard('core:finance:manage', CommissionRules) },
      { path: 'finance/commission-records', element: withGuard('core:finance:view', CommissionRecords) },
      { path: 'finance/monthly-settlement', element: withGuard('core:finance:view', MonthlySettlement) },
      { path: 'finance/ami-performance', element: withGuard('core:finance:view', AmiPerformance) },
      { path: 'finance/ami-billing', element: withGuard('core:finance:view', AmiBilling) },
      { path: 'finance/platform-revenue', element: withGuard('core:platform-revenue:view', PlatformRevenue) },

      // Operation Profit
      { path: 'operation-profit', element: <Navigate to="/operation-profit/overview" replace /> },
      { path: 'operation-profit/overview', handle: { permission: 'core:operation-profit:view' }, element: withGuard('core:operation-profit:view', OperationProfitOverview) },
      { path: 'operation-profit/product-margins', handle: { permission: 'core:product-margin:view' }, element: withGuard('core:product-margin:view', ProductMarginAnalysis) },
      { path: 'operation-profit/project-margins', handle: { permission: 'core:project-margin:view' }, element: withGuard('core:project-margin:view', ProjectMarginAnalysis) },
      { path: 'operation-profit/prepaid-liabilities', handle: { permission: 'core:prepaid-liability:view' }, element: withGuard('core:prepaid-liability:view', PrepaidLiabilityAnalysis) },
      { path: 'operation-profit/card-liabilities', handle: { permission: 'core:prepaid-liability:view' }, element: withGuard('core:prepaid-liability:view', CardPackageLiabilityAnalysis) },
      { path: 'operation-profit/beautician-performance', handle: { permission: 'core:beautician-performance:view' }, element: withGuard('core:beautician-performance:view', BeauticianPerformance) },
      { path: 'operation-profit/costs', handle: { permission: 'core:operation-cost:view' }, element: withGuard('core:operation-cost:view', OperationCostSettings) },

      // Supply Chain
      { path: 'supply-platform', element: withGuard('core:supply:view', SupplyPlatformMvp) },

      // Industry Data Platform
      { path: 'industry', element: <Navigate to="/industry/service-templates" replace /> },
      { path: 'industry/service-templates', handle: { permission: 'core:industry:service-template' }, element: withGuard('core:industry:service-template', IndustryServiceTemplates) },
      { path: 'industry/product-templates', handle: { permission: 'core:industry:product-template' }, element: withGuard('core:industry:product-template', IndustryProductTemplates) },
      { path: 'industry/bom-templates', handle: { permission: 'core:industry:bom-template' }, element: withGuard('core:industry:bom-template', IndustryBomTemplates) },
      { path: 'industry/knowledge', handle: { permission: 'core:industry:knowledge' }, element: withGuard('core:industry:knowledge', IndustryKnowledge) },
      { path: 'industry/salary-benchmarks', handle: { permission: 'core:industry:salary' }, element: withGuard('core:industry:salary', IndustrySalaryBenchmarks) },
      { path: 'industry/data-sources', handle: { permission: 'core:industry:data-source' }, element: withGuard('core:industry:data-source', IndustryDataSources) },
      { path: 'industry/adoptions', handle: { permission: 'core:industry:adoption' }, element: withGuard('core:industry:adoption', IndustryAdoptions) },

      // System Settings
      { path: 'system/users', element: withGuard('core:system:users', UserManagement) },
      { path: 'system/roles', element: withGuard('core:system:roles', RoleManagement) },
      { path: 'system/permissions', element: withGuard('core:system:permissions', PermissionManagement) },
      { path: 'system/stores', element: withGuard('core:system:stores', StoreSettings) },
      { path: 'system/devices', element: withGuard('core:system:stores', DeviceManagement) },
      { path: 'system/ai-audit', element: withGuard('core:system:view', AiAuditPage) },
      { path: 'system/business-definitions', element: withGuard('core:system:view', BusinessDefinitionCenter) },
      { path: 'system/agent-audit', element: <Navigate to="/system/agent-governance/runs" replace /> },
      { path: 'system/agent-governance', element: withGuard('core:agent-governance:view', AgentGovernanceCenter) },
      { path: 'system/agent-governance/runs', element: withGuard('core:agent-governance:view', AgentGovernanceCenter) },
      { path: 'system/agent-governance/runs/:id', element: withGuard('core:agent-governance:view', AgentGovernanceCenter) },
      { path: 'system/agent-governance/knowledge-graph', element: withGuard('core:agent-governance:view', AgentGovernanceCenter) },
      { path: 'system/agent-governance/knowledge-graph/visualize', element: withGuard('core:agent-governance:view', AgentGovernanceCenter) },
      { path: 'system/agent-governance/knowledge-graph/synonyms', element: withGuard('core:agent-governance:view', AgentGovernanceCenter) },
      { path: 'system/agent-governance/capabilities', element: withGuard('core:agent-governance:view', AgentGovernanceCenter) },
      { path: 'system/agent-governance/auto-publish', element: withGuard('core:agent-governance:view', AgentGovernanceCenter) },
      { path: 'system/agent-governance/eval', element: withGuard('core:agent-governance:view', AgentGovernanceCenter) },
      { path: 'system/agent-governance/feedback', element: withGuard('core:agent-governance:view', AgentGovernanceCenter) },
      { path: 'system/agent-governance/debug', element: withGuard('core:agent-governance:view', AgentGovernanceCenter) },
      { path: 'system/agent-capabilities', element: withGuard('core:agent-governance:view', AgentCapabilityCenter) },
      { path: 'brain-governance', element: withGuard('core:brain-governance:view', BrainGovernanceCenter) },

      // AI 智能体工作台
      { path: 'ami-agent', element: withGuard('core:agent:view', AmiAgentWorkspace) },

      // Fallback
      { path: '*', Component: () => <Placeholder title="404: 页面未找到" /> },
    ],
  },
]);
