import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/app/components/ui/button';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

function isDynamicImportError(error: Error | null) {
  const message = error?.message ?? '';
  return (
    message.includes('Failed to fetch dynamically imported module') ||
    message.includes('Importing a module script failed') ||
    message.includes('error loading dynamically imported module')
  );
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo);
  }

  handleReset = () => {
    if (isDynamicImportError(this.state.error)) {
      window.location.reload();
      return;
    }
    this.setState({ hasError: false, error: null });
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const isDev = import.meta.env.DEV;
      const dynamicImportFailed = isDynamicImportError(this.state.error);

      return (
        <div className="flex min-h-screen items-center justify-center bg-background p-6">
          <div className="flex max-w-md flex-col items-center text-center">
            <div className="mb-6 flex size-16 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="size-8 text-destructive" />
            </div>
            <h1 className="mb-2 text-2xl font-semibold text-foreground">
              {dynamicImportFailed ? '页面资源加载失败' : '页面加载异常'}
            </h1>
            <p className="mb-6 text-sm leading-6 text-muted-foreground">
              {dynamicImportFailed
                ? '开发服务重启或缓存旧模块时会出现这个问题，请刷新页面重新加载最新资源。'
                : this.state.error?.message || '发生了意外错误，请稍后重试。'}
            </p>
            {isDev && this.state.error?.stack && (
              <pre className="mb-6 max-h-48 w-full overflow-auto rounded-lg bg-muted/50 p-4 text-left text-xs text-muted-foreground">
                {this.state.error.stack}
              </pre>
            )}
            <div className="flex gap-3">
              <Button variant="outline" className="gap-2" onClick={this.handleReset}>
                {dynamicImportFailed ? <RefreshCw className="h-4 w-4" /> : null}
                {dynamicImportFailed ? '刷新页面' : '重试'}
              </Button>
              <Button onClick={this.handleGoHome}>返回首页</Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export { ErrorBoundary };
