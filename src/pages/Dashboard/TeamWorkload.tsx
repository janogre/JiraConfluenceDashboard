import { useState } from 'react';
import type { JiraIssue } from '../../types';
import styles from './Dashboard.module.css';

interface TeamWorkloadProps {
  issues: JiraIssue[];
}

export function TeamWorkload({ issues }: TeamWorkloadProps) {
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set());

  const allProjects = Array.from(new Set(issues.map((i) => i.projectKey))).sort();

  const toggleProject = (key: string) => {
    setSelectedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const filtered =
    selectedProjects.size === 0
      ? issues
      : issues.filter((i) => selectedProjects.has(i.projectKey));

  const countMap: Record<string, { count: number; avatarUrl?: string }> = {};
  filtered.forEach((issue) => {
    if (!issue.assignee) return;
    const name = issue.assignee.displayName;
    if (!countMap[name]) {
      countMap[name] = { count: 0, avatarUrl: issue.assignee.avatarUrl };
    }
    countMap[name].count++;
  });

  const sorted = Object.entries(countMap)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 8);

  const maxCount = sorted[0]?.[1].count ?? 1;

  return (
    <div>
      {allProjects.length > 1 && (
        <div className={styles.projectFilter}>
          {allProjects.map((key) => (
            <button
              key={key}
              className={`${styles.projectChip} ${selectedProjects.has(key) ? styles.projectChipActive : ''}`}
              onClick={() => toggleProject(key)}
            >
              {key}
            </button>
          ))}
        </div>
      )}

      {sorted.length === 0 ? (
        <p className={styles.empty}>Ingen åpne tildelte saker</p>
      ) : (
        <ul className={styles.workloadList}>
          {sorted.map(([name, { count, avatarUrl }]) => (
            <li key={name} className={styles.workloadRow}>
              {avatarUrl ? (
                <img src={avatarUrl} alt={name} className={styles.workloadAvatar} />
              ) : (
                <span className={styles.workloadInitial}>{name.charAt(0).toUpperCase()}</span>
              )}
              <span className={styles.workloadName}>{name}</span>
              <div className={styles.workloadBarTrack}>
                <div
                  className={styles.workloadBar}
                  style={{ width: `${(count / maxCount) * 100}%` }}
                />
              </div>
              <span className={styles.workloadCount}>{count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
