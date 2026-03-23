import { useQuery } from '@tanstack/react-query';
import { getChildIssues } from '../../services/jiraService';
import type { JiraIssue } from '../../types';
import styles from './Board.module.css';

interface SubtaskListProps {
  parentKey: string;
  jiraBaseUrl: string;
  fallback: JiraIssue[];
  currentUserDisplayName?: string;
}

export function SubtaskList({ parentKey, jiraBaseUrl, fallback, currentUserDisplayName }: SubtaskListProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['childIssues', parentKey],
    queryFn: () => getChildIssues(parentKey),
    staleTime: 1000 * 60 * 5,
  });

  const children = data ?? fallback;

  if (isLoading && fallback.length === 0) {
    return <p className={styles.subtasksLoading}>Laster underoppgaver…</p>;
  }

  return (
    <ul className={styles.subtasksList}>
      {children.map((child) => {
        const isMe = !!currentUserDisplayName && child.assignee?.displayName === currentUserDisplayName;
        return (
          <li key={child.key} className={`${styles.subtaskItem} ${isMe ? styles.subtaskItemMe : ''}`}>
            <span
              className={`${styles.subtaskDot} ${
                child.status.category === 'done'
                  ? styles.subtaskDotDone
                  : child.status.category === 'indeterminate'
                  ? styles.subtaskDotActive
                  : styles.subtaskDotNew
              }`}
            />
            {child.issueType.iconUrl && (
              <img
                src={child.issueType.iconUrl}
                alt={child.issueType.name}
                className={styles.subtaskTypeIcon}
              />
            )}
            <a
              href={`${jiraBaseUrl}/browse/${child.key}`}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.subtaskKey}
              onClick={(e) => e.stopPropagation()}
            >
              {child.key}
            </a>
            <span className={styles.subtaskSummary}>{child.summary}</span>
            {child.assignee && (
              isMe ? (
                <span className={styles.subtaskMeBadge}>Meg</span>
              ) : child.assignee.avatarUrl ? (
                <img
                  src={child.assignee.avatarUrl}
                  alt={child.assignee.displayName}
                  className={styles.subtaskAssigneeAvatar}
                  title={child.assignee.displayName}
                />
              ) : (
                <div
                  className={styles.subtaskAssigneeInitial}
                  title={child.assignee.displayName}
                >
                  {child.assignee.displayName.charAt(0)}
                </div>
              )
            )}
          </li>
        );
      })}
    </ul>
  );
}
