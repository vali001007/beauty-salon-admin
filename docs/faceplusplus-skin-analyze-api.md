# Face++ AI 肤质检测接口接入说明

本说明用于 Ami_Core 管理端 `客户管理 / 客户数据 / 肌肤档案` 的 `AI肤质检测` 功能。

## 调用链路

```text
管理端拍照 -> POST /api/ai/analyze/skin-photo -> Core 后端 -> Face++ 皮肤分析-高阶版 -> 统一映射为客户肌肤档案
```

前端和 Ami Aura Lite 不保存 Face++ Key，只调用 Core 后端接口。

## 后端环境变量

```env
FACEPP_API_KEY=
FACEPP_API_SECRET=
FACEPP_SKIN_ANALYZE_URL=https://api-cn.faceplusplus.com/facepp/v1/skinanalyze
FACEPP_SKIN_ANALYZE_TIMEOUT_MS=30000
FACEPP_SKIN_ANALYZE_FALLBACK=true
REQUEST_BODY_LIMIT=12mb
```

- `FACEPP_API_KEY`：Face++ 控制台生成的 API Key。
- `FACEPP_API_SECRET`：Face++ 控制台生成的 API Secret。
- `FACEPP_SKIN_ANALYZE_URL`：皮肤分析-高阶版接口地址，默认使用中国区接口。
- `FACEPP_SKIN_ANALYZE_TIMEOUT_MS`：第三方接口超时时间。
- `FACEPP_SKIN_ANALYZE_FALLBACK`：为 `true` 时，Face++ 未配置或临时失败会返回演示级兜底结果，避免门店演示流程中断；生产环境可改为 `false`。
- `REQUEST_BODY_LIMIT`：Core API 接收 JSON 请求体的大小上限。肤质检测会传输压缩后的 base64 图片，建议不低于 `12mb`。

## Core 接口

`POST /api/ai/analyze/skin-photo`

请求：

```json
{
  "customerId": 1,
  "customerName": "张女士",
  "storeName": "心悦美容养生会所",
  "imageDataUrl": "data:image/jpeg;base64,...",
  "capturedAt": "2026-06-01T10:00:00.000Z"
}
```

响应：

```json
{
  "id": "facepp-request-id",
  "customerId": 1,
  "customerName": "张女士",
  "skinType": "混合",
  "skinStatus": "肤质倾向为混合，水油状态相对平衡",
  "mainProblems": "敏感泛红、毛孔粗大",
  "allergyHistory": "检测到敏感/泛红风险，需到店确认近期过敏史与护肤品使用情况",
  "goals": "舒缓修护、细致毛孔",
  "recommendedCare": "舒缓修护护理 + 低敏补水管理",
  "instrument": "Face++ 皮肤分析-高阶版",
  "metrics": {
    "moisture": 50,
    "oil": 62,
    "elasticity": 71,
    "sensitivity": 68,
    "pore": 72,
    "pigmentation": 41
  },
  "confidence": 0.95,
  "capturedAt": "2026-06-01T10:00:00.000Z",
  "explanation": "Face++ 高阶肤质检测判断当前偏混合..."
}
```

## 字段映射

Face++ 高阶版返回的 `result` 会被 Core 统一映射为 Ami_Core 当前可保存的客户肌肤档案字段：

| Ami_Core 字段 | 来源与处理 |
| --- | --- |
| `skinType` | 识别 `skin_type / skinTexture / skinQuality` 等字段，统一为 `干性 / 油性 / 混合 / 敏感 / 中性` |
| `metrics.sensitivity` | 识别敏感、红区等指标，归一化到 0-100 |
| `metrics.pore` | 汇总额头、左右脸颊、下巴等毛孔指标，归一化到 0-100 |
| `metrics.pigmentation` | 汇总斑点、色沉、肤色肤调等指标，归一化到 0-100 |
| `metrics.oil` | 优先使用出油指标；无明确字段时按肤质推导 |
| `metrics.moisture` | 按肤质、敏感和痘痘风险推导为可运营的水分评分 |
| `metrics.elasticity` | 按细纹、法令纹和肤龄推导为弹性评分 |
| `mainProblems` | 根据敏感、毛孔、色沉、痘痘闭口黑头、细纹、缺水生成门店可读的问题摘要 |
| `goals` | 转成护理目标，如补水保湿、舒缓修护、控油清洁、细致毛孔 |
| `recommendedCare` | 转成门店可执行的护理建议 |

## 失败策略

- 未配置 `FACEPP_API_KEY` 或 `FACEPP_API_SECRET`：返回演示级兜底结果，并在 `instrument` 中标记。
- Face++ 网络异常、超时或返回错误：
  - `FACEPP_SKIN_ANALYZE_FALLBACK=true`：返回兜底结果并写入 AI 审计日志。
  - `FACEPP_SKIN_ANALYZE_FALLBACK=false`：接口返回 502，提示检查 Face++ Key、权限、套餐和图片质量。

## 验收点

1. 后端 `.env` 配置 Face++ Key 后，`/api/ai/analyze/skin-photo` 会向 Face++ 发起 `application/x-www-form-urlencoded` 请求。
2. 请求参数包含 `api_key`、`api_secret`、`image_base64`。
3. 管理端拍照检测后可将结果录入客户肌肤档案。
4. AI 审计日志记录 `scenario=skin_photo_analyze`、`provider=faceplusplus`、`model=skin_analyze_premier`。
