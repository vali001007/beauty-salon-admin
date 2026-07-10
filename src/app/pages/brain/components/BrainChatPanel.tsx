import { useState } from 'react';
import { sendBrainMessage } from '@/api/brain';

export function BrainChatPanel({ conversationId }: { conversationId: number | null }) {
  const [message, setMessage] = useState('');
  const [answer, setAnswer] = useState('');

  async function submit() {
    if (!conversationId || !message.trim()) return;
    const response = await sendBrainMessage(conversationId, { message, timezone: 'Asia/Shanghai' });
    setAnswer(response.answer);
    setMessage('');
  }

  return (
    <main className="flex min-w-0 flex-1 flex-col">
      <div className="flex-1 overflow-auto p-6">
        {answer ? <div className="rounded-md border border-border p-4 text-sm leading-6">{answer}</div> : null}
      </div>
      <div className="border-t border-border p-4">
        <textarea
          className="min-h-24 w-full rounded-md border border-input bg-background p-3 text-sm"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="问经营数据、风险和下一步动作"
        />
        <div className="mt-3 flex justify-end">
          <button className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground" onClick={submit}>
            发送
          </button>
        </div>
      </div>
    </main>
  );
}
