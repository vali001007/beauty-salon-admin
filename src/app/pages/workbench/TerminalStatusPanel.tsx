import { Badge } from '@/app/components/ui/badge';

interface TerminalStatusPanelProps {
  status?: {
    totalDevices: number;
    onlineDevices: number;
  };
}

export function TerminalStatusPanel({ status }: TerminalStatusPanelProps) {
  if (!status || status.totalDevices <= 0) return null;

  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">门店运行状态</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Ami Aura Lite 终端运行状态以设备心跳为准，适合快速判断前台和服务终端是否正常。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">终端总数 {status.totalDevices}</Badge>
          <Badge variant={status.onlineDevices > 0 ? 'default' : 'destructive'}>在线 {status.onlineDevices}</Badge>
        </div>
      </div>
    </section>
  );
}
