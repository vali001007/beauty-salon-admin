import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Search,
  Plus,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  X,
  Bold,
  Italic,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Link as LinkIcon,
  Image as ImageIcon,
  Underline,
  Upload,
  Sparkles,
  Loader2,
} from 'lucide-react';
import { Input, Button, Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '../components/UI';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TextAlign } from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { Image as TiptapImage } from '@tiptap/extension-image';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { cardSchema, type CardFormData } from '@/schemas/card';
import { getCards, createCard, updateCard } from '@/api/card';
import { getProjects } from '@/api/project';
import { useStoreStore } from '@/stores/storeStore';
import { toast } from 'sonner';
import type { Card } from '@/types/card';
import type { Project } from '@/types/project';

export function CardManagement() {
  const [searchName, setSearchName] = useState('');
  const [searchStatus, setSearchStatus] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [cards, setCards] = useState<Card[]>([]);
  const [editingCard, setEditingCard] = useState<Card | null>(null);
  const [formData, setFormData] = useState({
    description: '',
    details: '',
    coverImage: null as File | null,
  });
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customProjectName, setCustomProjectName] = useState('');
  const [customProjectTimes, setCustomProjectTimes] = useState(1);
  const [customProjectRemark, setCustomProjectRemark] = useState('');
  const [availableProjects, setAvailableProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const projectPickerRef = useRef<HTMLDivElement>(null);
  const currentStoreId = useStoreStore((state) => state.currentStoreId);
  const stores = useStoreStore((state) => state.stores);
  const loadStores = useStoreStore((state) => state.loadStores);

  const {
    register,
    handleSubmit: rhfHandleSubmit,
    formState: { errors, isSubmitting },
    reset,
    setValue,
    watch,
  } = useForm<CardFormData>({
    resolver: zodResolver(cardSchema),
    defaultValues: {
      name: '',
      type: '',
      totalTimes: 1,
      price: 0,
      validDays: 1,
      projects: [],
    },
  });

  const watchedProjects = watch('projects');
  const currentStoreName = useMemo(
    () => (currentStoreId ? stores.find((store) => store.id === currentStoreId)?.name : ''),
    [currentStoreId, stores],
  );
  const projectScopeStoreName = editingCard?.storeName || currentStoreName || '';
  const scopedProjects = useMemo(() => {
    const activeProjects = availableProjects.filter((project) => project.status);
    if (!projectScopeStoreName || projectScopeStoreName === '全部门店') return activeProjects;
    return activeProjects.filter((project) => project.storeName === projectScopeStoreName);
  }, [availableProjects, projectScopeStoreName]);
  const selectableProjects = useMemo(
    () =>
      scopedProjects.filter((project) => !(watchedProjects || []).some((item) => item.projectName === project.name)),
    [scopedProjects, watchedProjects],
  );

  const loadCards = async () => {
    try {
      const data = await getCards();
      setCards(data);
    } catch {
      toast.error('加载次卡列表失败');
    }
  };

  useEffect(() => {
    loadCards();
  }, []);

  useEffect(() => {
    if (stores.length === 0) {
      void loadStores().catch(() => {
        toast.warning('门店数据加载失败，项目选择将展示全部项目');
      });
    }
  }, [loadStores, stores.length]);

  useEffect(() => {
    let cancelled = false;
    setProjectsLoading(true);
    void getProjects()
      .then((items) => {
        if (!cancelled) setAvailableProjects(items);
      })
      .catch((error) => {
        if (!cancelled) toast.error(error instanceof Error ? `项目数据加载失败：${error.message}` : '项目数据加载失败');
      })
      .finally(() => {
        if (!cancelled) setProjectsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 点击外部关闭项目选择器
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (projectPickerRef.current && !projectPickerRef.current.contains(e.target as Node)) {
        setShowProjectPicker(false);
      }
    };
    if (showProjectPicker) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showProjectPicker]);

  const handleAddProject = (project: Project) => {
    const current = watchedProjects || [];
    if (current.some((p) => p.projectName === project.name)) return;
    setValue('projects', [...current, { projectName: project.name, timesPerCard: 1 }]);
    setShowProjectPicker(false);
  };

  const handleRemoveProject = (projectName: string) => {
    const current = watchedProjects || [];
    setValue(
      'projects',
      current.filter((p) => p.projectName !== projectName),
    );
  };

  const handleUpdateProjectTimes = (projectName: string, times: number) => {
    const current = watchedProjects || [];
    setValue(
      'projects',
      current.map((p) => (p.projectName === projectName ? { ...p, timesPerCard: Math.max(1, times) } : p)),
    );
  };

  const totalRecords = cards.length;
  const pageSize = 10;
  const totalPages = Math.ceil(totalRecords / pageSize);
  const displayCards = cards.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleReset = () => {
    setSearchName('');
    setSearchStatus('');
  };

  const handleOpenDialog = () => {
    setEditingCard(null);
    reset({ name: '', type: '', totalTimes: 1, price: 0, validDays: 1, projects: [] });
    setFormData({ description: '', details: '', coverImage: null });
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingCard(null);
  };

  const onSubmit = async (data: CardFormData) => {
    try {
      if (editingCard) {
        await updateCard(editingCard.id, data);
        toast.success('次卡更新成功');
      } else {
        await createCard(data);
        toast.success('次卡创建成功');
      }
      handleCloseDialog();
      loadCards();
    } catch (err: any) {
      toast.error(err?.message || (editingCard ? '更新次卡失败' : '创建次卡失败'));
    }
  };

  const handleOpenEdit = (card: Card) => {
    setEditingCard(card);
    reset({
      name: card.name,
      type: card.type,
      totalTimes: card.totalTimes,
      price: card.price,
      validDays: card.validDays,
      projects: card.projects,
    });
    setFormData({ description: '', details: '', coverImage: null });
    setIsDialogOpen(true);
  };

  const editor = useEditor({
    extensions: [
      StarterKit,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      TextStyle,
      Color,
      TiptapImage,
    ],
    content: formData.details,
    onUpdate: ({ editor }) => {
      setFormData({ ...formData, details: editor.getHTML() });
    },
  });

  return (
    <div className="flex flex-col gap-6">
      {/* Breadcrumb */}
      <div className="text-sm text-gray-500">首页 / 商品管理 / 次卡管理</div>

      {/* Search Section */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600 whitespace-nowrap">名称</label>
          <Input
            placeholder="请输入名称"
            className="w-48"
            value={searchName}
            onChange={(e) => setSearchName(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600 whitespace-nowrap">状态</label>
          <select
            className="w-48 h-9 px-3 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={searchStatus}
            onChange={(e) => setSearchStatus(e.target.value)}
          >
            <option value="">全部</option>
            <option value="上架">上架</option>
            <option value="下架">下架</option>
          </select>
        </div>
        <Button className="gap-2">
          <Search className="w-4 h-4" /> 搜索
        </Button>
        <Button variant="outline" className="gap-2" onClick={handleReset}>
          <RotateCcw className="w-4 h-4" /> 重置
        </Button>
        <Button className="gap-2 bg-[#1890ff] hover:bg-[#40a9ff]" onClick={handleOpenDialog}>
          <Plus className="w-4 h-4" /> 新增次卡
        </Button>
      </div>

      {/* Table */}
      <Table>
        <TableHeader>
          <TableRow className="bg-gray-50/80">
            <TableHead>ID</TableHead>
            <TableHead>名称</TableHead>
            <TableHead>有效期(天)</TableHead>
            <TableHead>价格</TableHead>
            <TableHead>所属门店</TableHead>
            <TableHead>状态</TableHead>
            <TableHead>创建时间</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {displayCards.map((card) => (
            <TableRow key={card.id} className="hover:bg-blue-50/30">
              <TableCell>{card.id}</TableCell>
              <TableCell className="font-medium text-gray-700">{card.name}</TableCell>
              <TableCell>{card.validDays}</TableCell>
              <TableCell>¥{card.price}</TableCell>
              <TableCell>{card.storeName}</TableCell>
              <TableCell>
                <span
                  className={`px-2 py-1 text-xs rounded ${
                    card.status === '上架' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {card.status}
                </span>
              </TableCell>
              <TableCell>{card.createdAt}</TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-3 text-sm">
                  <button className="text-blue-500 hover:text-blue-600" onClick={() => handleOpenEdit(card)}>
                    编辑
                  </button>
                  <button className="text-blue-500 hover:text-blue-600">下架</button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">共 {totalRecords} 条</span>
          <select className="h-8 px-2 text-sm border border-gray-300 rounded">
            <option>10条/页</option>
            <option>20条/页</option>
            <option>50条/页</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="px-3 py-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={currentPage === 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>

          <div className="flex items-center gap-1">
            {[1, 2, 3].map((pageNum) => (
              <button
                key={pageNum}
                onClick={() => setCurrentPage(pageNum)}
                className={`px-3 py-1.5 text-sm rounded transition-colors ${
                  currentPage === pageNum
                    ? 'bg-blue-500 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-300'
                }`}
              >
                {pageNum}
              </button>
            ))}
          </div>

          <Button
            variant="outline"
            className="px-3 py-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>

          <span className="text-sm text-gray-600 ml-2">跳至</span>
          <Input type="number" className="w-16 h-8 text-center" defaultValue="1" />
          <span className="text-sm text-gray-600">页</span>
        </div>
      </div>

      {/* Add Card Dialog */}
      {isDialogOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg w-[900px] max-h-[90vh] overflow-y-auto">
            {/* Dialog Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-lg font-medium">{editingCard ? '编辑次卡' : '新增次卡'}</h2>
              <button onClick={handleCloseDialog} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Dialog Body */}
            <form onSubmit={rhfHandleSubmit(onSubmit)}>
              <div className="p-6 space-y-6">
                {/* Row 1: Name and Type */}
                <div className="grid grid-cols-2 gap-6">
                  <div className="flex items-start gap-2">
                    <span className="text-red-500 mt-2">*</span>
                    <label className="text-sm text-gray-700 whitespace-nowrap mt-2 min-w-[80px]">名称</label>
                    <div className="flex-1">
                      <Input placeholder="请输入名称" {...register('name')} />
                      {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-red-500 mt-2">*</span>
                    <label className="text-sm text-gray-700 whitespace-nowrap mt-2 min-w-[80px]">类型</label>
                    <div className="flex-1">
                      <select
                        className="w-full h-9 px-3 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        {...register('type')}
                      >
                        <option value="">请选择类型</option>
                        <option value="护理卡">护理卡</option>
                        <option value="仪器卡">仪器卡</option>
                        <option value="综合卡">综合卡</option>
                      </select>
                      {errors.type && <p className="text-red-500 text-xs mt-1">{errors.type.message}</p>}
                    </div>
                  </div>
                </div>

                {/* Row 2: Valid Days and Price */}
                <div className="grid grid-cols-2 gap-6">
                  <div className="flex items-start gap-2">
                    <span className="text-red-500 mt-2">*</span>
                    <label className="text-sm text-gray-700 whitespace-nowrap mt-2 min-w-[80px]">有效期(天)</label>
                    <div className="flex-1">
                      <Input type="number" {...register('validDays', { valueAsNumber: true })} />
                      {errors.validDays && <p className="text-red-500 text-xs mt-1">{errors.validDays.message}</p>}
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-red-500 mt-2">*</span>
                    <label className="text-sm text-gray-700 whitespace-nowrap mt-2 min-w-[80px]">价格</label>
                    <div className="flex-1">
                      <Input type="number" step="0.01" {...register('price', { valueAsNumber: true })} />
                      {errors.price && <p className="text-red-500 text-xs mt-1">{errors.price.message}</p>}
                    </div>
                  </div>
                </div>

                {/* Row 2b: Total Times */}
                <div className="flex items-start gap-2">
                  <span className="text-red-500 mt-2">*</span>
                  <label className="text-sm text-gray-700 whitespace-nowrap mt-2 min-w-[80px]">总次数</label>
                  <div className="w-[400px]">
                    <Input type="number" {...register('totalTimes', { valueAsNumber: true })} />
                    {errors.totalTimes && <p className="text-red-500 text-xs mt-1">{errors.totalTimes.message}</p>}
                  </div>
                </div>

                {/* 项目明细 Section */}
                <div className="mt-6 relative">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-base text-blue-600 font-medium">项目明细</h3>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="px-4 h-8 bg-blue-500 text-white text-sm rounded-full hover:bg-blue-600 transition-colors"
                        onClick={() => setShowProjectPicker(true)}
                      >
                        添加项目
                      </button>
                      <button
                        type="button"
                        className="px-4 h-8 bg-green-500 text-white text-sm rounded-full hover:bg-green-600 transition-colors"
                        onClick={() => {
                          setShowCustomInput(true);
                          setCustomProjectName('');
                          setCustomProjectTimes(1);
                          setCustomProjectRemark('');
                        }}
                      >
                        自定义项目
                      </button>
                    </div>
                  </div>
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-sm text-gray-600 font-medium">项目</th>
                          <th className="px-4 py-3 text-left text-sm text-gray-600 font-medium">次数</th>
                          <th className="px-4 py-3 text-left text-sm text-gray-600 font-medium">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(watchedProjects || []).length > 0 ? (
                          (watchedProjects || []).map((project, idx) => (
                            <tr key={idx}>
                              <td className="px-4 py-3 text-sm text-gray-600">{project.projectName}</td>
                              <td className="px-4 py-3 text-sm text-gray-600">
                                <Input
                                  type="number"
                                  className="w-20 h-8 text-center"
                                  value={project.timesPerCard}
                                  onChange={(e) =>
                                    handleUpdateProjectTimes(project.projectName, parseInt(e.target.value) || 0)
                                  }
                                />
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-600">
                                <button
                                  type="button"
                                  className="text-red-500 hover:text-red-600"
                                  onClick={() => handleRemoveProject(project.projectName)}
                                >
                                  删除
                                </button>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={3} className="px-4 py-8 text-center text-blue-400 text-sm">
                              暂无数据
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  {errors.projects && (
                    <p className="text-red-500 text-xs mt-1">{errors.projects.message || '至少关联一个项目'}</p>
                  )}
                  {showProjectPicker && (
                    <div
                      ref={projectPickerRef}
                      className="absolute top-full left-0 right-0 bg-white border border-gray-300 rounded-lg shadow-lg mt-2 max-h-60 overflow-y-auto z-10"
                    >
                      <div className="p-3">
                        <h4 className="text-sm text-gray-500 font-medium mb-2">选择项目（来自项目管理）</h4>
                        {projectScopeStoreName && (
                          <div className="mb-2 rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-700">
                            当前仅显示：{projectScopeStoreName}
                          </div>
                        )}
                        {projectsLoading ? (
                          <div className="flex items-center justify-center gap-2 py-3 text-sm text-gray-400">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            项目加载中...
                          </div>
                        ) : selectableProjects.length === 0 ? (
                          <div className="text-sm text-gray-400 text-center py-3">
                            {projectScopeStoreName ? '当前门店暂无可添加项目' : '所有项目已添加'}
                          </div>
                        ) : (
                          selectableProjects.map((project) => (
                            <div
                              key={project.id}
                              className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-blue-50 rounded-md transition-colors"
                              onClick={() => handleAddProject(project)}
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-gray-800">{project.name}</span>
                                <span className="text-xs text-gray-400">({project.type})</span>
                              </div>
                              <span className="text-xs text-gray-400">{project.storeName}</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                  {showCustomInput && (
                    <div className="absolute top-full left-0 right-0 bg-white border border-gray-300 rounded-lg shadow-lg mt-2 max-h-60 overflow-y-auto z-10">
                      <div className="p-3">
                        <h4 className="text-sm text-gray-500 font-medium mb-2">自定义项目</h4>
                        <div className="flex items-center gap-2">
                          <label className="text-sm text-gray-700 whitespace-nowrap">项目名称</label>
                          <Input
                            className="flex-1"
                            value={customProjectName}
                            onChange={(e) => setCustomProjectName(e.target.value)}
                          />
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <label className="text-sm text-gray-700 whitespace-nowrap">次数</label>
                          <Input
                            type="number"
                            className="w-20 h-8 text-center"
                            value={customProjectTimes}
                            onChange={(e) => setCustomProjectTimes(parseInt(e.target.value) || 0)}
                          />
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <label className="text-sm text-gray-700 whitespace-nowrap">备注</label>
                          <Input
                            className="flex-1"
                            value={customProjectRemark}
                            onChange={(e) => setCustomProjectRemark(e.target.value)}
                          />
                        </div>
                        <div className="flex items-center justify-end mt-4">
                          <Button variant="outline" onClick={() => setShowCustomInput(false)}>
                            取消
                          </Button>
                          <Button
                            className="bg-[#1890ff] hover:bg-[#40a9ff]"
                            onClick={() => {
                              if (customProjectName) {
                                const current = watchedProjects || [];
                                setValue('projects', [
                                  ...current,
                                  { projectName: customProjectName, timesPerCard: customProjectTimes },
                                ]);
                                setShowCustomInput(false);
                              }
                            }}
                          >
                            确定
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Cover Image Upload */}
                <div className="flex items-start gap-2">
                  <label className="text-sm text-gray-700 whitespace-nowrap mt-2 min-w-[80px]">封面</label>
                  <div className="flex-1">
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 hover:border-blue-500 transition-colors">
                      <input
                        type="file"
                        id="coverImage"
                        accept="image/*"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            setFormData({ ...formData, coverImage: e.target.files[0] });
                          }
                        }}
                        className="hidden"
                      />
                      <label htmlFor="coverImage" className="flex flex-col items-center justify-center cursor-pointer">
                        {formData.coverImage ? (
                          <div className="text-center">
                            <div className="w-32 h-32 mx-auto mb-3 rounded-lg overflow-hidden border border-gray-200">
                              <img
                                src={URL.createObjectURL(formData.coverImage)}
                                alt="封面预览"
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <div className="text-sm text-gray-600 mb-1">{formData.coverImage.name}</div>
                            <div className="text-xs text-gray-500">点击重新选择</div>
                          </div>
                        ) : (
                          <>
                            <Upload className="w-10 h-10 text-gray-400 mb-3" />
                            <div className="text-sm text-gray-600 mb-1">点击或拖拽上传图片</div>
                            <div className="text-xs text-gray-500">支持 JPG、PNG 格式</div>
                          </>
                        )}
                      </label>
                    </div>
                  </div>
                </div>

                {/* Row 4: Description */}
                <div className="flex items-start gap-2">
                  <label className="text-sm text-gray-700 whitespace-nowrap mt-2 min-w-[80px]">简介</label>
                  <textarea
                    className="flex-1 min-h-[100px] px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="请输入简介"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>

                {/* Row 5: Details (Rich Text Editor) */}
                <div className="flex items-start gap-2">
                  <div className="flex items-center gap-2 whitespace-nowrap mt-2 min-w-[80px]">
                    <label className="text-sm text-gray-700">详情</label>
                    <button
                      type="button"
                      onClick={() => {
                        // AI生成次卡详情内容
                        const cardName = watch('name') || '精品次卡';
                        const projects =
                          watchedProjects.length > 0
                            ? watchedProjects.map((p) => `<li>${p.projectName}（${p.timesPerCard}次）</li>`).join('')
                            : '<li>精选美容护理项目</li>';

                        const aiContent = `
                        <h2>💎 ${cardName}套餐介绍</h2>
                        <p>欢迎体验我们为您精心打造的专属美容护理套餐，享受专业美容服务，焕发由内而外的美丽光彩。</p>
                        
                        <h3>📋 套餐包含项目</h3>
                        <ul>
                          ${projects}
                        </ul>
                        
                        <h3>✨ 套餐特色</h3>
                        <ul>
                          <li><strong>专业团队：</strong>资深美容师一对一贴心服务</li>
                          <li><strong>高端仪器：</strong>采用国际先进美容仪器设备</li>
                          <li><strong>私密环境：</strong>独立VIP护理空间，舒适温馨</li>
                          <li><strong>个性定制：</strong>根据您的肤质量身定制护理方案</li>
                        </ul>
                        
                        <h3>🎁 会员权益</h3>
                        <ul>
                          <li>有效期${watch('validDays')}天，充足时间享受美丽蜕变</li>
                          <li>灵活预约，专属客服一对一服务</li>
                          <li>会员专享生日礼遇及节日优惠</li>
                          <li>积分累计，兑换更多精美礼品</li>
                        </ul>
                        
                        <h3>💝 适用人群</h3>
                        <p>适合注重肌肤护理、追求品质生活的您。无论是日常保养还是特殊护理需求，我们都能为您提供专业的解决方案。</p>
                        
                        <h3>📞 温馨提示</h3>
                        <p>购卡后请及时联系我们的客服进行预约，我们将为您安排最合适的护理时间。如有任何疑问，欢迎随时咨询。</p>
                        
                        <p style="text-align: center; margin-top: 20px;"><em>期待与您共同开启美丽之旅 ✨</em></p>
                      `;

                        editor?.commands.setContent(aiContent);
                      }}
                      className="px-3 py-1 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs rounded-full hover:from-purple-600 hover:to-pink-600 transition-all flex items-center gap-1 shadow-sm"
                      title="AI生成详情"
                    >
                      <Sparkles className="w-3 h-3" />
                      AI生成
                    </button>
                  </div>
                  <div className="flex-1">
                    {/* Toolbar */}
                    <div className="border border-gray-300 rounded-t-md bg-gray-50 p-2 flex items-center gap-4 flex-wrap">
                      <div className="flex items-center gap-1 border-r border-gray-300 pr-4">
                        <button
                          type="button"
                          onClick={() => editor?.chain().focus().toggleBold().run()}
                          className={`p-1.5 rounded hover:bg-gray-200 ${editor?.isActive('bold') ? 'bg-gray-300' : ''}`}
                          title="粗体"
                        >
                          <Bold className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => editor?.chain().focus().toggleItalic().run()}
                          className={`p-1.5 rounded hover:bg-gray-200 ${editor?.isActive('italic') ? 'bg-gray-300' : ''}`}
                          title="斜体"
                        >
                          <Italic className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => editor?.chain().focus().toggleStrike().run()}
                          className={`p-1.5 rounded hover:bg-gray-200 ${editor?.isActive('strike') ? 'bg-gray-300' : ''}`}
                          title="删除线"
                        >
                          <Underline className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="flex items-center gap-1 border-r border-gray-300 pr-4">
                        <button
                          type="button"
                          onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
                          className={`p-1.5 px-2 rounded hover:bg-gray-200 text-sm font-medium ${editor?.isActive('heading', { level: 1 }) ? 'bg-gray-300' : ''}`}
                          title="标题1"
                        >
                          H1
                        </button>
                        <button
                          type="button"
                          onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
                          className={`p-1.5 px-2 rounded hover:bg-gray-200 text-sm font-medium ${editor?.isActive('heading', { level: 2 }) ? 'bg-gray-300' : ''}`}
                          title="标题2"
                        >
                          H2
                        </button>
                        <button
                          type="button"
                          onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
                          className={`p-1.5 px-2 rounded hover:bg-gray-200 text-sm font-medium ${editor?.isActive('heading', { level: 3 }) ? 'bg-gray-300' : ''}`}
                          title="标题3"
                        >
                          H3
                        </button>
                      </div>
                      <div className="flex items-center gap-1 border-r border-gray-300 pr-4">
                        <button
                          type="button"
                          onClick={() => editor?.chain().focus().toggleBulletList().run()}
                          className={`p-1.5 rounded hover:bg-gray-200 ${editor?.isActive('bulletList') ? 'bg-gray-300' : ''}`}
                          title="无序列表"
                        >
                          <List className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
                          className={`p-1.5 rounded hover:bg-gray-200 ${editor?.isActive('orderedList') ? 'bg-gray-300' : ''}`}
                          title="有序列表"
                        >
                          <ListOrdered className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="flex items-center gap-1 border-r border-gray-300 pr-4">
                        <button
                          type="button"
                          onClick={() => editor?.chain().focus().setTextAlign('left').run()}
                          className={`p-1.5 rounded hover:bg-gray-200 ${editor?.isActive({ textAlign: 'left' }) ? 'bg-gray-300' : ''}`}
                          title="左对齐"
                        >
                          <AlignLeft className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => editor?.chain().focus().setTextAlign('center').run()}
                          className={`p-1.5 rounded hover:bg-gray-200 ${editor?.isActive({ textAlign: 'center' }) ? 'bg-gray-300' : ''}`}
                          title="居中对齐"
                        >
                          <AlignCenter className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => editor?.chain().focus().setTextAlign('right').run()}
                          className={`p-1.5 rounded hover:bg-gray-200 ${editor?.isActive({ textAlign: 'right' }) ? 'bg-gray-300' : ''}`}
                          title="右对齐"
                        >
                          <AlignRight className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            const url = window.prompt('请输入链接地址:');
                            if (url) {
                              editor?.chain().focus().setLink({ href: url }).run();
                            }
                          }}
                          className={`p-1.5 rounded hover:bg-gray-200 ${editor?.isActive('link') ? 'bg-gray-300' : ''}`}
                          title="插入链接"
                        >
                          <LinkIcon className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const url = window.prompt('请输入图片地址:');
                            if (url) {
                              editor?.chain().focus().setImage({ src: url }).run();
                            }
                          }}
                          className="p-1.5 rounded hover:bg-gray-200"
                          title="插入图片"
                        >
                          <ImageIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <EditorContent
                      editor={editor}
                      className="border border-t-0 border-gray-300 rounded-b-md bg-white min-h-[300px] prose max-w-none"
                    />
                  </div>
                </div>
              </div>

              {/* Dialog Footer */}
              <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200">
                <Button type="button" variant="outline" onClick={handleCloseDialog}>
                  取消
                </Button>
                <Button type="submit" className="bg-[#1890ff] hover:bg-[#40a9ff]" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {editingCard ? '保存' : '确定'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
