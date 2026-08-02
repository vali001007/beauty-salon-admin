import type { BrainActionDecisionResponse } from './brain'

export interface BrainActionDecisionPresentation {
  tone: 'success' | 'info' | 'error'
  message: string
}

export function presentBrainActionDecision(
  result: BrainActionDecisionResponse,
  decision: 'confirm' | 'reject',
): BrainActionDecisionPresentation {
  const receiptMessage = typeof result.receipt?.message === 'string' ? result.receipt.message.trim() : ''
  if (receiptMessage) {
    return {
      tone:
        result.status === 'failed' || result.status === 'expired' || result.status === 'partially_succeeded'
          ? 'error'
          : result.status === 'queued' || result.status === 'executing'
            ? 'info'
            : 'success',
      message: receiptMessage,
    }
  }
  if (result.status === 'succeeded') return { tone: 'success', message: '动作已执行完成。' }
  if (result.status === 'partially_succeeded') return { tone: 'error', message: '动作仅部分执行成功，请核对业务回执和失败项。' }
  if (result.status === 'failed') return { tone: 'error', message: result.error?.message || '动作执行失败，未确认业务写入结果。' }
  if (result.status === 'expired') return { tone: 'error', message: '动作确认已过期，请重新生成动作预览。' }
  if (result.status === 'queued') return { tone: 'info', message: '动作已进入执行队列，业务结果尚未完成。' }
  if (result.status === 'executing') return { tone: 'info', message: '动作正在执行，业务结果尚未完成。' }
  if (result.status === 'rejected') return { tone: 'success', message: '已拒绝该动作，本次不会执行。' }
  if (decision === 'reject') return { tone: 'info', message: '拒绝请求已提交，当前仍在等待最终状态。' }
  return { tone: 'info', message: '动作仍在等待确认。' }
}
