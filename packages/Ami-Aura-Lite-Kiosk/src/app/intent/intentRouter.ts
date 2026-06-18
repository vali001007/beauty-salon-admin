import { parseAiIntentFallback } from "./aiIntentParser";
import type { AuraResolvedIntent, ResolveIntentOptions } from "./intentTypes";
import { isBusinessRelevant } from "./relevanceGuard";
import { parseRuleIntent } from "./ruleIntentParser";

export async function resolveCommandIntent(options: ResolveIntentOptions): Promise<AuraResolvedIntent> {
  const source = options.source ?? ((options.definition.availableActions as string[]).includes(options.command) ? "quick_action" : "text");
  const ruleResult = parseRuleIntent(options.command, options.role, options.definition, source);

  if (ruleResult.name !== "unknown.clarify" || ruleResult.deniedReason) {
    return ruleResult;
  }

  if (!isBusinessRelevant(options.command)) {
    return ruleResult;
  }

  return parseAiIntentFallback({
    command: options.command,
    role: options.role,
    definition: options.definition,
    source,
  });
}

export function shouldDisplayUserCommand(intent: AuraResolvedIntent) {
  return intent.showUserCommand && !intent.action?.startsWith("appointment:");
}
