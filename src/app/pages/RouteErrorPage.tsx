import { AlertTriangle, ArrowLeft, LayoutDashboard, RefreshCw } from 'lucide-react';
import { isRouteErrorResponse, useNavigate, useRouteError } from 'react-router';
import { Button } from '../components/UI';

function getErrorMessage(error: unknown) {
  if (isRouteErrorResponse(error)) return error.statusText || String(error.status);
  if (error instanceof Error) return error.message;
  return String(error || '');
}

function isDynamicImportError(message: string) {
  return (
    message.includes('Failed to fetch dynamically imported module') ||
    message.includes('Importing a module script failed') ||
    message.includes('error loading dynamically imported module')
  );
}

export function RouteErrorPage() {
  const error = useRouteError();
  const navigate = useNavigate();
  const isRouteError = isRouteErrorResponse(error);
  const status = isRouteError ? error.status : 500;
  const errorMessage = getErrorMessage(error);
  const moduleLoadFailed = isDynamicImportError(errorMessage);

  const title =
    status === 404
      ? '页面暂时找不到'
      : moduleLoadFailed
        ? '页面资源加载失败'
        : '页面加载遇到问题';
  const description =
    status === 404
      ? '当前地址可能不是这个应用的入口，或页面路径已经调整。Ami Aura Lite 主线终端包 packages/Ami Aura Lite Kiosk Prototype 启动后请访问 127.0.0.1:5175。'
      : moduleLoadFailed
        ? '通常是开发服务重启、端口访问错位或浏览器缓存了旧模块地址。Ami Aura Lite 主线终端包 packages/Ami Aura Lite Kiosk Prototype 启动后请访问 127.0.0.1:5175；当前页面可先刷新重试。'
        : '当前页面没有正常加载。建议返回上一页，或回到工作台重新进入对应功能。';

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10 text-foreground">
      <div className="w-full max-w-xl rounded-xl border border-border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
          <AlertTriangle className="h-7 w-7" />
        </div>
        <div className="mb-2 text-sm font-medium text-muted-foreground">{status} / Ami_Core</div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">{description}</p>
        {import.meta.env.DEV && errorMessage ? (
          <pre className="mt-5 max-h-36 overflow-auto rounded-lg bg-muted/50 p-3 text-left text-xs text-muted-foreground">
            {errorMessage}
          </pre>
        ) : null}
        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          <Button variant="outline" className="gap-2" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
            返回上一页
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => window.location.reload()}>
            <RefreshCw className="h-4 w-4" />
            刷新页面
          </Button>
          <Button className="gap-2" onClick={() => navigate('/dashboard', { replace: true })}>
            <LayoutDashboard className="h-4 w-4" />
            回到工作台
          </Button>
        </div>
      </div>
    </div>
  );
}
