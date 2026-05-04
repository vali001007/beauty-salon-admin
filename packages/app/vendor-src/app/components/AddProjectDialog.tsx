import React, { useState, useEffect } from 'react';
import { X, Upload, Plus, Minus, Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight, Sparkles, Loader2 } from 'lucide-react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TextAlign } from '@tiptap/extension-text-align';
import { Color } from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';
import { createProject } from '@/api/project';
import { getProjectTypes, type ProjectType } from '@/api/projectType';
import { toast } from 'sonner';
import '../../styles/tiptap.css';

interface AddProjectDialogProps {
  open: boolean;
  onClose: () => void;
}

export function AddProjectDialog({ open, onClose }: AddProjectDialogProps) {
  const [projectTypeList, setProjectTypeList] = useState<ProjectType[]>([]);
  const [formData, setFormData] = useState({
    name: '',
    type: '',
    price: 0,
    discountPrice: 0,
    sortOrder: 0,
    onlineDisplay: false,
    isRecommended: false,
    isHomePage: false,
    summary: '',
    headerImage: null as File | null,
    detailImages: [] as File[],
  });

  const [isGenerating, setIsGenerating] = useState(false);
  const [isSubmittingForm, setIsSubmittingForm] = useState(false);

  useEffect(() => {
    if (open) {
      getProjectTypes().then((types) => setProjectTypeList(types.filter((t) => t.status === '启用'))).catch(() => {});
    }
  }, [open]);

  const editor = useEditor({
    extensions: [
      StarterKit,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Color,
      TextStyle,
    ],
    content: '<p>请输入项目详情...</p>',
  });

  const handleNumberChange = (field: 'price' | 'discountPrice' | 'sortOrder', delta: number) => {
    setFormData(prev => ({
      ...prev,
      [field]: Math.max(0, prev[field] + delta)
    }));
  };

  const handleHeaderImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFormData(prev => ({ ...prev, headerImage: e.target.files![0] }));
    }
  };

  const handleDetailImagesUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setFormData(prev => ({ ...prev, detailImages: [...prev.detailImages, ...newFiles] }));
    }
  };

  const removeDetailImage = (index: number) => {
    setFormData(prev => ({
      ...prev,
      detailImages: prev.detailImages.filter((_, i) => i !== index)
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error('项目名称不能为空');
      return;
    }
    setIsSubmittingForm(true);
    try {
      await createProject({
        name: formData.name,
        type: formData.type || '面部护理',
        duration: 0,
        price: formData.price,
        storeName: '心悦芸美容养生会所',
        recommend: formData.isRecommended,
        online: formData.onlineDisplay,
        home: formData.isHomePage,
        status: true,
        sort: formData.sortOrder,
      });
      toast.success('项目创建成功');
      onClose();
    } catch (err: any) {
      toast.error(err?.message || '创建项目失败');
    } finally {
      setIsSubmittingForm(false);
    }
  };

  const handleAIGenerate = () => {
    setIsGenerating(true);
    
    // 模拟AI生成内容
    setTimeout(() => {
      const aiContent = `
        <h2 style="text-align: center;">🌸 ${formData.name || '美容项目'} - 专业护理体验 🌸</h2>
        
        <h3>✨ 项目介绍</h3>
        <p>${formData.name || '本项目'}采用先进的美容技术和优质产品，为您提供专业、舒适的护理体验。通过精心设计的护理流程，让您在放松身心的同时，获得显著的美容效果。</p>
        
        <h3>💎 核心功效</h3>
        <ul>
          <li><strong>深层滋养</strong> - 为肌肤补充充足水分和营养</li>
          <li><strong>提亮肤色</strong> - 改善暗沉，焕发自然光彩</li>
          <li><strong>紧致提升</strong> - 增强肌肤弹性，淡化细纹</li>
          <li><strong>舒缓修护</strong> - 缓解压力，改善肌肤状态</li>
        </ul>
        
        <h3>👥 适用人群</h3>
        <p>适合希望改善肌肤状态、追求高品质护理体验的所有爱美人士。特别推荐给工作压力大、肌肤缺水、需要深层护理的顾客。</p>
        
        <h3>💰 特惠价格</h3>
        <p style="text-align: center; font-size: 18px;">
          <span style="text-decoration: line-through; color: #999;">原价 ¥${formData.price > 0 ? formData.price : 'XXX'}</span> 
          <strong style="color: #ff4d4f; font-size: 24px;"> 现价 ¥${formData.discountPrice > 0 ? formData.discountPrice : formData.price > 0 ? formData.price : 'XXX'}</strong>
        </p>
        
        <p style="text-align: center; color: #1890ff;"><em>✨ 限时优惠，欢迎预约体验！✨</em></p>
      `;
      
      editor?.commands.setContent(aiContent);
      setIsGenerating(false);
    }, 1500);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800">添加项目</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Basic Info Grid */}
            <div className="grid grid-cols-2 gap-6">
              {/* Project Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  项目名称 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="请输入项目名称"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>

              {/* Project Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  项目类型 <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData(prev => ({ ...prev, type: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                >
                  <option value="">请选择项目类型</option>
                  {projectTypeList.map((t) => (
                    <option key={t.id} value={t.name}>{t.name}</option>
                  ))}
                </select>
              </div>

              {/* Price */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">价格</label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleNumberChange('price', -10)}
                    className="w-8 h-9 flex items-center justify-center border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <Minus className="w-4 h-4 text-gray-600" />
                  </button>
                  <input
                    type="number"
                    value={formData.price}
                    onChange={(e) => setFormData(prev => ({ ...prev, price: Number(e.target.value) }))}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-center"
                  />
                  <button
                    type="button"
                    onClick={() => handleNumberChange('price', 10)}
                    className="w-8 h-9 flex items-center justify-center border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <Plus className="w-4 h-4 text-gray-600" />
                  </button>
                </div>
              </div>

              {/* Discount Price */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">优惠价格</label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleNumberChange('discountPrice', -10)}
                    className="w-8 h-9 flex items-center justify-center border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <Minus className="w-4 h-4 text-gray-600" />
                  </button>
                  <input
                    type="number"
                    value={formData.discountPrice}
                    onChange={(e) => setFormData(prev => ({ ...prev, discountPrice: Number(e.target.value) }))}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-center"
                  />
                  <button
                    type="button"
                    onClick={() => handleNumberChange('discountPrice', 10)}
                    className="w-8 h-9 flex items-center justify-center border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <Plus className="w-4 h-4 text-gray-600" />
                  </button>
                </div>
              </div>

              {/* Sort Order */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">排序号</label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleNumberChange('sortOrder', -1)}
                    className="w-8 h-9 flex items-center justify-center border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <Minus className="w-4 h-4 text-gray-600" />
                  </button>
                  <input
                    type="number"
                    value={formData.sortOrder}
                    onChange={(e) => setFormData(prev => ({ ...prev, sortOrder: Number(e.target.value) }))}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-center"
                  />
                  <button
                    type="button"
                    onClick={() => handleNumberChange('sortOrder', 1)}
                    className="w-8 h-9 flex items-center justify-center border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <Plus className="w-4 h-4 text-gray-600" />
                  </button>
                </div>
              </div>
            </div>

            {/* Checkboxes */}
            <div className="flex items-center gap-8">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.onlineDisplay}
                  onChange={(e) => setFormData(prev => ({ ...prev, onlineDisplay: e.target.checked }))}
                  className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700">线上展示</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.isRecommended}
                  onChange={(e) => setFormData(prev => ({ ...prev, isRecommended: e.target.checked }))}
                  className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700">是否推荐</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.isHomePage}
                  onChange={(e) => setFormData(prev => ({ ...prev, isHomePage: e.target.checked }))}
                  className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700">是否首页展示</span>
              </label>
            </div>

            {/* Project Summary */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">项目简介</label>
              <textarea
                value={formData.summary}
                onChange={(e) => setFormData(prev => ({ ...prev, summary: e.target.value }))}
                placeholder="请输入项目简介"
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              />
            </div>

            {/* Header Image Upload */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">封面</label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 hover:border-blue-500 transition-colors">
                <input
                  type="file"
                  id="headerImage"
                  accept="image/*"
                  onChange={handleHeaderImageUpload}
                  className="hidden"
                />
                <label
                  htmlFor="headerImage"
                  className="flex flex-col items-center justify-center cursor-pointer"
                >
                  {formData.headerImage ? (
                    <div className="text-center">
                      <div className="mb-2 text-sm text-gray-600">
                        已选择: {formData.headerImage.name}
                      </div>
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

            {/* Project Details (Rich Text Editor) */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">项目详情</label>
                <button
                  type="button"
                  onClick={handleAIGenerate}
                  disabled={isGenerating}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  <Sparkles className="w-4 h-4" />
                  {isGenerating ? '生成中...' : 'AI生成按钮'}
                </button>
              </div>
              <div className="border border-gray-300 rounded-lg overflow-hidden">
                {/* Toolbar */}
                <div className="bg-gray-50 border-b border-gray-300 px-3 py-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => editor?.chain().focus().toggleBold().run()}
                    className={`p-2 rounded hover:bg-gray-200 transition-colors ${
                      editor?.isActive('bold') ? 'bg-gray-300' : ''
                    }`}
                  >
                    <Bold className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => editor?.chain().focus().toggleItalic().run()}
                    className={`p-2 rounded hover:bg-gray-200 transition-colors ${
                      editor?.isActive('italic') ? 'bg-gray-300' : ''
                    }`}
                  >
                    <Italic className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => editor?.chain().focus().toggleUnderline?.().run()}
                    className="p-2 rounded hover:bg-gray-200 transition-colors"
                  >
                    <Underline className="w-4 h-4" />
                  </button>
                  <div className="w-px h-6 bg-gray-300 mx-2" />
                  <button
                    type="button"
                    onClick={() => editor?.chain().focus().setTextAlign('left').run()}
                    className={`p-2 rounded hover:bg-gray-200 transition-colors ${
                      editor?.isActive({ textAlign: 'left' }) ? 'bg-gray-300' : ''
                    }`}
                  >
                    <AlignLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => editor?.chain().focus().setTextAlign('center').run()}
                    className={`p-2 rounded hover:bg-gray-200 transition-colors ${
                      editor?.isActive({ textAlign: 'center' }) ? 'bg-gray-300' : ''
                    }`}
                  >
                    <AlignCenter className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => editor?.chain().focus().setTextAlign('right').run()}
                    className={`p-2 rounded hover:bg-gray-200 transition-colors ${
                      editor?.isActive({ textAlign: 'right' }) ? 'bg-gray-300' : ''
                    }`}
                  >
                    <AlignRight className="w-4 h-4" />
                  </button>
                </div>
                {/* Editor */}
                <EditorContent editor={editor} className="prose max-w-none" />
              </div>
            </div>

            {/* Detail Images Upload */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">详情图</label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 hover:border-blue-500 transition-colors">
                <input
                  type="file"
                  id="detailImages"
                  accept="image/*"
                  multiple
                  onChange={handleDetailImagesUpload}
                  className="hidden"
                />
                <label
                  htmlFor="detailImages"
                  className="flex flex-col items-center justify-center cursor-pointer"
                >
                  <Upload className="w-10 h-10 text-gray-400 mb-3" />
                  <div className="text-sm text-gray-600 mb-1">点击或拖拽上传多张图片</div>
                  <div className="text-xs text-gray-500">支持 JPG、PNG 格式，可选择多张</div>
                </label>
              </div>
              {/* Preview Detail Images */}
              {formData.detailImages.length > 0 && (
                <div className="mt-4 grid grid-cols-4 gap-4">
                  {formData.detailImages.map((file, index) => (
                    <div key={index} className="relative group">
                      <div className="aspect-square bg-gray-100 rounded-lg overflow-hidden">
                        <img
                          src={URL.createObjectURL(file)}
                          alt={`详情图 ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeDetailImage(index)}
                        className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-4 h-4" />
                      </button>
                      <div className="mt-1 text-xs text-gray-500 text-center truncate">
                        {file.name}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmittingForm}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isSubmittingForm && <Loader2 className="w-4 h-4 animate-spin" />}
            确定
          </button>
        </div>
      </div>
    </div>
  );
}