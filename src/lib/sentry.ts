export function initSentry() {
  if (!import.meta.env.VITE_SENTRY_DSN) {
    return;
  }

  void Function('specifier', 'return import(specifier)')('@sentry/react')
    .then((Sentry: { init: (options: Record<string, unknown>) => void }) => {
      Sentry.init({
      dsn: import.meta.env.VITE_SENTRY_DSN,
      environment: import.meta.env.MODE,
      tracesSampleRate: import.meta.env.MODE === 'production' ? 0.1 : 1.0,
      replaysSessionSampleRate: 0.1,
      replaysOnErrorSampleRate: 1.0,
    });
    })
    .catch(() => {
      // Sentry is optional in this project; production can install @sentry/react to enable it.
    });
}
