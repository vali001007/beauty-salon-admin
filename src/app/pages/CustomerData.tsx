import { useState, useMemo } from 'react';
import { Search, Plus, Trash2, Upload, Eye, Loader2, Download, FileDown, Edit2 } from 'lucide-react';
import { Input, Button, Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '../components/UI';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { ImportDialog } from '../components/ImportDialog';
import { ImageWithFallback } from '../components/figma/ImageWithFallback';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { customerSchema, type CustomerFormData } from '@/schemas/customer';
import { getCustomersPaginated, createCustomer, updateCustomer, importCustomers, deleteCustomers } from '@/api/customer';
import { usePagination } from '@/hooks/usePagination';
import { exportToExcel, downloadTemplate } from '@/utils/excel';
import { toast } from 'sonner';
import type { Customer } from '@/types';
import type { ExportColumn } from '@/types/excel';
import { PasswordConfirmDialog } from '../components/PasswordConfirmDialog';
import rawCustomers from '@/api/mock/data/customers.json';

const CUSTOMER_EXPORT_COLUMNS: ExportColumn[] = [
  { key: 'name', header: '客户名称', width: 15 },
  { key: 'storeName', header: '所属门店', width: 20 },
  { key: 'email', header: '邮箱', width: 20 },
  { key: 'phone', header: '手机号码', width: 15 },
  { key: 'landline', header: '座机号', width: 15 },
  { key: 'wechat', header: '微信号', width: 15 },
  { key: 'gender', header: '性别', width: 8 },
  { key: 'maritalStatus', header: '婚姻状态', width: 10 },
  { key: 'birthday', header: '出生日期', width: 12 },
  { key: 'age', header: '年龄', width: 8 },
  { key: 'height', header: '身高(cm)', width: 10 },
  { key: 'weight', header: '体重(kg)', width: 10 },
  { key: 'occupation', header: '职业', width: 12 },
  { key: 'workplace', header: '工作单位', width: 15 },
  { key: 'address', header: '家庭地址', width: 25 },
  { key: 'hasAllergy', header: '过敏史', width: 8 },
  { key: 'hasSurgery', header: '整形或微创', width: 12 },
  { key: 'skinCondition', header: '皮肤状况', width: 15 },
  { key: 'totalSpent', header: '总消费金额', width: 12 },
  { key: 'memberLevel', header: '客户等级', width: 12 },
  { key: 'source', header: '客户来源', width: 10 },
  { key: 'lastVisitDate', header: '最后到店时间', width: 15 },
  { key: 'remark', header: '备注', width: 20 },
];

const CUSTOMER_IMPORT_COLUMNS: ExportColumn[] = [
  { key: 'name', header: '客户名称', width: 15 },
  { key: 'storeName', header: '所属门店', width: 20 },
  { key: 'email', header: '邮箱', width: 20 },
  { key: 'phone', header: '手机号码', width: 15 },
  { key: 'wechat', header: '微信号', width: 15 },
  { key: 'gender', header: '性别', width: 8 },
  { key: 'maritalStatus', header: '婚姻状态', width: 10 },
  { key: 'birthday', header: '出生日期', width: 12 },
  { key: 'age', header: '年龄', width: 8 },
  { key: 'occupation', header: '职业', width: 12 },
  { key: 'workplace', header: '工作单位', width: 15 },
  { key: 'address', header: '家庭地址', width: 25 },
  { key: 'hasAllergy', header: '过敏史', width: 8 },
  { key: 'hasSurgery', header: '整形或微创', width: 12 },
  { key: 'skinCondition', header: '皮肤状况', width: 15 },
  { key: 'memberLevel', header: '客户等级', width: 12 },
  { key: 'source', header: '客户来源', width: 10 },
  { key: 'remark', header: '备注', width: 20 },
];

const CUSTOMER_IMPORT_SAMPLE = [
  { name: '示例客户', storeName: '心悦芸美容养生会所', email: '', phone: '13800138000', wechat: '', gender: '女', maritalStatus: '未知', birthday: '1996-01-01', age: 30, occupation: '', workplace: '', address: '', hasAllergy: '无', hasSurgery: '无', skinCondition: '', memberLevel: '无', source: '门店', remark: '' },
];

import rawConsumptionRecords from '@/api/mock/data/consumption-records.json';
import rawHealthProfiles from '@/api/mock/data/health-profiles.json';

const MOCK_CONSUMPTION_RECORDS = rawConsumptionRecords as any[];
const MOCK_HEALTH_PROFILES = rawHealthProfiles as any[];

export function CustomerData() {
  const [activeTab, setActiveTab] = useState('base');

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [showPwdConfirm, setShowPwdConfirm] = useState(false);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<number[]>([]);

  // Pagination for consumption records
  const [spendPage, setSpendPage] = useState(1);
  const [spendPageSize, setSpendPageSize] = useState(50);
  const spendTotal = MOCK_CONSUMPTION_RECORDS.length;
  const spendData = MOCK_CONSUMPTION_RECORDS.slice((spendPage - 1) * spendPageSize, spendPage * spendPageSize);

  // Pagination for health profiles - merged with all customers
  const [healthPage, setHealthPage] = useState(1);
  const [healthPageSize, setHealthPageSize] = useState(50);
  const [healthSearch, setHealthSearch] = useState('');
  const [healthSkinFilter, setHealthSkinFilter] = useState('');
  const [editingHealth, setEditingHealth] = useState<any>(null);
  const [showHealthEditDialog, setShowHealthEditDialog] = useState(false);

  // Build health profile map by customerId
  const healthProfileMap = useMemo(() => {
    const map = new Map<number, any>();
    for (const p of MOCK_HEALTH_PROFILES) map.set(p.customerId, p);
    return map;
  }, []);

  // Merge all customers with health profiles
  const allHealthRows = useMemo(() => {
    return (rawCustomers as any[]).map((c: any) => {
      const hp = healthProfileMap.get(c.id);
      return {
        customerId: c.id,
        name: c.name,
        photo: hp?.photo || '',
        skinType: hp?.skinType || '-',
        skinStatus: hp?.skinStatus || '-',
        mainProblems: hp?.mainProblems || '-',
        allergyHistory: hp?.allergyHistory || (c.hasAllergy === '有' ? '有' : '-'),
        goals: hp?.goals || '-',
        recommendedCare: hp?.recommendedCare || '-',
        instrument: hp?.instrument || '-',
        lastCheck: hp?.lastCheck || '-',
      };
    });
  }, [healthProfileMap]);

  const filteredHealthRows = useMemo(() => {
    let rows = allHealthRows;
    if (healthSearch) {
      const kw = healthSearch.toLowerCase();
      rows = rows.filter((r) => r.name.toLowerCase().includes(kw));
    }
    if (healthSkinFilter) {
      rows = rows.filter((r) => r.skinType === healthSkinFilter);
    }
    return rows;
  }, [allHealthRows, healthSearch, healthSkinFilter]);

  const healthTotal = filteredHealthRows.length;
  const healthData = filteredHealthRows.slice((healthPage - 1) * healthPageSize, healthPage * healthPageSize);

  const filters = useMemo(() => ({}), []);
  const { data: customers, total, page, pageSize, loading, setPage, setPageSize, refresh } = usePagination<Customer>(getCustomersPaginated, filters);

  const { register, handleSubmit, formState: { errors, isSubmitting }, reset } = useForm<CustomerFormData>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      gender: '女',
      maritalStatus: '未知',
      hasAllergy: '无',
      hasSurgery: '无',
      memberLevel: '无',
      source: '',
      tags: [],
    },
  });

  const onSubmit = async (data: CustomerFormData) => {
    try {
      if (editingCustomer) {
        await updateCustomer(editingCustomer.id, data);
        toast.success('客户更新成功');
      } else {
        await createCustomer({ ...data, storeName: '心悦美容养生会所' });
        toast.success('客户创建成功');
      }
      handleCloseDialog();
      refresh();
    } catch (err: any) {
      toast.error(err?.message || (editingCustomer ? '更新客户失败' : '创建客户失败'));
    }
  };

  const handleOpenAdd = () => {
    setEditingCustomer(null);
    reset({ gender: '女', maritalStatus: '未知', hasAllergy: '无', hasSurgery: '无', memberLevel: '无', source: '', tags: [] });
    setShowAddDialog(true);
  };

  const handleOpenEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    reset({
      name: customer.name,
      phone: customer.phone,
      gender: customer.gender,
      age: customer.age,
      memberLevel: customer.memberLevel,
      tags: customer.tags,
      source: customer.source,
    });
    setShowAddDialog(true);
  };

  const handleCloseDialog = () => {
    setShowAddDialog(false);
    setEditingCustomer(null);
    reset();
  };

  const handleBatchDelete = () => {
    if (selectedIds.length === 0) return;
    setPendingDeleteIds(selectedIds);
    setShowPwdConfirm(true);
  };

  const handleDeleteOne = (id: number) => {
    setPendingDeleteIds([id]);
    setShowPwdConfirm(true);
  };

  const executeDelete = async () => {
    await deleteCustomers(pendingDeleteIds);
    toast.success(`已删除 ${pendingDeleteIds.length} 条客户`);
    setSelectedIds((prev) => prev.filter((id) => !pendingDeleteIds.includes(id)));
    setPendingDeleteIds([]);
    refresh();
  };

  const toggleSelectAll = () => {
    setSelectedIds(selectedIds.length === customers.length ? [] : customers.map((c) => c.id));
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]);
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-gray-800 border-b border-gray-100 pb-4">客户画像数据管理</h1>

      {/* Tabs */}
      <div className="flex gap-8 border-b border-gray-200">
        {[
          { id: 'base', label: '基础信息' },
          { id: 'spend', label: '消费记录' },
          { id: 'health', label: '肌肤档案' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`pb-3 px-1 text-sm font-medium transition-colors relative ${
              activeTab === tab.id ? 'text-blue-500' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
            {activeTab === tab.id && (
              <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-500" />
            )}
          </button>
        ))}
      </div>

      {/* Base Info Tab */}
      {activeTab === 'base' && (
        <>
          {/* Filters */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600 whitespace-nowrap">客户名称</label>
              <Input placeholder="请输入客户名称" className="w-48" />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600 whitespace-nowrap">手机号码</label>
              <Input placeholder="请输入手机号码" className="w-48" />
            </div>
            <Button className="gap-2">
              <Search className="w-4 h-4" /> 搜索
            </Button>
            <Button variant="default" className="gap-2 bg-[#1890ff]" onClick={handleOpenAdd}>
              <Plus className="w-4 h-4" /> 新增客户
            </Button>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <Button variant="danger" className="gap-2 bg-red-400 hover:bg-red-500" disabled={selectedIds.length === 0} onClick={handleBatchDelete}>
              <Trash2 className="w-4 h-4" /> 批量删除
            </Button>
            <Button variant="success" className="gap-2 bg-green-500 hover:bg-green-600" onClick={() => setShowImportDialog(true)}>
              <Upload className="w-4 h-4" /> 批量导入
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => downloadTemplate(CUSTOMER_IMPORT_COLUMNS, '客户导入模板', CUSTOMER_IMPORT_SAMPLE)}>
              <FileDown className="w-4 h-4" /> 下载模板
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => exportToExcel(customers, CUSTOMER_EXPORT_COLUMNS, '客户数据')}>
              <Download className="w-4 h-4" /> 导出
            </Button>
          </div>

          {/* Table */}
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
              <span className="ml-2 text-gray-500">加载中...</span>
            </div>
          )}
          {!loading && (
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50/80">
                <TableHead className="w-12 text-center">
                  <input type="checkbox" className="rounded border-gray-300" checked={selectedIds.length === customers.length && customers.length > 0} onChange={toggleSelectAll} />
                </TableHead>
                <TableHead>客户名称</TableHead>
                <TableHead>年龄</TableHead>
                <TableHead>手机号码</TableHead>
                <TableHead>性别</TableHead>
                <TableHead>会员等级</TableHead>
                <TableHead>累计消费</TableHead>
                <TableHead>客户来源</TableHead>
                <TableHead>最后到店时间</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((customer) => (
                <TableRow key={customer.id} className="hover:bg-blue-50/30">
                  <TableCell className="text-center">
                    <input type="checkbox" className="rounded border-gray-300" checked={selectedIds.includes(customer.id)} onChange={() => toggleSelect(customer.id)} />
                  </TableCell>
                  <TableCell className="font-medium text-gray-700">{customer.name}</TableCell>
                  <TableCell>{customer.age ?? '-'}</TableCell>
                  <TableCell>{customer.phone}</TableCell>
                  <TableCell>{customer.gender}</TableCell>
                  <TableCell>{customer.memberLevel}</TableCell>
                  <TableCell>¥{customer.totalSpent}</TableCell>
                  <TableCell>{customer.source}</TableCell>
                  <TableCell>{customer.lastVisitDate}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-3 text-sm">
                      <button className="flex items-center gap-1 text-blue-500 hover:text-blue-600" onClick={() => handleOpenEdit(customer)}>
                        <Eye className="w-4 h-4" /> 编辑
                      </button>
                      <button className="flex items-center gap-1 text-red-400 hover:text-red-500" onClick={() => handleDeleteOne(customer.id)}>
                        <Trash2 className="w-4 h-4" /> 删除
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          )}

          {/* Pagination */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
            <div className="text-sm text-gray-600">共 {total} 条</div>
            <div className="flex items-center gap-2">
              <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className="h-8 px-2 text-sm border border-gray-300 rounded">
                <option value={10}>10条/页</option>
                <option value={20}>20条/页</option>
                <option value={50}>50条/页</option>
              </select>
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</Button>
              <span className="text-sm text-gray-600">{page} / {Math.ceil(total / pageSize) || 1}</span>
              <Button variant="outline" size="sm" disabled={page >= Math.ceil(total / pageSize)} onClick={() => setPage(page + 1)}>下一页</Button>
            </div>
          </div>
        </>
      )}

      {/* Consumption Records Tab */}
      {activeTab === 'spend' && (
        <>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600 whitespace-nowrap">用户名称</label>
              <Input placeholder="请输入用户名称" className="w-48" />
            </div>
            <Button className="gap-2">
              <Search className="w-4 h-4" /> 搜索
            </Button>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <Button variant="danger" className="gap-2 bg-red-400 hover:bg-red-500">
              <Trash2 className="w-4 h-4" /> 批量删除
            </Button>
            <Button variant="success" className="gap-2 bg-green-500 hover:bg-green-600">
              <Upload className="w-4 h-4" /> 批量导入
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => downloadTemplate(
              [{ key: 'userName', header: '用户名称', width: 15 }, { key: 'consumeType', header: '消费类型', width: 12 }, { key: 'consumeContent', header: '消费内容', width: 20 }, { key: 'payMethod', header: '支付方式', width: 10 }, { key: 'amount', header: '消费金额', width: 12 }, { key: 'campaign', header: '关联营销活动', width: 15 }, { key: 'consumeTime', header: '消费时间', width: 18 }],
              '消费记录导入模板',
              [{ userName: '张小美', consumeType: '服务消费', consumeContent: '深层清洁护理', payMethod: '微信支付', amount: '¥588.00', campaign: '春季活动', consumeTime: '2024-03-15 14:30' }]
            )}>
              <FileDown className="w-4 h-4" /> 下载模板
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => exportToExcel(
              MOCK_CONSUMPTION_RECORDS,
              [{ key: 'userName', header: '用户名称', width: 15 }, { key: 'consumeType', header: '消费类型', width: 12 }, { key: 'consumeContent', header: '消费内容', width: 20 }, { key: 'payMethod', header: '支付方式', width: 10 }, { key: 'amount', header: '消费金额', width: 12 }, { key: 'campaign', header: '关联营销活动', width: 15 }, { key: 'consumeTime', header: '消费时间', width: 18 }],
              '消费记录'
            )}>
              <Download className="w-4 h-4" /> 导出
            </Button>
          </div>

          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50/80">
                <TableHead className="w-12 text-center">
                  <input type="checkbox" className="rounded border-gray-300" />
                </TableHead>
                <TableHead>用户名称</TableHead>
                <TableHead>消费类型</TableHead>
                <TableHead>消费内容</TableHead>
                <TableHead>支付方式</TableHead>
                <TableHead>消费金额</TableHead>
                <TableHead>关联营销活动</TableHead>
                <TableHead>消费时间</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {spendData.map((record: any) => (
                <TableRow key={record.id} className="hover:bg-blue-50/30">
                  <TableCell className="text-center">
                    <input type="checkbox" className="rounded border-gray-300" />
                  </TableCell>
                  <TableCell className="font-medium text-gray-700">{record.userName}</TableCell>
                  <TableCell>{record.consumeType}</TableCell>
                  <TableCell>{record.consumeContent}</TableCell>
                  <TableCell>{record.payMethod}</TableCell>
                  <TableCell className="font-medium text-gray-800">{record.amount}</TableCell>
                  <TableCell>{record.campaign}</TableCell>
                  <TableCell>{record.consumeTime}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Pagination */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
            <div className="text-sm text-gray-600">共 {spendTotal} 条</div>
            <div className="flex items-center gap-2">
              <select value={spendPageSize} onChange={(e) => { setSpendPageSize(Number(e.target.value)); setSpendPage(1); }} className="h-8 px-2 text-sm border border-gray-300 rounded">
                <option value={10}>10条/页</option>
                <option value={20}>20条/页</option>
                <option value={50}>50条/页</option>
              </select>
              <Button variant="outline" size="sm" disabled={spendPage <= 1} onClick={() => setSpendPage(spendPage - 1)}>上一页</Button>
              <span className="text-sm text-gray-600">{spendPage} / {Math.ceil(spendTotal / spendPageSize) || 1}</span>
              <Button variant="outline" size="sm" disabled={spendPage >= Math.ceil(spendTotal / spendPageSize)} onClick={() => setSpendPage(spendPage + 1)}>下一页</Button>
            </div>
          </div>
        </>
      )}

      {/* Health Profile Tab */}
      {activeTab === 'health' && (
        <>
          {/* Search & Filter */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600 whitespace-nowrap">用户姓名</label>
              <Input placeholder="请输入用户姓名" className="w-48" value={healthSearch} onChange={(e) => { setHealthSearch(e.target.value); setHealthPage(1); }} />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600 whitespace-nowrap">肌肤类型</label>
              <select className="h-9 w-36 px-3 text-sm border border-gray-300 rounded-md" value={healthSkinFilter} onChange={(e) => { setHealthSkinFilter(e.target.value); setHealthPage(1); }}>
                <option value="">全部</option>
                <option value="干性">干性</option>
                <option value="油性">油性</option>
                <option value="混干">混干</option>
                <option value="混油">混油</option>
                <option value="中性">中性</option>
                <option value="敏感">敏感</option>
                <option value="-">未检测</option>
              </select>
            </div>
            <Button className="gap-2" onClick={() => setHealthPage(1)}>
              <Search className="w-4 h-4" /> 搜索
            </Button>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <Button variant="danger" className="gap-2 bg-red-400 hover:bg-red-500">
              <Trash2 className="w-4 h-4" /> 批量删除
            </Button>
            <Button variant="success" className="gap-2 bg-green-500 hover:bg-green-600">
              <Upload className="w-4 h-4" /> 批量导入
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => downloadTemplate(
              [{ key: 'name', header: '用户姓名', width: 15 }, { key: 'skinType', header: '肌肤类型', width: 10 }, { key: 'skinStatus', header: '肌肤状态', width: 15 }, { key: 'mainProblems', header: '主要问题', width: 20 }, { key: 'allergyHistory', header: '过敏史', width: 10 }, { key: 'goals', header: '改善目标', width: 15 }, { key: 'recommendedCare', header: '推荐护理', width: 15 }, { key: 'instrument', header: '检测仪器', width: 15 }, { key: 'lastCheck', header: '最近检查时间', width: 15 }],
              '肌肤档案导入模板',
              [{ name: '张小美', skinType: '混干', skinStatus: '皮肤薄', mainProblems: 'T区出油', allergyHistory: '没有', goals: '补水保湿', recommendedCare: '补水保湿', instrument: '面部皮肤检测器', lastCheck: '2025-05-09' }]
            )}>
              <FileDown className="w-4 h-4" /> 下载模板
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => exportToExcel(
              filteredHealthRows,
              [{ key: 'name', header: '用户姓名', width: 15 }, { key: 'skinType', header: '肌肤类型', width: 10 }, { key: 'skinStatus', header: '肌肤状态', width: 15 }, { key: 'mainProblems', header: '主要问题', width: 20 }, { key: 'allergyHistory', header: '过敏史', width: 10 }, { key: 'goals', header: '改善目标', width: 15 }, { key: 'recommendedCare', header: '推荐护理', width: 15 }, { key: 'instrument', header: '检测仪器', width: 15 }, { key: 'lastCheck', header: '最近检查时间', width: 15 }],
              '肌肤档案'
            )}>
              <Download className="w-4 h-4" /> 导出
            </Button>
          </div>

          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50/80">
                <TableHead className="w-12 text-center"><input type="checkbox" className="rounded border-gray-300" /></TableHead>
                <TableHead>用户姓名</TableHead>
                <TableHead>肌肤类型</TableHead>
                <TableHead>肌肤状态</TableHead>
                <TableHead>主要问题</TableHead>
                <TableHead>过敏史</TableHead>
                <TableHead>改善目标</TableHead>
                <TableHead>推荐护理</TableHead>
                <TableHead>检测仪器</TableHead>
                <TableHead>最近检查时间</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {healthData.map((row: any) => (
                <TableRow key={row.customerId} className="hover:bg-blue-50/30">
                  <TableCell className="text-center"><input type="checkbox" className="rounded border-gray-300" /></TableCell>
                  <TableCell className="font-medium text-gray-700">{row.name}</TableCell>
                  <TableCell><span className={row.skinType === '-' ? 'text-gray-400' : 'text-gray-700'}>{row.skinType}</span></TableCell>
                  <TableCell><span className={row.skinStatus === '-' ? 'text-gray-400' : 'text-gray-700'}>{row.skinStatus}</span></TableCell>
                  <TableCell className="max-w-[120px] truncate"><span className={row.mainProblems === '-' ? 'text-gray-400' : 'text-gray-700'}>{row.mainProblems}</span></TableCell>
                  <TableCell><span className={row.allergyHistory === '-' ? 'text-gray-400' : 'text-gray-700'}>{row.allergyHistory}</span></TableCell>
                  <TableCell><span className={row.goals === '-' ? 'text-gray-400' : 'text-gray-700'}>{row.goals}</span></TableCell>
                  <TableCell><span className={row.recommendedCare === '-' ? 'text-gray-400' : 'text-gray-700'}>{row.recommendedCare}</span></TableCell>
                  <TableCell><span className={row.instrument === '-' ? 'text-gray-400' : 'text-gray-700'}>{row.instrument}</span></TableCell>
                  <TableCell><span className={row.lastCheck === '-' ? 'text-gray-400' : 'text-gray-700'}>{row.lastCheck}</span></TableCell>
                  <TableCell className="text-right">
                    <button className="flex items-center gap-1 text-blue-500 hover:text-blue-600 text-sm" onClick={() => { setEditingHealth(row); setShowHealthEditDialog(true); }}>
                      <Edit2 className="w-4 h-4" /> 编辑
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Pagination */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
            <div className="text-sm text-gray-600">共 {healthTotal} 条</div>
            <div className="flex items-center gap-2">
              <select value={healthPageSize} onChange={(e) => { setHealthPageSize(Number(e.target.value)); setHealthPage(1); }} className="h-8 px-2 text-sm border border-gray-300 rounded">
                <option value={10}>10条/页</option>
                <option value={20}>20条/页</option>
                <option value={50}>50条/页</option>
              </select>
              <Button variant="outline" size="sm" disabled={healthPage <= 1} onClick={() => setHealthPage(healthPage - 1)}>上一页</Button>
              <span className="text-sm text-gray-600">{healthPage} / {Math.ceil(healthTotal / healthPageSize) || 1}</span>
              <Button variant="outline" size="sm" disabled={healthPage >= Math.ceil(healthTotal / healthPageSize)} onClick={() => setHealthPage(healthPage + 1)}>下一页</Button>
            </div>
          </div>
        </>
      )}

      {/* Health Edit Dialog */}
      <Dialog open={showHealthEditDialog} onOpenChange={setShowHealthEditDialog}>
        <DialogContent className="max-w-lg" aria-describedby="health-edit-desc">
          <DialogHeader><DialogTitle>编辑肌肤档案 — {editingHealth?.name}</DialogTitle></DialogHeader>
          <span id="health-edit-desc" className="sr-only">编辑客户肌肤档案信息</span>
          {editingHealth && (
            <div className="space-y-4 mt-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">肌肤类型</label>
                <select className="w-full h-9 px-3 text-sm border border-gray-300 rounded-md" value={editingHealth.skinType === '-' ? '' : editingHealth.skinType} onChange={(e) => setEditingHealth({ ...editingHealth, skinType: e.target.value || '-' })}>
                  <option value="">未检测</option>
                  <option value="干性">干性</option><option value="油性">油性</option><option value="混干">混干</option>
                  <option value="混油">混油</option><option value="中性">中性</option><option value="敏感">敏感</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">肌肤状态</label>
                <Input value={editingHealth.skinStatus === '-' ? '' : editingHealth.skinStatus} onChange={(e) => setEditingHealth({ ...editingHealth, skinStatus: e.target.value || '-' })} placeholder="如：皮肤薄、偏干缺水" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">主要问题</label>
                <Input value={editingHealth.mainProblems === '-' ? '' : editingHealth.mainProblems} onChange={(e) => setEditingHealth({ ...editingHealth, mainProblems: e.target.value || '-' })} placeholder="如：T区出油, 毛孔粗大" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">过敏史</label>
                <Input value={editingHealth.allergyHistory === '-' ? '' : editingHealth.allergyHistory} onChange={(e) => setEditingHealth({ ...editingHealth, allergyHistory: e.target.value || '-' })} placeholder="如：没有 / 花粉过敏" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">改善目标</label>
                <Input value={editingHealth.goals === '-' ? '' : editingHealth.goals} onChange={(e) => setEditingHealth({ ...editingHealth, goals: e.target.value || '-' })} placeholder="如：补水保湿, 美白提亮" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">推荐护理</label>
                <Input value={editingHealth.recommendedCare === '-' ? '' : editingHealth.recommendedCare} onChange={(e) => setEditingHealth({ ...editingHealth, recommendedCare: e.target.value || '-' })} placeholder="如：补水保湿+光子嫩肤" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">检测仪器</label>
                <Input value={editingHealth.instrument === '-' ? '' : editingHealth.instrument} onChange={(e) => setEditingHealth({ ...editingHealth, instrument: e.target.value || '-' })} placeholder="如：VISIA皮肤分析仪" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">最近检查时间</label>
                <Input type="date" value={editingHealth.lastCheck === '-' ? '' : editingHealth.lastCheck} onChange={(e) => setEditingHealth({ ...editingHealth, lastCheck: e.target.value || '-' })} />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" onClick={() => setShowHealthEditDialog(false)}>取消</Button>
                <Button onClick={() => { toast.success('肌肤档案已更新'); setShowHealthEditDialog(false); }}>保存</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add/Edit Customer Dialog */}
      <Dialog open={showAddDialog} onOpenChange={handleCloseDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" aria-describedby="customer-dialog-description">
          <DialogHeader>
            <DialogTitle>{editingCustomer ? '编辑客户' : '新增客户'}</DialogTitle>
          </DialogHeader>
          <span id="customer-dialog-description" className="sr-only">{editingCustomer ? '编辑客户信息' : '创建新客户'}</span>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 mt-4">
            {/* Row 1: Name + Store */}
            <div className="grid grid-cols-2 gap-6">
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-gray-700 whitespace-nowrap w-24 text-right"><span className="text-red-500">*</span> 客户名称</label>
                <div className="flex-1">
                  <Input placeholder="请输入客户名称" {...register('name')} />
                  {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-gray-700 whitespace-nowrap w-24 text-right">所属门店</label>
                <select className="flex-1 h-9 px-3 text-sm border border-gray-300 rounded-md" {...register('storeName')}>
                  <option value="心悦芸美容养生会所">心悦芸美容养生会所</option>
                  <option value="凤仪阁美容养生会所">凤仪阁美容养生会所</option>
                </select>
              </div>
            </div>

            {/* Row 2: Email + Phone */}
            <div className="grid grid-cols-2 gap-6">
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-gray-700 whitespace-nowrap w-24 text-right">邮箱</label>
                <div className="flex-1">
                  <Input placeholder="请输入邮箱" {...register('email')} />
                  {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-gray-700 whitespace-nowrap w-24 text-right">手机号码</label>
                <div className="flex-1">
                  <Input placeholder="请输入手机号码" {...register('phone')} />
                  {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone.message}</p>}
                </div>
              </div>
            </div>

            {/* Row 3: Landline + WeChat */}
            <div className="grid grid-cols-2 gap-6">
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-gray-700 whitespace-nowrap w-24 text-right">座机号</label>
                <Input placeholder="请输入座机号" className="flex-1" {...register('landline')} />
              </div>
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-gray-700 whitespace-nowrap w-24 text-right">微信号</label>
                <Input placeholder="请输入微信号" className="flex-1" {...register('wechat')} />
              </div>
            </div>

            {/* Row 4: Gender + Marital Status */}
            <div className="grid grid-cols-2 gap-6">
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-gray-700 whitespace-nowrap w-24 text-right"><span className="text-red-500">*</span> 性别</label>
                <div className="flex-1 flex items-center gap-4">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" value="男" {...register('gender')} className="text-blue-500" />
                    <span className="text-sm">男</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" value="女" {...register('gender')} className="text-blue-500" />
                    <span className="text-sm text-blue-500">女</span>
                  </label>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-gray-700 whitespace-nowrap w-24 text-right">婚姻状态</label>
                <div className="flex-1 flex items-center gap-4">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" value="未知" {...register('maritalStatus')} className="text-blue-500" />
                    <span className="text-sm text-blue-500">未知</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" value="已婚" {...register('maritalStatus')} className="text-blue-500" />
                    <span className="text-sm">已婚</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" value="未婚" {...register('maritalStatus')} className="text-blue-500" />
                    <span className="text-sm">未婚</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Row 5: Birthday + Age */}
            <div className="grid grid-cols-2 gap-6">
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-gray-700 whitespace-nowrap w-24 text-right">出生日期</label>
                <Input type="date" className="flex-1" {...register('birthday')} />
              </div>
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-gray-700 whitespace-nowrap w-24 text-right">年龄</label>
                <Input type="number" placeholder="请输入年龄" className="flex-1" {...register('age', { valueAsNumber: true })} />
              </div>
            </div>

            {/* Row 6: Height + Weight */}
            <div className="grid grid-cols-2 gap-6">
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-gray-700 whitespace-nowrap w-24 text-right">身高(cm)</label>
                <Input type="number" placeholder="请输入身高" className="flex-1" {...register('height', { valueAsNumber: true })} />
              </div>
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-gray-700 whitespace-nowrap w-24 text-right">体重(kg)</label>
                <Input type="number" placeholder="请输入体重" className="flex-1" {...register('weight', { valueAsNumber: true })} />
              </div>
            </div>

            {/* Row 7: Occupation + Workplace */}
            <div className="grid grid-cols-2 gap-6">
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-gray-700 whitespace-nowrap w-24 text-right">职业</label>
                <Input placeholder="请输入职业" className="flex-1" {...register('occupation')} />
              </div>
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-gray-700 whitespace-nowrap w-24 text-right">工作单位</label>
                <Input placeholder="请输入工作单位" className="flex-1" {...register('workplace')} />
              </div>
            </div>

            {/* Row 8: Address (full width) */}
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-gray-700 whitespace-nowrap w-24 text-right">家庭地址</label>
              <Input placeholder="请输入家庭地址" className="flex-1" {...register('address')} />
            </div>

            {/* Row 9: Allergy */}
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-gray-700 whitespace-nowrap w-24 text-right">过敏史</label>
              <div className="flex-1 flex items-center gap-4">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" value="无" {...register('hasAllergy')} className="text-blue-500" />
                  <span className="text-sm text-blue-500">无</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" value="有" {...register('hasAllergy')} className="text-blue-500" />
                  <span className="text-sm">有</span>
                </label>
              </div>
            </div>

            {/* Row 10: Surgery */}
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-gray-700 whitespace-nowrap w-24 text-right">有无整形或微创治疗</label>
              <div className="flex-1 flex items-center gap-4">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" value="无" {...register('hasSurgery')} className="text-blue-500" />
                  <span className="text-sm text-blue-500">无</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" value="有" {...register('hasSurgery')} className="text-blue-500" />
                  <span className="text-sm">有</span>
                </label>
              </div>
            </div>

            {/* Row 11: Skin Condition */}
            <div className="flex items-start gap-3">
              <label className="text-sm font-medium text-gray-700 whitespace-nowrap w-24 text-right mt-2">皮肤状况</label>
              <textarea placeholder="请输入皮肤状况" rows={2} className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-blue-500" {...register('skinCondition')} />
            </div>

            {/* Row 12: Total Spent */}
            <div className="grid grid-cols-2 gap-6">
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-gray-700 whitespace-nowrap w-24 text-right">总消费金额</label>
                <Input type="number" placeholder="0" className="flex-1" {...register('totalSpent', { valueAsNumber: true })} />
              </div>
            </div>

            {/* Row 13: Member Level + Source */}
            <div className="grid grid-cols-2 gap-6">
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-gray-700 whitespace-nowrap w-24 text-right">客户等级</label>
                <select className="flex-1 h-9 px-3 text-sm border border-gray-300 rounded-md" {...register('memberLevel')}>
                  <option value="无">无</option>
                  <option value="普通会员">普通会员</option>
                  <option value="银卡会员">银卡会员</option>
                  <option value="金卡会员">金卡会员</option>
                  <option value="钻石会员">钻石会员</option>
                </select>
              </div>
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-gray-700 whitespace-nowrap w-24 text-right">客户来源</label>
                <select className="flex-1 h-9 px-3 text-sm border border-gray-300 rounded-md" {...register('source')}>
                  <option value="">请选择客户来源</option>
                  <option value="门店">门店</option>
                  <option value="推荐">推荐</option>
                  <option value="线上">线上</option>
                  <option value="活动">活动</option>
                </select>
              </div>
            </div>

            {/* Row 14: Last Visit Date */}
            <div className="grid grid-cols-2 gap-6">
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-gray-700 whitespace-nowrap w-24 text-right">最后到店时间</label>
                <Input type="datetime-local" className="flex-1" {...register('lastVisitDate')} />
              </div>
            </div>

            {/* Row 15: Remark */}
            <div className="flex items-start gap-3">
              <label className="text-sm font-medium text-gray-700 whitespace-nowrap w-24 text-right mt-2">备注</label>
              <textarea placeholder="请输入备注" rows={3} className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm resize-y focus:outline-none focus:ring-1 focus:ring-blue-500" {...register('remark')} />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={handleCloseDialog}>取消</Button>
              <Button type="submit" disabled={isSubmitting} className="bg-[#1890ff]">
                {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {editingCustomer ? '保存' : '创建'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Import Dialog */}
      <ImportDialog
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
        title="批量导入客户"
        columns={CUSTOMER_IMPORT_COLUMNS}
        requiredColumns={['客户姓名', '手机号码']}
        onImport={importCustomers}
        onSuccess={refresh}
      />

      <PasswordConfirmDialog
        open={showPwdConfirm}
        onOpenChange={setShowPwdConfirm}
        description={`即将删除 ${pendingDeleteIds.length} 条客户数据，此操作不可撤销，请输入账号密码确认身份`}
        onConfirm={executeDelete}
      />
    </div>
  );
}
