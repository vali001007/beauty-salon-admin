import { lazy } from 'react';

const RETRY_KEY_PREFIX = 'ami_lazy_retry:';

function isDynamicImportError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('Failed to fetch dynamically imported module') ||
    message.includes('Importing a module script failed') ||
    message.includes('error loading dynamically imported module')
  );
}

export function lazyWithRetry<T extends React.ComponentType<any>>(
  importer: () => Promise<{ default: T }>,
  moduleName: string,
) {
  return lazy(async () => {
    const retryStorage = typeof window !== 'undefined' ? window.sessionStorage : undefined;
    try {
      const mod = await importer();
      retryStorage?.removeItem(`${RETRY_KEY_PREFIX}${moduleName}`);
      return mod;
    } catch (error) {
      if (isDynamicImportError(error)) {
        const retryKey = `${RETRY_KEY_PREFIX}${moduleName}`;
        if (retryStorage?.getItem(retryKey) !== '1') {
          retryStorage?.setItem(retryKey, '1');
          window.location.reload();
          return new Promise<never>(() => undefined);
        }
      }
      throw error;
    }
  });
}
