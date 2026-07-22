import React, { useState, useMemo } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import {
  Users, Store, ShoppingBag, FileText,
  ChevronDown, ChevronRight, Menu, UserCircle, LogOut,
  MessageSquare, MessageSquareWarning, Calendar, ClipboardList, Scissors, Star, LayoutGrid, User,
  Package, PackagePlus, AlertTriangle, ShoppingCart, Megaphone, Home,
  Settings, Shield, Lock, Building2, Monitor, WalletCards, BarChart3, Sparkles, Zap, TrendingUp,
  Database, BookOpen, BookKey, CheckCircle2, ShieldCheck, BrainCircuit,
  type LucideIcon,
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useAuthStore } from '../../stores/authStore';
import { StoreSwitcher } from './StoreSwitcher';
import { hasPermission } from '@/config/permissions';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type MenuChild = {
  title: string;
  path: string;
  icon: LucideIcon;
  permission: string;
  group?: string;
};

type MenuItem = {
  title: string;
  icon: LucideIcon;
  path: string;
  children: MenuChild[];
};

export const MENU_ITEMS: MenuItem[] = [
  {
    title: '工作台',
    icon: Home,
    path: '/dashboard',
    children: [
      { title: '我的工作台', path: '/dashboard', icon: LayoutGrid, permission: 'core:dashboard:view' },
      { title: '门店经营指标', path: '/store-operations/metrics', icon: TrendingUp, permission: 'core:store-metrics:view' },
      { title: '智能问数', path: '/ask-data', icon: Database, permission: 'core:dashboard:view' },
      { title: 'Ami Brain', path: '/brain', icon: BrainCircuit, permission: 'core:brain:use' },
      { title: 'AI 智能体', path: '/ami-agent', icon: Sparkles, permission: 'core:agent:view' },
    ],
  },
  {
    title: '客户管理',
    icon: Users,
    path: '/customers',
    children: [
      { title: '客户数据', path: '/customers/data', icon: LayoutGrid, permission: 'core:customer:view' },
      { title: '客户反馈', path: '/customers/feedback', icon: MessageSquareWarning, permission: 'core:customer:view' },
      { title: '客户画像', path: '/customers/profile', icon: User, permission: 'core:customer:profile' },
      { title: '智能邀约', path: '/customers/script', icon: MessageSquare, permission: 'core:customer:script' },
    ],
  },
  {
    title: '智能营销',
    icon: Megaphone,
    path: '/customer-marketing',
    children: [
      { title: '营销工作台', path: '/customer-marketing/workbench', icon: Sparkles, permission: 'core:marketing:view' },
      { title: '智能推荐', path: '/customer-marketing/intelligent-recommendation', icon: Star, permission: 'core:marketing:view' },
      { title: '活动列表', path: '/customer-marketing/activity-management', icon: ClipboardList, permission: 'core:marketing:view' },
      { title: '自动触达', path: '/customer-marketing/automation', icon: Zap, permission: 'core:marketing:view' },
      { title: '推广资产', path: '/customer-marketing/assets', icon: Megaphone, permission: 'core:marketing:view' },
      { title: '数据复盘', path: '/customer-marketing/effect-analysis', icon: BarChart3, permission: 'core:marketing:analytics' },
    ],
  },
  {
    title: '门店管理',
    icon: Store,
    path: '/stores',
    children: [
      { title: '项目类型管理', path: '/stores/project-types', icon: LayoutGrid, permission: 'core:store:project-types' },
      { title: '项目管理', path: '/stores/projects', icon: ClipboardList, permission: 'core:store:projects' },
      { title: '美容师管理', path: '/stores/beauticians', icon: Scissors, permission: 'core:store:beauticians' },
      { title: '美容师等级设置', path: '/stores/beautician-levels', icon: Star, permission: 'core:store:beautician-levels' },
      { title: '排班管理', path: '/stores/scheduling', icon: Calendar, permission: 'core:store:scheduling' },
      { title: '项目预约', path: '/stores/reservations', icon: Calendar, permission: 'core:store:reservations' },
    ],
  },
  {
    title: '商品管理',
    icon: ShoppingBag,
    path: '/goods',
    children: [
      { title: '商品管理', path: '/goods/products', icon: ShoppingBag, permission: 'core:goods:products' },
      { title: '次卡管理', path: '/goods/cards', icon: FileText, permission: 'core:goods:cards' },
    ],
  },
  {
    title: '订单管理',
    icon: FileText,
    path: '/orders',
    children: [
      { title: '商品订单管理', path: '/orders/products', icon: FileText, permission: 'core:order:products' },
      { title: '项目订单管理', path: '/orders/projects', icon: FileText, permission: 'core:order:projects' },
      { title: '会员卡管理', path: '/orders/member-cards', icon: FileText, permission: 'core:order:member-cards' },
      { title: '会员卡划扣流水', path: '/orders/member-card-deducts', icon: FileText, permission: 'core:order:member-cards' },
      { title: '次卡订单管理', path: '/orders/card-orders', icon: FileText, permission: 'core:order:card-orders' },
      { title: '次卡核销流水', path: '/orders/card-usage', icon: FileText, permission: 'core:order:card-usage' },
    ],
  },
  {
    title: '库存管理',
    icon: Package,
    path: '/inventory',
    children: [
      { title: '产品类型', path: '/goods/types', icon: LayoutGrid, permission: 'core:goods:types' },
      { title: '产品管理', path: '/inventory/products', icon: ShoppingBag, permission: 'core:inventory:products' },
      { title: '库存管理', path: '/inventory/stock', icon: Package, permission: 'core:inventory:stock' },
      { title: '采购管理', path: '/inventory/purchase', icon: ShoppingCart, permission: 'core:inventory:purchase' },
      { title: '过期管理', path: '/inventory/expiry', icon: AlertTriangle, permission: 'core:inventory:expiry' },
      { title: '门店库存与调拨', path: '/inventory/transfer', icon: PackagePlus, permission: 'core:inventory:transfer' },
      { title: '服务消耗与 BOM', path: '/inventory/consumption', icon: ClipboardList, permission: 'core:inventory:consumption' },
    ],
  },
  {
    title: '财务中心',
    icon: WalletCards,
    path: '/finance',
    children: [
      { title: '收银对账', path: '/finance/reconciliation', icon: ClipboardList, permission: 'core:finance:view', group: '结算与对账' },
      { title: '员工提成', path: '/finance/staff-commission', icon: Users, permission: 'core:finance:view', group: '提成与人效' },
      { title: '经营利润', path: '/finance/profit', icon: TrendingUp, permission: 'core:operation-profit:view', group: '经营利润' },
      { title: '会员资产', path: '/finance/member-assets', icon: WalletCards, permission: 'core:prepaid-liability:view', group: '会员资产' },
      { title: '数字员工账单', path: '/finance/ami-billing', icon: BarChart3, permission: 'core:finance:view', group: '数字员工' },
    ],
  },
  {
    title: '供应链平台',
    icon: PackagePlus,
    path: '/supply-platform',
    children: [
      { title: '供应链工作台', path: '/supply-platform', icon: PackagePlus, permission: 'core:supply:view' },
    ],
  },
  {
    title: '行业数据平台',
    icon: Database,
    path: '/industry',
    children: [
      { title: '服务项目模板', path: '/industry/service-templates', icon: ClipboardList, permission: 'core:industry:service-template' },
      { title: '项目 BOM 模板', path: '/industry/bom-templates', icon: FileText, permission: 'core:industry:bom-template' },
      { title: '标准商品/耗品', path: '/industry/product-templates', icon: Package, permission: 'core:industry:product-template' },
      { title: '岗位薪酬模板', path: '/industry/salary-benchmarks', icon: Users, permission: 'core:industry:salary' },
      { title: '服务知识库', path: '/industry/knowledge', icon: BookOpen, permission: 'core:industry:knowledge' },
      { title: '数据源管理', path: '/industry/data-sources', icon: Database, permission: 'core:industry:data-source' },
      { title: '采用记录', path: '/industry/adoptions', icon: CheckCircle2, permission: 'core:industry:adoption' },
    ],
  },
  {
    title: '系统设置',
    icon: Settings,
    path: '/system',
    children: [
      { title: '用户管理', path: '/system/users', icon: Users, permission: 'core:system:users' },
      { title: '角色管理', path: '/system/roles', icon: Shield, permission: 'core:system:roles' },
      { title: '权限管理', path: '/system/permissions', icon: Lock, permission: 'core:system:permissions' },
      { title: '门店管理', path: '/system/stores', icon: Building2, permission: 'core:system:stores' },
      { title: '终端设备', path: '/system/devices', icon: Monitor, permission: 'core:system:stores' },
      { title: '平台收入报表', path: '/finance/platform-revenue', icon: BarChart3, permission: 'core:platform-revenue:view' },
      { title: '业务口径中心', path: '/system/business-definitions', icon: BookKey, permission: 'core:system:view' },
      { title: 'AI 治理中心', path: '/system/agent-governance', icon: ShieldCheck, permission: 'core:agent-governance:view' },
      { title: 'Brain 治理中心', path: '/brain-governance', icon: ShieldCheck, permission: 'core:brain-governance:view' },
    ],
  },
];

export function Layout() {
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({
    '/dashboard': true,
    '/customers': true,
    '/customer-marketing': true,
    '/stores': true,
    '/goods': true,
    '/orders': true,
    '/inventory': true,
    '/finance': true,
    '/supply-platform': true,
    '/industry': true,
    '/system': true,
  });
  const location = useLocation();
  const navigate = useNavigate();
  const logout = useAuthStore((state) => state.logout);
  const user = useAuthStore((state) => state.user);

  const filteredMenuItems = useMemo(() => {
    const permissions = user?.permissions ?? [];
    const deniedPermissions = user?.deniedPermissions ?? [];
    // Super admin sees everything
    if (hasPermission(permissions, '*') && !hasPermission(deniedPermissions, '*')) {
      return MENU_ITEMS;
    }
    return MENU_ITEMS
      .map((menu) => ({
        ...menu,
        children: menu.children.filter((child) => hasPermission(permissions, child.permission) && !hasPermission(deniedPermissions, child.permission)),
      }))
      .filter((menu) => menu.children.length > 0);
  }, [user?.permissions, user?.deniedPermissions]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const toggleMenu = (path: string) => {
    setOpenMenus(prev => ({ ...prev, [path]: !prev[path] }));
  };

  // Helper to get the current menu path shown in the header.
  const getBreadcrumbs = () => {
    const currentPath = location.pathname === '/' ? '/dashboard' : location.pathname;

    for (const menu of MENU_ITEMS) {
      const child = menu.children.find((item) => item.path === currentPath);
      if (child) {
        return [menu.title, child.title].join(' / ');
      }
    }

    return '';
  };

  return (
    <div className="flex h-screen bg-background font-sans text-sm text-foreground">
      {/* Sidebar */}
      <div className="w-64 border-r border-border bg-sidebar text-sidebar-foreground flex flex-col shrink-0 overflow-y-auto">
        <div className="flex items-center gap-3 px-6 h-16 shrink-0 border-b border-sidebar-border">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground shadow-sm">
            <span className="text-xs font-bold">Ami</span>
          </div>
          <span className="text-foreground font-semibold text-lg tracking-wide">Ami_Core</span>
        </div>

        <div className="py-4 flex-1 overflow-y-auto">
          {filteredMenuItems.map((menu) => (
            <div key={menu.path} className="mb-2">
              <button
                onClick={() => toggleMenu(menu.path)}
                className="w-full flex items-center justify-between px-6 py-3 text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              >
                <div className="flex items-center gap-3">
                  <menu.icon className="w-5 h-5" />
                  <span className="font-medium">{menu.title}</span>
                </div>
                {openMenus[menu.path] ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </button>

              {openMenus[menu.path] && (
                <div className="flex flex-col">
                  {menu.children.map((child) => {
                    return (
                      <React.Fragment key={child.path}>
                        <NavLink
                          to={child.path}
                          className={({ isActive }) =>
                            cn(
                              "flex items-center gap-3 pl-14 pr-6 py-2.5 transition-colors",
                              isActive
                                ? "bg-sidebar-primary text-sidebar-primary-foreground"
                                : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                            )
                          }
                        >
                          <child.icon className="w-4 h-4 opacity-70" />
                          <span>{child.title}</span>
                        </NavLink>
                      </React.Fragment>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-16 bg-card border-b border-border flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-4 text-muted-foreground">
            <button className="hover:bg-muted p-1.5 rounded-md text-muted-foreground transition-colors">
              <Menu className="w-5 h-5" />
            </button>
            <div className="text-foreground/70 font-medium">
              {getBreadcrumbs()}
            </div>
            <StoreSwitcher />
          </div>

          <div className="flex items-center gap-3">
            <span className="text-foreground/80">{user?.name ?? '用户'}</span>
            <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-primary-foreground shadow-sm">
              <UserCircle className="w-5 h-5" />
            </div>
            <button
              onClick={handleLogout}
              className="hover:bg-muted p-1.5 rounded-md text-muted-foreground hover:text-destructive transition-colors"
              title="退出登录"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto p-6 bg-background/70">
          <div className="bg-card rounded-xl border border-border shadow-sm min-h-full p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
