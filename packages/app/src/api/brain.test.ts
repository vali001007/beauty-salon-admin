import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiClient = vi.hoisted(() => ({
  post: vi.fn(),
}))

vi.mock('./client', () => ({ default: apiClient }))

describe('mobile Ami Brain API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiClient.post.mockResolvedValue({ status: 'completed' })
  })

  it('keeps the role and timezone contract when sending a message', async () => {
    const { sendBrainMessage } = await import('./brain')

    await sendBrainMessage(16, {
      message: '本月商品销售排行',
      roleHint: 'store_manager',
      timezone: 'Asia/Shanghai',
    })

    expect(apiClient.post).toHaveBeenCalledWith('/brain/conversations/16/messages', {
      message: '本月商品销售排行',
      roleHint: 'store_manager',
      timezone: 'Asia/Shanghai',
    })
  })

  it('uses governed confirm and reject endpoints with the source run', async () => {
    const { confirmBrainAction, rejectBrainAction } = await import('./brain')

    await confirmBrainAction('act:purchase/1', 88)
    await rejectBrainAction('act:purchase/1', 88)

    expect(apiClient.post).toHaveBeenCalledWith('/brain/actions/act%3Apurchase%2F1/confirm', {
      actionId: 'act:purchase/1',
      runId: 88,
    })
    expect(apiClient.post).toHaveBeenCalledWith('/brain/actions/act%3Apurchase%2F1/reject', {
      actionId: 'act:purchase/1',
      runId: 88,
    })
  })
})
