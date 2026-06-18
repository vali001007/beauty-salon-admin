import React, { useMemo, useState } from 'react';
import { Camera, CheckSquare, Eraser, FileText, Mic } from 'lucide-react';
import type { ServiceRecordConfirmInput, ServiceRecordFlowData, ServiceRecordTaskOption } from '../types';
import { cn } from './ui/utils';

function safeArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function formatTaskLabel(task: ServiceRecordTaskOption) {
  const time = task.appointmentTime
    ? new Date(task.appointmentTime).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    : '';
  return `${time} ${task.customerName} · ${task.projectName}`.trim();
}

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  onstart: (() => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  start: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('图片读取失败'));
    reader.readAsDataURL(file);
  });
}

export function ServiceRecordFlowCard({
  data,
  onConfirm,
}: {
  data: ServiceRecordFlowData;
  onConfirm: (input: ServiceRecordConfirmInput) => Promise<void>;
}) {
  const tasks = safeArray(data.tasks);
  const [selectedTaskId, setSelectedTaskId] = useState<number | ''>(tasks[0]?.id ?? '');
  const [result, setResult] = useState('服务已完成，客户状态稳定。');
  const [customerFeedback, setCustomerFeedback] = useState('');
  const [customerInfoUpdate, setCustomerInfoUpdate] = useState('');
  const [attentionItems, setAttentionItems] = useState('');
  const [nextSuggestion, setNextSuggestion] = useState('');
  const [remark, setRemark] = useState('');
  const [beforeImageUrls, setBeforeImageUrls] = useState('');
  const [afterImageUrls, setAfterImageUrls] = useState('');
  const [beforeCapturedImages, setBeforeCapturedImages] = useState<string[]>([]);
  const [afterCapturedImages, setAfterCapturedImages] = useState<string[]>([]);
  const [customerSignature, setCustomerSignature] = useState('');
  const [signatureImage, setSignatureImage] = useState('');
  const [materialQtyByKey, setMaterialQtyByKey] = useState<Record<string, string>>({});
  const [transferToCashier, setTransferToCashier] = useState(true);
  const [loading, setLoading] = useState(false);
  const [voiceListening, setVoiceListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedTask = useMemo(() => tasks.find((task) => task.id === Number(selectedTaskId)), [selectedTaskId, tasks]);
  const canSubmit = Boolean(selectedTask && result.trim() && nextSuggestion.trim());
  const materialItems = safeArray(selectedTask?.consumptionItems);
  const normalizeImageUrls = (value: string) =>
    value
      .split(/\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);
  const beforeImages = [...normalizeImageUrls(beforeImageUrls), ...beforeCapturedImages];
  const afterImages = [...normalizeImageUrls(afterImageUrls), ...afterCapturedImages];
  const consumptionItems = materialItems.map((item, index) => {
    const key = String(item.productId ?? `${item.productName}-${index}`);
    const actualQty = Number(materialQtyByKey[key]);
    return {
      ...item,
      actualQty: Number.isFinite(actualQty) && actualQty >= 0 ? actualQty : item.actualQty,
    };
  });

  const submit = async () => {
    if (!selectedTask || !canSubmit) return;
    setLoading(true);
    setError(null);
    try {
      await onConfirm({
        taskId: selectedTask.id,
        customerId: selectedTask.customerId,
        projectId: selectedTask.projectId,
        beauticianId: data.beauticianId,
        result: result.trim(),
        customerFeedback: customerFeedback.trim() || undefined,
        customerInfoUpdate: customerInfoUpdate.trim() || undefined,
        attentionItems: attentionItems.trim() || undefined,
        nextSuggestion: nextSuggestion.trim(),
        remark: remark.trim() || undefined,
        beforeImages: beforeImages.length ? beforeImages : undefined,
        afterImages: afterImages.length ? afterImages : undefined,
        customerSignature:
          [customerSignature.trim(), signatureImage ? '已采集签名图片' : ''].filter(Boolean).join('，') || undefined,
        images: signatureImage ? [signatureImage] : undefined,
        consumptionItems,
        transferToCashier,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '服务记录提交失败');
    } finally {
      setLoading(false);
    }
  };

  const startVoiceInput = (target: 'result' | 'feedback' | 'suggestion') => {
    const speechWindow = window as unknown as {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const SpeechRecognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError('当前浏览器不支持语音录入，请手动填写服务记录。');
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'zh-CN';
    recognition.interimResults = false;
    recognition.onstart = () => {
      setVoiceListening(true);
      setError(null);
    };
    recognition.onerror = () => {
      setVoiceListening(false);
      setError('语音录入失败，请重试或手动填写。');
    };
    recognition.onend = () => setVoiceListening(false);
    recognition.onresult = (event) => {
      const text = Array.from(event.results)
        .map((resultItem) => resultItem[0]?.transcript ?? '')
        .join('')
        .trim();
      if (!text) return;
      if (target === 'result') setResult((current) => `${current}${current ? '\n' : ''}${text}`);
      if (target === 'feedback') setCustomerFeedback((current) => `${current}${current ? '\n' : ''}${text}`);
      if (target === 'suggestion') setNextSuggestion((current) => `${current}${current ? '\n' : ''}${text}`);
    };
    recognition.start();
  };

  const handlePhotoFiles = async (target: 'before' | 'after', files: FileList | null) => {
    const selected = Array.from(files ?? []).filter((file) => file.type.startsWith('image/'));
    if (!selected.length) return;
    try {
      const images = await Promise.all(selected.map(readFileAsDataUrl));
      if (target === 'before') setBeforeCapturedImages((current) => [...current, ...images]);
      if (target === 'after') setAfterCapturedImages((current) => [...current, ...images]);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '图片读取失败，请重新拍摄或上传。');
    }
  };

  const drawSignaturePoint = (event: React.PointerEvent<HTMLCanvasElement>, shouldStart = false) => {
    const canvas = event.currentTarget;
    const context = canvas.getContext('2d');
    if (!context) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;
    context.lineWidth = 3;
    context.lineCap = 'round';
    context.strokeStyle = '#1F1B2D';
    if (shouldStart) {
      canvas.setPointerCapture(event.pointerId);
      context.beginPath();
      context.moveTo(x, y);
      return;
    }
    if (event.buttons !== 1) return;
    context.lineTo(x, y);
    context.stroke();
    setSignatureImage(canvas.toDataURL('image/png'));
  };

  const clearSignature = (event: React.MouseEvent<HTMLButtonElement>) => {
    const canvas = event.currentTarget.closest('[data-signature-panel]')?.querySelector('canvas');
    const context = canvas?.getContext('2d');
    if (canvas && context) context.clearRect(0, 0, canvas.width, canvas.height);
    setSignatureImage('');
  };

  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-black/5 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-2xl font-semibold text-[#1F1B2D]">
            <FileText className="h-5 w-5 text-[#2D1B69]" />
            {data.title}
          </div>
          <div className="mt-1 text-sm text-[#6F6678]">
            {data.subtitle} · {data.beauticianName}
          </div>
          <div className="mt-1 text-xs text-[#9B92A3]">
            生成时间 {new Date(data.generatedAt).toLocaleString('zh-CN')}
          </div>
        </div>
        <span className="rounded-full bg-[#2D1B69]/8 px-3 py-1 text-xs font-medium text-[#2D1B69]">
          {tasks.length} 个可记录任务
        </span>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</div>
      ) : null}

      {!tasks.length ? (
        <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          当前暂无待记录服务，请前台确认到店后由系统生成服务任务，或从客户档案新建服务记录。
        </div>
      ) : (
        <>
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-[#6F6678]">选择待记录客户</span>
            <select
              value={selectedTaskId}
              onChange={(event) => setSelectedTaskId(Number(event.target.value))}
              className="h-12 rounded-xl border border-black/10 bg-white px-4 text-sm text-[#1F1B2D] outline-none focus:border-[#C9956C] focus:ring-2 focus:ring-[#C9956C]/20"
            >
              {tasks.map((task) => (
                <option key={task.id} value={task.id}>
                  {formatTaskLabel(task)}
                </option>
              ))}
            </select>
          </label>

          {selectedTask ? (
            <div className="grid gap-3 rounded-2xl bg-[#F7F5F2] p-4 text-sm sm:grid-cols-3">
              <div>
                <div className="text-xs text-[#6F6678]">客户</div>
                <div className="mt-1 font-semibold text-[#1F1B2D]">{selectedTask.customerName}</div>
              </div>
              <div>
                <div className="text-xs text-[#6F6678]">项目</div>
                <div className="mt-1 font-semibold text-[#1F1B2D]">{selectedTask.projectName}</div>
              </div>
              <div>
                <div className="text-xs text-[#6F6678]">状态</div>
                <div className="mt-1 font-semibold text-[#1F1B2D]">
                  {selectedTask.status === 'completed' ? '已记录' : '待记录'}
                </div>
              </div>
            </div>
          ) : null}

          <div className="grid gap-4">
            <label className="flex flex-col gap-2">
              <span className="flex items-center justify-between gap-3 text-sm font-medium text-[#6F6678]">
                服务结果
                <button
                  type="button"
                  onClick={() => startVoiceInput('result')}
                  className="inline-flex items-center gap-1 rounded-lg bg-[#F7F5F2] px-2 py-1 text-xs text-[#2D1B69]"
                >
                  <Mic className="h-3.5 w-3.5" />
                  {voiceListening ? '录入中' : '语音'}
                </button>
              </span>
              <textarea
                value={result}
                onChange={(event) => setResult(event.target.value)}
                rows={3}
                className="rounded-xl border border-black/10 px-4 py-3 text-sm outline-none focus:border-[#C9956C]"
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className="flex items-center justify-between gap-3 text-sm font-medium text-[#6F6678]">
                客户反馈
                <button
                  type="button"
                  onClick={() => startVoiceInput('feedback')}
                  className="inline-flex items-center gap-1 rounded-lg bg-[#F7F5F2] px-2 py-1 text-xs text-[#2D1B69]"
                >
                  <Mic className="h-3.5 w-3.5" />
                  语音
                </button>
              </span>
              <textarea
                value={customerFeedback}
                onChange={(event) => setCustomerFeedback(event.target.value)}
                rows={2}
                placeholder="例如：肤感舒缓，T 区仍有出油"
                className="rounded-xl border border-black/10 px-4 py-3 text-sm outline-none focus:border-[#C9956C]"
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-[#6F6678]">客户信息更新</span>
              <textarea
                value={customerInfoUpdate}
                onChange={(event) => setCustomerInfoUpdate(event.target.value)}
                rows={2}
                placeholder="例如：近期刷酸、睡眠偏晚、手机号或护理偏好变化"
                className="rounded-xl border border-black/10 px-4 py-3 text-sm outline-none focus:border-[#C9956C]"
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-[#6F6678]">关注事项</span>
              <textarea
                value={attentionItems}
                onChange={(event) => setAttentionItems(event.target.value)}
                rows={2}
                placeholder="例如：过敏禁忌、泛红部位、下次需避开的产品或手法"
                className="rounded-xl border border-black/10 px-4 py-3 text-sm outline-none focus:border-[#C9956C]"
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className="flex items-center justify-between gap-3 text-sm font-medium text-[#6F6678]">
                下次护理建议
                <button
                  type="button"
                  onClick={() => startVoiceInput('suggestion')}
                  className="inline-flex items-center gap-1 rounded-lg bg-[#F7F5F2] px-2 py-1 text-xs text-[#2D1B69]"
                >
                  <Mic className="h-3.5 w-3.5" />
                  语音
                </button>
              </span>
              <textarea
                value={nextSuggestion}
                onChange={(event) => setNextSuggestion(event.target.value)}
                rows={3}
                placeholder="建议填写护理周期、居家注意事项和下次项目"
                className="rounded-xl border border-black/10 px-4 py-3 text-sm outline-none focus:border-[#C9956C]"
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-[#6F6678]">备注</span>
              <input
                value={remark}
                onChange={(event) => setRemark(event.target.value)}
                placeholder="可选"
                className="h-12 rounded-xl border border-black/10 px-4 text-sm outline-none focus:border-[#C9956C]"
              />
            </label>
          </div>

          <div className="rounded-2xl border border-black/5 bg-[#F7F5F2] p-4">
            <div className="mb-3 text-sm font-semibold text-[#1F1B2D]">耗材明细</div>
            {materialItems.length ? (
              <div className="grid gap-2">
                {materialItems.map((item, index) => {
                  const key = String(item.productId ?? `${item.productName}-${index}`);
                  return (
                    <div
                      key={key}
                      className="grid gap-2 rounded-xl bg-white p-3 text-sm sm:grid-cols-[1fr_120px_80px] sm:items-center"
                    >
                      <div>
                        <div className="font-medium text-[#1F1B2D]">{item.productName || '未命名耗材'}</div>
                        <div className="mt-1 text-xs text-[#6F6678]">
                          标准 {item.standardQty || 0} {item.unit || ''}
                        </div>
                      </div>
                      <input
                        value={materialQtyByKey[key] ?? String(item.actualQty ?? item.standardQty ?? 0)}
                        onChange={(event) => setMaterialQtyByKey((prev) => ({ ...prev, [key]: event.target.value }))}
                        type="number"
                        min={0}
                        className="h-10 rounded-lg border border-black/10 px-3 text-sm outline-none focus:border-[#C9956C]"
                      />
                      <div className="text-xs text-[#6F6678]">{item.unit || '单位'}</div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl bg-white px-4 py-3 text-sm text-[#6F6678]">
                当前项目暂无 BOM 耗材明细，可直接提交服务记录。
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-2">
              <span className="flex items-center justify-between gap-3 text-sm font-medium text-[#6F6678]">
                服务前图片
                <span className="inline-flex items-center gap-1 rounded-lg bg-[#F7F5F2] px-2 py-1 text-xs text-[#2D1B69]">
                  <Camera className="h-3.5 w-3.5" />
                  拍照/上传
                </span>
              </span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                onChange={(event) => void handlePhotoFiles('before', event.target.files)}
                className="rounded-xl border border-dashed border-black/10 bg-white px-4 py-3 text-xs text-[#6F6678] file:mr-3 file:rounded-lg file:border-0 file:bg-[#2D1B69] file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white"
              />
              <textarea
                value={beforeImageUrls}
                onChange={(event) => setBeforeImageUrls(event.target.value)}
                rows={2}
                placeholder="可粘贴图片 URL，多张用换行或逗号分隔"
                className="rounded-xl border border-black/10 px-4 py-3 text-sm outline-none focus:border-[#C9956C]"
              />
              {beforeCapturedImages.length ? (
                <div className="grid grid-cols-3 gap-2">
                  {beforeCapturedImages.map((image, index) => (
                    <img
                      key={`${image.slice(0, 24)}-${index}`}
                      src={image}
                      alt={`服务前 ${index + 1}`}
                      className="aspect-square rounded-lg border border-black/5 object-cover"
                    />
                  ))}
                </div>
              ) : null}
            </label>
            <label className="flex flex-col gap-2">
              <span className="flex items-center justify-between gap-3 text-sm font-medium text-[#6F6678]">
                服务后图片
                <span className="inline-flex items-center gap-1 rounded-lg bg-[#F7F5F2] px-2 py-1 text-xs text-[#2D1B69]">
                  <Camera className="h-3.5 w-3.5" />
                  拍照/上传
                </span>
              </span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                onChange={(event) => void handlePhotoFiles('after', event.target.files)}
                className="rounded-xl border border-dashed border-black/10 bg-white px-4 py-3 text-xs text-[#6F6678] file:mr-3 file:rounded-lg file:border-0 file:bg-[#2D1B69] file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white"
              />
              <textarea
                value={afterImageUrls}
                onChange={(event) => setAfterImageUrls(event.target.value)}
                rows={2}
                placeholder="可粘贴图片 URL，多张用换行或逗号分隔"
                className="rounded-xl border border-black/10 px-4 py-3 text-sm outline-none focus:border-[#C9956C]"
              />
              {afterCapturedImages.length ? (
                <div className="grid grid-cols-3 gap-2">
                  {afterCapturedImages.map((image, index) => (
                    <img
                      key={`${image.slice(0, 24)}-${index}`}
                      src={image}
                      alt={`服务后 ${index + 1}`}
                      className="aspect-square rounded-lg border border-black/5 object-cover"
                    />
                  ))}
                </div>
              ) : null}
            </label>
          </div>
          <div data-signature-panel className="grid gap-3 rounded-2xl border border-black/5 bg-[#F7F5F2] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-[#1F1B2D]">客户签字确认</div>
                <div className="mt-1 text-xs text-[#6F6678]">客户可在终端屏幕签名，或输入姓名确认。</div>
              </div>
              <button
                type="button"
                onClick={clearSignature}
                className="inline-flex items-center gap-1 rounded-lg bg-white px-3 py-2 text-xs font-medium text-[#6F6678]"
              >
                <Eraser className="h-3.5 w-3.5" />
                清除签名
              </button>
            </div>
            <canvas
              width={720}
              height={180}
              onPointerDown={(event) => drawSignaturePoint(event, true)}
              onPointerMove={(event) => drawSignaturePoint(event)}
              onPointerUp={(event) => {
                const canvas = event.currentTarget;
                setSignatureImage(canvas.toDataURL('image/png'));
              }}
              className="h-36 w-full touch-none rounded-xl border border-dashed border-black/15 bg-white"
            />
            <input
              value={customerSignature}
              onChange={(event) => setCustomerSignature(event.target.value)}
              placeholder="签字姓名，例如：李伟明"
              className="h-12 rounded-xl border border-black/10 px-4 text-sm outline-none focus:border-[#C9956C]"
            />
          </div>

          <button
            type="button"
            onClick={() => setTransferToCashier((value) => !value)}
            className={cn(
              'flex h-11 items-center justify-between rounded-xl border px-4 text-sm font-medium',
              transferToCashier
                ? 'border-[#2D1B69] bg-[#2D1B69]/6 text-[#2D1B69]'
                : 'border-black/10 bg-white text-[#6F6678]',
            )}
          >
            <span>提交后提示转前台收银</span>
            <span>{transferToCashier ? '已开启' : '已关闭'}</span>
          </button>

          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit || loading}
            className="flex h-12 items-center justify-center gap-2 rounded-xl bg-[#1F1B2D] text-sm font-semibold text-white disabled:opacity-50"
          >
            <CheckSquare className="h-4 w-4" />
            {loading ? '正在提交...' : '提交服务记录'}
          </button>
        </>
      )}
    </div>
  );
}
