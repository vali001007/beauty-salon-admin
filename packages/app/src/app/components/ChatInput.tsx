import { useState } from 'react'
import { Send, ImageIcon, Mic } from 'lucide-react'

interface ChatInputProps {
  onSend: (message: string) => void
  disabled?: boolean
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [message, setMessage] = useState('')

  const handleSend = () => {
    if (message.trim() && !disabled) {
      onSend(message.trim())
      setMessage('')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="border-t border-gray-200 bg-white p-4">
      <div className="flex items-end gap-2">
        <button className="flex-shrink-0 w-9 h-9 flex items-center justify-center text-gray-400 hover:text-[#C9956C] transition-colors">
          <ImageIcon size={20} />
        </button>
        <button className="flex-shrink-0 w-9 h-9 flex items-center justify-center text-gray-400 hover:text-[#C9956C] transition-colors">
          <Mic size={20} />
        </button>
        <div className="flex-1 bg-gray-100 rounded-lg px-3 py-2">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入消息..."
            disabled={disabled}
            className="w-full bg-transparent outline-none text-sm disabled:opacity-50"
          />
        </div>
        <button
          onClick={handleSend}
          disabled={disabled || !message.trim()}
          className="flex-shrink-0 w-9 h-9 flex items-center justify-center bg-gradient-to-r from-[#C9956C] to-[#B8845A] text-white rounded-full hover:opacity-90 transition-opacity disabled:opacity-40"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  )
}
