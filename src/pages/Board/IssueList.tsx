import { useState } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { Badge } from '../../components/common';
import type { JiraIssue } from '../../types';
import styles from './IssueList.module.css';

interface IssueListProps {
  issues: JiraIssue[];
  jiraBaseUrl: string;
  onIssueClick: (issue: JiraIssue) => void;
}

type SortKey = 'key' | 'summary' | 'status' | 'priority' | 'assignee' | 'dueDate' | 'updated';
type SortDir = 'asc' | 'desc';

const PRIORITY_ORDER: Record<string, number> = {
  Highest: 5, High: 4, Medium: 3, Low: 2, Lowest: 1,
};

function getPriorityOrder(name?: string) {
  return name ? (PRIORITY_ORDER[name] ?? 3) : 0;
}

function getPriorityVariant(priority?: string) {
  switch (priority?.toLowerCase()) {
    case 'highest':
    case 'high':
      return 'danger' as const;
    case 'medium':
      return 'warning' as const;
    default:
      return 'default' as const;
  }
}

export function IssueList({ issues, jiraBaseUrl, onIssueClick }: IssueListProps) {
  const [sortKey, setSortKey] = useState<SortKey>('updated');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sorted = [...issues].sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case 'key':
        cmp = a.key.localeCompare(b.key);
        break;
      case 'summary':
        cmp = a.summary.localeCompare(b.summary);
        break;
      case 'status':
        cmp = a.status.name.localeCompare(b.status.name);
        break;
      case 'priority':
        cmp = getPriorityOrder(b.priority?.name) - getPriorityOrder(a.priority?.name);
        break;
      case 'assignee':
        cmp = (a.assignee?.displayName ?? '').localeCompare(b.assignee?.displayName ?? '');
        break;
      case 'dueDate':
        cmp = (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999');
        break;
      case 'updated':
        cmp = b.updated.localeCompare(a.updated);
        break;
    }
    return sortDir === 'desc' ? -cmp : cmp;
  });

  const SortIcon = ({ col }: { col: SortKey }) =>
    sortKey === col ? (
      sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />
    ) : null;

  if (issues.length === 0) {
    return <p className={styles.empty}>Ingen saker funnet</p>;
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.table}>
        <div className={styles.headerRow}>
          <div className={styles.colType} />
          <button className={styles.colHeader} onClick={() => handleSort('key')}>
            Nøkkel <SortIcon col="key" />
          </button>
          <button className={`${styles.colHeader} ${styles.colSummaryHeader}`} onClick={() => handleSort('summary')}>
            Tittel <SortIcon col="summary" />
          </button>
          <button className={styles.colHeader} onClick={() => handleSort('status')}>
            Status <SortIcon col="status" />
          </button>
          <button className={styles.colHeader} onClick={() => handleSort('priority')}>
            Prioritet <SortIcon col="priority" />
          </button>
          <button className={styles.colHeader} onClick={() => handleSort('assignee')}>
            Tildelt <SortIcon col="assignee" />
          </button>
          <button className={styles.colHeader} onClick={() => handleSort('dueDate')}>
            Frist <SortIcon col="dueDate" />
          </button>
          <div className={styles.colHeader}>Etiketter</div>
          <button className={styles.colHeader} onClick={() => handleSort('updated')}>
            Oppdatert <SortIcon col="updated" />
          </button>
        </div>

        {sorted.map((issue) => (
          <div key={issue.key} className={styles.row} onClick={() => onIssueClick(issue)}>
            <div className={styles.colType}>
              {issue.issueType.iconUrl && (
                <img
                  src={issue.issueType.iconUrl}
                  alt={issue.issueType.name}
                  className={styles.typeIcon}
                  title={issue.issueType.name}
                />
              )}
            </div>
            <div className={styles.colData}>
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
            <div className={`${styles.colData} ${styles.colSummary}`}>
              <span className={styles.summary}>{issue.summary}</span>
            </div>
            <div className={styles.colData}>
              <Badge
                variant={
                  issue.status.category === 'done'
                    ? 'success'
                    : issue.status.category === 'indeterminate'
                    ? 'primary'
                    : 'default'
                }
                size="sm"
              >
                {issue.status.name}
              </Badge>
            </div>
            <div className={styles.colData}>
              {issue.priority && (
                <Badge variant={getPriorityVariant(issue.priority.name)} size="sm">
                  {issue.priority.name}
                </Badge>
              )}
            </div>
            <div className={styles.colData}>
              {issue.assignee && (
                <div className={styles.assignee}>
                  {issue.assignee.avatarUrl ? (
                    <img
                      src={issue.assignee.avatarUrl}
                      alt={issue.assignee.displayName}
                      className={styles.avatar}
                    />
                  ) : (
                    <div className={styles.avatarInitial}>
                      {issue.assignee.displayName.charAt(0)}
                    </div>
                  )}
                  <span className={styles.assigneeName}>{issue.assignee.displayName}</span>
                </div>
              )}
            </div>
            <div className={styles.colData}>
              {issue.dueDate && (
                <span
                  className={
                    new Date(issue.dueDate) < new Date() && issue.status.category !== 'done'
                      ? styles.overdue
                      : styles.dueDate
                  }
                >
                  {new Date(issue.dueDate).toLocaleDateString('nb-NO')}
                </span>
              )}
            </div>
            <div className={styles.colData}>
              {issue.labels && issue.labels.length > 0 && (
                <div className={styles.labels}>
                  {issue.labels.slice(0, 2).map((label) => (
                    <span key={label} className={styles.label}>{label}</span>
                  ))}
                  {issue.labels.length > 2 && (
                    <span className={styles.labelMore}>+{issue.labels.length - 2}</span>
                  )}
                </div>
              )}
            </div>
            <div className={styles.colData}>
              <span className={styles.updated}>
                {new Date(issue.updated).toLocaleDateString('nb-NO', {
                  day: 'numeric',
                  month: 'short',
                })}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
