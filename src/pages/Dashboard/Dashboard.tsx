import { useQuery } from '@tanstack/react-query';
import { FolderKanban, FileText, CheckSquare, Clock, AlertCircle, ExternalLink, User, Eye, BarChart2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, CardHeader, CardContent, Badge } from '../../components/common';
import { getProjects, getIssues, getMyIssues, getWatchedIssues } from '../../services/jiraService';
import { getRecentPages } from '../../services/confluenceService';
import { useTodoStore } from '../../store/todoStore';
import { isConfigured, getJiraBaseUrl } from '../../services/api';
import type { JiraIssue } from '../../types';
import { ActivityChart } from './ActivityChart';
import { TeamWorkload } from './TeamWorkload';
import styles from './Dashboard.module.css';

export function Dashboard() {
  const { getActiveTodos } = useTodoStore();
  const activeTodos = getActiveTodos();
  const configured = isConfigured();

  const { data: projects, isLoading: loadingProjects, isError: errorProjects } = useQuery({
    queryKey: ['projects'],
    queryFn: getProjects,
    enabled: configured,
  });

  const { data: recentIssues, isLoading: loadingIssues, isError: errorIssues } = useQuery({
    queryKey: ['recentIssues'],
    queryFn: () => getIssues(undefined, 'created >= -30d OR resolutiondate >= -30d ORDER BY created DESC'),
    enabled: configured,
  });

  const { data: myIssues, isLoading: loadingMyIssues, isError: errorMyIssues } = useQuery({
    queryKey: ['myIssues'],
    queryFn: getMyIssues,
    enabled: configured,
  });

  const { data: watchedIssues, isLoading: loadingWatched, isError: errorWatched } = useQuery({
    queryKey: ['watchedIssues'],
    queryFn: getWatchedIssues,
    enabled: configured,
  });

  const { data: openAssignedIssues } = useQuery({
    queryKey: ['openAssignedIssues'],
    queryFn: () => getIssues(undefined, 'resolution = EMPTY AND assignee is not EMPTY ORDER BY updated DESC'),
    enabled: configured,
  });

  const { data: recentPages, isLoading: loadingPages, isError: errorPages } = useQuery({
    queryKey: ['recentPages'],
    queryFn: () => getRecentPages(5),
    enabled: configured,
  });

  if (!configured) {
    return (
      <div className={styles.notConfigured}>
        <AlertCircle size={48} />
        <h2>API Not Configured</h2>
        <p>Please configure your Jira/Confluence credentials to get started.</p>
        <Link to="/settings" className={styles.configureLink}>
          Go to Settings
        </Link>
      </div>
    );
  }

  let jiraBaseUrl = '';
  try {
    jiraBaseUrl = getJiraBaseUrl();
  } catch {
    // Not configured
  }

  const myIssuesList = myIssues?.slice(0, 5) || [];
  const watchedIssuesList = watchedIssues?.slice(0, 5) || [];

  const renderError = (message = 'Kunne ikke laste data') => (
    <p className={styles.apiError}>
      <AlertCircle size={14} />
      {message} — <Link to="/settings">Sjekk API-innstillinger</Link>
    </p>
  );

  const renderIssueList = (issues: JiraIssue[], emptyMessage: string) => {
    if (issues.length === 0) {
      return <p className={styles.empty}>{emptyMessage}</p>;
    }
    return (
      <ul className={styles.issueList}>
        {issues.map((issue) => (
          <li key={issue.id} className={styles.issueItem}>
            <div className={styles.issueMain}>
              <a
                href={`${jiraBaseUrl}/browse/${issue.key}`}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.issueKey}
              >
                {issue.key}
              </a>
              <span className={styles.issueSummary}>{issue.summary}</span>
            </div>
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
            {issue.description && (
              <div className={styles.issueTooltip}>
                <div className={styles.tooltipHeader}>
                  <strong>{issue.key}</strong> - {issue.summary}
                </div>
                <p className={styles.tooltipDescription}>{issue.description}</p>
                {(issue.assignee || issue.dueDate) && (
                  <div className={styles.tooltipMeta}>
                    {issue.assignee && <span>Ansvarlig: {issue.assignee.displayName}</span>}
                    {issue.dueDate && <span>Frist: {new Date(issue.dueDate).toLocaleDateString('nb-NO')}</span>}
                  </div>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    );
  };

  return (
    <div className={styles.dashboard}>
      {/* Stats */}
      <div className={styles.stats}>
        <Card className={styles.statCard}>
          <CardContent>
            <div className={styles.statIcon}>
              <FolderKanban size={24} />
            </div>
            <div className={styles.statValue}>{loadingProjects ? '–' : errorProjects ? '!' : (projects?.length || 0)}</div>
            <div className={styles.statLabel}>Prosjekter</div>
          </CardContent>
        </Card>

        <Card className={styles.statCard}>
          <CardContent>
            <div className={styles.statIcon}>
              <User size={24} />
            </div>
            <div className={styles.statValue}>{loadingMyIssues ? '–' : (myIssues?.length || 0)}</div>
            <div className={styles.statLabel}>Mine åpne saker</div>
          </CardContent>
        </Card>

        <Card className={styles.statCard}>
          <CardContent>
            <div className={styles.statIcon}>
              <Eye size={24} />
            </div>
            <div className={styles.statValue}>{loadingWatched ? '–' : (watchedIssues?.length || 0)}</div>
            <div className={styles.statLabel}>Fulgte saker</div>
          </CardContent>
        </Card>

        <Card className={styles.statCard}>
          <CardContent>
            <div className={styles.statIcon}>
              <CheckSquare size={24} />
            </div>
            <div className={styles.statValue}>{activeTodos.length}</div>
            <div className={styles.statLabel}>Aktive gjøremål</div>
          </CardContent>
        </Card>
      </div>

      <div className={styles.grid}>
        {/* Mine saker */}
        <Card>
          <CardHeader>
            <div className={styles.cardHeaderContent}>
              <h3><User size={18} /> Mine åpne saker</h3>
              <Link to="/projects?filter=mine" className={styles.viewAll}>
                Se alle
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {loadingMyIssues
              ? <p className={styles.empty}>Laster...</p>
              : errorMyIssues
              ? renderError('Kunne ikke laste dine saker')
              : renderIssueList(myIssuesList, 'Ingen saker tildelt deg')}
          </CardContent>
        </Card>

        {/* Fulgte saker */}
        <Card>
          <CardHeader>
            <div className={styles.cardHeaderContent}>
              <h3><Eye size={18} /> Fulgte saker</h3>
            </div>
          </CardHeader>
          <CardContent>
            {loadingWatched
              ? <p className={styles.empty}>Laster...</p>
              : errorWatched
              ? renderError('Kunne ikke laste fulgte saker')
              : renderIssueList(watchedIssuesList, 'Ingen fulgte saker')}
          </CardContent>
        </Card>

        {/* Aktivitet siste 30 dager */}
        <Card className={styles.chartCard}>
          <CardHeader>
            <div className={styles.cardHeaderContent}>
              <h3><Clock size={18} /> Aktivitet siste 30 dager</h3>
            </div>
          </CardHeader>
          <CardContent>
            {loadingIssues
              ? <p className={styles.empty}>Laster...</p>
              : errorIssues
              ? renderError('Kunne ikke laste aktivitet')
              : <ActivityChart issues={recentIssues || []} />}
          </CardContent>
        </Card>

        {/* Åpne saker per person */}
        <Card>
          <CardHeader>
            <div className={styles.cardHeaderContent}>
              <h3><BarChart2 size={18} /> Åpne saker per person</h3>
            </div>
          </CardHeader>
          <CardContent>
            <TeamWorkload issues={openAssignedIssues || []} />
          </CardContent>
        </Card>

        {/* Siste aktivitet */}
        <Card>
          <CardHeader>
            <div className={styles.cardHeaderContent}>
              <h3><Clock size={18} /> Siste aktivitet</h3>
              <Link to="/projects" className={styles.viewAll}>
                Se prosjekter
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {loadingIssues
              ? <p className={styles.empty}>Laster...</p>
              : errorIssues
              ? renderError('Kunne ikke laste siste aktivitet')
              : renderIssueList(recentIssues?.slice(0, 5) || [], 'Ingen nylig aktivitet')}
          </CardContent>
        </Card>

        {/* Siste Confluence-sider */}
        <Card>
          <CardHeader>
            <div className={styles.cardHeaderContent}>
              <h3>Siste sider</h3>
              <Link to="/confluence" className={styles.viewAll}>
                Se alle
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {loadingPages ? (
              <p className={styles.empty}>Laster...</p>
            ) : errorPages ? (
              renderError('Kunne ikke laste Confluence-sider')
            ) : recentPages?.length === 0 ? (
              <p className={styles.empty}>Ingen sider nylig</p>
            ) : (
              <ul className={styles.pageList}>
                {recentPages?.map((page) => (
                  <li key={page.id} className={styles.pageItem}>
                    <div className={styles.pageMain}>
                      <FileText size={16} className={styles.pageIcon} />
                      <span className={styles.pageTitle}>{page.title}</span>
                    </div>
                    <a
                      href={page.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.pageLink}
                    >
                      <ExternalLink size={14} />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Mine gjøremål */}
        <Card>
          <CardHeader>
            <div className={styles.cardHeaderContent}>
              <h3>Mine gjøremål</h3>
              <Link to="/todos" className={styles.viewAll}>
                Se alle
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {activeTodos.length === 0 ? (
              <p className={styles.empty}>Ingen aktive gjøremål</p>
            ) : (
              <ul className={styles.todoList}>
                {activeTodos.slice(0, 5).map((todo) => (
                  <li key={todo.id} className={styles.todoItem}>
                    <span className={styles.todoContent}>{todo.content}</span>
                    <Badge
                      variant={
                        todo.priority === 'high'
                          ? 'danger'
                          : todo.priority === 'medium'
                          ? 'warning'
                          : 'default'
                      }
                      size="sm"
                    >
                      {todo.priority}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
