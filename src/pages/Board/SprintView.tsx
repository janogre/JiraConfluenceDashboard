import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle } from 'lucide-react';
import { Badge, LoadingOverlay } from '../../components/common';
import { getSprints, getSprintIssues } from '../../services/jiraService';
import type { JiraIssue, JiraSprint } from '../../types';
import styles from './SprintView.module.css';

interface SprintViewProps {
  projectKey: string;
  jiraBaseUrl: string;
  onIssueClick: (issue: JiraIssue) => void;
}

const SPRINT_COLUMNS = [
  { id: 'new' as const, label: 'Å gjøre' },
  { id: 'indeterminate' as const, label: 'Pågår' },
  { id: 'done' as const, label: 'Ferdig' },
];

function BurndownChart({ issues, sprint }: { issues: JiraIssue[]; sprint: JiraSprint }) {
  if (!sprint.startDate || !sprint.endDate) return null;

  const startMs = new Date(sprint.startDate).getTime();
  const endMs = new Date(sprint.endDate).getTime();
  const nowMs = Math.min(Date.now(), endMs);
  const totalDays = Math.max(1, Math.ceil((endMs - startMs) / 86400000));
  const elapsedDays = Math.max(0, Math.ceil((nowMs - startMs) / 86400000));
  const totalIssues = issues.length;

  // Build actual burndown: remaining count per day
  const actualPoints: Array<{ day: number; val: number }> = [];
  for (let day = 0; day <= elapsedDays; day++) {
    const dayEndMs = startMs + (day + 1) * 86400000;
    const resolved = issues.filter(
      (i) => i.resolutionDate && new Date(i.resolutionDate).getTime() < dayEndMs
    ).length;
    actualPoints.push({ day, val: totalIssues - resolved });
  }

  const chartWidth = 460;
  const chartHeight = 130;
  const padLeft = 30;
  const padBottom = 22;
  const padRight = 12;
  const w = chartWidth - padLeft - padRight;
  const h = chartHeight - padBottom;
  const maxVal = Math.max(totalIssues, 1);

  const toX = (day: number) => padLeft + (day / totalDays) * w;
  const toY = (val: number) => Math.max(4, h - (val / maxVal) * (h - 4) + 4);

  const idealLine = `${toX(0)},${toY(totalIssues)} ${toX(totalDays)},${toY(0)}`;
  const actualLine = actualPoints.map((p) => `${toX(p.day)},${toY(p.val)}`).join(' ');

  const yTicks = [0, Math.round(maxVal / 2), maxVal];
  const todayX = toX(elapsedDays);

  const xLabels = [0, Math.round(totalDays / 4), Math.round(totalDays / 2), Math.round((3 * totalDays) / 4), totalDays];

  return (
    <svg
      viewBox={`0 0 ${chartWidth} ${chartHeight}`}
      className={styles.burndownChart}
      aria-label="Burndown-kurve"
    >
      {yTicks.map((val) => {
        const y = toY(val);
        return (
          <g key={val}>
            <line
              x1={padLeft} y1={y} x2={chartWidth - padRight} y2={y}
              stroke="var(--color-border)" strokeDasharray="3 3" strokeWidth={0.8}
            />
            <text x={padLeft - 4} y={y + 4} textAnchor="end" fontSize={8} fill="var(--color-text-muted)">
              {val}
            </text>
          </g>
        );
      })}

      {xLabels.map((day) => {
        const date = new Date(startMs + day * 86400000);
        return (
          <text key={day} x={toX(day)} y={chartHeight - 5} textAnchor="middle" fontSize={8} fill="var(--color-text-muted)">
            {date.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' })}
          </text>
        );
      })}

      {/* Today marker */}
      {elapsedDays < totalDays && (
        <>
          <line x1={todayX} y1={4} x2={todayX} y2={h} stroke="var(--color-primary)" strokeDasharray="4 3" strokeWidth={1} opacity={0.5} />
          <text x={todayX + 3} y={14} fontSize={8} fill="var(--color-primary)" opacity={0.7}>i dag</text>
        </>
      )}

      {/* Ideal line */}
      <polyline points={idealLine} fill="none" stroke="var(--color-text-muted)" strokeWidth={1.5} strokeDasharray="5 3" />

      {/* Actual line */}
      {actualPoints.length > 1 && (
        <polyline
          points={actualLine} fill="none"
          stroke="var(--color-primary)" strokeWidth={2.5}
          strokeLinejoin="round" strokeLinecap="round"
        />
      )}

      {/* Current dot */}
      {actualPoints.length > 0 && (
        <circle
          cx={toX(actualPoints[actualPoints.length - 1].day)}
          cy={toY(actualPoints[actualPoints.length - 1].val)}
          r={4} fill="var(--color-primary)"
        />
      )}
    </svg>
  );
}

function getPriorityVariant(name?: string) {
  switch (name?.toLowerCase()) {
    case 'highest': case 'high': return 'danger' as const;
    case 'medium': return 'warning' as const;
    default: return 'default' as const;
  }
}

export function SprintView({ projectKey, jiraBaseUrl, onIssueClick }: SprintViewProps) {
  const [userSelectedSprintId, setUserSelectedSprintId] = useState<number | null>(null);

  const { data: sprints, isLoading: loadingSprints, isError: errorSprints } = useQuery({
    queryKey: ['sprints', projectKey],
    queryFn: () => getSprints(projectKey),
    enabled: !!projectKey,
  });

  const activeSprint = sprints?.find((s) => s.state === 'active');
  const effectiveSprintId =
    userSelectedSprintId ??
    activeSprint?.id ??
    (sprints && sprints.length > 0 ? sprints[sprints.length - 1].id : null);

  const { data: issues, isLoading: loadingIssues } = useQuery({
    queryKey: ['sprintIssues', effectiveSprintId],
    queryFn: () => getSprintIssues(effectiveSprintId!),
    enabled: !!effectiveSprintId,
  });

  if (loadingSprints) return <LoadingOverlay message="Laster sprinter…" />;

  if (errorSprints) {
    return (
      <div className={styles.errorState}>
        <AlertCircle size={18} />
        <span>Kunne ikke laste sprinter — prosjektet bruker kanskje ikke Scrum-board.</span>
      </div>
    );
  }

  if (!sprints || sprints.length === 0) {
    return (
      <div className={styles.emptyState}>
        <p>Ingen sprinter funnet for dette prosjektet.</p>
      </div>
    );
  }

  const selectedSprint = sprints.find((s) => s.id === effectiveSprintId) ?? sprints[0];
  const sprintIssues = issues ?? [];

  const totalCount = sprintIssues.length;
  const doneCount = sprintIssues.filter((i) => i.status.category === 'done').length;
  const inProgressCount = sprintIssues.filter((i) => i.status.category === 'indeterminate').length;
  const todoCount = sprintIssues.filter((i) => i.status.category === 'new').length;
  const donePct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  const daysLeft =
    selectedSprint?.endDate && selectedSprint.state === 'active'
      ? Math.max(0, Math.ceil((new Date(selectedSprint.endDate).getTime() - Date.now()) / 86400000))
      : null;

  const statusBadgeVariant = (cat: 'new' | 'indeterminate' | 'done') => {
    if (cat === 'done') return 'success' as const;
    if (cat === 'indeterminate') return 'primary' as const;
    return 'default' as const;
  };

  return (
    <div className={styles.wrapper}>
      {/* Sprint selector */}
      <div className={styles.sprintSelector}>
        <select
          className={styles.sprintSelect}
          value={effectiveSprintId ?? ''}
          onChange={(e) => setUserSelectedSprintId(Number(e.target.value))}
        >
          {sprints.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.state === 'active' ? ' (aktiv)' : s.state === 'future' ? ' (fremtidig)' : ' (avsluttet)'}
            </option>
          ))}
        </select>
      </div>

      {loadingIssues ? (
        <LoadingOverlay message="Laster sprint-saker…" />
      ) : (
        <>
          {/* Sprint metadata + burndown */}
          <div className={styles.sprintHeader}>
            <div className={styles.sprintMeta}>
              <div className={styles.sprintInfo}>
                <h3 className={styles.sprintName}>{selectedSprint.name}</h3>
                {selectedSprint.goal && (
                  <p className={styles.sprintGoal}>"{selectedSprint.goal}"</p>
                )}
                <div className={styles.sprintDates}>
                  {selectedSprint.startDate && (
                    <span>
                      {new Date(selectedSprint.startDate).toLocaleDateString('nb-NO', {
                        day: 'numeric', month: 'short',
                      })}
                    </span>
                  )}
                  {selectedSprint.startDate && selectedSprint.endDate && <span>→</span>}
                  {selectedSprint.endDate && (
                    <span>
                      {new Date(selectedSprint.endDate).toLocaleDateString('nb-NO', {
                        day: 'numeric', month: 'short',
                      })}
                    </span>
                  )}
                  {daysLeft !== null && (
                    <span className={styles.daysLeft}>
                      {daysLeft} dag{daysLeft !== 1 ? 'er' : ''} igjen
                    </span>
                  )}
                </div>
                <div className={styles.sprintStats}>
                  <span className={styles.statItem}>
                    <span className={styles.statCount}>{totalCount}</span> totalt
                  </span>
                  <span className={styles.statItem}>
                    <span className={styles.statCountTodo}>{todoCount}</span> å gjøre
                  </span>
                  <span className={styles.statItem}>
                    <span className={styles.statCountActive}>{inProgressCount}</span> pågår
                  </span>
                  <span className={styles.statItem}>
                    <span className={styles.statCountDone}>{doneCount}</span> ferdig
                  </span>
                  <span className={styles.donePct}>{donePct}%</span>
                </div>
              </div>

              <BurndownChart issues={sprintIssues} sprint={selectedSprint} />
            </div>
          </div>

          {/* Kanban columns */}
          <div className={styles.columns}>
            {SPRINT_COLUMNS.map((col) => {
              const colIssues = sprintIssues.filter((i) => i.status.category === col.id);
              return (
                <div key={col.id} className={styles.column}>
                  <div className={styles.columnHeader}>
                    <h4 className={styles.columnTitle}>{col.label}</h4>
                    <span className={styles.columnCount}>{colIssues.length}</span>
                  </div>
                  <div className={styles.columnContent}>
                    {colIssues.length === 0 && (
                      <p className={styles.emptyColumn}>Ingen saker</p>
                    )}
                    {colIssues.map((issue) => (
                      <div
                        key={issue.key}
                        className={styles.issueCard}
                        onClick={() => onIssueClick(issue)}
                      >
                        <div className={styles.cardTop}>
                          <div className={styles.cardId}>
                            {issue.issueType.iconUrl && (
                              <img
                                src={issue.issueType.iconUrl}
                                alt={issue.issueType.name}
                                className={styles.typeIcon}
                              />
                            )}
                            <a
                              href={`${jiraBaseUrl}/browse/${issue.key}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={styles.issueKey}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {issue.key}
                            </a>
                          </div>
                          {issue.assignee && (
                            issue.assignee.avatarUrl ? (
                              <img
                                src={issue.assignee.avatarUrl}
                                alt={issue.assignee.displayName}
                                className={styles.avatar}
                                title={issue.assignee.displayName}
                              />
                            ) : (
                              <div className={styles.avatarInitial} title={issue.assignee.displayName}>
                                {issue.assignee.displayName.charAt(0)}
                              </div>
                            )
                          )}
                        </div>
                        <p className={styles.cardSummary}>{issue.summary}</p>
                        <div className={styles.cardFooter}>
                          {issue.priority && (
                            <Badge variant={getPriorityVariant(issue.priority.name)} size="sm">
                              {issue.priority.name}
                            </Badge>
                          )}
                          <Badge variant={statusBadgeVariant(issue.status.category)} size="sm">
                            {issue.status.name}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
