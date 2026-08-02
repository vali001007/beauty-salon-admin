import { describe, expect, it } from 'vitest'
import { presentBrainActionDecision } from './brain-action-decision'
import type { BrainActionDecisionResponse } from './brain'

describe('mobile Brain action decision presentation', () => {
  const actionFixture = {
    id: 'BQ0211',
    question: '帮王静怡新建客户档案，电话138xxxx807',
    questionId: 'BQ0211',
    actionId: 'act_customer_create',
    runId: 88,
  }

  it.each([
    ['queued', 'info', '执行队列'],
    ['executing', 'info', '正在执行'],
    ['succeeded', 'success', '执行完成'],
    ['partially_succeeded', 'error', '部分执行成功'],
    ['failed', 'error', '执行失败'],
    ['expired', 'error', '已过期'],
    ['rejected', 'success', '不会执行'],
    ['pending', 'info', '等待确认'],
  ] as const)('does not present %s as a false success', (status, tone, text) => {
    const result: BrainActionDecisionResponse = {
      actionId: actionFixture.actionId,
      runId: actionFixture.runId,
      status,
    }

    expect(presentBrainActionDecision(result, status === 'rejected' ? 'reject' : 'confirm')).toMatchObject({ tone })
    expect(presentBrainActionDecision(result, status === 'rejected' ? 'reject' : 'confirm').message).toContain(text)
  })

  it('keeps a partial receipt visibly non-successful', () => {
    expect(presentBrainActionDecision({
      actionId: actionFixture.actionId,
      runId: actionFixture.runId,
      status: 'partially_succeeded',
      receipt: { message: '已触达 2 人，1 人失败' },
    }, 'confirm')).toEqual({ tone: 'error', message: '已触达 2 人，1 人失败' })
  })

  it('does not claim a rejection succeeded when the reject endpoint failed', () => {
    expect(presentBrainActionDecision({
      actionId: actionFixture.actionId,
      runId: actionFixture.runId,
      status: 'failed',
      error: { message: '拒绝写入失败' }, // ami-brain-unit-only
    }, 'reject')).toEqual({ tone: 'error', message: '拒绝写入失败' })
  })
})
