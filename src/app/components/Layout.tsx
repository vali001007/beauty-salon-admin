import React, { useState, useMemo } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { 
  Users, Store, ShoppingBag, FileText, 
  ChevronDown, ChevronRight, Menu, UserCircle, LogOut,
  MessageSquare, Calendar, ClipboardList, Scissors, Star, LayoutGrid, User,
  Package, PackagePlus, PackageMinus, AlertTriangle, ShoppingCart, Megaphone, Home,
  Settings, Shield, Lock, Building2
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useAuthStore } from '../../stores/authStore';
import { StoreSwitcher } from './StoreSwitcher';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const MENU_ITEMS = [
  {
    title: '仪表盘',
    icon: Home,
    path: '/dashboard',
    children: [
      { title: '数据概览', path: '/dashboard', icon: LayoutGrid, permission: 'dashboard:view' },
    ],
  },
  {
    title: '客户管理',
    icon: Users,
    path: '/customers',
    children: [
      { title: '客户数据', path: '/customers/data', icon: LayoutGrid, permission: 'customer:view' },
      { title: '客户画像', path: '/customers/profile', icon: User, permission: 'customer:profile' },
      { title: '智能邀约', path: '/customers/script', icon: MessageSquare, permission: 'customer:script' },
    ],
  },
  {
    title: '智能营销',
    icon: Megaphone,
    path: '/customer-marketing',
    children: [
      { title: '智能推荐', path: '/customer-marketing/intelligent-recommendation', icon: MessageSquare, permission: 'marketing:recommend' },
      { title: '自动营销', path: '/customer-marketing/strategy-templates', icon: FileText, permission: 'marketing:template' },
      { title: '活动管理', path: '/customer-marketing/activity-management', icon: LayoutGrid, permission: 'marketing:view' },
      { title: '效果分析', path: '/customer-marketing/effect-analysis', icon: ClipboardList, permission: 'marketing:analytics' },
    ],
  },
  {
    title: '门店管理',
    icon: Store,
    path: '/stores',
    children: [
      { title: '项目类型管理', path: '/stores/project-types', icon: LayoutGrid, permission: 'store:project-types' },
      { title: '项目管理', path: '/stores/projects', icon: ClipboardList, permission: 'store:projects' },
      { title: '美容师管理', path: '/stores/beauticians', icon: Scissors, permission: 'store:beauticians' },
      { title: '美容师等级设置', path: '/stores/beautician-levels', icon: Star, permission: 'store:beautician-levels' },
      { title: '排班管理', path: '/stores/scheduling', icon: Calendar, permission: 'store:scheduling' },
      { title: '项目预约', path: '/stores/reservations', icon: Calendar, permission: 'store:reservations' },
    ],
  },
  {
    title: '商品管理',
    icon: ShoppingBag,
    path: '/goods',
    children: [
      { title: '商品类型', path: '/goods/types', icon: LayoutGrid, permission: 'goods:types' },
      { title: '商品管理', path: '/goods/products', icon: ShoppingBag, permission: 'goods:products' },
      { title: '次卡管理', path: '/goods/cards', icon: FileText, permission: 'goods:cards' },
    ],
  },
  {
    title: '订单管理',
    icon: FileText,
    path: '/orders',
    children: [
      { title: '商品订单管理', path: '/orders/products', icon: FileText, permission: 'order:products' },
      { title: '次卡开卡管理', path: '/orders/card-orders', icon: FileText, permission: 'order:card-orders' },
      { title: '次卡核销管理', path: '/orders/card-usage', icon: FileText, permission: 'order:card-usage' },
    ],
  },
  {
    title: '库存管理',
    icon: Package,
    path: '/inventory',
    children: [
      { title: '产品管理', path: '/inventory/products', icon: ShoppingBag, permission: 'inventory:products' },
      { title: '库存管理', path: '/inventory/stock', icon: Package, permission: 'inventory:stock' },
      { title: '采购管理', path: '/inventory/purchase', icon: ShoppingCart, permission: 'inventory:purchase' },
      { title: '过期管理', path: '/inventory/expiry', icon: AlertTriangle, permission: 'inventory:expiry' },
      { title: '门店库存与调拨', path: '/inventory/transfer', icon: PackagePlus, permission: 'inventory:transfer' },
      { title: '服务消耗与BOM', path: '/inventory/consumption', icon: ClipboardList, permission: 'inventory:consumption' },
    ],
  },
  {
    title: '系统设置',
    icon: Settings,
    path: '/system',
    children: [
      { title: '用户管理', path: '/system/users', icon: Users, permission: 'system:users' },
      { title: '角色管理', path: '/system/roles', icon: Shield, permission: 'system:roles' },
      { title: '权限管理', path: '/system/permissions', icon: Lock, permission: 'system:permissions' },
      { title: '门店管理', path: '/system/stores', icon: Building2, permission: 'system:stores' },
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
    '/system': true,
  });
  const location = useLocation();
  const navigate = useNavigate();
  const logout = useAuthStore((state) => state.logout);
  const user = useAuthStore((state) => state.user);

  const filteredMenuItems = useMemo(() => {
    const permissions = user?.permissions ?? [];
    // Super admin sees everything
    if (permissions.includes('*')) {
      return MENU_ITEMS;
    }
    return MENU_ITEMS
      .map((menu) => ({
        ...menu,
        children: menu.children.filter((child) => permissions.includes(child.permission)),
      }))
      .filter((menu) => menu.children.length > 0);
  }, [user?.permissions]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const toggleMenu = (path: string) => {
    setOpenMenus(prev => ({ ...prev, [path]: !prev[path] }));
  };

  // Helper to get breadcrumb text
  const getBreadcrumbs = () => {
    let breadcrumbs = ['首页'];
    filteredMenuItems.forEach(menu => {
      menu.children.forEach(child => {
        if (location.pathname === child.path) {
          breadcrumbs.push(menu.title);
          breadcrumbs.push(child.title);
        }
      });
    });
    return breadcrumbs.join(' / ');
  };

  return (
    <div className="flex h-screen bg-gray-50 font-sans text-sm">
      {/* Sidebar */}
      <div className="w-64 bg-[#0a1628] text-gray-300 flex flex-col shrink-0 overflow-y-auto">
        <div className="flex items-center gap-3 px-6 h-16 shrink-0 border-b border-gray-800">
          <div className="w-8 h-8 rounded-full bg-pink-500 flex items-center justify-center text-white">
            <span className="font-bold">美</span>
          </div>
          <span className="text-white font-semibold text-lg tracking-wide">美业管理平台</span>
        </div>
        
        <div className="py-4 flex-1 overflow-y-auto">
          {filteredMenuItems.map((menu) => (
            <div key={menu.path} className="mb-2">
              <button
                onClick={() => toggleMenu(menu.path)}
                className="w-full flex items-center justify-between px-6 py-3 hover:text-white transition-colors"
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
                            ? "bg-[#1890ff] text-white" 
                            : "hover:text-white hover:bg-white/5"
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
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-4 text-gray-600">
            <button className="hover:bg-gray-100 p-1.5 rounded-md text-gray-400 hover:text-gray-600 transition-colors">
              <Menu className="w-5 h-5" />
            </button>
            <div className="text-gray-500 font-medium">
              {getBreadcrumbs()}
            </div>
            <StoreSwitcher />
          </div>
          
          <div className="flex items-center gap-3">
            <span className="text-gray-600">{user?.name ?? '用户'}</span>
            <div className="w-8 h-8 bg-indigo-500 rounded-full flex items-center justify-center text-white">
              <UserCircle className="w-5 h-5" />
            </div>
            <button
              onClick={handleLogout}
              className="hover:bg-gray-100 p-1.5 rounded-md text-gray-400 hover:text-red-500 transition-colors"
              title="退出登录"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto p-6 bg-[#f0f2f5]">
          <div className="bg-white rounded-lg shadow-sm min-h-full p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}