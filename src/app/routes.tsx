import { Suspense } from 'react';
import { createBrowserRouter } from 'react-router';
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
const CustomerData = lazyWithRetry(() => import('./pages/CustomerData').then(m => ({ default: m.CustomerData })), 'CustomerData');
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
const AgentAuditPage = lazyWithRetry(() => import('./pages/system/AgentAuditPage').then(m => ({ default: m.AgentAuditPage })), 'AgentAuditPage');
const CommissionRules = lazyWithRetry(() => import('./pages/finance/CommissionRules').then(m => ({ default: m.CommissionRules })), 'CommissionRules');
const CommissionRecords = lazyWithRetry(() => import('./pages/finance/CommissionRecords').then(m => ({ default: m.CommissionRecords })), 'CommissionRecords');
const MonthlySettlement = lazyWithRetry(() => import('./pages/finance/MonthlySettlement').then(m => ({ default: m.MonthlySettlement })), 'MonthlySettlement');
const DailySettlement = lazyWithRetry(() => import('./pages/finance/DailySettlement').then(m => ({ default: m.DailySettlement })), 'DailySettlement');
const AmiPerformance = lazyWithRetry(() => import('./pages/finance/AmiPerformance').then(m => ({ default: m.AmiPerformance })), 'AmiPerformance');
const AmiBilling = lazyWithRetry(() => import('./pages/finance/AmiBilling').then(m => ({ default: m.AmiBilling })), 'AmiBilling');
const PlatformRevenue = lazyWithRetry(() => import('./pages/finance/PlatformRevenue').then(m => ({ default: m.PlatformRevenue })), 'PlatformRevenue');
const SupplierManagement = lazyWithRetry(() => import('./pages/supply-chain/SupplierManagement').then(m => ({ default: m.SupplierManagement })), 'SupplierManagement');
const PurchaseOrders = lazyWithRetry(() => import('./pages/supply-chain/PurchaseOrders').then(m => ({ default: m.PurchaseOrders })), 'PurchaseOrders');
const SupplierSettlements = lazyWithRetry(() => import('./pages/supply-chain/SupplierSettlements').then(m => ({ default: m.SupplierSettlements })), 'SupplierSettlements');

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

      // Customers
      { path: 'customers/data', element: withGuard('core:customer:view', CustomerData) },
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
      { path: 'customer-marketing/intelligent-recommendation', element: withGuard('core:marketing:recommend', MarketingRecommendation) },
      { path: 'customer-marketing/assets', element: withGuard('core:marketing:view', MarketingAssets) },
      { path: 'customer-marketing/automation', element: withGuard('core:marketing:template', CreateMarketing) },
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
      { path: 'finance/daily-settlement', element: withGuard('core:finance:view', DailySettlement) },
      { path: 'finance/commission-rules', element: withGuard('core:finance:manage', CommissionRules) },
      { path: 'finance/commission-records', element: withGuard('core:finance:view', CommissionRecords) },
      { path: 'finance/monthly-settlement', element: withGuard('core:finance:view', MonthlySettlement) },
      { path: 'finance/ami-performance', element: withGuard('core:finance:view', AmiPerformance) },
      { path: 'finance/ami-billing', element: withGuard('core:finance:view', AmiBilling) },
      { path: 'finance/platform-revenue', element: withGuard('core:finance:view', PlatformRevenue) },

      // Supply Chain
      { path: 'supply-chain/suppliers', element: withGuard('core:supply:view', SupplierManagement) },
      { path: 'supply-chain/orders', element: withGuard('core:supply:view', PurchaseOrders) },
      { path: 'supply-chain/settlements', element: withGuard('core:supply:view', SupplierSettlements) },

      // System Settings
      { path: 'system/users', element: withGuard('core:system:users', UserManagement) },
      { path: 'system/roles', element: withGuard('core:system:roles', RoleManagement) },
      { path: 'system/permissions', element: withGuard('core:system:permissions', PermissionManagement) },
      { path: 'system/stores', element: withGuard('core:system:stores', StoreSettings) },
      { path: 'system/devices', element: withGuard('core:system:stores', DeviceManagement) },
      { path: 'system/ai-audit', element: withGuard('core:system:view', AiAuditPage) },
      { path: 'system/agent-audit', element: withGuard('core:system:view', AgentAuditPage) },

      // Fallback
      { path: '*', Component: () => <Placeholder title="404: 页面未找到" /> },
    ],
  },
]);
