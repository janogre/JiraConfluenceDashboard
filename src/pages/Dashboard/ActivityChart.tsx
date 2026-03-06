import type { JiraIssue } from '../../types';
import styles from './Dashboard.module.css';

interface ActivityChartProps {
  issues: JiraIssue[];
}

function getDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function ActivityChart({ issues }: ActivityChartProps) {
  const days: string[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(getDayKey(d));
  }

  const createdMap: Record<string, number> = {};
  const resolvedMap: Record<string, number> = {};
  days.forEach((d) => {
    createdMap[d] = 0;
    resolvedMap[d] = 0;
  });

  issues.forEach((issue) => {
    const createdDay = issue.created.slice(0, 10);
    if (createdMap[createdDay] !== undefined) createdMap[createdDay]++;
    if (issue.resolutionDate) {
      const resolvedDay = issue.resolutionDate.slice(0, 10);
      if (resolvedMap[resolvedDay] !== undefined) resolvedMap[resolvedDay]++;
    }
  });

  const createdCounts = days.map((d) => createdMap[d]);
  const resolvedCounts = days.map((d) => resolvedMap[d]);
  const maxVal = Math.max(...createdCounts, ...resolvedCounts, 1);

  const chartWidth = 360;
  const chartHeight = 110;
  const padLeft = 28;
  const padBottom = 20;
  const w = chartWidth - padLeft;
  const h = chartHeight - padBottom;

  const toX = (i: number) => padLeft + (i / 29) * w;
  const toY = (count: number) => h - (count / maxVal) * h + 4;

  const toPolyline = (counts: number[]) =>
    counts.map((c, i) => `${toX(i)},${toY(c)}`).join(' ');

  const yTicks = [0, 1, 2, 3].map((t) => Math.round((maxVal / 3) * t));

  return (
    <div>
      <svg
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        className={styles.svgChart}
        aria-label="Aktivitet siste 30 dager"
      >
        {/* Y-axis guide lines */}
        {yTicks.map((val, i) => {
          const y = toY(val);
          return (
            <g key={i}>
              <line
                x1={padLeft}
                y1={y}
                x2={chartWidth}
                y2={y}
                stroke="var(--color-border)"
                strokeDasharray="3 3"
                strokeWidth={0.8}
              />
              <text
                x={padLeft - 4}
                y={y + 4}
                textAnchor="end"
                fontSize={8}
                fill="var(--color-text-muted)"
              >
                {val}
              </text>
            </g>
          );
        })}

        {/* X-axis labels (1st and 15th of each month) */}
        {days.map((day, i) => {
          const dom = parseInt(day.slice(8, 10), 10);
          if (dom !== 1 && dom !== 15) return null;
          const label = day.slice(5, 10).replace('-', '/');
          return (
            <text
              key={day}
              x={toX(i)}
              y={chartHeight - 4}
              textAnchor="middle"
              fontSize={8}
              fill="var(--color-text-muted)"
            >
              {label}
            </text>
          );
        })}

        {/* Resolved line */}
        <polyline
          points={toPolyline(resolvedCounts)}
          fill="none"
          stroke="var(--color-success)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Created line */}
        <polyline
          points={toPolyline(createdCounts)}
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>

      <div className={styles.chartLegend}>
        <span className={styles.legendItem}>
          <span className={styles.legendDot} style={{ background: 'var(--color-primary)' }} />
          Opprettet
        </span>
        <span className={styles.legendItem}>
          <span className={styles.legendDot} style={{ background: 'var(--color-success)' }} />
          Ferdigstilt
        </span>
      </div>
    </div>
  );
}
