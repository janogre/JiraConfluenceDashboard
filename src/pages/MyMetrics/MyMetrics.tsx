import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Clock, ListTodo, AlertCircle } from 'lucide-react';
import { Card, CardHeader, CardContent, LoadingSpinner } from '../../components/common';
import { getIssues, getCurrentUser, getMyIssues } from '../../services/jiraService';
import { isConfigured } from '../../services/api';
import type { JiraIssue } from '../../types';
import styles from './MyMetrics.module.css';

type Period = '30d' | '90d' | '180d';

function workdaysBetween(start: string, end: string): number {
  let count = 0;
  const cur = new Date(start);
  const endDate = new Date(end);
  while (cur <= endDate) {
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

function groupByWeek(issues: JiraIssue[]): { label: string; count: number }[] {
  const weeks: Record<string, number> = {};
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i * 7);
    const key = `Uke ${getISOWeek(d)}`;
    weeks[key] = 0;
  }
  issues.forEach((issue) => {
    if (!issue.resolutionDate) return;
    const d = new Date(issue.resolutionDate);
    const key = `Uke ${getISOWeek(d)}`;
    if (key in weeks) weeks[key]++;
  });
  return Object.entries(weeks).map(([label, count]) => ({ label, count }));
}

function getISOWeek(d: Date): number {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
  const week1 = new Date(date.getFullYear(), 0, 4);
  return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string | number; color: string }) {
  return (
    <div className={`${styles.statCard} ${styles[`stat_${color}`]}`}>
      <div className={styles.statIcon}>{icon}</div>
      <div className={styles.statValue}>{value}</div>
      <div className={styles.statLabel}>{label}</div>
    </div>
  );
}

export function MyMetrics() {
  const [period, setPeriod] = useState<Period>('30d');
  const configured = isConfigured();

  const periodDays = { '30d': 30, '90d': 90, '180d': 180 };

  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: getCurrentUser,
    enabled: configured,
  });

  const { data: resolved = [], isLoading: loadingResolved } = useQuery({
    queryKey: ['my-resolved'],
    queryFn: () => getIssues(
      undefined,
      'assignee = currentUser() AND statusCategory = Done AND updated >= -180d ORDER BY updated DESC',
      true
    ),
    enabled: configured,
  });

  const { data: activeIssues = [], isLoading: loadingActive } = useQuery({
    queryKey: ['myIssues'],
    queryFn: getMyIssues,
    enabled: configured,
  });

  const loading = loadingResolved || loadingActive;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - periodDays[period]);

  const filteredResolved = resolved.filter(
    (i) => i.resolutionDate && new Date(i.resolutionDate) >= cutoff
  );

  const last30cutoff = new Date();
  last30cutoff.setDate(last30cutoff.getDate() - 30);
  const resolvedLast30 = resolved.filter(
    (i) => i.resolutionDate && new Date(i.resolutionDate) >= last30cutoff
  );

  const avgResolutionDays = filteredResolved.length > 0
    ? Math.round(
        filteredResolved.reduce((sum, i) => {
          if (!i.resolutionDate) return sum;
          return sum + workdaysBetween(i.created, i.resolutionDate);
        }, 0) / filteredResolved.length
      )
    : 0;

  const highPrioOpen = activeIssues.filter(
    (i) => i.priority?.name === 'High' || i.priority?.name === 'Highest'
  ).length;

  const statusGroups = activeIssues.reduce<Record<string, number>>((acc, i) => {
    const cat = i.status.category;
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {});

  const weeklyData = groupByWeek(resolved);
  const maxCount = Math.max(...weeklyData.map((w) => w.count), 1);

  const last10Resolved = filteredResolved.slice(0, 10);

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
      {currentUser && (
        <div className={styles.userHeader}>
          {currentUser.avatarUrl && (
            <img src={currentUser.avatarUrl} alt="" className={styles.userAvatar} />
          )}
          <div>
            <h2 className={styles.userName}>{currentUser.displayName}</h2>
            {currentUser.emailAddress && (
              <p className={styles.userEmail}>{currentUser.emailAddress}</p>
            )}
          </div>
          <div className={styles.periodPicker}>
            {(['30d', '90d', '180d'] as Period[]).map((p) => (
              <button
                key={p}
                className={`${styles.periodBtn} ${period === p ? styles.periodBtnActive : ''}`}
                onClick={() => setPeriod(p)}
              >
                {p === '30d' ? 'Siste 30d' : p === '90d' ? 'Siste 90d' : 'Siste 6mnd'}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <LoadingSpinner />
      ) : (
        <>
          <div className={styles.statsGrid}>
            <StatCard
              icon={<CheckCircle2 size={24} />}
              label="Løst siste 30d"
              value={resolvedLast30.length}
              color="green"
            />
            <StatCard
              icon={<Clock size={24} />}
              label="Gjsn. løsningstid (arbeidsdager)"
              value={avgResolutionDays}
              color="blue"
            />
            <StatCard
              icon={<ListTodo size={24} />}
              label="Aktive issues"
              value={activeIssues.length}
              color="purple"
            />
            <StatCard
              icon={<AlertCircle size={24} />}
              label="Høy prioritet åpne"
              value={highPrioOpen}
              color="red"
            />
          </div>

          <div className={styles.chartsRow}>
            <Card className={styles.chartCard}>
              <CardHeader>
                <h3>Løste issues per uke (siste 12 uker)</h3>
              </CardHeader>
              <CardContent>
                <div className={styles.barChart}>
                  {weeklyData.map((w) => (
                    <div key={w.label} className={styles.barGroup}>
                      <div className={styles.barWrap}>
                        <div
                          className={styles.bar}
                          style={{ height: `${(w.count / maxCount) * 100}%` }}
                          title={`${w.count} issues`}
                        />
                      </div>
                      <span className={styles.barLabel}>{w.label.replace('Uke ', 'U')}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className={styles.chartCard}>
              <CardHeader>
                <h3>Status-fordeling (aktive)</h3>
              </CardHeader>
              <CardContent>
                <div className={styles.statusList}>
                  {Object.entries(statusGroups).map(([cat, count]) => (
                    <div key={cat} className={styles.statusRow}>
                      <span className={`${styles.statusDot} ${styles[`dot_${cat}`]}`} />
                      <span className={styles.statusName}>
                        {cat === 'new' ? 'Å gjøre' : cat === 'indeterminate' ? 'Pågående' : 'Ferdig'}
                      </span>
                      <span className={styles.statusCount}>{count}</span>
                      <div className={styles.statusBar}>
                        <div
                          className={`${styles.statusBarFill} ${styles[`fill_${cat}`]}`}
                          style={{ width: `${(count / activeIssues.length) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                  {activeIssues.length === 0 && (
                    <p className={styles.empty}>Ingen aktive issues</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <h3>Siste {last10Resolved.length} løste issues</h3>
            </CardHeader>
            <CardContent>
              {last10Resolved.length === 0 ? (
                <p className={styles.empty}>Ingen issues løst i valgt periode.</p>
              ) : (
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Nøkkel</th>
                      <th>Sammendrag</th>
                      <th>Løsningstid (dager)</th>
                      <th>Løst</th>
                    </tr>
                  </thead>
                  <tbody>
                    {last10Resolved.map((issue) => (
                      <tr key={issue.id}>
                        <td>
                          <span className={styles.issueKey}>{issue.key}</span>
                        </td>
                        <td>{issue.summary}</td>
                        <td>
                          {issue.resolutionDate
                            ? workdaysBetween(issue.created, issue.resolutionDate)
                            : '-'}
                        </td>
                        <td>
                          {issue.resolutionDate
                            ? new Date(issue.resolutionDate).toLocaleDateString('nb-NO')
                            : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
