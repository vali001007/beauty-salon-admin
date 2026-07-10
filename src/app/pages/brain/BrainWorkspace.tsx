import { useState } from 'react';
import { BrainChatPanel } from './components/BrainChatPanel';
import { BrainEvidencePanel } from './components/BrainEvidencePanel';

export function BrainWorkspace() {
  const [conversationId, setConversationId] = useState<number | null>(null);

  return (
    <div className="flex h-full min-h-0 bg-background">
      <div className="w-72 border-r border-border p-4">
        <h1 className="text-lg font-semibold">Ami Brain</h1>
        <p className="mt-1 text-sm text-muted-foreground">门店经营智能体</p>
        <button
          className="mt-4 w-full rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"
          onClick={() => setConversationId(Date.now())}
        >
          新建会话
        </button>
      </div>
      <BrainChatPanel conversationId={conversationId} />
      <BrainEvidencePanel />
    </div>
  );
}
