import React, { useState } from 'react';
import { Shield, ChevronDown, ChevronRight, Lock, Eye, Edit, Plus, Trash2, Settings } from 'lucide-react';

interface PermissionNode {
  id: string;
  name: string;
  code: string;
  type: '菜单' | '按钮' | '接口';
  description: string;
  children?: PermissionNode[];
}

const PERMISSION_TREE: PermissionNode[] = [
  {
    id: '1', name: '仪表盘', code: 'dashboard', type: '菜单', description: '数据概览面板',
    children: [
      { id: '1-1', name: '查看仪表盘', code: 'dashboard:view', type: '按钮', description: '查看仪表盘数据' },
    ],
  },
  {
    id: '2', name: '客户管理', code: 'customer', type: '菜单', description: '客户信息管理模块',
    children: [
      { id: '2-1', name: '查看客户', code: 'customer:view', type: '按钮', description: '查看客户列表和详情' },
      { id: '2-2', name: '新增客户', code: 'customer:create', type: '按钮', description: '创建新客户' },
      { id: '2-3', name: '编辑客户', code: 'customer:edit', type: '按钮', description: '修改客户信息' },
      { id: '2-4', name: '删除客户', code: 'customer:delete', type: '按钮', description: '删除客户记录' },
      { id: '2-5', name: '导出客户', code: 'customer:export', type: '按钮', description: '导出客户数据' },
    ],
  },
  {
    id: '3', name: '智能营销', code: 'marketing', type: '菜单', description: '营销活动管理模块',
    children: [
      { id: '3-1', name: '查看活动', code: 'marketing:view', type: '按钮', description: '查看营销活动列表' },
      { id: '3-2', name: '创建活动', code: 'marketing:create', type: '按钮', description: '创建新营销活动' },
      { id: '3-3', name: '编辑活动', code: 'marketing:edit', type: '按钮', description: '修改营销活动' },
      { id: '3-4', name: '删除活动', code: 'marketing:delete', type: '按钮', description: '删除营销活动' },
    ],
  },
  {
    id: '4', name: '门店管理', code: 'store', type: '菜单', description: '门店运营管理模块',
    children: [
      { id: '4-1', name: '查看门店', code: 'store:view', type: '按钮', description: '查看门店信息' },
      { id: '4-2', name: '项目管理', code: 'store:project:manage', type: '按钮', description: '管理服务项目' },
      { id: '4-3', name: '美容师管理', code: 'store:beautician:manage', type: '按钮', description: '管理美容师' },
      { id: '4-4', name: '排班管理', code: 'store:schedule:manage', type: '按钮', description: '管理排班' },
      { id: '4-5', name: '预约管理', code: 'store:reservation:manage', type: '按钮', description: '管理项目预约' },
    ],
  },
  {
    id: '5', name: '商品管理', code: 'goods', type: '菜单', description: '商品信息管理模块',
    children: [
      { id: '5-1', name: '查看商品', code: 'goods:view', type: '按钮', description: '查看商品列表' },
      { id: '5-2', name: '新增商品', code: 'goods:create', type: '按钮', description: '创建新商品' },
      { id: '5-3', name: '编辑商品', code: 'goods:edit', type: '按钮', description: '修改商品信息' },
      { id: '5-4', name: '删除商品', code: 'goods:delete', type: '按钮', description: '删除商品' },
    ],
  },
  {
    id: '6', name: '订单管理', code: 'order', type: '菜单', description: '订单处理模块',
    children: [
      { id: '6-1', name: '查看订单', code: 'order:view', type: '按钮', description: '查看订单列表和详情' },
      { id: '6-2', name: '创建订单', code: 'order:create', type: '按钮', description: '创建新订单' },
      { id: '6-3', name: '编辑订单', code: 'order:edit', type: '按钮', description: '修改订单信息' },
      { id: '6-4', name: '退款', code: 'order:refund', type: '按钮', description: '处理订单退款' },
    ],
  },
  {
    id: '7', name: '库存管理', code: 'inventory', type: '菜单', description: '库存与采购管理模块',
    children: [
      { id: '7-1', name: '查看库存', code: 'inventory:view', type: '按钮', description: '查看库存信息' },
      { id: '7-2', name: '入库操作', code: 'inventory:inbound', type: '按钮', description: '执行入库操作' },
      { id: '7-3', name: '出库操作', code: 'inventory:outbound', type: '按钮', description: '执行出库操作' },
      { id: '7-4', name: '采购管理', code: 'inventory:purchase', type: '按钮', description: '管理采购订单' },
      { id: '7-5', name: '调拨管理', code: 'inventory:transfer', type: '按钮', description: '管理门店间调拨' },
    ],
  },
  {
    id: '8', name: '系统设置', code: 'system', type: '菜单', description: '系统全局配置模块',
    children: [
      { id: '8-1', name: '用户管理', code: 'system:user:manage', type: '按钮', description: '管理系统用户' },
      { id: '8-2', name: '角色管理', code: 'system:role:manage', type: '按钮', description: '管理角色和权限' },
      { id: '8-3', name: '门店管理', code: 'system:store:manage', type: '按钮', description: '管理门店信息' },
      { id: '8-4', name: '操作日志', code: 'system:log:view', type: '按钮', description: '查看操作日志' },
    ],
  },
];

export function PermissionManagement() {
  const [expandedIds, setExpandedIds] = useState<string[]>(PERMISSION_TREE.map(p => p.id));
  const [selectedNode, setSelectedNode] = useState<PermissionNode | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]);
  };

  const getTypeColor = (type: PermissionNode['type']) => {
    switch (type) {
      case '菜单': return 'bg-blue-100 text-blue-700';
      case '按钮': return 'bg-green-100 text-green-700';
      case '接口': return 'bg-purple-100 text-purple-700';
    }
  };

  const getTypeIcon = (type: PermissionNode['type']) => {
    switch (type) {
      case '菜单': return <Settings className="w-4 h-4 text-blue-500" />;
      case '按钮': return <Lock className="w-4 h-4 text-green-500" />;
      case '接口': return <Shield className="w-4 h-4 text-purple-500" />;
    }
  };

  const totalPermissions = PERMISSION_TREE.reduce((sum, node) => sum + (node.children?.length || 0) + 1, 0);
  const menuCount = PERMISSION_TREE.length;
  const buttonCount = PERMISSION_TREE.reduce((sum, node) => sum + (node.children?.length || 0), 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="text-sm text-gray-500">首页 / 系统设置 / 权限管理</div>
      <h2 className="text-xl font-semibold text-gray-800">权限管理</h2>

      {/* 统计 */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4">
          <div className="text-sm text-blue-600 mb-1">菜单权限</div>
          <div className="text-2xl font-bold text-blue-900">{menuCount}</div>
        </div>
        <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4">
          <div className="text-sm text-green-600 mb-1">操作权限</div>
          <div className="text-2xl font-bold text-green-900">{buttonCount}</div>
        </div>
        <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4">
          <div className="text-sm text-purple-600 mb-1">权限总数</div>
          <div className="text-2xl font-bold text-purple-900">{totalPermissions}</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* 权限树 */}
        <div className="col-span-2 border border-gray-200 rounded-lg overflow-hidden">
          <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">权限结构</span>
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-blue-500" /> 菜单</span>
              <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-green-500" /> 操作</span>
            </div>
          </div>
          <div className="max-h-[600px] overflow-y-auto">
            {PERMISSION_TREE.map((node) => (
              <div key={node.id}>
                <div
                  className={`flex items-center justify-between px-4 py-3 border-b border-gray-100 hover:bg-blue-50/50 cursor-pointer ${selectedNode?.id === node.id ? 'bg-blue-50' : ''}`}
                  onClick={() => setSelectedNode(node)}
                >
                  <div className="flex items-center gap-2">
                    <button onClick={(e) => { e.stopPropagation(); toggleExpand(node.id); }} className="p-0.5 hover:bg-gray-200 rounded">
                      {expandedIds.includes(node.id) ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
                    </button>
                    {getTypeIcon(node.type)}
                    <span className="font-medium text-gray-800">{node.name}</span>
                    <span className="font-mono text-xs text-gray-400">{node.code}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${getTypeColor(node.type)}`}>{node.type}</span>
                  </div>
                  <span className="text-xs text-gray-400">{node.children?.length || 0} 个子权限</span>
                </div>
                {expandedIds.includes(node.id) && node.children?.map((child) => (
                  <div
                    key={child.id}
                    className={`flex items-center justify-between pl-12 pr-4 py-2.5 border-b border-gray-50 hover:bg-gray-50 cursor-pointer ${selectedNode?.id === child.id ? 'bg-blue-50' : ''}`}
                    onClick={() => setSelectedNode(child)}
                  >
                    <div className="flex items-center gap-2">
                      {getTypeIcon(child.type)}
                      <span className="text-sm text-gray-700">{child.name}</span>
                      <span className="font-mono text-xs text-gray-400">{child.code}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${getTypeColor(child.type)}`}>{child.type}</span>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* 详情面板 */}
        <div className="border border-gray-200 rounded-lg p-6">
          {selectedNode ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                {getTypeIcon(selectedNode.type)}
                <h3 className="font-semibold text-gray-800 text-lg">{selectedNode.name}</h3>
              </div>
              <div className="space-y-3">
                <div>
                  <div className="text-xs text-gray-500 mb-1">权限编码</div>
                  <div className="font-mono text-sm text-gray-700 bg-gray-50 px-3 py-1.5 rounded">{selectedNode.code}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">类型</div>
                  <span className={`inline-flex px-2 py-1 rounded text-xs font-medium ${getTypeColor(selectedNode.type)}`}>{selectedNode.type}</span>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">描述</div>
                  <div className="text-sm text-gray-700">{selectedNode.description}</div>
                </div>
                {selectedNode.children && selectedNode.children.length > 0 && (
                  <div>
                    <div className="text-xs text-gray-500 mb-1">子权限</div>
                    <div className="text-sm font-semibold text-blue-600">{selectedNode.children.length} 个</div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 py-12">
              <Shield className="w-12 h-12 mb-3" />
              <p className="text-sm">选择左侧权限查看详情</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
