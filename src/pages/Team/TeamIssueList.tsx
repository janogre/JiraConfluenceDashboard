import { useState } from 'react';
import { ChevronRight, ChevronUp, ChevronDown, AlertOctagon } from 'lucide-react';
import { Badge } from '../../components/common';
import type { JiraIssue } from '../../types';
import listStyles from '../Board/IssueList.module.css';
import teamStyles from './Team.module.css';

interface TeamIssueListProps {
  issues: JiraIssue[];
  childrenMap: Map<string, JiraIssue[]>;
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

function getPriorityVariant(priority?: string): 'danger' | 'warning' | 'default' {
  switch (priority?.toLowerCase()) {
    case 'highest':
    case 'high': return 'danger';
    case 'medium': return 'warning';
    default: return 'default';
  }
}

export function TeamIssueList({ issues, childrenMap, jiraBaseUrl, onIssueClick }: TeamIssueListProps) {
  const [sortKey, setSortKey] = useState<SortKey>('updated');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

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
      case 'key': cmp = a.key.localeCompare(b.key); break;
      case 'summary': cmp = a.summary.localeCompare(b.summary); break;
      case 'status': cmp = a.status.name.localeCompare(b.status.name); break;
      case 'priority': cmp = getPriorityOrder(b.priority?.name) - getPriorityOrder(a.priority?.name); break;
      case 'assignee': cmp = (a.assignee?.displayName ?? '').localeCompare(b.assignee?.displayName ?? ''); break;
      case 'dueDate': cmp = (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'); break;
      case 'updated': cmp = b.updated.localeCompare(a.updated); break;
    }
    return sortDir === 'desc' ? -cmp : cmp;
  });

  const toggleExpand = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const SortIcon = ({ col }: { col: SortKey }) =>
    sortKey === col ? (
      sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />
    ) : null;

  if (issues.length === 0) {
    return <p className={listStyles.empty}>Ingen saker funnet</p>;
  }

  return (
    <div className={listStyles.wrapper}>
      <div className={`${listStyles.table} ${teamStyles.teamIssueTable}`}>
        {/* Header */}
        <div className={listStyles.headerRow}>
          <div className={listStyles.colType} />
          <button className={listStyles.colHeader} onClick={() => handleSort('key')}>Nøkkel <SortIcon col="key" /></button>
          <button className={`${listStyles.colHeader} ${listStyles.colSummaryHeader}`} onClick={() => handleSort('summary')}>Tittel <SortIcon col="summary" /></button>
          <button className={listStyles.colHeader} onClick={() => handleSort('status')}>Status <SortIcon col="status" /></button>
          <button className={listStyles.colHeader} onClick={() => handleSort('priority')}>Prioritet <SortIcon col="priority" /></button>
          <button className={listStyles.colHeader} onClick={() => handleSort('assignee')}>Tildelt <SortIcon col="assignee" /></button>
          <button className={listStyles.colHeader} onClick={() => handleSort('dueDate')}>Frist <SortIcon col="dueDate" /></button>
          <div className={listStyles.colHeader}>Etiketter</div>
          <div className={listStyles.colHeader}>Kategori</div>
          <button className={listStyles.colHeader} onClick={() => handleSort('updated')}>Oppdatert <SortIcon col="updated" /></button>
          <div className={listStyles.colType} />
        </div>

        {/* Rows */}
        {sorted.map((issue) => {
          const children = childrenMap.get(issue.key) ?? [];
          const hasChildren = children.length > 0;
          const isExpanded = expanded.has(issue.key);

          return (
            <div key={issue.key} style={{ display: 'contents' }}>
              {/* Parent row */}
              <div className={listStyles.row} onClick={() => onIssueClick(issue)} style={{ display: 'contents', cursor: 'pointer' }}>
                <div className={listStyles.colType}>
                  {hasChildren ? (
                    <button
                      className={listStyles.expandBtn}
                      onClick={(e) => { e.stopPropagation(); toggleExpand(issue.key); }}
                      title={isExpanded ? 'Skjul underoppgaver' : `Vis ${children.length} underoppgaver`}
                    >
                      <ChevronRight
                        size={14}
                        className={`${listStyles.expandIcon} ${isExpanded ? listStyles.expandIconOpen : ''}`}
                      />
                    </button>
                  ) : issue.issueType.iconUrl ? (
                    <img src={issue.issueType.iconUrl} alt={issue.issueType.name} className={listStyles.typeIcon} title={issue.issueType.name} />
                  ) : null}
                </div>
                <div className={listStyles.colData}>
                  <a
                    href={`${jiraBaseUrl}/browse/${issue.key}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={listStyles.issueKey}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {issue.key}
                  </a>
                </div>
                <div className={`${listStyles.colData} ${listStyles.colSummary}`}>
                  <span className={listStyles.summary}>{issue.summary}</span>
                  {issue.links?.filter((l) => {
                    const t = l.type.name.toLowerCase();
                    return !!l.inwardIssue && (t.includes('block') || t.includes('blokkerer'));
                  }).map((l) => (
                    <span key={l.id} className={listStyles.blockedBadge} title={`Blokkert av ${l.inwardIssue!.key}`}>
                      <AlertOctagon size={11} />
                      Blokkert av {l.inwardIssue!.key}
                    </span>
                  ))}
                </div>
                <div className={listStyles.colData}>
                  <Badge
                    variant={issue.status.category === 'done' ? 'success' : issue.status.category === 'indeterminate' ? 'primary' : 'default'}
                    size="sm"
                  >
                    {issue.status.name}
                  </Badge>
                </div>
                <div className={listStyles.colData}>
                  {issue.priority && (
                    <Badge variant={getPriorityVariant(issue.priority.name)} size="sm">
                      {issue.priority.name}
                    </Badge>
                  )}
                </div>
                <div className={listStyles.colData}>
                  {issue.assignee && (
                    <div className={listStyles.assignee}>
                      {issue.assignee.avatarUrl ? (
                        <img src={issue.assignee.avatarUrl} alt={issue.assignee.displayName} className={listStyles.avatar} />
                      ) : (
                        <div className={listStyles.avatarInitial}>{issue.assignee.displayName.charAt(0)}</div>
                      )}
                      <span className={listStyles.assigneeName}>{issue.assignee.displayName}</span>
                    </div>
                  )}
                </div>
                <div className={listStyles.colData}>
                  {issue.dueDate && (
                    <span className={new Date(issue.dueDate) < new Date() && issue.status.category !== 'done' ? listStyles.overdue : listStyles.dueDate}>
                      {new Date(issue.dueDate).toLocaleDateString('nb-NO')}
                    </span>
                  )}
                </div>
                <div className={listStyles.colData}>
                  {issue.labels && issue.labels.length > 0 && (
                    <div className={listStyles.labels}>
                      {issue.labels.slice(0, 2).map((label) => (
                        <span key={label} className={listStyles.label}>{label}</span>
                      ))}
                      {issue.labels.length > 2 && (
                        <span className={listStyles.labelMore}>+{issue.labels.length - 2}</span>
                      )}
                    </div>
                  )}
                </div>
                <div className={listStyles.colData}>
                  {issue.kategori && (
                    <span className={listStyles.label}>{issue.kategori}</span>
                  )}
                </div>
                <div className={listStyles.colData}>
                  <span className={listStyles.updated}>
                    {new Date(issue.updated).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' })}
                  </span>
                </div>
                <div className={listStyles.colData} />
              </div>

              {/* Children — grid-column: 1/-1, kolonner justert mot foreldrerad */}
              {hasChildren && isExpanded && (
                <div className={listStyles.childGroupCell}>
                  {children.map((child) => (
                    <div
                      key={child.key}
                      className={teamStyles.teamChildItemRow}
                      onClick={() => onIssueClick(child)}
                    >
                      {/* Kol 1: type-ikon */}
                      <div className={listStyles.colType}>
                        {child.issueType.iconUrl && (
                          <img src={child.issueType.iconUrl} alt={child.issueType.name} className={listStyles.typeIcon} title={child.issueType.name} />
                        )}
                      </div>
                      {/* Kol 2: nøkkel */}
                      <div className={listStyles.colData}>
                        <a
                          href={`${jiraBaseUrl}/browse/${child.key}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={listStyles.issueKey}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {child.key}
                        </a>
                      </div>
                      {/* Kol 3: tittel */}
                      <div className={`${listStyles.colData} ${listStyles.colSummary}`}>
                        <span className={listStyles.summary}>{child.summary}</span>
                      </div>
                      {/* Kol 4: status */}
                      <div className={listStyles.colData}>
                        <Badge
                          variant={child.status.category === 'done' ? 'success' : child.status.category === 'indeterminate' ? 'primary' : 'default'}
                          size="sm"
                        >
                          {child.status.name}
                        </Badge>
                      </div>
                      {/* Kol 5: prioritet */}
                      <div className={listStyles.colData}>
                        {child.priority && (
                          <Badge variant={getPriorityVariant(child.priority.name)} size="sm">
                            {child.priority.name}
                          </Badge>
                        )}
                      </div>
                      {/* Kol 6: tildelt */}
                      <div className={listStyles.colData}>
                        {child.assignee && (
                          <div className={listStyles.assignee}>
                            {child.assignee.avatarUrl ? (
                              <img src={child.assignee.avatarUrl} alt={child.assignee.displayName} className={listStyles.avatar} />
                            ) : (
                              <div className={listStyles.avatarInitial}>{child.assignee.displayName.charAt(0)}</div>
                            )}
                            <span className={listStyles.assigneeName}>{child.assignee.displayName}</span>
                          </div>
                        )}
                      </div>
                      {/* Kol 7–11: frist, etiketter, kategori, oppdatert, handling — tomme */}
                      <div /><div /><div /><div /><div />
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
