import { ReactNode } from 'react'

interface ChatMessageProps {
  type: 'ai' | 'user' | 'system'
  content?: string
  children?: ReactNode
}

export function ChatMessage({ type, content, children }: ChatMessageProps) {
  if (type === 'system') {
    return (
      <div className="flex justify-center py-2">
        <span className="text-xs text-gray-400">{content}</span>
      </div>
    )
  }

  if (type === 'ai') {
    return (
      <div className="flex gap-2 items-start">
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-[#C9956C] to-[#2D1B69] flex items-center justify-center text-white text-xs font-medium">
          AI
        </div>
        <div className="flex-1 max-w-[80%]">
          <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-none p-3 shadow-sm">
            {content && <p className="text-sm text-gray-800 whitespace-pre-wrap">{content}</p>}
            {children}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-2 items-start justify-end">
      <div className="flex-1 max-w-[80%] flex justify-end">
        <div className="bg-gradient-to-r from-[#C9956C] to-[#B8845A] rounded-2xl rounded-tr-none p-3 shadow-sm">
          {content && <p className="text-sm text-white whitespace-pre-wrap">{content}</p>}
          {children}
        </div>
      </div>
    </div>
  )
}
