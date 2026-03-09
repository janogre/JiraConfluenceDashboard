import { useState } from 'react';
import { X } from 'lucide-react';
import { Badge } from '../../components/common';
import type { JiraIssue } from '../../types';
import styles from './ProjectPulse.module.css';

interface ProjectPulseProps {
  issues: JiraIssue[];
  jiraBaseUrl: string;
}

interface EpicBubble {
  epic: JiraIssue;
  children: JiraIssue[];
  backlogCount: number;
  inProgressCount: number;
  doneCount: number;
  totalCount: number;
  donePct: number;
  health: 'green' | 'orange' | 'gray';
  isStalled: boolean;
  bubbleSize: number;
}

const EPIC_TYPE_NAMES = new Set(['epic', 'oppgavesamling']);
const MIN_SIZE = 80;
const MAX_SIZE = 180;

function buildEpicBubbles(issues: JiraIssue[]): { bubbles: EpicBubble[]; orphans: JiraIssue[] } {
  const referencedAsParent = new Set(
    issues.map((i) => i.parent?.key).filter((k): k is string => !!k)
  );

  const isEpicIssue = (i: JiraIssue) =>
    referencedAsParent.has(i.key) || EPIC_TYPE_NAMES.has(i.issueType.name.toLowerCase());

  const epics = issues.filter(isEpicIssue);
  const epicKeys = new Set(epics.map((e) => e.key));

  const childrenByEpic = new Map<string, JiraIssue[]>();
  const orphans: JiraIssue[] = [];

  issues.forEach((issue) => {
    if (isEpicIssue(issue)) return;
    const parentKey = issue.parent?.key;
    if (parentKey && epicKeys.has(parentKey)) {
      const arr = childrenByEpic.get(parentKey) ?? [];
      arr.push(issue);
      childrenByEpic.set(parentKey, arr);
    } else if (!parentKey) {
      orphans.push(issue);
    }
  });

  const allCounts = epics.map((epic) => (childrenByEpic.get(epic.key) ?? []).length);
  const maxCount = Math.max(...allCounts, 1);

  const bubbles: EpicBubble[] = epics.map((epic) => {
    const children = childrenByEpic.get(epic.key) ?? [];
    const totalCount = children.length;
    const backlogCount = children.filter((c) => c.status.category === 'new').length;
    const inProgressCount = children.filter((c) => c.status.category === 'indeterminate').length;
    const doneCount = children.filter((c) => c.status.category === 'done').length;
    const donePct = totalCount > 0 ? (doneCount / totalCount) * 100 : 0;

    const inProgressChildren = children.filter((c) => c.status.category === 'indeterminate');
    const isStalled =
      inProgressChildren.length > 0 &&
      inProgressChildren.every(
        (c) => Date.now() - new Date(c.updated).getTime() > 7 * 86400000
      );

    const health: 'green' | 'orange' | 'gray' =
      donePct >= 60 ? 'green' : isStalled ? 'orange' : 'gray';

    const bubbleSize = MIN_SIZE + (totalCount / maxCount) * (MAX_SIZE - MIN_SIZE);

    return {
      epic,
      children,
      backlogCount,
      inProgressCount,
      doneCount,
      totalCount,
      donePct,
      health,
      isStalled,
      bubbleSize,
    };
  });

  // Sort: active epics first, then backlog-heavy, then done
  bubbles.sort((a, b) => {
    if (a.inProgressCount > 0 && b.inProgressCount === 0) return -1;
    if (b.inProgressCount > 0 && a.inProgressCount === 0) return 1;
    if (b.backlogCount !== a.backlogCount) return b.backlogCount - a.backlogCount;
    return b.donePct - a.donePct;
  });

  return { bubbles, orphans };
}

function BubbleSvg({ size, donePct, health }: { size: number; donePct: number; health: string }) {
  const r = size / 2 - 10;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const arcLength = circumference * (donePct / 100);

  const strokeColor =
    health === 'green'
      ? 'var(--color-success, #22c55e)'
      : health === 'orange'
      ? 'var(--color-warning, #f59e0b)'
      : 'var(--color-text-muted, #94a3b8)';

  const pctFontSize = Math.max(10, size * 0.17);
  const countFontSize = Math.max(8, size * 0.12);

  return (
    <svg width={size} height={size} style={{ display: 'block' }}>
      {/* Track ring */}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke="var(--color-border)"
        strokeWidth={4}
      />
      {/* Progress arc */}
      {donePct > 0 && (
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={strokeColor}
          strokeWidth={5}
          strokeDasharray={`${arcLength} ${circumference - arcLength}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ transition: 'stroke-dasharray 0.4s ease' }}
        />
      )}
      {/* Percentage text */}
      <text
        x={cx}
        y={cy - countFontSize * 0.3}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={pctFontSize}
        fontWeight="700"
        fill="var(--color-text-primary)"
      >
        {Math.round(donePct)}%
      </text>
    </svg>
  );
}

function SegBar({
  backlog,
  inProgress,
  done,
  total,
}: {
  backlog: number;
  inProgress: number;
  done: number;
  total: number;
}) {
  if (total === 0) return null;
  return (
    <div className={styles.segBar} title={`${backlog} backlog · ${inProgress} pågår · ${done} ferdig`}>
      {backlog > 0 && (
        <div
          className={styles.segBacklog}
          style={{ flex: backlog }}
        />
      )}
      {inProgress > 0 && (
        <div
          className={styles.segInProgress}
          style={{ flex: inProgress }}
        />
      )}
      {done > 0 && (
        <div
          className={styles.segDone}
          style={{ flex: done }}
        />
      )}
    </div>
  );
}

type StatusCategory = 'new' | 'indeterminate' | 'done';

export function ProjectPulse({ issues, jiraBaseUrl }: ProjectPulseProps) {
  const [selectedBubble, setSelectedBubble] = useState<EpicBubble | null>(null);
  const [activeCategories, setActiveCategories] = useState<Set<StatusCategory>>(
    new Set(['indeterminate'])
  );

  if (issues.length === 0) {
    return (
      <div className={styles.emptyState}>
        <p>Ingen saker funnet for dette prosjektet.</p>
      </div>
    );
  }

  const { bubbles, orphans } = buildEpicBubbles(issues);

  const totalBacklog = issues.filter((i) => i.status.category === 'new').length;
  const totalInProgress = issues.filter((i) => i.status.category === 'indeterminate').length;
  const totalDone = issues.filter((i) => i.status.category === 'done').length;

  const toggleCategory = (cat: StatusCategory) => {
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
    setSelectedBubble(null);
  };

  const visibleBubbles =
    activeCategories.size === 0
      ? bubbles
      : bubbles.filter((b) => {
          if (activeCategories.has('new') && (b.backlogCount > 0 || b.epic.status.category === 'new')) return true;
          if (activeCategories.has('indeterminate') && (b.inProgressCount > 0 || b.epic.status.category === 'indeterminate')) return true;
          if (activeCategories.has('done') && (b.doneCount > 0 || b.epic.status.category === 'done')) return true;
          return false;
        });

  const handleBubbleClick = (bubble: EpicBubble) => {
    setSelectedBubble((prev) => (prev?.epic.key === bubble.epic.key ? null : bubble));
  };

  const statusBadgeVariant = (category: 'new' | 'indeterminate' | 'done') => {
    if (category === 'done') return 'success' as const;
    if (category === 'indeterminate') return 'primary' as const;
    return 'default' as const;
  };

  return (
    <div className={styles.pulseWrapper}>
      {/* Summary strip */}
      <div className={styles.summaryStrip}>
        <button
          className={`${styles.summaryPill} ${styles.pillBacklog} ${activeCategories.has('new') ? styles.pillActive : styles.pillInactive}`}
          onClick={() => toggleCategory('new')}
          title={activeCategories.has('new') ? 'Skjul backlog-epics' : 'Vis backlog-epics'}
        >
          <span className={styles.pillCount}>{totalBacklog}</span>
          <span className={styles.pillLabel}>Backlog</span>
        </button>
        <button
          className={`${styles.summaryPill} ${styles.pillInProgress} ${activeCategories.has('indeterminate') ? styles.pillActive : styles.pillInactive}`}
          onClick={() => toggleCategory('indeterminate')}
          title={activeCategories.has('indeterminate') ? 'Skjul aktive epics' : 'Vis aktive epics'}
        >
          <span className={styles.pillCount}>{totalInProgress}</span>
          <span className={styles.pillLabel}>Under arbeid</span>
        </button>
        <button
          className={`${styles.summaryPill} ${styles.pillDone} ${activeCategories.has('done') ? styles.pillActive : styles.pillInactive}`}
          onClick={() => toggleCategory('done')}
          title={activeCategories.has('done') ? 'Skjul ferdige epics' : 'Vis ferdige epics'}
        >
          <span className={styles.pillCount}>{totalDone}</span>
          <span className={styles.pillLabel}>Ferdig</span>
        </button>
      </div>

      {/* Map + detail */}
      <div
        className={styles.mapAndDetail}
        style={{ gridTemplateColumns: selectedBubble ? '1fr 300px' : '1fr' }}
      >
        {/* Bubble map */}
        <div className={styles.bubbleMap}>
          {visibleBubbles.length === 0 && (
            <p className={styles.noVisible}>Ingen epics matcher valgte filtre.</p>
          )}
          {visibleBubbles.map((bubble) => {
            const { epic, bubbleSize, health, isStalled, totalCount, donePct } = bubble;
            const isSelected = selectedBubble?.epic.key === epic.key;

            const healthClass =
              health === 'green'
                ? styles.bubbleGreen
                : health === 'orange'
                ? styles.bubbleOrange
                : styles.bubbleGray;

            return (
              <div key={epic.key} className={styles.bubbleWrapper}>
                <button
                  className={`${styles.bubble} ${healthClass} ${isSelected ? styles.bubbleSelected : ''}`}
                  style={{ width: bubbleSize, height: bubbleSize }}
                  onClick={() => handleBubbleClick(bubble)}
                  title={`${epic.key}: ${epic.summary} — ${Math.round(donePct)}% ferdig, ${totalCount} saker`}
                >
                  {isStalled && <span className={styles.stalledDot} title="Stanset — ingen aktivitet på 7+ dager" />}
                  <BubbleSvg size={bubbleSize} donePct={donePct} health={health} />
                </button>
                <div
                  className={styles.bubbleLabel}
                  style={{ maxWidth: bubbleSize }}
                  title={`${epic.key}: ${epic.summary}`}
                >
                  <span className={styles.bubbleLabelKey}>{epic.key}</span>
                  <span className={styles.bubbleLabelSummary}>{epic.summary}</span>
                </div>
              </div>
            );
          })}

          {orphans.length > 0 && (
            <div className={styles.orphanSection}>
              <span className={styles.orphanLabel}>Uten epos ({orphans.length})</span>
              <div className={styles.orphanList}>
                {orphans.map((issue) => (
                  <a
                    key={issue.key}
                    href={`${jiraBaseUrl}/browse/${issue.key}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.orphanItem}
                  >
                    {issue.issueType.iconUrl && (
                      <img src={issue.issueType.iconUrl} alt={issue.issueType.name} className={styles.orphanIcon} />
                    )}
                    <span className={styles.orphanKey}>{issue.key}</span>
                    <span className={styles.orphanSummary}>{issue.summary}</span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Detail panel */}
        {selectedBubble && (
          <div className={styles.detailPanel}>
            <div className={styles.detailHeader}>
              <div className={styles.detailTitle}>
                {selectedBubble.epic.issueType.iconUrl && (
                  <img
                    src={selectedBubble.epic.issueType.iconUrl}
                    alt={selectedBubble.epic.issueType.name}
                    className={styles.detailTypeIcon}
                  />
                )}
                <a
                  href={`${jiraBaseUrl}/browse/${selectedBubble.epic.key}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.detailKey}
                >
                  {selectedBubble.epic.key}
                </a>
                <Badge variant={statusBadgeVariant(selectedBubble.epic.status.category)} size="sm">
                  {selectedBubble.epic.status.name}
                </Badge>
              </div>
              <button
                className={styles.detailClose}
                onClick={() => setSelectedBubble(null)}
                title="Lukk"
              >
                <X size={16} />
              </button>
            </div>

            <p className={styles.detailSummary}>{selectedBubble.epic.summary}</p>

            <SegBar
              backlog={selectedBubble.backlogCount}
              inProgress={selectedBubble.inProgressCount}
              done={selectedBubble.doneCount}
              total={selectedBubble.totalCount}
            />

            <div className={styles.detailCounts}>
              <span className={styles.countBacklog}>{selectedBubble.backlogCount} backlog</span>
              <span className={styles.countInProgress}>{selectedBubble.inProgressCount} pågår</span>
              <span className={styles.countDone}>{selectedBubble.doneCount} ferdig</span>
            </div>

            <div className={styles.childList}>
              {selectedBubble.children.length === 0 ? (
                <p className={styles.noChildren}>Ingen underoppgaver</p>
              ) : (
                selectedBubble.children.map((child) => (
                  <div key={child.key} className={styles.childRow}>
                    {child.issueType.iconUrl && (
                      <img
                        src={child.issueType.iconUrl}
                        alt={child.issueType.name}
                        className={styles.childTypeIcon}
                      />
                    )}
                    <a
                      href={`${jiraBaseUrl}/browse/${child.key}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.childKey}
                    >
                      {child.key}
                    </a>
                    <span className={styles.childSummary} title={child.summary}>
                      {child.summary}
                    </span>
                    <Badge variant={statusBadgeVariant(child.status.category)} size="sm">
                      {child.status.name}
                    </Badge>
                    {child.assignee && (
                      child.assignee.avatarUrl ? (
                        <img
                          src={child.assignee.avatarUrl}
                          alt={child.assignee.displayName}
                          className={styles.childAvatar}
                          title={child.assignee.displayName}
                        />
                      ) : (
                        <div
                          className={styles.childAvatarInitial}
                          title={child.assignee.displayName}
                        >
                          {child.assignee.displayName.charAt(0)}
                        </div>
                      )
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
