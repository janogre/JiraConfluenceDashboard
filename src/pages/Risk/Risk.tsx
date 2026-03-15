import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Clock, UserX, Link, RefreshCw } from 'lucide-react';
import { Card, CardHeader, CardContent, LoadingSpinner } from '../../components/common';
import { getIssues, getProjects } from '../../services/jiraService';
import { isConfigured } from '../../services/api';
import type { JiraIssue } from '../../types';
import styles from './Risk.module.css';

type RiskTab = 'forfalt' | 'foreldet' | 'foreldreløs' | 'blokkert';

function loadStarredProjects(): Set<string> {
  try {
    const raw = localStorage.getItem('board_starred_projects');
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function projectPrefix(key: string): string {
  return key ? `project = "${key}" AND ` : '';
}

function daysDiff(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

function IssueCard({ issue, showDue }: { issue: JiraIssue; showDue?: boolean }) {
  const daysOld = daysDiff(issue.updated);
  const daysDue = issue.dueDate ? daysDiff(issue.dueDate) : null;

  return (
    <div className={styles.issueCard}>
      <div className={styles.issueHeader}>
        <a
          className={styles.issueKey}
          href={`https://jira.atlassian.com/browse/${issue.key}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          {issue.key}
        </a>
        {issue.priority && (
          <span className={styles.priority}>{issue.priority.name}</span>
        )}
      </div>
      <p className={styles.issueSummary}>{issue.summary}</p>
      <div className={styles.issueMeta}>
        {issue.assignee ? (
          <span className={styles.assignee}>
            {issue.assignee.avatarUrl && (
              <img src={issue.assignee.avatarUrl} alt="" className={styles.avatar} />
            )}
            {issue.assignee.displayName}
          </span>
        ) : (
          <span className={styles.unassigned}>Ikke tildelt</span>
        )}
        {showDue && daysDue !== null && (
          <span className={`${styles.badge} ${daysDue > 0 ? styles.badgeRed : styles.badgeOrange}`}>
            {daysDue > 0 ? `Forfalt for ${daysDue}d siden` : `Forfaller om ${-daysDue}d`}
          </span>
        )}
        {!showDue && (
          <span className={styles.badgeGray}>Oppdatert for {daysOld}d siden</span>
        )}
      </div>
    </div>
  );
}

export function Risk() {
  const [activeTab, setActiveTab] = useState<RiskTab>('forfalt');
  const [selectedProject, setSelectedProject] = useState('');
  const configured = isConfigured();
  const starredProjects = loadStarredProjects();

  const { data: projects = [], isLoading: loadingProjects } = useQuery({
    queryKey: ['projects'],
    queryFn: getProjects,
    enabled: configured,
  });

  const p = projectPrefix(selectedProject);

  const { data: forfalt = [], isLoading: l1 } = useQuery({
    queryKey: ['risk-forfalt', selectedProject],
    queryFn: () => getIssues(undefined, `${p}duedate < now() AND statusCategory != Done ORDER BY duedate ASC`),
    enabled: configured,
  });

  const { data: foreldet = [], isLoading: l2 } = useQuery({
    queryKey: ['risk-foreldet', selectedProject],
    queryFn: () => getIssues(undefined, `${p}updated <= -14d AND statusCategory != Done ORDER BY updated ASC`),
    enabled: configured,
  });

  const { data: foreldreløs = [], isLoading: l3 } = useQuery({
    queryKey: ['risk-foreldreløs', selectedProject],
    queryFn: () => getIssues(undefined, `${p}assignee is EMPTY AND statusCategory != Done ORDER BY created ASC`),
    enabled: configured,
  });

  const { data: aktive = [], isLoading: l4 } = useQuery({
    queryKey: ['risk-aktive', selectedProject],
    queryFn: () => getIssues(undefined, `${p}statusCategory != Done ORDER BY updated DESC`),
    enabled: configured,
  });

  const blokkert = aktive.filter((issue) =>
    issue.links?.some(
      (link) =>
        link.type.inward === 'is blocked by' &&
        link.inwardIssue?.status.category !== 'done'
    )
  );

  const loading = l1 || l2 || l3 || l4;

  const tabs: { id: RiskTab; label: string; count: number; icon: React.ReactNode; color: string }[] = [
    { id: 'forfalt',     label: 'Forfalt',     count: forfalt.length,     icon: <Clock size={16} />,     color: 'red'    },
    { id: 'foreldet',    label: 'Foreldet',    count: foreldet.length,    icon: <RefreshCw size={16} />, color: 'orange' },
    { id: 'foreldreløs', label: 'Foreldreløs', count: foreldreløs.length, icon: <UserX size={16} />,     color: 'yellow' },
    { id: 'blokkert',    label: 'Blokkert',    count: blokkert.length,    icon: <Link size={16} />,      color: 'gray'   },
  ];

  const currentIssues: Record<RiskTab, JiraIssue[]> = {
    forfalt,
    foreldet,
    foreldreløs,
    blokkert,
  };

  if (!configured) {
    return (
      <div className={styles.container}>
        <Card>
          <CardContent>
            <p>Konfigurer API-tilkobling under Settings først.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.projectBar}>
        <label className={styles.projectBarLabel} htmlFor="risk-project-select">Prosjekt</label>
        <select
          id="risk-project-select"
          className={styles.projectSelect}
          value={selectedProject}
          onChange={(e) => setSelectedProject(e.target.value)}
          disabled={loadingProjects}
        >
          <option value="">— Alle prosjekter —</option>
          {starredProjects.size > 0 && (
            <optgroup label="Stjernemerket">
              {projects
                .filter((p) => starredProjects.has(p.key))
                .map((p) => (
                  <option key={p.key} value={p.key}>★ {p.name}</option>
                ))}
            </optgroup>
          )}
          <optgroup label="Alle prosjekter">
            {projects
              .filter((p) => !starredProjects.has(p.key))
              .map((p) => (
                <option key={p.key} value={p.key}>{p.name}</option>
              ))}
          </optgroup>
        </select>
      </div>

      <div className={styles.summaryRow}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`${styles.summaryCard} ${styles[`summary_${tab.color}`]}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.icon}
            <span className={styles.summaryCount}>{loading ? '…' : tab.count}</span>
            <span className={styles.summaryLabel}>{tab.label}</span>
          </button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <div className={styles.tabNav}>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                className={`${styles.tab} ${activeTab === tab.id ? styles.tabActive : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.icon}
                {tab.label}
                <span className={styles.tabCount}>{loading ? '…' : tab.count}</span>
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <LoadingSpinner />
          ) : currentIssues[activeTab].length === 0 ? (
            <div className={styles.empty}>
              <AlertTriangle size={32} />
              <p>Ingen issues i denne kategorien</p>
            </div>
          ) : (
            <div className={styles.issueList}>
              {currentIssues[activeTab].map((issue) => (
                <IssueCard
                  key={issue.id}
                  issue={issue}
                  showDue={activeTab === 'forfalt'}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
