import { useQuery } from '@tanstack/react-query';
import { getChildIssues } from '../../services/jiraService';
import type { JiraIssue } from '../../types';
import styles from './Board.module.css';

interface SubtaskListProps {
  parentKey: string;
  jiraBaseUrl: string;
  fallback: JiraIssue[];
  myIssueKeys: Set<string>;
}

export function SubtaskList({ parentKey, jiraBaseUrl, fallback, myIssueKeys }: SubtaskListProps) {
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
        const isMe = myIssueKeys.has(child.key);
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
            {isMe && <span className={styles.subtaskMeBadge}>Meg</span>}
          </li>
        );
      })}
    </ul>
  );
}
