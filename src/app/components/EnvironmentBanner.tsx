import { Database } from 'lucide-react';

export type AmiDataEnvironment = 'local-synthetic' | 'supabase-development' | 'candidate-signoff';

export function resolveEnvironmentBanner(env: Record<string, string | boolean | undefined>) {
  const dataEnvironment = String(env.VITE_AMI_DATA_ENV ?? '').trim() as AmiDataEnvironment;
  const labels: Record<AmiDataEnvironment, { title: string; tone: string }> = {
    'local-synthetic': { title: '本地合成数据', tone: 'border-amber-200 bg-amber-50 text-amber-800' },
    'supabase-development': { title: 'Supabase 开发数据', tone: 'border-sky-200 bg-sky-50 text-sky-800' },
    'candidate-signoff': { title: '候选签收环境', tone: 'border-violet-200 bg-violet-50 text-violet-800' },
  };
  const selected = labels[dataEnvironment];
  if (!selected) return null;
  return {
    ...selected,
    dataEnvironment,
    slotId: String(env.VITE_AMI_DEV_SLOT ?? '').trim() || null,
    runtimeMode: String(env.VITE_AMI_RUNTIME_MODE ?? '').trim() || null,
    apiTarget: String(env.VITE_API_PROXY_TARGET ?? '').trim() || null,
  };
}

export function EnvironmentBanner() {
  const banner = resolveEnvironmentBanner(import.meta.env as Record<string, string | boolean | undefined>);
  if (!banner) return null;
  const details = [banner.slotId ? `Slot ${banner.slotId}` : null, banner.runtimeMode, banner.apiTarget].filter(Boolean);
  return (
    <div className={`flex shrink-0 items-center justify-between gap-3 border-b px-3 py-1.5 text-xs ${banner.tone}`} data-testid="environment-banner">
      <span className="flex items-center gap-1.5 font-semibold"><Database className="h-3.5 w-3.5" />{banner.title}</span>
      {details.length ? <span className="truncate opacity-80">{details.join(' · ')}</span> : null}
    </div>
  );
}
