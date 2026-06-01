import React, { useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, Trash2, Upload } from "lucide-react";
import type { RegistrationConfirmInput, RegistrationFlowData, RegistrationSkinAnalysisData } from "../types";
import { analyzeRegistrationSkinPhoto } from "../services/auraCoreService";
import { cn } from "./ui/utils";

const readImageFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      if (!dataUrl) {
        reject(new Error("照片读取失败，请重新上传"));
        return;
      }

      const image = new Image();
      image.onload = () => {
        const maxSide = 1280;
        const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("照片处理失败，请重新上传"));
          return;
        }
        context.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.86));
      };
      image.onerror = () => reject(new Error("照片读取失败，请重新上传"));
      image.src = dataUrl;
    };
    reader.onerror = () => reject(new Error("照片读取失败，请重新上传"));
    reader.readAsDataURL(file);
  });

const getCameraErrorMessage = (err: unknown) => {
  if (err instanceof DOMException) {
    if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
      return "未获得摄像头权限，请允许浏览器摄像头权限，或使用“上传照片”进行检测。";
    }
    if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
      return "未检测到可用摄像头，请连接摄像头，或使用“上传照片”进行检测。";
    }
    if (err.name === "NotReadableError" || err.name === "TrackStartError") {
      return "摄像头暂时不可用，可能被其他程序占用，请关闭占用程序或使用“上传照片”进行检测。";
    }
  }

  if (err instanceof Error && /permission denied|notallowed/i.test(err.message)) {
    return "未获得摄像头权限，请允许浏览器摄像头权限，或使用“上传照片”进行检测。";
  }

  return err instanceof Error ? err.message : "面部检测失败，请重试";
};

export function RegistrationFlowCard({
  data,
  onConfirm,
}: {
  data: RegistrationFlowData;
  onConfirm: (input: RegistrationConfirmInput) => Promise<void>;
}) {
  const [step, setStep] = useState(1);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    gender: "女" as "男" | "女",
    birthday: "",
    source: "Ami Aura Lite",
    remark: "",
    skinType: "混合肌",
    skinStatus: "偏干缺水",
    mainProblems: "缺水、暗沉",
    recommendationText: "建议补水修护护理，7-14 天后复诊。",
  });
  const [cameraCaptured, setCameraCaptured] = useState(false);
  const [capturedPreview, setCapturedPreview] = useState<string | null>(null);
  const [skinAnalysis, setSkinAnalysis] = useState<RegistrationSkinAnalysisData | null>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const setField = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm((prev) => ({ ...prev, [key]: event.target.value }));
  };

  const canSubmitBasic = form.name.trim() && form.phone.trim();

  const analyzeImageDataUrl = async (imageDataUrl: string) => {
    const result = await analyzeRegistrationSkinPhoto({
      imageDataUrl,
      customerName: form.name || undefined,
    });
    setCapturedPreview(imageDataUrl);
    setSkinAnalysis(result);
    setCameraCaptured(true);
    setForm((prev) => ({
      ...prev,
      skinType: result.skinType,
      skinStatus: result.skinStatus,
      mainProblems: result.mainProblems,
      recommendationText: result.recommendationText,
    }));
  };

  const captureFaceImage = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("当前浏览器不支持摄像头采集，请在支持摄像头的设备上重试");
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user",
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    });
    streamRef.current = stream;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) {
      stream.getTracks().forEach((track) => track.stop());
      throw new Error("摄像头画面初始化失败");
    }

    try {
      video.srcObject = stream;
      await video.play();
      await new Promise((resolve) => window.setTimeout(resolve, 600));

      const width = video.videoWidth || 720;
      const height = video.videoHeight || 720;
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("摄像头画面采集失败");
      context.drawImage(video, 0, 0, width, height);

      return canvas.toDataURL("image/jpeg", 0.86);
    } finally {
      stream.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      video.srcObject = null;
    }
  };

  const runSkinAnalyze = async () => {
    setScanLoading(true);
    setError(null);
    try {
      const imageDataUrl = await captureFaceImage();
      await analyzeImageDataUrl(imageDataUrl);
    } catch (err) {
      setCameraCaptured(false);
      setSkinAnalysis(null);
      setError(getCameraErrorMessage(err));
    } finally {
      setScanLoading(false);
    }
  };

  const handleUploadPhoto = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("请上传 JPG、PNG 等图片文件");
      return;
    }

    setScanLoading(true);
    setError(null);
    try {
      const imageDataUrl = await readImageFileAsDataUrl(file);
      await analyzeImageDataUrl(imageDataUrl);
    } catch (err) {
      setCameraCaptured(false);
      setSkinAnalysis(null);
      setError(err instanceof Error ? err.message : "照片检测失败，请重新上传");
    } finally {
      setScanLoading(false);
    }
  };

  const clearSkinPhoto = () => {
    setCapturedPreview(null);
    setSkinAnalysis(null);
    setCameraCaptured(false);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const submit = async () => {
    if (!canSubmitBasic) return;
    setLoading(true);
    setError(null);
    try {
      await onConfirm({
        ...form,
        cameraCaptured,
        skinMetrics: skinAnalysis?.metrics,
        skinImageUrl: skinAnalysis?.imageUrl,
        skinInstrument: skinAnalysis?.instrument,
        skinConfidence: skinAnalysis?.confidence,
        skinCapturedAt: skinAnalysis?.capturedAt,
        skinAnalyzeId: skinAnalysis?.analyzeId,
      });
      setStep(4);
    } catch (err) {
      setError(err instanceof Error ? err.message : "登记提交失败");
    } finally {
      setLoading(false);
    }
  };

  if (step === 4) return null;

  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-black/5 bg-white p-5 shadow-sm">
      <div>
        <div className="text-2xl font-semibold text-[#1F1B2D]">{data.title}</div>
        <div className="mt-1 text-sm text-[#6F6678]">{data.subtitle} · {data.source}</div>
        <div className="mt-1 text-xs text-[#9B92A3]">生成时间 {data.generatedAt}</div>
      </div>
      {error ? <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</div> : null}

      {step === 1 ? (
        <div className="flex flex-col gap-4">
          <div className="text-sm font-medium text-[#6F6678]">第一步：录入用户信息</div>
          <div className="grid gap-4 md:grid-cols-2">
            <input value={form.name} onChange={setField("name")} placeholder="客户姓名" className="h-12 rounded-xl border border-black/10 px-4 outline-none focus:border-[#C9956C]" />
            <input value={form.phone} onChange={setField("phone")} placeholder="手机号" className="h-12 rounded-xl border border-black/10 px-4 outline-none focus:border-[#C9956C]" />
            <select value={form.gender} onChange={setField("gender")} className="h-12 rounded-xl border border-black/10 px-4 outline-none focus:border-[#C9956C]">
              <option value="女">女</option>
              <option value="男">男</option>
            </select>
            <input type="date" value={form.birthday} onChange={setField("birthday")} placeholder="生日（选填）" className="h-12 rounded-xl border border-black/10 px-4 outline-none focus:border-[#C9956C]" />
          </div>
          <textarea value={form.remark} onChange={setField("remark")} placeholder="备注（选填）" className="min-h-20 rounded-xl border border-black/10 px-4 py-3 outline-none focus:border-[#C9956C]" />
          <button type="button" onClick={() => setStep(2)} disabled={!canSubmitBasic} className="h-13 rounded-2xl bg-[#C9956C] text-base font-semibold text-white disabled:opacity-40">
            下一步：面部检测
          </button>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="flex flex-col gap-5">
          <div className="text-sm font-medium text-[#6F6678]">第二步：面部检测</div>
          <div className="rounded-2xl border border-dashed border-[#2D1B69]/20 bg-[#2D1B69]/5 p-6 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white">
              {cameraCaptured ? <CheckCircle2 className="h-8 w-8 text-emerald-600" /> : <Camera className="h-8 w-8 text-[#2D1B69]" />}
            </div>
            <div className="mt-4 text-lg font-semibold text-[#1F1B2D]">{cameraCaptured ? "面部检测已完成" : "调用摄像头进行面部检测"}</div>
            <p className="mt-2 text-sm text-[#6F6678]">
              {cameraCaptured
                ? `已调用 Ami_Core 面部检测 API${skinAnalysis?.instrument ? ` · ${skinAnalysis.instrument}` : ""}`
                : "可调用本机摄像头采集画面，也可上传照片，并提交 Ami_Core 面部检测 API 分析。"}
            </p>
            {capturedPreview ? (
              <img
                src={capturedPreview}
                alt="面部检测采集预览"
                className="mx-auto mt-4 h-28 w-40 rounded-xl object-cover"
              />
            ) : null}
            <video ref={videoRef} muted playsInline className="hidden" />
            <canvas ref={canvasRef} className="hidden" />
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleUploadPhoto} />
            <div className="mt-4 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={runSkinAnalyze}
                disabled={scanLoading}
                className="inline-flex items-center gap-2 rounded-xl bg-[#1F1B2D] px-5 py-3 text-sm font-medium text-white disabled:opacity-60"
              >
                <Camera className="h-4 w-4" />
                {scanLoading ? "正在检测..." : cameraCaptured ? "重新检测" : "开始检测"}
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={scanLoading}
                className="inline-flex items-center gap-2 rounded-xl border border-black/10 bg-white px-5 py-3 text-sm font-medium text-[#1F1B2D] disabled:opacity-60"
              >
                <Upload className="h-4 w-4" />
                上传照片
              </button>
              {capturedPreview || skinAnalysis ? (
                <button
                  type="button"
                  onClick={clearSkinPhoto}
                  disabled={scanLoading}
                  className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-5 py-3 text-sm font-medium text-rose-600 disabled:opacity-60"
                >
                  <Trash2 className="h-4 w-4" />
                  删除照片
                </button>
              ) : null}
            </div>
          </div>
          {skinAnalysis ? (
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-emerald-800">Ami_Core 面部检测结果</div>
                  <div className="mt-1 text-xs text-emerald-700">
                    检测ID {skinAnalysis.analyzeId} · 置信度 {Math.round(skinAnalysis.confidence * 100)}%
                  </div>
                </div>
                <div className="rounded-full bg-white px-3 py-1 text-xs font-medium text-emerald-700">
                  {skinAnalysis.instrument}
                </div>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {skinAnalysis.metrics.slice(0, 6).map((metric) => (
                  <div key={metric.key} className="rounded-xl bg-white px-3 py-2">
                    <div className="text-[11px] text-[#6F6678]">{metric.label}</div>
                    <div className="mt-1 text-sm font-semibold text-[#1F1B2D]">
                      {metric.value}
                      {metric.unit ?? ""}
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-sm leading-6 text-emerald-800">{skinAnalysis.explanation}</p>
            </div>
          ) : null}
          <div className="grid gap-4 md:grid-cols-2">
            <input value={form.skinType} onChange={setField("skinType")} placeholder="肤质" className="h-12 rounded-xl border border-black/10 px-4 outline-none focus:border-[#C9956C]" />
            <input value={form.skinStatus} onChange={setField("skinStatus")} placeholder="皮肤状态" className="h-12 rounded-xl border border-black/10 px-4 outline-none focus:border-[#C9956C]" />
          </div>
          <textarea value={form.mainProblems} onChange={setField("mainProblems")} placeholder="主要问题" className="min-h-20 rounded-xl border border-black/10 px-4 py-3 outline-none focus:border-[#C9956C]" />
          <div className="grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={() => setStep(1)} className="h-12 rounded-xl border border-black/10 bg-white text-sm font-medium">返回信息</button>
            <button type="button" onClick={() => setStep(3)} disabled={!cameraCaptured} className="h-12 rounded-xl bg-[#C9956C] text-sm font-semibold text-white disabled:opacity-40">
              生成用户信息卡
            </button>
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="flex flex-col gap-5">
          <div className="text-sm font-medium text-[#6F6678]">第三步：生成用户信息卡</div>
          <div className="rounded-2xl bg-[#F7F5F2] p-5">
            <div className="text-2xl font-bold text-[#1F1B2D]">{form.name}</div>
            <div className="mt-1 text-sm text-[#6F6678]">{form.phone} · {form.gender} · 新客户</div>
            <div className="mt-4 flex flex-wrap gap-2">
              {[form.skinType, form.skinStatus, form.mainProblems].map((item) => (
                <span key={item} className="rounded-full bg-white px-3 py-1 text-xs text-[#6F6678]">{item}</span>
              ))}
            </div>
            <textarea value={form.recommendationText} onChange={setField("recommendationText")} className="mt-4 min-h-20 w-full rounded-xl border border-black/10 bg-white px-4 py-3 outline-none focus:border-[#C9956C]" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={() => setStep(2)} className="h-12 rounded-xl border border-black/10 bg-white text-sm font-medium">返回检测</button>
            <button type="button" onClick={submit} disabled={loading} className={cn("h-12 rounded-xl bg-[#1F1B2D] text-sm font-semibold text-white", loading && "opacity-60")}>
              {loading ? "正在登记..." : "确认登记"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
