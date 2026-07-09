import React, { useState } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import type { AgentFeedbackContext } from "@ami/agent-core";

export interface AgentFeedbackProps {
  runId?: number | null;
  feedbackContext?: AgentFeedbackContext;
  onFeedback?: (runId: number, adopted: boolean, context?: AgentFeedbackContext) => Promise<void> | void;
}

export function AgentFeedback({ runId, feedbackContext, onFeedback }: AgentFeedbackProps) {
  const [selected, setSelected] = useState<"up" | "down" | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!runId || !onFeedback) return null;

  const submit = async (adopted: boolean) => {
    if (submitting || selected) return;
    setSubmitting(true);
    try {
      await onFeedback(runId, adopted, feedbackContext);
      setSelected(adopted ? "up" : "down");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex items-center gap-2 px-1 text-xs text-[#6F6678]">
      <button
        type="button"
        onClick={() => void submit(true)}
        disabled={submitting || Boolean(selected)}
        className={[
          "inline-flex items-center gap-1 rounded-full px-2 py-1 transition-colors",
          selected === "up" ? "bg-emerald-50 text-emerald-700" : "hover:bg-[#F7F5F2] hover:text-[#1F1B2D]",
          submitting || selected ? "cursor-default" : "",
        ].join(" ")}
      >
        <ThumbsUp className="h-3.5 w-3.5" />
        有用
      </button>
      <button
        type="button"
        onClick={() => void submit(false)}
        disabled={submitting || Boolean(selected)}
        className={[
          "inline-flex items-center gap-1 rounded-full px-2 py-1 transition-colors",
          selected === "down" ? "bg-rose-50 text-rose-600" : "hover:bg-[#F7F5F2] hover:text-[#1F1B2D]",
          submitting || selected ? "cursor-default" : "",
        ].join(" ")}
      >
        <ThumbsDown className="h-3.5 w-3.5" />
        无用
      </button>
      {selected ? <span className="text-[#9A8F85]">已记录</span> : null}
    </div>
  );
}
