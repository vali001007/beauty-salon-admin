export const ATTRIBUTABLE_TOUCH_STATUSES = ['sent', 'delivered', 'opened', 'clicked', 'converted'] as const;

export const ATTRIBUTABLE_TOUCH_STATUS_SET: ReadonlySet<string> = new Set(ATTRIBUTABLE_TOUCH_STATUSES);
