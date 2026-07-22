// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ChatMessage } from './ChatMessage'

describe('mobile ChatMessage Ami Brain blocks', () => {
  it('renders every governed block family without falling back to plain text', () => {
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
  })

  it('submits clarification and explicit approve or reject decisions', () => {
    const onClarificationSelect = vi.fn()
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
          { kind: 'action_preview', actions: [action] },
        ]}
        onClarificationSelect={onClarificationSelect}
        onConfirmAction={onConfirmAction}
        onRejectAction={onRejectAction}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '本月' }))
    fireEvent.click(screen.getByRole('button', { name: '确认执行' }))
    fireEvent.click(screen.getByRole('button', { name: '拒绝' }))

    expect(onClarificationSelect).toHaveBeenCalledWith('本月', '本月')
    expect(onConfirmAction).toHaveBeenCalledWith(action)
    expect(onRejectAction).toHaveBeenCalledWith(action)
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
})
