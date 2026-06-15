import React, { useState, useMemo } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { 
  Users, Store, ShoppingBag, FileText, 
  ChevronDown, ChevronRight, Menu, UserCircle, LogOut,
  MessageSquare, Calendar, ClipboardList, Scissors, Star, LayoutGrid, User,
  Package, PackagePlus, AlertTriangle, ShoppingCart, Megaphone, Home,
  Settings, Shield, Lock, Building2, Monitor, WalletCards, BarChart3, Sparkles, Zap
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useAuthStore } from '../../stores/authStore';
import { StoreSwitcher } from './StoreSwitcher';
import { hasPermission } from '@/config/permissions';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const MENU_ITEMS = [
  {
    title: '工作台',
    icon: Home,
    path: '/dashboard',
    children: [
      { title: '我的工作台', path: '/dashboard', icon: LayoutGrid, permission: 'core:dashboard:view' },
    ],
  },
  {
    title: '客户管理',
    icon: Users,
    path: '/customers',
    children: [
      { title: '客户数据', path: '/customers/data', icon: LayoutGrid, permission: 'core:customer:view' },
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
      { title: '自动触达', path: '/customer-marketing/automation', icon: Zap, permission: 'core:marketing:template' },
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
      { title: '产品类型', path: '/goods/types', icon: LayoutGrid, permission: 'core:goods:types' },
      { title: '产品管理', path: '/inventory/products', icon: ShoppingBag, permission: 'core:inventory:products' },
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
      { title: '会员卡划扣记录', path: '/orders/member-card-deducts', icon: FileText, permission: 'core:order:member-cards' },
      { title: '次卡开卡管理', path: '/orders/card-orders', icon: FileText, permission: 'core:order:card-orders' },
      { title: '次卡核销管理', path: '/orders/card-usage', icon: FileText, permission: 'core:order:card-usage' },
    ],
  },
  {
    title: '库存管理',
    icon: Package,
    path: '/inventory',
    children: [
      { title: '库存管理', path: '/inventory/stock', icon: Package, permission: 'core:inventory:stock' },
      { title: '采购管理', path: '/inventory/purchase', icon: ShoppingCart, permission: 'core:inventory:purchase' },
      { title: '过期管理', path: '/inventory/expiry', icon: AlertTriangle, permission: 'core:inventory:expiry' },
      { title: '门店库存与调拨', path: '/inventory/transfer', icon: PackagePlus, permission: 'core:inventory:transfer' },
      { title: '服务消耗与 BOM', path: '/inventory/consumption', icon: ClipboardList, permission: 'core:inventory:consumption' },
    ],
  },
  {
    title: '财务管理',
    icon: WalletCards,
    path: '/finance',
    children: [
      { title: '日结报表', path: '/finance/daily-settlement', icon: ClipboardList, permission: 'core:finance:view' },
      { title: '提成规则', path: '/finance/commission-rules', icon: Settings, permission: 'core:finance:manage' },
      { title: '提成明细', path: '/finance/commission-records', icon: BarChart3, permission: 'core:finance:view' },
      { title: '月度结算', path: '/finance/monthly-settlement', icon: WalletCards, permission: 'core:finance:view' },
      { title: '数字员工绩效', path: '/finance/ami-performance', icon: BarChart3, permission: 'core:finance:view' },
      { title: '数字员工账单', path: '/finance/ami-billing', icon: WalletCards, permission: 'core:finance:view' },
      { title: '平台收入报表', path: '/finance/platform-revenue', icon: BarChart3, permission: 'core:finance:view' },
    ],
  },
  {
    title: '供应链',
    icon: PackagePlus,
    path: '/supply-chain',
    children: [
      { title: '供应商管理', path: '/supply-chain/suppliers', icon: Building2, permission: 'core:supply:view' },
      { title: '采购订单', path: '/supply-chain/orders', icon: ShoppingCart, permission: 'core:supply:view' },
      { title: '供应商结算', path: '/supply-chain/settlements', icon: WalletCards, permission: 'core:supply:view' },
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
      { title: 'AI 审计', path: '/system/ai-audit', icon: FileText, permission: 'core:system:view' },
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
    '/supply-chain': true,
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
                  {menu.children.map((child) => (
                    <NavLink
                      key={child.path}
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
                  ))}
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

