import React from 'react';

interface FollowUpChipsProps {
  suggestions: string[];
  onSelect: (suggestion: string) => void;
  visible?: boolean;
}

/**
 * 回复完成后展示的关联问题推荐 chips，最多 3 个。
 * 流式输出结束后才显示（由父组件通过 visible 控制）。
 * 三个方向：深入（更细节）/ 扩展（相关维度）/ 行动（基于结论能做什么）。
 */
export function FollowUpChips({ suggestions, onSelect, visible = true }: FollowUpChipsProps) {
  if (!visible || suggestions.length === 0) return null;

  const displaySuggestions = suggestions.slice(0, 3);

  return (
    <div className="mt-3 flex flex-wrap gap-2 animate-in fade-in duration-300">
      {displaySuggestions.map((suggestion, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onSelect(suggestion)}
          className="rounded-full border border-border bg-background px-3 py-1 text-xs text-foreground transition-colors hover:bg-muted hover:border-foreground/20 active:scale-95"
        >
          {suggestion}
        </button>
      ))}
    </div>
  );
}
