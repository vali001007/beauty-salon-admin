// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ChatInput } from './ChatInput'

describe('ChatInput failure recovery', () => {
  it('keeps the message when sending fails and clears it after a successful retry', async () => {
    const registeredQuestion = { id: 'BQ0627', text: '最近三个月的实收流水' }
    const onSend = vi.fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)

    render(<ChatInput onSend={onSend} />)
    const input = screen.getByPlaceholderText('输入消息...') as HTMLInputElement
    fireEvent.change(input, { target: { value: registeredQuestion.text } })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))

    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1))
    expect(input.value).toBe(registeredQuestion.text)

    fireEvent.click(screen.getByRole('button', { name: '发送' }))
    await waitFor(() => expect(input.value).toBe(''))
  })
})
