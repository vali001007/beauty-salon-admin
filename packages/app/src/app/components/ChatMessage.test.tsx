// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ChatMessage } from './ChatMessage'

describe('mobile ChatMessage Ami Brain blocks', () => {
  it('renders every governed block family without falling back to plain text', () => {
    const structuredResultJourney = { id: 'BQ0500', question: '本月各项目的销量排行' }
    render(
      <ChatMessage
        type="ai"
        content="兼容摘要"
        blocks={[
          { kind: 'kpi', items: [{ label: '本月实收', value: '28,756.30 元', hint: '已扣退款' }] },
          { kind: 'ranking', columns: ['商品', '销量'], rows: [{ 商品: '抗衰紧致眼霜', 销量: 14 }] },
          { kind: 'chart', chartType: 'line', rows: [{ 日期: '07-20', 营业额: 1200 }, { 日期: '07-21', 营业额: 1800 }], xKey: '日期', yKeys: ['营业额'] },
          { kind: 'comparison', items: [{ label: '实收', current: '100', previous: '80', delta: '+20' }] },
          { kind: 'diagnosis', findings: [{ title: '退款异常', detail: '退款金额上升', severity: 'warning' }] },
          { kind: 'limitations', items: ['缺少满意度采集'] },
          { kind: 'evidence', citations: [{ sourceType: 'metric', sourceId: 'metric.paid_amount', label: '实收' }] },
        ]}
      />,
    )

    expect(screen.getByText('28,756.30 元')).not.toBeNull()
    expect(screen.getByText('抗衰紧致眼霜')).not.toBeNull()
    expect(screen.getByLabelText('趋势数据图')).not.toBeNull()
    expect(screen.getByText('退款异常')).not.toBeNull()
    expect(screen.getByText(/缺少满意度采集/)).not.toBeNull()
    expect(screen.getByText(/数据依据：实收/)).not.toBeNull()
    expect(screen.queryByText('兼容摘要')).toBeNull()
    expect(structuredResultJourney.id).toBe('BQ0500')
  })

  it('submits clarification and explicit approve or reject decisions', () => {
    const clarificationJourney = { id: 'BQ1965', question: '本月怎么样' }
    const followUpJourney = { id: 'BQ1933', question: '第1轮:先看上周流水 → 第2轮:跟昨天比呢' }
    const onClarificationSelect = vi.fn()
    const onFollowUpSelect = vi.fn()
    const onConfirmAction = vi.fn()
    const onRejectAction = vi.fn()
    const action = {
      actionId: 'act_1',
      actionType: 'create_purchase_order',
      riskLevel: 'high' as const,
      summary: '创建补货单预览',
      requiresConfirmation: true,
    }

    render(
      <ChatMessage
        type="ai"
        blocks={[
          { kind: 'clarification', question: '查看哪个周期？', options: [{ id: 'month', label: '本月', value: '本月' }] },
          { kind: 'follow_up_questions', questions: [{ id: 'compare', label: '跟昨天比呢', value: '跟昨天比呢' }] },
          { kind: 'action_preview', actions: [action] },
        ]}
        onClarificationSelect={onClarificationSelect}
        onFollowUpSelect={onFollowUpSelect}
        onConfirmAction={onConfirmAction}
        onRejectAction={onRejectAction}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '本月' }))
    fireEvent.click(screen.getByRole('button', { name: '跟昨天比呢' }))
    fireEvent.click(screen.getByRole('button', { name: '确认执行' }))
    fireEvent.click(screen.getByRole('button', { name: '拒绝' }))

    expect(onClarificationSelect).toHaveBeenCalledWith('本月', '本月', 'month')
    expect(onFollowUpSelect).toHaveBeenCalledWith('跟昨天比呢', '跟昨天比呢', 'compare')
    expect(onConfirmAction).toHaveBeenCalledWith(action)
    expect(onRejectAction).toHaveBeenCalledWith(action)
    expect(clarificationJourney.id).toBe('BQ1965')
    expect(followUpJourney.id).toBe('BQ1933')
  })

  it('falls back to the compatible answer when a future block kind is unknown', () => {
    render(
      <ChatMessage
        type="ai"
        content="兼容摘要仍可读取"
        blocks={[{ kind: 'future_block', payload: 'unsupported' } as never]}
      />,
    )

    expect(screen.getByText('兼容摘要仍可读取')).not.toBeNull()
  })

  it('shows a clear empty result without exposing internal no-data codes', () => {
    render(
      <ChatMessage
        type="ai"
        blocks={[
          { kind: 'ranking', columns: ['员工'], rows: [] },
          { kind: 'limitations', items: ['no_data:ranking'] },
        ]}
      />,
    )

    expect(screen.getByText('暂无匹配数据')).not.toBeNull()
    expect(screen.queryByText(/no_data:ranking/)).toBeNull()
  })

  it.each([
    ['failed', '执行失败'],
    ['running', '处理中'],
    ['needs_confirmation', '待确认'],
    ['cancelled', '已取消'],
  ] as const)('shows the top-level %s status without presenting it as completed', (brainStatus, label) => {
    render(
      <ChatMessage
        type="ai"
        brainStatus={brainStatus}
        blocks={[{ kind: 'text', text: '状态说明' }]}
      />,
    )

    expect(screen.getByText(label)).not.toBeNull()
  })
})
