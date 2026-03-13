import { useState, useRef, useEffect } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import type { JiraIssue } from '../../types';
import styles from './Timeline.module.css';

interface TimelineProps {
  issues: JiraIssue[];
  jiraBaseUrl: string;
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function getMonthsBetween(start: Date, end: Date): Date[] {
  const months: Date[] = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cur <= endMonth) {
    months.push(new Date(cur));
    cur.setMonth(cur.getMonth() + 1);
  }
  return months;
}


function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function barColor(category: 'new' | 'indeterminate' | 'done'): string {
  switch (category) {
    case 'done': return 'var(--color-success, #22c55e)';
    case 'indeterminate': return '#a855f7';
    default: return 'var(--color-text-muted, #94a3b8)';
  }
}

function statusBadgeClass(category: 'new' | 'indeterminate' | 'done'): string {
  switch (category) {
    case 'done': return styles.statusDone;
    case 'indeterminate': return styles.statusInProgress;
    default: return styles.statusNew;
  }
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Des'];
const ROW_HEIGHT = 40;
const SECTION_ROW_HEIGHT = 32;

interface Row {
  issue: JiraIssue;
  isEpic: boolean;
  isChild: boolean;
}

export function Timeline({ issues, jiraBaseUrl }: TimelineProps) {
  const today = new Date();

  const [windowOffset, setWindowOffset] = useState(0);
  const windowStart = startOfMonth(addMonths(today, -2 + windowOffset));
  const windowEnd = startOfMonth(addMonths(today, 5 + windowOffset));
  const windowEndExclusive = addMonths(windowEnd, 1);
  const MS_PER_DAY = 1000 * 60 * 60 * 24;
  const windowDays = (windowEndExclusive.getTime() - windowStart.getTime()) / MS_PER_DAY;

  const months = getMonthsBetween(windowStart, windowEnd);
  const monthWidthPct = 100 / months.length;

  // Expanded epics (collapsed by default — click to expand)
  const [expandedEpics, setExpandedEpics] = useState<Set<string>>(new Set());
  const prevIssuesRef = useRef<JiraIssue[]>([]);
  useEffect(() => {
    if (prevIssuesRef.current !== issues) {
      prevIssuesRef.current = issues;
      setExpandedEpics(new Set());
    }
  }, [issues]);


  const toggleEpic = (key: string) => {
    setExpandedEpics((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // Section-level expand (Utgaver group)
  const [sectionExpanded, setSectionExpanded] = useState(true);

  // Sync vertical scroll
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const onLeftScroll = () => { if (rightRef.current && leftRef.current) rightRef.current.scrollTop = leftRef.current.scrollTop; };
  const onRightScroll = () => { if (leftRef.current && rightRef.current) leftRef.current.scrollTop = rightRef.current.scrollTop; };

  // Detect epics dynamically: any issue referenced as parent.key by another issue,
  // OR whose type name is a known epic type (handles both English and Norwegian Jira)
  const EPIC_TYPE_NAMES = new Set(['epic', 'oppgavesamling']);
  const referencedAsParent = new Set(
    issues.map((i) => i.parent?.key).filter((k): k is string => !!k)
  );

  const isEpicIssue = (i: JiraIssue) =>
    referencedAsParent.has(i.key) || EPIC_TYPE_NAMES.has(i.issueType.name.toLowerCase());

  const epics = issues.filter(isEpicIssue);
  const epicKeys = new Set(epics.map((e) => e.key));

  const childrenByEpic = new Map<string, JiraIssue[]>();

  issues.forEach((issue) => {
    if (isEpicIssue(issue)) return;
    const parentKey = issue.parent?.key;
    if (parentKey && epicKeys.has(parentKey)) {
      const arr = childrenByEpic.get(parentKey) ?? [];
      arr.push(issue);
      childrenByEpic.set(parentKey, arr);
    }
  });

  const rows: Row[] = [];
  if (sectionExpanded) {
    // Only epics at top level — expand to show children on click
    epics.forEach((epic) => {
      rows.push({ issue: epic, isEpic: true, isChild: false });
      if (expandedEpics.has(epic.key)) {
        (childrenByEpic.get(epic.key) ?? []).forEach((child) => {
          rows.push({ issue: child, isEpic: false, isChild: true });
        });
      }
    });
  }

  // Bar calculation — left and right positions calculated independently from windowStart
  // so that issues created before the visible window don't inflate bar width.
  function getBar(issue: JiraIssue): { left: number; width: number; isMilestone?: boolean } | null {
    const endStr = issue.dueDate;
    if (!endStr) return null;
    const end = new Date(endStr);

    if (issue.startDate) {
      const start = new Date(issue.startDate);
      if (end <= start) return null;
      const startOffset = (start.getTime() - windowStart.getTime()) / MS_PER_DAY;
      const endOffset = (end.getTime() - windowStart.getTime()) / MS_PER_DAY;
      const leftPct = (startOffset / windowDays) * 100;
      const rightPct = (endOffset / windowDays) * 100;
      const clampedLeft = clamp(leftPct, 0, 100);
      const clampedRight = clamp(rightPct, 0, 100);
      const clampedWidth = clampedRight - clampedLeft;
      if (clampedWidth < 0.2) return null;
      return { left: clampedLeft, width: clampedWidth };
    } else {
      // Ingen startdato — vis som milestone ved forfallsdato
      const endOffset = (end.getTime() - windowStart.getTime()) / MS_PER_DAY;
      const leftPct = (endOffset / windowDays) * 100;
      const clampedLeft = clamp(leftPct, 0, 100);
      if (clampedLeft <= 0 || clampedLeft >= 100) return null;
      return { left: clampedLeft, width: 0.6, isMilestone: true };
    }
  }

  const todayLeft = ((today.getTime() - windowStart.getTime()) / MS_PER_DAY / windowDays) * 100;
  const showTodayLine = todayLeft >= 0 && todayLeft <= 100;

  // Total content height for bars area (section header + rows)
  const totalContentHeight = SECTION_ROW_HEIGHT + rows.length * ROW_HEIGHT;

  return (
    <div className={styles.timelineWrapper}>
      {/* Navigation */}
      <div className={styles.navBar}>
        <button className={styles.navButton} onClick={() => setWindowOffset((o) => o - 1)}>&#8592; Forrige</button>
        <span className={styles.navLabel}>
          {MONTH_NAMES[windowStart.getMonth()]} {windowStart.getFullYear()} – {MONTH_NAMES[windowEnd.getMonth()]} {windowEnd.getFullYear()}
        </span>
        <button className={styles.navButton} onClick={() => setWindowOffset((o) => o + 1)}>Neste &#8594;</button>
      </div>

      <div className={styles.gridContainer}>
        {/* Left panel */}
        <div className={styles.leftPanel} ref={leftRef} onScroll={onLeftScroll}>
          <div className={styles.leftHeader}>Arbeid</div>

          {/* Section header row */}
          <div
            className={styles.sectionRow}
            style={{ height: SECTION_ROW_HEIGHT }}
            onClick={() => setSectionExpanded((v) => !v)}
          >
            <span className={styles.chevron}>
              {sectionExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </span>
            <span className={styles.sectionLabel}>Utgaver</span>
          </div>

          {/* Issue rows */}
          {rows.map(({ issue, isEpic, isChild }) => (
            <div
              key={issue.key}
              className={`${styles.leftRow} ${isEpic ? styles.epicRow : ''} ${isChild ? styles.childRow : ''}`}
              style={{ height: ROW_HEIGHT }}
              onClick={isEpic ? () => toggleEpic(issue.key) : undefined}
            >
              {/* Chevron column - always reserve space */}
              <span className={styles.chevron}>
                {isEpic
                  ? (expandedEpics.has(issue.key) ? <ChevronDown size={14} /> : <ChevronRight size={14} />)
                  : null}
              </span>

              {issue.issueType.iconUrl && (
                <img src={issue.issueType.iconUrl} alt={issue.issueType.name} className={styles.issueIcon} />
              )}
              <a
                href={`${jiraBaseUrl}/browse/${issue.key}`}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.issueKeyLink}
                onClick={(e) => e.stopPropagation()}
              >
                {issue.key}
              </a>
              <span className={styles.issueSummary} title={issue.summary}>{issue.summary}</span>
              <span className={`${styles.statusBadge} ${statusBadgeClass(issue.status.category)}`}>
                {issue.status.name}
              </span>
            </div>
          ))}
        </div>

        {/* Right panel */}
        <div className={styles.rightPanel} ref={rightRef} onScroll={onRightScroll}>
          {/* Month header */}
          <div className={styles.monthHeader}>
            {months.map((m) => (
              <div
                key={m.toISOString()}
                className={styles.monthCell}
                style={{ width: `${monthWidthPct}%` }}
              >
                {MONTH_NAMES[m.getMonth()]} {m.getFullYear()}
              </div>
            ))}
          </div>

          {/* Bars area */}
          <div className={styles.barsArea} style={{ height: totalContentHeight }}>
            {/* Today line */}
            {showTodayLine && (
              <div className={styles.todayLine} style={{ left: `${todayLeft}%` }} />
            )}

            {/* Month grid lines */}
            {months.map((m, i) => (
              <div
                key={m.toISOString()}
                className={styles.monthGridLine}
                style={{ left: `${i * monthWidthPct}%`, width: `${monthWidthPct}%` }}
              />
            ))}

            {/* Section header row (empty, just for height alignment) */}
            <div style={{ height: SECTION_ROW_HEIGHT }} />

            {/* Bar rows */}
            {rows.map(({ issue }) => {
              const bar = getBar(issue);
              return (
                <div key={issue.key} className={styles.barRow} style={{ height: ROW_HEIGHT }}>
                  {bar && (
                    <a
                      href={`${jiraBaseUrl}/browse/${issue.key}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={bar.isMilestone ? styles.barMilestone : styles.bar}
                      title={bar.isMilestone
                        ? `${issue.key}: ${issue.summary}\nFrist: ${issue.dueDate}`
                        : `${issue.key}: ${issue.summary}\n${issue.startDate} → ${issue.dueDate}`}
                      style={{
                        left: `${bar.left}%`,
                        width: `${bar.width}%`,
                        backgroundColor: barColor(issue.status.category),
                      }}
                    >
                      {!bar.isMilestone && <span className={styles.barLabel}>{issue.summary}</span>}
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
