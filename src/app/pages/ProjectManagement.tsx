import { useState, useEffect, useCallback } from 'react';
import { Search, RotateCcw, Plus, Edit, Trash2, Loader2 } from 'lucide-react';
import { Input, Button, Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '../components/UI';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { AddProjectDialog } from '../components/AddProjectDialog';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { projectSchema, type ProjectFormData } from '@/schemas/project';
import { getProjects, createProject, updateProject } from '@/api/project';
import { getProjectTypes, type ProjectType } from '@/api/projectType';
import { toast } from 'sonner';
import type { Project } from '@/types';

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

export function ProjectManagement() {
  const [isAddProjectDialogOpen, setIsAddProjectDialogOpen] = useState(false);
  const [showQuickAddDialog, setShowQuickAddDialog] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectTypeList, setProjectTypeList] = useState<ProjectType[]>([]);

  const { register, handleSubmit, formState: { errors, isSubmitting }, reset } = useForm<ProjectFormData>({
    resolver: zodResolver(projectSchema),
  });

  const loadProjects = useCallback(async () => {
    try {
      const data = await getProjects();
      setProjects(data);
    } catch {
      toast.error('加载项目列表失败');
    }
  }, []);

  const loadProjectTypes = useCallback(async () => {
    try {
      const types = await getProjectTypes();
      setProjectTypeList(types.filter((t) => t.status === '启用'));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    loadProjects();
    loadProjectTypes();
  }, [loadProjects, loadProjectTypes]);

  const onQuickSubmit = async (data: ProjectFormData) => {
    try {
      if (editingProject) {
        await updateProject(editingProject.id, {
          name: data.name,
          duration: data.duration,
          price: data.price,
        });
        toast.success('项目更新成功');
      } else {
        await createProject({
          name: data.name,
          type: '面部护理',
          duration: data.duration,
          price: data.price,
          storeName: '心悦芸美容养生会所',
          recommend: false,
          online: true,
          home: false,
          status: true,
          sort: 0,
        });
        toast.success('项目创建成功');
      }
      handleCloseQuickDialog();
      loadProjects();
    } catch (err: any) {
      toast.error(err?.message || (editingProject ? '更新项目失败' : '创建项目失败'));
    }
  };

  const handleOpenQuickEdit = (project: Project) => {
    setEditingProject(project);
    reset({
      name: project.name,
      duration: project.duration,
      price: project.price,
    });
    setShowQuickAddDialog(true);
  };

  const handleCloseQuickDialog = () => {
    setShowQuickAddDialog(false);
    setEditingProject(null);
    reset();
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
          <Button className="bg-blue-50 hover:bg-blue-100 text-[#1890ff] border border-blue-200 gap-1.5 px-4 shadow-sm" onClick={() => setIsAddProjectDialogOpen(true)}>
             <Plus className="w-4 h-4" /> 新增
          </Button>
          <Button className="bg-green-50 hover:bg-green-100 text-green-600 border border-green-200 gap-1.5 px-4 shadow-sm">
            <Edit className="w-4 h-4" /> 修改
          </Button>
          <Button className="bg-red-50 hover:bg-red-100 text-red-500 border border-red-200 gap-1.5 px-4 shadow-sm">
            <Trash2 className="w-4 h-4" /> 删除
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50/80 border-b border-gray-200">
              <TableHead className="w-12 text-center">
                <input type="checkbox" className="rounded border-gray-300 text-blue-500 focus:ring-blue-500" />
              </TableHead>
              <TableHead>图片</TableHead>
              <TableHead>项目编号</TableHead>
              <TableHead>项目名称</TableHead>
              <TableHead>所属门店</TableHead>
              <TableHead>项目类型</TableHead>
              <TableHead>项目价格</TableHead>
              <TableHead className="text-center">是否推荐</TableHead>
              <TableHead className="text-center">线上展示</TableHead>
              <TableHead className="text-center">首页展示</TableHead>
              <TableHead className="text-center">状态</TableHead>
              <TableHead>项目时长</TableHead>
              <TableHead>排序</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {projects.map((project) => (
              <TableRow key={project.id} className="hover:bg-blue-50/40 transition-colors group">
                <TableCell className="text-center align-middle">
                  <input type="checkbox" className="rounded border-gray-300 text-blue-500 focus:ring-blue-500" />
                </TableCell>
                <TableCell className="align-middle">
                  <div className="w-12 h-12 bg-gray-100 rounded-md overflow-hidden flex items-center justify-center border border-gray-200 shadow-sm">
                    {project.image ? (
                      <img src={project.image} alt={project.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" />
                    ) : (
                      <span className="text-gray-400 text-xs font-medium">无图</span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="font-medium text-gray-500 align-middle">{project.id}</TableCell>
                <TableCell className="font-semibold text-gray-800 align-middle">{project.name}</TableCell>
                <TableCell className="text-gray-600 align-middle">{project.storeName}</TableCell>
                <TableCell className="text-gray-600 align-middle">{project.type}</TableCell>
                <TableCell className="font-medium text-orange-500 align-middle">{project.price > 0 ? `¥${project.price.toFixed(2)}` : '-'}</TableCell>
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
                <TableCell className="text-gray-500 align-middle">{project.sort}</TableCell>
                <TableCell className="text-right align-middle">
                  <button className="text-blue-500 hover:text-blue-600 text-sm" onClick={() => handleOpenQuickEdit(project)}>
                    编辑
                  </button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      
      {/* Pagination (Mock) */}
      <div className="flex items-center justify-between text-sm text-gray-500 px-2 mt-4">
        <span>共 {projects.length} 条数据</span>
        <div className="flex items-center gap-2">
          <select className="border border-gray-300 rounded px-2 py-1 bg-white focus:outline-none focus:border-blue-500 text-gray-700">
            <option>10条/页</option>
            <option>20条/页</option>
          </select>
          <div className="flex items-center gap-1 border border-gray-200 rounded-md overflow-hidden shadow-sm">
            <button className="px-3 py-1 bg-white hover:bg-gray-50 disabled:opacity-50 border-r border-gray-200" disabled>&lt;</button>
            <button className="px-3 py-1 bg-[#1890ff] text-white font-medium">1</button>
            <button className="px-3 py-1 bg-white hover:bg-gray-50 border-l border-gray-200">&gt;</button>
          </div>
          <span className="ml-4">前往</span>
          <input type="text" className="w-12 border border-gray-300 rounded px-2 py-1 text-center bg-white focus:outline-none focus:border-blue-500" defaultValue="1" />
          <span>页</span>
        </div>
      </div>

      {/* Full Add Project Dialog (rich editor) */}
      <AddProjectDialog open={isAddProjectDialogOpen} onClose={() => { setIsAddProjectDialogOpen(false); loadProjects(); }} />

      {/* Quick Edit Dialog */}
      <Dialog open={showQuickAddDialog} onOpenChange={handleCloseQuickDialog}>
        <DialogContent className="max-w-md" aria-describedby="project-dialog-description">
          <DialogHeader>
            <DialogTitle>{editingProject ? '编辑项目' : '快速添加项目'}</DialogTitle>
          </DialogHeader>
          <span id="project-dialog-description" className="sr-only">{editingProject ? '编辑项目信息' : '快速创建新项目'}</span>
          <form onSubmit={handleSubmit(onQuickSubmit)}>
            <div className="space-y-4 mt-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  项目名称 <span className="text-red-500">*</span>
                </label>
                <Input placeholder="请输入项目名称" {...register('name')} />
                {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  服务时长（分钟） <span className="text-red-500">*</span>
                </label>
                <Input type="number" placeholder="如：60" {...register('duration', { valueAsNumber: true })} />
                {errors.duration && <p className="text-red-500 text-xs mt-1">{errors.duration.message}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  价格 <span className="text-red-500">*</span>
                </label>
                <Input type="number" step="0.01" placeholder="0.00" {...register('price', { valueAsNumber: true })} />
                {errors.price && <p className="text-red-500 text-xs mt-1">{errors.price.message}</p>}
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <Button type="button" variant="outline" onClick={handleCloseQuickDialog}>取消</Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {editingProject ? '保存' : '确认添加'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
