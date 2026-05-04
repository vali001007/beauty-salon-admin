import React from 'react';
import { createBrowserRouter } from 'react-router';
import { Layout } from './components/Layout';
import { AuthGuard } from './components/AuthGuard';
import { PermissionGuard } from './components/PermissionGuard';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { Dashboard } from './pages/Dashboard';
import { CustomerData } from './pages/CustomerData';
import { CustomerInvitationScript } from './pages/CustomerInvitationScript';
import { ProjectManagement } from './pages/ProjectManagement';
import { Scheduling } from './pages/Scheduling';
import { CardManagement } from './pages/CardManagement';
import { CardOrderManagement } from './pages/CardOrderManagement';
import { ProjectTypeManagement } from './pages/ProjectTypeManagement';
import { BeauticianManagement } from './pages/BeauticianManagement';
import { BeauticianLevelSettings } from './pages/BeauticianLevelSettings';
import { UserProfile } from './pages/UserProfile';
import { ProjectReservation } from './pages/ProjectReservation';
import { CardVerification } from './pages/CardVerification';
import { ProductManagement } from './pages/ProductManagement';
import { StockManagement } from './pages/StockManagement';
import { PurchaseManagement } from './pages/PurchaseManagement';
import { ExpiryManagement } from './pages/ExpiryManagement';
import { StoreTransfer } from './pages/StoreTransfer';
import { ServiceConsumption } from './pages/ServiceConsumption';
import { MarketingStrategy } from './pages/MarketingStrategy';
import { MarketingRecommendation } from './pages/MarketingRecommendation';
import { CreateMarketing } from './pages/CreateMarketing';
import { MarketingAnalytics } from './pages/MarketingAnalytics';
import { MarketingActivityEffect } from './pages/MarketingActivityEffect';
import { GoodsTypeManagement } from './pages/GoodsTypeManagement';
import { ProductOrderManagement } from './pages/ProductOrderManagement';
import { UserManagement } from './pages/system/UserManagement';
import { RoleManagement } from './pages/system/RoleManagement';
import { PermissionManagement } from './pages/system/PermissionManagement';
import { StoreSettings } from './pages/system/StoreSettings';

// Placeholder for unbuilt pages
const Placeholder = ({ title }: { title: string }) => (
  <div className="flex items-center justify-center h-full min-h-[400px]">
    <div className="text-center">
      <h2 className="text-2xl font-semibold text-gray-700 mb-2">{title}</h2>
      <p className="text-gray-500">此页面正在开发中...</p>
    </div>
  </div>
);

// Wrapper that applies AuthGuard around Layout
const ProtectedLayout = () => (
  <AuthGuard>
    <Layout />
  </AuthGuard>
);

export const router = createBrowserRouter([
  // Login route — NOT wrapped by AuthGuard
  {
    path: '/login',
    Component: LoginPage,
  },
  // Register route — NOT wrapped by AuthGuard
  {
    path: '/register',
    Component: RegisterPage,
  },
  // Protected routes — wrapped by AuthGuard
  {
    path: '/',
    Component: ProtectedLayout,
    children: [
      { index: true, Component: Dashboard }, // Default route
      
      // Dashboard
      { path: 'dashboard', Component: Dashboard },
      
      // Customers
      { path: 'customers/data', element: <PermissionGuard permission="customer:view"><CustomerData /></PermissionGuard> },
      { path: 'customers/profile', element: <PermissionGuard permission="customer:profile"><UserProfile /></PermissionGuard> },
      { path: 'customers/script', element: <PermissionGuard permission="customer:script"><CustomerInvitationScript /></PermissionGuard> },
      
      // Customer Marketing
      { path: 'customer-marketing/activity-management', element: <PermissionGuard permission="marketing:view"><MarketingStrategy /></PermissionGuard> },
      { path: 'customer-marketing/activity-effect/:id', element: <PermissionGuard permission="marketing:view"><MarketingActivityEffect /></PermissionGuard> },
      { path: 'customer-marketing/intelligent-recommendation', element: <PermissionGuard permission="marketing:recommend"><MarketingRecommendation /></PermissionGuard> },
      { path: 'customer-marketing/strategy-templates', element: <PermissionGuard permission="marketing:template"><CreateMarketing /></PermissionGuard> },
      { path: 'customer-marketing/effect-analysis', element: <PermissionGuard permission="marketing:analytics"><MarketingAnalytics /></PermissionGuard> },
      
      // Stores
      { path: 'stores/project-types', element: <PermissionGuard permission="store:project-types"><ProjectTypeManagement /></PermissionGuard> },
      { path: 'stores/projects', element: <PermissionGuard permission="store:projects"><ProjectManagement /></PermissionGuard> },
      { path: 'stores/beauticians', element: <PermissionGuard permission="store:beauticians"><BeauticianManagement /></PermissionGuard> },
      { path: 'stores/beautician-levels', element: <PermissionGuard permission="store:beautician-levels"><BeauticianLevelSettings /></PermissionGuard> },
      { path: 'stores/scheduling', element: <PermissionGuard permission="store:scheduling"><Scheduling /></PermissionGuard> },
      { path: 'stores/reservations', element: <PermissionGuard permission="store:reservations"><ProjectReservation /></PermissionGuard> },
      
      // Goods
      { path: 'goods/types', element: <PermissionGuard permission="goods:types"><GoodsTypeManagement /></PermissionGuard> },
      { path: 'goods/products', element: <PermissionGuard permission="goods:products"><ProductManagement /></PermissionGuard> },
      { path: 'goods/cards', element: <PermissionGuard permission="goods:cards"><CardManagement /></PermissionGuard> },
      
      // Orders
      { path: 'orders/products', element: <PermissionGuard permission="order:products"><ProductOrderManagement /></PermissionGuard> },
      { path: 'orders/card-orders', element: <PermissionGuard permission="order:card-orders"><CardOrderManagement /></PermissionGuard> },
      { path: 'orders/card-usage', element: <PermissionGuard permission="order:card-usage"><CardVerification /></PermissionGuard> },
      
      // Inventory
      { path: 'inventory/products', element: <PermissionGuard permission="inventory:products"><ProductManagement /></PermissionGuard> },
      { path: 'inventory/stock', element: <PermissionGuard permission="inventory:stock"><StockManagement /></PermissionGuard> },
      { path: 'inventory/purchase', element: <PermissionGuard permission="inventory:purchase"><PurchaseManagement /></PermissionGuard> },
      { path: 'inventory/expiry', element: <PermissionGuard permission="inventory:expiry"><ExpiryManagement /></PermissionGuard> },
      { path: 'inventory/transfer', element: <PermissionGuard permission="inventory:transfer"><StoreTransfer /></PermissionGuard> },
      { path: 'inventory/consumption', element: <PermissionGuard permission="inventory:consumption"><ServiceConsumption /></PermissionGuard> },
      
      // System Settings
      { path: 'system/users', element: <PermissionGuard permission="system:users"><UserManagement /></PermissionGuard> },
      { path: 'system/roles', element: <PermissionGuard permission="system:roles"><RoleManagement /></PermissionGuard> },
      { path: 'system/permissions', element: <PermissionGuard permission="system:permissions"><PermissionManagement /></PermissionGuard> },
      { path: 'system/stores', element: <PermissionGuard permission="system:stores"><StoreSettings /></PermissionGuard> },
      
      // Fallback
      { path: '*', Component: () => <Placeholder title="404: 页面未找到" /> },
    ],
  },
]);