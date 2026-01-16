import { useQuery } from '@tanstack/react-query';
import { FolderKanban, FileText, CheckSquare, Clock, AlertCircle, ExternalLink, User, Eye, Star } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, CardHeader, CardContent, Badge, LoadingOverlay } from '../../components/common';
import { getProjects, getIssues, getMyIssues, getWatchedIssues, getFavoriteFilters, runFilter } from '../../services/jiraService';
import { getRecentPages } from '../../services/confluenceService';
import { useTodoStore } from '../../store/todoStore';
import { isConfigured, getJiraBaseUrl } from '../../services/api';
import type { JiraIssue, JiraFilter } from '../../types';
import { useState } from 'react';
import styles from './Dashboard.module.css';

export function Dashboard() {
  const { getActiveTodos } = useTodoStore();
  const activeTodos = getActiveTodos();
  const configured = isConfigured();
  const [selectedFilter, setSelectedFilter] = useState<JiraFilter | null>(null);

  const { data: projects, isLoading: loadingProjects } = useQuery({
    queryKey: ['projects'],
    queryFn: getProjects,
    enabled: configured,
  });

  const { data: recentIssues, isLoading: loadingIssues } = useQuery({
    queryKey: ['recentIssues'],
    queryFn: () => getIssues(undefined, 'updated >= -7d ORDER BY updated DESC'),
    enabled: configured,
  });

  const { data: myIssues, isLoading: loadingMyIssues } = useQuery({
    queryKey: ['myIssues'],
    queryFn: getMyIssues,
    enabled: configured,
  });

  const { data: watchedIssues, isLoading: loadingWatched } = useQuery({
    queryKey: ['watchedIssues'],
    queryFn: getWatchedIssues,
    enabled: configured,
  });

  const { data: favoriteFilters } = useQuery({
    queryKey: ['favoriteFilters'],
    queryFn: getFavoriteFilters,
    enabled: configured,
  });

  const { data: filterResults, isLoading: loadingFilterResults } = useQuery({
    queryKey: ['filterResults', selectedFilter?.id],
    queryFn: () => runFilter(selectedFilter!.id),
    enabled: !!selectedFilter,
  });

  const { data: recentPages, isLoading: loadingPages } = useQuery({
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

  const isLoading = loadingProjects || loadingIssues || loadingPages || loadingMyIssues || loadingWatched;

  if (isLoading) {
    return <LoadingOverlay message="Loading dashboard..." />;
  }

  let jiraBaseUrl = '';
  try {
    jiraBaseUrl = getJiraBaseUrl();
  } catch {
    // Not configured
  }

  const recentIssuesList = recentIssues?.slice(0, 5) || [];
  const myIssuesList = myIssues?.slice(0, 5) || [];
  const watchedIssuesList = watchedIssues?.slice(0, 5) || [];

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
                    {issue.assignee && <span>Assignee: {issue.assignee.displayName}</span>}
                    {issue.dueDate && <span>Due: {new Date(issue.dueDate).toLocaleDateString()}</span>}
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
            <div className={styles.statValue}>{projects?.length || 0}</div>
            <div className={styles.statLabel}>Projects</div>
          </CardContent>
        </Card>

        <Card className={styles.statCard}>
          <CardContent>
            <div className={styles.statIcon}>
              <User size={24} />
            </div>
            <div className={styles.statValue}>{myIssues?.length || 0}</div>
            <div className={styles.statLabel}>My Issues</div>
          </CardContent>
        </Card>

        <Card className={styles.statCard}>
          <CardContent>
            <div className={styles.statIcon}>
              <Eye size={24} />
            </div>
            <div className={styles.statValue}>{watchedIssues?.length || 0}</div>
            <div className={styles.statLabel}>Watched</div>
          </CardContent>
        </Card>

        <Card className={styles.statCard}>
          <CardContent>
            <div className={styles.statIcon}>
              <CheckSquare size={24} />
            </div>
            <div className={styles.statValue}>{activeTodos.length}</div>
            <div className={styles.statLabel}>Active Todos</div>
          </CardContent>
        </Card>
      </div>

      <div className={styles.grid}>
        {/* My Issues */}
        <Card>
          <CardHeader>
            <div className={styles.cardHeaderContent}>
              <h3><User size={18} /> My Issues</h3>
              <Link to="/projects" className={styles.viewAll}>
                View all
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {renderIssueList(myIssuesList, 'No issues assigned to you')}
          </CardContent>
        </Card>

        {/* Watched Issues */}
        <Card>
          <CardHeader>
            <div className={styles.cardHeaderContent}>
              <h3><Eye size={18} /> Watched Issues</h3>
            </div>
          </CardHeader>
          <CardContent>
            {renderIssueList(watchedIssuesList, 'No watched issues')}
          </CardContent>
        </Card>

        {/* Favorite Filters */}
        <Card>
          <CardHeader>
            <div className={styles.cardHeaderContent}>
              <h3><Star size={18} /> Favorite Filters</h3>
            </div>
          </CardHeader>
          <CardContent>
            {!favoriteFilters || favoriteFilters.length === 0 ? (
              <p className={styles.empty}>No favorite filters</p>
            ) : (
              <ul className={styles.filterList}>
                {favoriteFilters.map((filter) => (
                  <li key={filter.id}>
                    <button
                      className={`${styles.filterButton} ${selectedFilter?.id === filter.id ? styles.filterActive : ''}`}
                      onClick={() => setSelectedFilter(selectedFilter?.id === filter.id ? null : filter)}
                    >
                      <Star size={14} />
                      <span>{filter.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {selectedFilter && (
              <div className={styles.filterResults}>
                <h4>{selectedFilter.name} Results</h4>
                {loadingFilterResults ? (
                  <p className={styles.empty}>Loading...</p>
                ) : (
                  renderIssueList(filterResults?.slice(0, 5) || [], 'No issues match this filter')
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Issues */}
        <Card>
          <CardHeader>
            <div className={styles.cardHeaderContent}>
              <h3><Clock size={18} /> Recent Activity</h3>
              <Link to="/projects" className={styles.viewAll}>
                View all
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {renderIssueList(recentIssuesList, 'No recent issues')}
          </CardContent>
        </Card>

        {/* Recent Confluence Pages */}
        <Card>
          <CardHeader>
            <div className={styles.cardHeaderContent}>
              <h3>Recent Pages</h3>
              <Link to="/confluence" className={styles.viewAll}>
                View all
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {recentPages?.length === 0 ? (
              <p className={styles.empty}>No recent pages</p>
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

        {/* My Todos */}
        <Card>
          <CardHeader>
            <div className={styles.cardHeaderContent}>
              <h3>My Todos</h3>
              <Link to="/todos" className={styles.viewAll}>
                View all
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {activeTodos.length === 0 ? (
              <p className={styles.empty}>No active todos</p>
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
