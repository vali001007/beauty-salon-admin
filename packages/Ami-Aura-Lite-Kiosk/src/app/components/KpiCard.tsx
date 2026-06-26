import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface KpiCardProps {
  label: string;
  value: string;
  delta?: string;
  deltaType?: 'up' | 'down' | 'neutral';
  unit?: string;
  hint?: string;
}

export function KpiCard({ label, value, delta, deltaType, unit, hint }: KpiCardProps) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-card px-4 py-3">
      <div className="truncate text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-end gap-1">
        <span className="truncate text-2xl font-semibold leading-tight text-foreground">
          {value}
        </span>
        {unit && <span className="mb-0.5 text-xs text-muted-foreground">{unit}</span>}
      </div>
      {delta && (
        <div className="mt-1 flex items-center gap-0.5">
          <DeltaIcon type={deltaType} />
          <span
            className={[
              'text-xs font-medium',
              deltaType === 'up' ? 'text-emerald-600' : '',
              deltaType === 'down' ? 'text-rose-500' : '',
              deltaType === 'neutral' || !deltaType ? 'text-muted-foreground' : '',
            ].join(' ')}
          >
            {delta}
          </span>
        </div>
      )}
      {hint && <div className="mt-1 truncate text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

function DeltaIcon({ type }: { type?: 'up' | 'down' | 'neutral' }) {
  if (type === 'up') return <TrendingUp className="h-3 w-3 text-emerald-600" />;
  if (type === 'down') return <TrendingDown className="h-3 w-3 text-rose-500" />;
  return <Minus className="h-3 w-3 text-muted-foreground" />;
}

interface KpiCardGroupProps {
  cards: KpiCardProps[];
  cols?: 2 | 3 | 4;
}

export function KpiCardGroup({ cards, cols = 2 }: KpiCardGroupProps) {
  const gridClass = {
    2: 'grid-cols-2',
    3: 'grid-cols-3',
    4: 'grid-cols-2 sm:grid-cols-4',
  }[cols];

  return (
    <div className={`grid gap-2 ${gridClass}`}>
      {cards.map((card, i) => (
        <KpiCard key={i} {...card} />
      ))}
    </div>
  );
}
