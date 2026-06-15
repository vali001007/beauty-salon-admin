import { describe, expect, it } from 'vitest';
import { filterWorkbenchItems } from './filterWorkbenchItems';

describe('filterWorkbenchItems', () => {
  const items = [
    { key: 'dashboard' },
    { key: 'customers', permission: 'core:customer:view' },
    { key: 'stock', permission: 'core:inventory:stock' },
  ];

  it('keeps items without permission and matching permitted items', () => {
    expect(filterWorkbenchItems(items, ['core:customer:view'])).toEqual([
      { key: 'dashboard' },
      { key: 'customers', permission: 'core:customer:view' },
    ]);
  });

  it('keeps all permitted items for wildcard permission', () => {
    expect(filterWorkbenchItems(items, ['*'])).toEqual(items);
  });

  it('removes denied permissions even when wildcard is present', () => {
    expect(filterWorkbenchItems(items, ['*'], ['core:inventory:stock'])).toEqual([
      { key: 'dashboard' },
      { key: 'customers', permission: 'core:customer:view' },
    ]);
  });

  it('removes all permission gated items when wildcard is denied', () => {
    expect(filterWorkbenchItems(items, ['*'], ['*'])).toEqual([{ key: 'dashboard' }]);
  });
});
