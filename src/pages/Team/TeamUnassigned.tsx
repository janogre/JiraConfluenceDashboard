import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { UserPlus, ChevronDown, CheckSquare } from 'lucide-react';
import { getIssuesByComponents, searchJiraUsers, assignIssue } from '../../services/jiraService';
import { getJiraBaseUrl, isConfigured } from '../../services/api';
import { IssueModal } from '../Board/IssueModal';
import type { JiraIssue, JiraUser } from '../../types';
import type { TeamName } from '../../store/teamStore';
import styles from './Team.module.css';

interface TeamUnassignedProps {
  teamName: TeamName;
  componentNames: string[];
}

export function TeamUnassigned({ teamName, componentNames }: TeamUnassignedProps) {
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [openAssignRow, setOpenAssignRow] = useState<string | null>(null);
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false);
  const [rowSearch, setRowSearch] = useState('');
  const [bulkSearch, setBulkSearch] = useState('');
  const [selectedIssue, setSelectedIssue] = useState<JiraIssue | null>(null);
  const bulkRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const jiraBaseUrl = getJiraBaseUrl();
  const configured = isConfigured();

  const queryKey = ['teamIssues', teamName, componentNames] as const;

  const { data: allIssues = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => getIssuesByComponents(componentNames),
    enabled: configured && componentNames.length > 0,
  });

  const issues = allIssues.filter((i) => !i.assignee);

  // Brukersøk for rad
  const { data: rowUsers = [] } = useQuery({
    queryKey: ['userSearch', rowSearch],
    queryFn: () => searchJiraUsers(rowSearch),
    enabled: !!openAssignRow && rowSearch.length >= 1,
  });

  // Brukersøk for bulk
  const { data: bulkUsers = [] } = useQuery({
    queryKey: ['userSearch', bulkSearch],
    queryFn: () => searchJiraUsers(bulkSearch),
    enabled: bulkAssignOpen && bulkSearch.length >= 1,
  });

  const { mutate: doAssign } = useMutation({
    mutationFn: ({ issueKey, accountId }: { issueKey: string; accountId: string; displayName: string }) =>
      assignIssue(issueKey, accountId),
    onSuccess: (_, { issueKey, displayName }) => {
      queryClient.setQueryData<JiraIssue[]>(queryKey, (old) =>
        (old ?? []).map((i) =>
          i.key === issueKey
            ? { ...i, assignee: { displayName } }
            : i
        )
      );
    },
  });

  const handleAssignRow = (issue: JiraIssue, user: JiraUser) => {
    doAssign({ issueKey: issue.key, accountId: user.accountId, displayName: user.displayName });
    setOpenAssignRow(null);
    setRowSearch('');
  };

  const handleAssignBulk = (user: JiraUser) => {
    [...selectedKeys].forEach((key) => {
      doAssign({ issueKey: key, accountId: user.accountId, displayName: user.displayName });
    });
    setSelectedKeys(new Set());
    setBulkAssignOpen(false);
    setBulkSearch('');
  };

  const toggleRow = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedKeys.size === issues.length) {
      setSelectedKeys(new Set());
    } else {
      setSelectedKeys(new Set(issues.map((i) => i.key)));
    }
  };

  // Lukk bulk-dropdown ved klikk utenfor
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (bulkRef.current && !bulkRef.current.contains(e.target as Node)) {
        setBulkAssignOpen(false);
        setBulkSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (isLoading) return <div className={styles.loadingState}>Laster saker…</div>;

  if (issues.length === 0) {
    return (
      <div className={styles.emptyState}>
        <CheckSquare size={32} />
        <p>Alle saker for <strong>{teamName}</strong> har en ansvarlig. Bra jobbet!</p>
      </div>
    );
  }

  const priorityColor = (name?: string) => {
    switch (name?.toLowerCase()) {
      case 'highest':
      case 'high': return '#e74c3c';
      case 'medium': return '#f39c12';
      default: return 'var(--color-text-secondary)';
    }
  };

  return (
    <>
      {/* Verktøylinje */}
      <div className={styles.toolbar}>
        {selectedKeys.size > 0 ? (
          <>
            <span className={styles.toolbarCount}>{selectedKeys.size} valgt</span>
            <div ref={bulkRef} style={{ position: 'relative' }}>
              <button
                className={styles.assignBtn}
                onClick={() => { setBulkAssignOpen((v) => !v); setBulkSearch(''); }}
              >
                <UserPlus size={14} />
                Tildel valgte
                <ChevronDown size={12} />
              </button>
              {bulkAssignOpen && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 100,
                  background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)', minWidth: 220,
                }}>
                  <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--color-border)' }}>
                    <input
                      className={styles.assignSearch}
                      placeholder="Søk etter person…"
                      value={bulkSearch}
                      onChange={(e) => setBulkSearch(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                    {bulkUsers.map((u) => (
                      <div
                        key={u.accountId}
                        className={styles.assignOption}
                        onClick={() => handleAssignBulk(u)}
                      >
                        {u.displayName}
                      </div>
                    ))}
                    {bulkSearch.length >= 1 && bulkUsers.length === 0 && (
                      <div style={{ padding: '8px', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
                        Ingen treff
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
            {issues.length} utildelte oppgaver — velg rader for bulktildeling
          </span>
        )}
      </div>

      {/* Tabell */}
      <div className={styles.unassignedTable}>
        <div className={styles.tableHeader}>
          <div>
            <input
              type="checkbox"
              checked={selectedKeys.size === issues.length && issues.length > 0}
              onChange={toggleAll}
              style={{ accentColor: 'var(--color-primary)' }}
            />
          </div>
          <div>Sak</div>
          <div>Komponent</div>
          <div>Prioritet</div>
          <div>Status</div>
          <div>Tildel</div>
        </div>

        {issues.map((issue) => (
          <div key={issue.key}>
            <div
              className={`${styles.tableRow} ${selectedKeys.has(issue.key) ? styles.tableRowSelected : ''}`}
            >
              <div>
                <input
                  type="checkbox"
                  checked={selectedKeys.has(issue.key)}
                  onChange={() => toggleRow(issue.key)}
                  style={{ accentColor: 'var(--color-primary)' }}
                />
              </div>
              <div style={{ overflow: 'hidden' }}>
                <span className={styles.issueKey}>{issue.key} </span>
                <span
                  className={styles.issueSummary}
                  onClick={() => setSelectedIssue(issue)}
                  title={issue.summary}
                >
                  {issue.summary}
                </span>
              </div>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                {issue.components.map((c) => c.name).join(', ')}
              </div>
              <div style={{ fontSize: 'var(--font-size-xs)', color: priorityColor(issue.priority?.name) }}>
                {issue.priority?.name ?? '—'}
              </div>
              <div style={{ fontSize: 'var(--font-size-xs)' }}>{issue.status.name}</div>
              <div>
                <button
                  className={styles.assignBtn}
                  style={{ fontSize: '11px', padding: '2px 8px' }}
                  onClick={() => {
                    setOpenAssignRow(openAssignRow === issue.key ? null : issue.key);
                    setRowSearch('');
                  }}
                >
                  <UserPlus size={12} />
                  Tildel
                </button>
              </div>
            </div>

            {openAssignRow === issue.key && (
              <div className={styles.assignPopup}>
                <input
                  className={styles.assignSearch}
                  placeholder="Søk etter person…"
                  value={rowSearch}
                  onChange={(e) => setRowSearch(e.target.value)}
                  autoFocus
                />
                <div style={{ marginTop: 4 }}>
                  {rowUsers.map((u) => (
                    <div
                      key={u.accountId}
                      className={styles.assignOption}
                      onClick={() => handleAssignRow(issue, u)}
                    >
                      {u.displayName}
                    </div>
                  ))}
                  {rowSearch.length >= 1 && rowUsers.length === 0 && (
                    <div style={{ padding: '4px 8px', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
                      Ingen treff
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {selectedIssue && (
        <IssueModal
          issue={selectedIssue}
          jiraBaseUrl={jiraBaseUrl}
          isOpen={!!selectedIssue}
          onClose={() => setSelectedIssue(null)}
          onTransitioned={(issueKey, newStatus) => {
            queryClient.setQueryData<JiraIssue[]>(queryKey, (old) =>
              (old ?? []).map((i) =>
                i.key === issueKey ? { ...i, status: newStatus } : i
              )
            );
            setSelectedIssue((prev) => (prev ? { ...prev, status: newStatus } : null));
          }}
        />
      )}
    </>
  );
}
