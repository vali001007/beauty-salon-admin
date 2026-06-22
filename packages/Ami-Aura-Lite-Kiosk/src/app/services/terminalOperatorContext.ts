import type { AuraRole } from "@/types/aura";
import type { TerminalBootstrapParams } from "@/types/terminal";

let activeBootstrapParams: TerminalBootstrapParams | undefined;

export function setActiveTerminalOperatorContext(operatorId?: number | null, role?: AuraRole | null) {
  activeBootstrapParams = operatorId ? { operatorId, ...(role ? { role } : {}) } : undefined;
}

export function resolveTerminalBootstrapParams(params?: TerminalBootstrapParams) {
  return params ?? activeBootstrapParams;
}

export function getActiveTerminalOperatorParams() {
  const operatorId = resolveTerminalBootstrapParams()?.operatorId;
  return operatorId ? { operatorId } : undefined;
}
