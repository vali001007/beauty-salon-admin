import { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, RotateCcw, Plus, Trash2, Loader2, Sparkles } from 'lucide-react';
import { Input, Button, Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '../components/UI';
import { AddProjectDialog } from '../components/AddProjectDialog';
import { MarketingPageGeneratorDialog, type MarketingPageGeneratorSource } from '../components/MarketingPageGeneratorDialog';
import { getProjectsPaginated, deleteProject } from '@/api/project';
import { getProjectTypes, type ProjectType } from '@/api/projectType';
import { toast } from 'sonner';
import type { Project } from '@/types';
import { usePagination } from '@/hooks/usePagination';

function StatusBadge({ active, children }: { active: boolean, children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
      active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
    }`}>
      {children}
    </span>
  );
}

function ToggleSwitch({ checked }: { checked: boolean }) {
  return (
    <button
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
        checked ? 'bg-blue-500' : 'bg-gray-200'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
          checked ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

function getProjectBomCompleteness(project: Project) {
  const bom = project.bom ?? [];
  if (!bom.length) {
    return {
      label: '未配置',
      hint: '不会自动扣耗材',
      className: 'bg-amber-50 text-amber-700 border-amber-200',
    };
  }
  if (bom.some((item) => item.productStatus === '停售' || item.productStatus === 'offline' || item.productStatus === 'inactive' || !item.productName)) {
    return {
      label: '商品已下架',
      hint: '需替换耗材',
      className: 'bg-red-50 text-red-700 border-red-200',
    };
  }
  if (bom.some((item) => Number(item.costPrice ?? 0) <= 0)) {
    return {
      label: '缺成本',
      hint: `${bom.length} 项耗材`,
      className: 'bg-orange-50 text-orange-700 border-orange-200',
    };
  }
  return {
    label: '已配置',
    hint: `${bom.length} 项耗材`,
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  };
}

function formatProjectCarePlan(project: Project) {
  const parts = [
    project.careCycleWeeks ? `周期 ${project.careCycleWeeks} 周` : '',
    project.treatmentCourseTimes ? `疗程 ${project.treatmentCourseTimes} 次` : '',
  ].filter(Boolean);
  return parts.length ? parts.join(' / ') : '-';
}

export function ProjectManagement() {
  const [isAddProjectDialogOpen, setIsAddProjectDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [projectTypeList, setProjectTypeList] = useState<ProjectType[]>([]);
  const [marketingPageSource, setMarketingPageSource] = useState<MarketingPageGeneratorSource | null>(null);
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<number>>(new Set());
  const projectFilters = useMemo(() => ({}), []);
  const { data: projects, total, page, pageSize, loading, setPage, setPageSize, refresh } =
    usePagination<Project>(getProjectsPaginated, projectFilters);
  const currentPageProjectIds = useMemo(() => projects.map((project) => project.id), [projects]);
  const isAllCurrentPageSelected = currentPageProjectIds.length > 0
    && currentPageProjectIds.every((id) => selectedProjectIds.has(id));

  const loadProjects = useCallback(async () => {
    try {
      refresh();
    } catch {
      toast.error('加载项目列表失败');
    }
  }, [refresh]);

  const loadProjectTypes = useCallback(async () => {
    try {
      const types = await getProjectTypes();
      setProjectTypeList(types.filter((t) => t.status === '启用'));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    loadProjectTypes();
  }, [loadProjectTypes]);

  useEffect(() => {
    const handleProjectBomUpdated = () => loadProjects();
    window.addEventListener('project-bom-updated', handleProjectBomUpdated);
    return () => window.removeEventListener('project-bom-updated', handleProjectBomUpdated);
  }, [loadProjects]);

  useEffect(() => {
    setSelectedProjectIds((prev) => {
      const visibleIds = new Set(currentPageProjectIds);
      const next = new Set([...prev].filter((id) => visibleIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [currentPageProjectIds]);

  const handleOpenQuickEdit = (project: Project) => {
    setEditingProject(project);
    setIsAddProjectDialogOpen(true);
  };

  const openMarketingPageGenerator = (project: Project) => {
    setMarketingPageSource({
      type: 'project',
      item: project,
      storeName: project.storeName,
    });
  };

  const toggleProjectSelection = (projectId: number) => {
    setSelectedProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  };

  const toggleCurrentPageSelection = () => {
    setSelectedProjectIds((prev) => {
      if (isAllCurrentPageSelected) {
        return new Set();
      }
      return new Set(currentPageProjectIds);
    });
  };

  const handleDeleteSelectedProjects = async () => {
    const ids = [...selectedProjectIds];
    if (ids.length === 0) {
      toast.warning('请先勾选需要删除的项目');
      return;
    }

    const confirmed = window.confirm(`确认删除已选 ${ids.length} 个项目？删除后项目列表和预约选择中将不再展示，历史订单和BOM记录会保留。`);
    if (!confirmed) return;

    try {
      await Promise.all(ids.map((id) => deleteProject(id)));
      setSelectedProjectIds(new Set());
      toast.success(`已删除 ${ids.length} 个项目`);
      loadProjects();
    } catch (err: any) {
      toast.error(err?.message || '删除项目失败');
    }
  };

  const handleCloseProjectDialog = () => {
    setIsAddProjectDialogOpen(false);
    setEditingProject(null);
    loadProjects();
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Search Bar */}
      <div className="flex items-center gap-4 bg-white p-4 rounded-lg shadow-sm border border-gray-100">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700 whitespace-nowrap">项目名称</label>
          <Input placeholder="请输入项目名称" className="w-64 border-gray-300 focus:border-blue-500 focus:ring-blue-500" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700 whitespace-nowrap">项目类型</label>
          <select className="flex h-9 w-40 rounded-md border border-gray-300 bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500">
            <option value="">全部</option>
            {projectTypeList.map((t) => (
              <option key={t.id} value={t.name}>{t.name}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2 ml-4">
          <Button className="bg-[#1890ff] hover:bg-blue-600 px-6 gap-2 h-9 shadow-sm">
            <Search className="w-4 h-4" /> 搜索
          </Button>
          <Button variant="outline" className="px-6 gap-2 h-9 border-gray-300 text-gray-700 hover:bg-gray-50 shadow-sm">
            <RotateCcw className="w-4 h-4" /> 重置
          </Button>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Button
            className="bg-blue-50 hover:bg-blue-100 text-[#1890ff] border border-blue-200 gap-1.5 px-4 shadow-sm"
            onClick={() => {
              setEditingProject(null);
              setIsAddProjectDialogOpen(true);
            }}
          >
             <Plus className="w-4 h-4" /> 新增
          </Button>
          <Button
            className="bg-red-50 hover:bg-red-100 text-red-500 border border-red-200 gap-1.5 px-4 shadow-sm disabled:opacity-50"
            onClick={handleDeleteSelectedProjects}
            disabled={selectedProjectIds.size === 0}
          >
            <Trash2 className="w-4 h-4" /> 删除
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {loading && (
          <div className="flex items-center justify-center py-10 text-gray-500">
            <Loader2 className="mr-2 h-5 w-5 animate-spin text-blue-500" />
            正在加载项目...
          </div>
        )}
        {!loading && (
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50/80 border-b border-gray-200">
              <TableHead className="w-12 text-center">
                <input
                  type="checkbox"
                  aria-label="选择当前页全部项目"
                  className="rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                  checked={isAllCurrentPageSelected}
                  onChange={toggleCurrentPageSelection}
                />
              </TableHead>
              <TableHead>项目编号</TableHead>
              <TableHead>图片</TableHead>
              <TableHead>项目名称</TableHead>
              <TableHead>所属门店</TableHead>
              <TableHead>项目类型</TableHead>
              <TableHead>项目价格</TableHead>
              <TableHead>BOM完整度</TableHead>
              <TableHead className="text-center">是否推荐</TableHead>
              <TableHead className="text-center">线上展示</TableHead>
              <TableHead className="text-center">首页展示</TableHead>
              <TableHead className="text-center">状态</TableHead>
              <TableHead>项目时长</TableHead>
              <TableHead>护理计划</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {projects.map((project) => (
              <TableRow key={project.id} className="hover:bg-blue-50/40 transition-colors group">
                <TableCell className="text-center align-middle">
                  <input
                    type="checkbox"
                    aria-label={`选择项目 ${project.name}`}
                    className="rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                    checked={selectedProjectIds.has(project.id)}
                    onChange={() => toggleProjectSelection(project.id)}
                  />
                </TableCell>
                <TableCell className="font-medium text-gray-500 align-middle">{project.id}</TableCell>
                <TableCell className="align-middle">
                  <div className="w-12 h-12 bg-gray-100 rounded-md overflow-hidden flex items-center justify-center border border-gray-200 shadow-sm">
                    {project.image ? (
                      <img src={project.image} alt={project.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" />
                    ) : (
                      <span className="text-gray-400 text-xs font-medium">无图</span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="font-semibold text-gray-800 align-middle">{project.name}</TableCell>
                <TableCell className="text-gray-600 align-middle">{project.storeName}</TableCell>
                <TableCell className="text-gray-600 align-middle">{project.type}</TableCell>
                <TableCell className="font-medium text-orange-500 align-middle">{project.price > 0 ? `¥${project.price.toFixed(2)}` : '-'}</TableCell>
                <TableCell className="align-middle">
                  {(() => {
                    const completeness = getProjectBomCompleteness(project);
                    return (
                      <div>
                        <span className={`inline-flex rounded border px-2 py-0.5 text-xs font-medium ${completeness.className}`}>
                          {completeness.label}
                        </span>
                        <div className="mt-1 text-xs text-gray-500">{completeness.hint}</div>
                      </div>
                    );
                  })()}
                </TableCell>
                <TableCell className="text-center align-middle">
                  <StatusBadge active={project.recommend}>{project.recommend ? '是' : '否'}</StatusBadge>
                </TableCell>
                <TableCell className="text-center align-middle">
                  <StatusBadge active={project.online}>{project.online ? '是' : '否'}</StatusBadge>
                </TableCell>
                <TableCell className="text-center align-middle">
                  <StatusBadge active={project.home}>{project.home ? '是' : '否'}</StatusBadge>
                </TableCell>
                <TableCell className="text-center align-middle">
                  <ToggleSwitch checked={project.status} />
                </TableCell>
                <TableCell className="text-gray-600 align-middle">{project.duration} 分钟</TableCell>
                <TableCell className="text-gray-600 align-middle">{formatProjectCarePlan(project)}</TableCell>
                <TableCell className="text-right align-middle">
                  <div className="flex items-center justify-end gap-3">
                    <button className="inline-flex items-center gap-1 text-purple-600 hover:text-purple-700 text-sm" onClick={() => openMarketingPageGenerator(project)}>
                      <Sparkles className="h-3.5 w-3.5" />
                      生成推广页
                    </button>
                    <button className="text-blue-500 hover:text-blue-600 text-sm" onClick={() => handleOpenQuickEdit(project)}>
                      编辑
                    </button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        )}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm text-gray-500 px-2 mt-4">
        <span>共 {total} 条数据</span>
        <div className="flex items-center gap-2">
          <select
            value={pageSize}
            onChange={(event) => setPageSize(Number(event.target.value))}
            className="border border-gray-300 rounded px-2 py-1 bg-white focus:outline-none focus:border-blue-500 text-gray-700"
          >
            <option value={10}>10条/页</option>
            <option value={20}>20条/页</option>
            <option value={50}>50条/页</option>
          </select>
          <div className="flex items-center gap-1 border border-gray-200 rounded-md overflow-hidden shadow-sm">
            <button
              className="px-3 py-1 bg-white hover:bg-gray-50 disabled:opacity-50 border-r border-gray-200"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              &lt;
            </button>
            <button className="px-3 py-1 bg-[#1890ff] text-white font-medium">{page}</button>
            <button
              className="px-3 py-1 bg-white hover:bg-gray-50 border-l border-gray-200 disabled:opacity-50"
              disabled={page >= Math.ceil(total / pageSize)}
              onClick={() => setPage(page + 1)}
            >
              &gt;
            </button>
          </div>
          <span className="ml-4">{page} / {Math.ceil(total / pageSize) || 1}</span>
        </div>
      </div>

      {/* Full Add Project Dialog (rich editor) */}
      <AddProjectDialog
        open={isAddProjectDialogOpen}
        initialProject={editingProject}
        onClose={handleCloseProjectDialog}
      />

      <MarketingPageGeneratorDialog
        source={marketingPageSource}
        onClose={() => setMarketingPageSource(null)}
        onPublished={loadProjects}
      />
    </div>
  );
}
