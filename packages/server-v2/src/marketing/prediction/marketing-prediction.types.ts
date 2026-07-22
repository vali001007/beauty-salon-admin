export const MARKETING_PREDICTION_MODEL_VERSION = 'rules-v2.1';
export const MARKETING_PREDICTION_STALE_RUNNING_MS = 30 * 60 * 1000;

export function getShanghaiBusinessDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function buildPredictionRunKey(storeId: number, businessDate: string, modelVersion = MARKETING_PREDICTION_MODEL_VERSION) {
  return `store:${storeId}:date:${businessDate}:model:${modelVersion}`;
}
