import React from "react";
import type { AgentPersonaCode, AgentPersonaSummary } from "@ami/agent-core";

const personaIcons: Record<AgentPersonaCode, string> = {
  manager: "📊",
  marketing: "📣",
  reception: "🎪",
  beautician: "✨",
  inventory: "📦",
  finance: "💰",
};

export interface PersonaSwitcherProps {
  personas: AgentPersonaSummary[];
  activePersonaCode?: AgentPersonaCode | string | null;
  onChange?: (persona: AgentPersonaSummary) => void;
}

export function PersonaSwitcher({ personas, activePersonaCode, onChange }: PersonaSwitcherProps) {
  if (!personas.length) return null;

  return (
    <div className="flex gap-2 overflow-x-auto px-1 pb-1">
      {personas.map((persona) => {
        const active = persona.code === activePersonaCode;
        return (
          <button
            key={persona.code}
            type="button"
            onClick={() => onChange?.(persona)}
            className={[
              "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              active
                ? "border-[#2D1B69]/20 bg-[#2D1B69] text-white shadow-sm"
                : "border-black/10 bg-white text-[#1F1B2D] hover:border-[#2D1B69]/20 hover:bg-[#F7F5F2]",
            ].join(" ")}
          >
            <span>{personaIcons[persona.code]}</span>
            <span>{persona.name.replace(" Agent", "")}</span>
          </button>
        );
      })}
    </div>
  );
}
