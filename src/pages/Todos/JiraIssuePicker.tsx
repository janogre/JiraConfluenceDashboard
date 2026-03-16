import { useState, useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Modal, Badge } from '../../components/common';
import { searchIssues, getIssues } from '../../services/jiraService';
import type { JiraIssue } from '../../types';
import styles from './JiraIssuePicker.module.css';

interface JiraIssuePickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (issueKey: string) => void;
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function JiraIssuePicker({ isOpen, onClose, onSelect }: JiraIssuePickerProps) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const debouncedQuery = useDebounce(query, 300);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const { data: recentIssues, isLoading: loadingRecent } = useQuery({
    queryKey: ['jira-recent-issues'],
    queryFn: () => getIssues(undefined, 'ORDER BY updated DESC', false),
    enabled: isOpen,
    staleTime: 60_000,
  });

  const { data: searchResults, isLoading: loadingSearch } = useQuery({
    queryKey: ['jira-search', debouncedQuery],
    queryFn: () => searchIssues(debouncedQuery),
    enabled: isOpen && debouncedQuery.length >= 2,
    staleTime: 30_000,
  });

  const isLoading = debouncedQuery.length >= 2 ? loadingSearch : loadingRecent;
  const issues: JiraIssue[] = debouncedQuery.length >= 2
    ? (searchResults ?? []).slice(0, 10)
    : (recentIssues ?? []).slice(0, 10);

  const getStatusVariant = (category: string) => {
    switch (category) {
      case 'done': return 'success' as const;
      case 'indeterminate': return 'primary' as const;
      default: return 'default' as const;
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Koble til Jira-issue" size="md">
      <div className={styles.picker}>
        <div className={styles.searchRow}>
          <Search size={16} className={styles.searchIcon} />
          <input
            ref={inputRef}
            type="text"
            className={styles.searchInput}
            placeholder="Søk etter issue-nøkkel eller tittel..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button className={styles.clearBtn} onClick={() => setQuery('')}>
              <X size={14} />
            </button>
          )}
        </div>

        <div className={styles.issueList}>
          {isLoading && (
            <div className={styles.loading}>Laster...</div>
          )}
          {!isLoading && issues.length === 0 && (
            <div className={styles.empty}>
              {debouncedQuery.length >= 2
                ? 'Ingen issues funnet'
                : 'Ingen issues tilgjengelig'}
            </div>
          )}
          {!isLoading && issues.map((issue) => (
            <button
              key={issue.key}
              className={styles.issueItem}
              onClick={() => { onSelect(issue.key); onClose(); }}
            >
              <div className={styles.issueTop}>
                <Badge variant="primary" size="sm">{issue.key}</Badge>
                <Badge variant={getStatusVariant(issue.status.category)} size="sm">
                  {issue.status.name}
                </Badge>
                <span className={styles.projectKey}>{issue.projectKey}</span>
              </div>
              <div className={styles.issueSummary}>{issue.summary}</div>
            </button>
          ))}
        </div>

        {!debouncedQuery && (
          <p className={styles.hint}>Viser 10 nylig oppdaterte issues</p>
        )}
      </div>
    </Modal>
  );
}
