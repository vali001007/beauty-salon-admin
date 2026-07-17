import { useState, useRef, useEffect } from 'react'
import type { ComponentProps } from 'react'
import { Menu, LogOut } from 'lucide-react'
import { toast } from 'sonner'
import { ChatMessage } from './ChatMessage'
import { QuickActions } from './QuickActions'
import { ChatInput } from './ChatInput'
import { sendMessage, type Message, type Role, type BusinessResult } from '../../api/claude'

const ROLE_LABELS: Record<Role, string> = {
  receptionist: '前台/收银员',
  manager: '店长',
  beautician: '美容师',
}

const ROLE_ACTIONS: Record<Role, { icon: string; label: string; action: string }[]> = {
  receptionist: [
    { icon: '💳', label: '核销', action: '帮客户核销次卡' },
    { icon: '📅', label: '预约', action: '查询今日预约' },
    { icon: '🛒', label: '收银', action: '开单收银' },
    { icon: '💎', label: '开卡', action: '办理会员卡' },
    { icon: '👤', label: '查客户', action: '查询客户信息' },
    { icon: '📋', label: '今日订单', action: '查看今日订单' },
  ],
  manager: [
    { icon: '📊', label: '今日报表', action: '查看今日经营报表' },
    { icon: '💰', label: '营业额', action: '查询今日营业额' },
    { icon: '📅', label: '今日预约', action: '查询今日预约情况' },
    { icon: '📢', label: '营销活动', action: '查看当前营销活动' },
    { icon: '📦', label: '库存预警', action: '查看库存预警信息' },
    { icon: '📈', label: '业绩排名', action: '查看美容师业绩排名' },
  ],
  beautician: [
    { icon: '📅', label: '我的排班', action: '查看我本周的排班' },
    { icon: '📋', label: '我的预约', action: '查看我今天的预约' },
    { icon: '✅', label: '确认到店', action: '确认客户到店' },
    { icon: '👤', label: '客户档案', action: '查看客户档案' },
    { icon: '🧴', label: '项目BOM', action: '查看项目物料清单' },
  ],
}

interface ChatInterfaceProps {
  user: { name: string; role: Role }
  onLogout: () => void
}

interface UIMessage {
  id: number
  type: 'ai' | 'user' | 'system'
  content: string
  businessResult?: BusinessResult | null
  blocks?: ComponentProps<typeof ChatMessage>['blocks']
}

export function ChatInterface({ user, onLogout }: ChatInterfaceProps) {
  const today = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })
  const [uiMessages, setUiMessages] = useState<UIMessage[]>([
    { id: 1, type: 'system', content: `今天是 ${today}，欢迎回来 ${user.name} 👋` },
    { id: 2, type: 'ai', content: `您好！我是您的门店助手。作为${ROLE_LABELS[user.role]}，我可以帮您处理日常工作。请问需要什么帮助？` },
  ])
  const [history, setHistory] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [uiMessages])

  const handleSend = async (text: string) => {
    if (loading) return

    const userMsg: UIMessage = { id: Date.now(), type: 'user', content: text }
    const aiMsgId = Date.now() + 1
    const aiMsg: UIMessage = { id: aiMsgId, type: 'ai', content: '' }

    setUiMessages((prev) => [...prev, userMsg, aiMsg])
    setLoading(true)

    try {
      const newEntries = await sendMessage(
        user.role,
        history,
        text,
        (chunk) => {
          setUiMessages((prev) =>
            prev.map((m) => (m.id === aiMsgId ? { ...m, content: chunk } : m))
          )
        },
        (toolName) => {
          setUiMessages((prev) =>
            prev.map((m) =>
              m.id === aiMsgId && !m.content
                ? { ...m, content: `正在查询 ${toolName}...` }
                : m
            )
          )
        },
        (businessResult) => {
          setUiMessages((prev) =>
            prev.map((m) => (m.id === aiMsgId ? { ...m, businessResult } : m))
          )
        },
      )

      setHistory((prev) => [...prev, ...newEntries])
    } catch (err) {
      const msg = err instanceof Error ? err.message : '请求失败'
      toast.error(msg)
      setUiMessages((prev) => prev.filter((m) => m.id !== aiMsgId))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50 max-w-md mx-auto">
      {/* 顶部栏 */}
      <div className="flex-shrink-0 h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4">
        <button className="p-2 -ml-2 text-gray-500 hover:text-gray-800">
          <Menu size={20} />
        </button>
        <div className="text-center">
          <div className="text-sm font-medium text-gray-900">美业智能助手</div>
          <div className="text-xs text-gray-400">{user.name} · {ROLE_LABELS[user.role]}</div>
        </div>
        <button onClick={onLogout} className="p-2 -mr-2 text-gray-400 hover:text-gray-700">
          <LogOut size={18} />
        </button>
      </div>

      {/* 消息区域 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {uiMessages.map((msg) => (
          <ChatMessage key={msg.id} type={msg.type} content={msg.content} businessResult={msg.businessResult} blocks={msg.blocks} />
        ))}
        {loading && uiMessages[uiMessages.length - 1]?.content === '' && (
          <div className="flex gap-2 items-center pl-10">
            <span className="text-xs text-gray-400 animate-pulse">正在思考...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 快捷操作 */}
      <div className="flex-shrink-0 bg-white border-t border-gray-200 px-4 py-3">
        <QuickActions
          actions={ROLE_ACTIONS[user.role]}
          onActionClick={handleSend}
          disabled={loading}
        />
      </div>

      {/* 输入框 */}
      <ChatInput onSend={handleSend} disabled={loading} />
    </div>
  )
}
