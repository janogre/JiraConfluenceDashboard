import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { getIssuesByComponents } from '../../services/jiraService';
import { getJiraBaseUrl, isConfigured } from '../../services/api';
import { IssueModal } from '../Board/IssueModal';
import { IssueList } from '../Board/IssueList';
import type { JiraIssue } from '../../types';
import type { TeamName } from '../../store/teamStore';
import styles from './Team.module.css';

interface TeamCoordinatorProps {
  teamName: TeamName;
  componentNames: string[];
}

const today = new Date(new Date().toDateString());

function isOverdue(dateStr?: string): boolean {
  return !!dateStr && new Date(dateStr) < today;
}

export function TeamCoordinator({ teamName, componentNames }: TeamCoordinatorProps) {
  const [selectedIssue, setSelectedIssue] = useState<JiraIssue | null>(null);
  const [filterPriority, setFilterPriority] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterComponent, setFilterComponent] = useState('');
  const queryClient = useQueryClient();
  const jiraBaseUrl = getJiraBaseUrl();
  const configured = isConfigured();

  const queryKey = ['teamIssues', teamName, componentNames] as const;

  const { data: issues = [], isLoading, refetch } = useQuery({
    queryKey,
    queryFn: () => getIssuesByComponents(componentNames),
    enabled: configured && componentNames.length > 0,
  });

  // Statistikk
  const openIssues = issues.filter((i) => i.status.category !== 'done');
  const overdueIssues = issues.filter((i) => i.status.category !== 'done' && isOverdue(i.dueDate));
  const unassignedIssues = issues.filter((i) => !i.assignee);
  const highPriorityIssues = issues.filter(
    (i) => i.status.category !== 'done' && (i.priority?.name === 'High' || i.priority?.name === 'Highest')
  );

  // Arbeidsbelastning per person
  const workloadMap = new Map<string, number>();
  issues.filter((i) => i.assignee).forEach((i) => {
    const name = i.assignee!.displayName;
    workloadMap.set(name, (workloadMap.get(name) ?? 0) + 1);
  });
  const workloadEntries = [...workloadMap.entries()].sort((a, b) => b[1] - a[1]);
  const maxWorkload = workloadEntries[0]?.[1] ?? 1;

  // Statusfordeling
  const doneCount = issues.filter((i) => i.status.category === 'done').length;
  const inProgressCount = issues.filter((i) => i.status.category === 'indeterminate').length;
  const todoCount = issues.filter((i) => i.status.category === 'new').length;
  const total = issues.length || 1;

  // Filtrert saksliste
  const filteredIssues = issues.filter((i) => {
    if (filterPriority && i.priority?.name !== filterPriority) return false;
    if (filterStatus) {
      if (filterStatus.startsWith('cat:')) {
        if (i.status.category !== filterStatus.slice(4)) return false;
      } else {
        if (i.status.name !== filterStatus) return false;
      }
    }
    if (filterComponent && !i.components.some((c) => c.name === filterComponent)) return false;
    return true;
  });

  const availablePriorities = [...new Set(issues.map((i) => i.priority?.name).filter(Boolean) as string[])];
  const availableStatuses = [...new Map(issues.map((i) => [i.status.name, i.status])).values()].sort((a, b) => {
    const order = { new: 0, indeterminate: 1, done: 2 };
    return order[a.category] - order[b.category];
  });

  if (isLoading) return <div className={styles.loadingState}>Laster saker…</div>;

  return (
    <>
      {/* Statistikkort */}
      <div className={styles.statsRow}>
        <div className={styles.statCard}>
          <div className={`${styles.statValue} ${styles.statPrimary}`}>{openIssues.length}</div>
          <div className={styles.statLabel}>Åpne saker</div>
        </div>
        <div className={styles.statCard}>
          <div className={`${styles.statValue} ${styles.statDanger}`}>{overdueIssues.length}</div>
          <div className={styles.statLabel}>Forfalt</div>
        </div>
        <div className={styles.statCard}>
          <div className={`${styles.statValue} ${styles.statWarning}`}>{unassignedIssues.length}</div>
          <div className={styles.statLabel}>Uten ansvarlig</div>
        </div>
        <div className={styles.statCard}>
          <div className={`${styles.statValue} ${styles.statDanger}`}>{highPriorityIssues.length}</div>
          <div className={styles.statLabel}>Høy prioritet</div>
        </div>
      </div>

      {/* Midt-rad */}
      <div className={styles.midRow}>
        {/* Arbeidsbelastning */}
        <div className={styles.panel}>
          <div className={styles.panelTitle}>Belastning per person</div>
          {workloadEntries.length === 0 ? (
            <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
              Ingen tildelte saker
            </div>
          ) : (
            workloadEntries.map(([name, count]) => (
              <div key={name} className={styles.workloadRow}>
                <span className={styles.workloadName} title={name}>{name}</span>
                <div className={styles.workloadBar}>
                  <div
                    className={styles.workloadFill}
                    style={{ width: `${(count / maxWorkload) * 100}%` }}
                  />
                </div>
                <span className={styles.workloadCount}>{count}</span>
              </div>
            ))
          )}
        </div>

        {/* Statusfordeling */}
        <div className={styles.panel}>
          <div className={styles.panelTitle}>Statusfordeling</div>
          <div className={styles.statusBar}>
            {doneCount > 0 && (
              <div
                className={styles.statusBarDone}
                style={{ flex: doneCount / total }}
                title={`Ferdig: ${doneCount}`}
              />
            )}
            {inProgressCount > 0 && (
              <div
                className={styles.statusBarInProgress}
                style={{ flex: inProgressCount / total }}
                title={`Pågår: ${inProgressCount}`}
              />
            )}
            {todoCount > 0 && (
              <div
                className={styles.statusBarTodo}
                style={{ flex: todoCount / total }}
                title={`Å gjøre: ${todoCount}`}
              />
            )}
          </div>
          <div className={styles.statusLegend}>
            <span>
              <span className={styles.statusLegendDot} style={{ background: '#2ecc71' }} />
              Ferdig ({doneCount})
            </span>
            <span>
              <span className={styles.statusLegendDot} style={{ background: 'var(--color-primary)' }} />
              Pågår ({inProgressCount})
            </span>
            <span>
              <span className={styles.statusLegendDot} style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }} />
              Å gjøre ({todoCount})
            </span>
          </div>
        </div>
      </div>

      {/* Saksliste */}
      <div className={styles.issueSection}>
        <div className={styles.issueSectionHeader}>
          <span className={styles.issueSectionTitle}>Alle saker ({filteredIssues.length})</span>
          <div className={styles.filterBar}>
            {availablePriorities.length > 0 && (
              <select
                className={styles.filterSelect}
                value={filterPriority}
                onChange={(e) => setFilterPriority(e.target.value)}
              >
                <option value="">Alle prioriteter</option>
                {availablePriorities.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            )}
            {availableStatuses.length > 0 && (
              <select
                className={styles.filterSelect}
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
              >
                <option value="">Alle statuser</option>
                <optgroup label="Kategori">
                  <option value="cat:new">Å gjøre</option>
                  <option value="cat:indeterminate">Pågår</option>
                  <option value="cat:done">Ferdig</option>
                </optgroup>
                <optgroup label="Spesifikk status">
                  {availableStatuses.map((s) => (
                    <option key={s.name} value={s.name}>{s.name}</option>
                  ))}
                </optgroup>
              </select>
            )}
            {componentNames.length > 1 && (
              <select
                className={styles.filterSelect}
                value={filterComponent}
                onChange={(e) => setFilterComponent(e.target.value)}
              >
                <option value="">Alle komponenter</option>
                {componentNames.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            )}
            <button
              onClick={() => refetch()}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center' }}
              title="Oppdater"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </div>
        <IssueList
          issues={filteredIssues}
          jiraBaseUrl={jiraBaseUrl}
          onIssueClick={setSelectedIssue}
        />
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
