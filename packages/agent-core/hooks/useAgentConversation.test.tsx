import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAgentConversation, type AgentConversationApi } from './useAgentConversation';

describe('useAgentConversation', () => {
  it('creates a run, appends follow-up messages, and submits feedback', async () => {
    const api: AgentConversationApi = {
      createRun: vi.fn(async () => ({
        runId: 101,
        runNo: 'AG101',
        status: 'completed' as const,
        answer: '首轮回答',
        toolResults: [],
        actions: [],
        renderedBlocks: [{ kind: 'text' as const, content: '首轮回答' }],
        followUpSuggestions: ['继续追问'],
        personaCode: 'manager' as const,
      })),
      appendMessage: vi.fn(async () => ({
        runId: 101,
        runNo: 'AG101',
        status: 'completed' as const,
        answer: '追问回答',
        toolResults: [],
        actions: [],
        renderedBlocks: [],
      })),
      submitFeedback: vi.fn(async () => undefined),
    };

    const { result } = renderHook(() =>
      useAgentConversation({
        api,
        role: 'manager',
        entrypoint: 'ami-agent:manager',
        personaCode: 'manager',
      }),
    );

    await act(async () => {
      await result.current.sendMessage('今天经营有什么风险');
    });

    expect(api.createRun).toHaveBeenCalledWith({
      message: '今天经营有什么风险',
      role: 'manager',
      entrypoint: 'ami-agent:manager',
      personaCode: 'manager',
      operatorId: undefined,
      context: undefined,
    });
    expect(result.current.activeRunId).toBe(101);
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[1]).toMatchObject({
      role: 'agent',
      text: '首轮回答',
      loading: false,
      runId: 101,
      followUpSuggestions: ['继续追问'],
    });

    await act(async () => {
      await result.current.sendMessage('展开说下');
    });

    expect(api.appendMessage).toHaveBeenCalledWith(101, {
      message: '展开说下',
      role: 'manager',
      entrypoint: 'ami-agent:manager',
      personaCode: 'manager',
      operatorId: undefined,
      context: undefined,
    });
    expect(result.current.messages).toHaveLength(4);
    expect(result.current.messages[3]).toMatchObject({
      role: 'agent',
      text: '追问回答',
      loading: false,
      runId: 101,
    });

    await act(async () => {
      await result.current.submitFeedback(101, { adopted: true });
    });
    expect(api.submitFeedback).toHaveBeenCalledWith(101, { adopted: true });
  });

  it('keeps the user question and marks the agent message when request fails', async () => {
    const api: AgentConversationApi = {
      createRun: vi.fn(async () => {
        throw new Error('Internal server error');
      }),
      appendMessage: vi.fn(),
    };

    const { result } = renderHook(() =>
      useAgentConversation({
        api,
        formatError: () => 'Agent 服务暂时异常',
      }),
    );

    await act(async () => {
      await result.current.sendMessage('近期有哪些临期库存');
    });

    expect(result.current.activeRunId).toBeNull();
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0]).toMatchObject({ role: 'user', text: '近期有哪些临期库存' });
    expect(result.current.messages[1]).toMatchObject({
      role: 'agent',
      loading: false,
      error: 'Agent 服务暂时异常',
    });
  });

  it('maps no_data, unsupported, and failed results into shared status notices for UI rendering', async () => {
    const responses = [
      {
        runId: 201,
        runNo: 'AG201',
        status: 'completed' as const,
        answer: '',
        toolResults: [{ status: 'no_data' as const, title: '临期库存', summary: '未来 90 天暂无临期库存。' }],
        actions: [],
      },
      {
        runId: 202,
        runNo: 'AG202',
        status: 'completed' as const,
        answer: '',
        toolResults: [{ status: 'unsupported' as const, title: '暂不支持', summary: '当前暂不支持查询这个指标。' }],
        actions: [],
      },
      {
        runId: 203,
        runNo: 'AG203',
        status: 'failed' as const,
        answer: '',
        toolResults: [{ status: 'failed' as const, title: '库存工具失败', summary: '库存数据加载失败。' }],
        actions: [],
      },
    ];
    const api: AgentConversationApi = {
      createRun: vi.fn(async () => responses.shift()!),
      appendMessage: vi.fn(),
    };

    const { result } = renderHook(() =>
      useAgentConversation({
        api,
        role: 'manager',
        entrypoint: 'ami-agent:manager',
      }),
    );

    await act(async () => {
      await result.current.sendMessage('近期有哪些临期库存');
    });
    expect(result.current.messages[1]).toMatchObject({
      role: 'agent',
      statusNotice: {
        kind: 'no_data',
        title: '暂无数据',
        message: '未来 90 天暂无临期库存。',
      },
    });

    await act(async () => {
      result.current.setActiveRunId(null);
    });
    await act(async () => {
      await result.current.sendMessage('查询暂不支持指标');
    });
    expect(result.current.messages[3]).toMatchObject({
      role: 'agent',
      statusNotice: {
        kind: 'unsupported',
        title: '暂不支持',
        message: '当前暂不支持查询这个指标。',
      },
    });

    await act(async () => {
      result.current.setActiveRunId(null);
    });
    await act(async () => {
      await result.current.sendMessage('库存工具失败怎么办');
    });
    expect(result.current.messages[5]).toMatchObject({
      role: 'agent',
      statusNotice: {
        kind: 'failed',
        title: '执行失败',
        message: '库存数据加载失败。',
      },
    });
  });
});
