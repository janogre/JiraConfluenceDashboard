import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, ExternalLink, ChevronRight, User, MessageSquare, Clock, ArrowLeft, RefreshCw, X, AlertCircle } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { Card, CardContent, Badge, Input, LoadingOverlay, Modal, Button } from '../../components/common';
import {
  getProjects,
  getIssues,
  getIssueComments,
  getIssueWorklog,
  getMyIssues,
  getTransitions,
  transitionIssue,
  searchIssues,
} from '../../services/jiraService';
import { isConfigured, getJiraBaseUrl } from '../../services/api';
import type { JiraProject, JiraIssue } from '../../types';
import styles from './Projects.module.css';

export function Projects() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProject, setSelectedProject] = useState<JiraProject | null>(null);
  const [selectedIssue, setSelectedIssue] = useState<JiraIssue | null>(null);
  const [issueSearchInput, setIssueSearchInput] = useState('');
  const [issueSearchQuery, setIssueSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [mineSearch, setMineSearch] = useState('');
  const [mineStatusFilter, setMineStatusFilter] = useState<string | null>(null);
  const [minePriorityFilter, setMinePriorityFilter] = useState<string | null>(null);
  const [searchParams] = useSearchParams();
  const filterMine = searchParams.get('filter') === 'mine';
  const configured = isConfigured();
  const queryClient = useQueryClient();

  const { data: projects, isLoading: loadingProjects, isError: errorProjects } = useQuery({
    queryKey: ['projects'],
    queryFn: getProjects,
    enabled: configured && !filterMine,
  });

  const { data: myIssues, isLoading: loadingMyIssues, isError: errorMyIssues } = useQuery({
    queryKey: ['myIssues'],
    queryFn: getMyIssues,
    enabled: configured && filterMine,
  });

  const { data: projectIssues, isLoading: loadingIssues, isError: errorIssues } = useQuery({
    queryKey: ['projectIssues', selectedProject?.key],
    queryFn: () => getIssues(selectedProject!.key),
    enabled: !!selectedProject,
  });

  const { data: issueComments, isLoading: loadingComments } = useQuery({
    queryKey: ['issueComments', selectedIssue?.key],
    queryFn: () => getIssueComments(selectedIssue!.key),
    enabled: !!selectedIssue,
  });

  const { data: issueWorklog, isLoading: loadingWorklog } = useQuery({
    queryKey: ['issueWorklog', selectedIssue?.key],
    queryFn: () => getIssueWorklog(selectedIssue!.key),
    enabled: !!selectedIssue,
  });

  const { data: transitions } = useQuery({
    queryKey: ['transitions', selectedIssue?.key],
    queryFn: () => getTransitions(selectedIssue!.key),
    enabled: !!selectedIssue,
  });

  const { data: searchResults, isLoading: loadingSearch } = useQuery({
    queryKey: ['issueSearch', issueSearchQuery],
    queryFn: () => searchIssues(issueSearchQuery),
    enabled: !!issueSearchQuery && !filterMine,
  });

  const { mutate: doTransition, isPending: changingStatus } = useMutation({
    mutationFn: (vars: { transitionId: string; toStatusName: string }) =>
      transitionIssue(selectedIssue!.key, vars.transitionId),
    onSuccess: (_, vars) => {
      setSelectedIssue((prev) =>
        prev ? { ...prev, status: { ...prev.status, name: vars.toStatusName } } : null
      );
      queryClient.invalidateQueries({ queryKey: ['projectIssues', selectedProject?.key] });
      queryClient.invalidateQueries({ queryKey: ['myIssues'] });
      queryClient.invalidateQueries({ queryKey: ['recentIssues'] });
      queryClient.invalidateQueries({ queryKey: ['transitions', selectedIssue?.key] });
    },
  });

  const renderError = (message: string) => (
    <div className={styles.apiError}>
      <AlertCircle size={16} />
      <span>
        {message} — <Link to="/settings">Sjekk API-innstillinger</Link>
      </span>
    </div>
  );

  if (!configured) {
    return (
      <div className={styles.notConfigured}>
        <p>Vennligst konfigurer API-innstillingene dine først.</p>
      </div>
    );
  }

  if (!filterMine && loadingProjects) {
    return <LoadingOverlay message="Laster prosjekter..." />;
  }

  const filteredProjects = projects?.filter(
    (project) =>
      project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      project.key.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const availableStatuses = [...new Set((projectIssues ?? []).map((i) => i.status.name))];
  const displayedIssues = statusFilter
    ? (projectIssues ?? []).filter((i) => i.status.name === statusFilter)
    : (projectIssues ?? []);

  const getStatusVariant = (category: string) => {
    switch (category) {
      case 'done':
        return 'success';
      case 'indeterminate':
        return 'primary';
      default:
        return 'default';
    }
  };

  const getPriorityVariant = (priority?: string) => {
    switch (priority?.toLowerCase()) {
      case 'highest':
      case 'high':
        return 'danger';
      case 'medium':
        return 'warning';
      default:
        return 'default';
    }
  };

  const formatTotalTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}t ${minutes}m`;
    }
    return `${minutes}m`;
  };

  let jiraBaseUrl = '';
  try {
    jiraBaseUrl = getJiraBaseUrl();
  } catch {
    // Not configured
  }

  const renderIssueRow = (issue: JiraIssue) => (
    <div
      key={issue.id}
      className={styles.issueRow}
      onClick={() => setSelectedIssue(issue)}
    >
      <div className={styles.issueMain}>
        <div className={styles.issueTypeIcon}>
          {issue.issueType.iconUrl && (
            <img src={issue.issueType.iconUrl} alt={issue.issueType.name} />
          )}
        </div>
        <a
          href={`${jiraBaseUrl}/browse/${issue.key}`}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.issueKey}
          onClick={(e) => e.stopPropagation()}
        >
          {issue.key}
        </a>
        <span className={styles.issueSummary}>{issue.summary}</span>
      </div>
      {issue.description && (
        <div className={styles.issueTooltip}>
          <div className={styles.tooltipHeader}>
            <strong>{issue.key}</strong> - {issue.summary}
          </div>
          <p className={styles.tooltipDescription}>{issue.description}</p>
          <div className={styles.tooltipMeta}>
            {issue.assignee && <span>Ansvarlig: {issue.assignee.displayName}</span>}
            {issue.dueDate && <span>Frist: {new Date(issue.dueDate).toLocaleDateString('nb-NO')}</span>}
          </div>
        </div>
      )}
      <div className={styles.issueMeta}>
        {issue.priority && (
          <Badge variant={getPriorityVariant(issue.priority.name)} size="sm">
            {issue.priority.name}
          </Badge>
        )}
        <Badge variant={getStatusVariant(issue.status.category)} size="sm">
          {issue.status.name}
        </Badge>
        {issue.assignee && (
          <div className={styles.assignee}>
            {issue.assignee.avatarUrl ? (
              <img src={issue.assignee.avatarUrl} alt="" className={styles.assigneeAvatar} />
            ) : (
              <div className={styles.assigneeAvatarPlaceholder}>
                {issue.assignee.displayName.charAt(0)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  const issueDetailModal = selectedIssue && (
    <Modal
      isOpen={!!selectedIssue}
      onClose={() => setSelectedIssue(null)}
      title={selectedIssue.key}
      size="lg"
    >
      <div className={styles.issueDetail}>
        <h2 className={styles.issueDetailTitle}>{selectedIssue.summary}</h2>

        <div className={styles.issueDetailMeta}>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>Status</span>
            <Badge variant={getStatusVariant(selectedIssue.status.category)}>
              {selectedIssue.status.name}
            </Badge>
          </div>

          {selectedIssue.priority && (
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Prioritet</span>
              <Badge variant={getPriorityVariant(selectedIssue.priority.name)}>
                {selectedIssue.priority.name}
              </Badge>
            </div>
          )}

          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>Type</span>
            <span>{selectedIssue.issueType.name}</span>
          </div>

          {selectedIssue.assignee && (
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Ansvarlig</span>
              <span>{selectedIssue.assignee.displayName}</span>
            </div>
          )}

          {selectedIssue.reporter && (
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Rapportert av</span>
              <span>{selectedIssue.reporter.displayName}</span>
            </div>
          )}

          {selectedIssue.dueDate && (
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Frist</span>
              <span>{new Date(selectedIssue.dueDate).toLocaleDateString('nb-NO')}</span>
            </div>
          )}
        </div>

        {selectedIssue.labels.length > 0 && (
          <div className={styles.issueLabels}>
            <span className={styles.metaLabel}>Etiketter</span>
            <div className={styles.labelsList}>
              {selectedIssue.labels.map((label) => (
                <Badge key={label} size="sm">
                  {label}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {selectedIssue.description && (
          <div className={styles.issueDescription}>
            <span className={styles.metaLabel}>Beskrivelse</span>
            <p>{selectedIssue.description}</p>
          </div>
        )}

        {/* Endre status */}
        {transitions && transitions.length > 0 && (
          <div className={styles.issueSection}>
            <h3 className={styles.sectionHeader}>
              <RefreshCw size={18} />
              Endre status
            </h3>
            <div className={styles.transitionButtons}>
              {transitions.map((t) => (
                <Button
                  key={t.id}
                  size="sm"
                  variant="secondary"
                  onClick={() => doTransition({ transitionId: t.id, toStatusName: t.to.name })}
                  disabled={changingStatus}
                >
                  {t.name}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Kommentarer */}
        <div className={styles.issueSection}>
          <h3 className={styles.sectionHeader}>
            <MessageSquare size={18} />
            Kommentarer ({issueComments?.length || 0})
          </h3>
          {loadingComments ? (
            <p className={styles.sectionLoading}>Laster kommentarer...</p>
          ) : issueComments && issueComments.length > 0 ? (
            <div className={styles.commentsList}>
              {issueComments.map((comment) => (
                <div key={comment.id} className={styles.comment}>
                  <div className={styles.commentHeader}>
                    {comment.author.avatarUrl && (
                      <img src={comment.author.avatarUrl} alt="" className={styles.commentAvatar} />
                    )}
                    <span className={styles.commentAuthor}>{comment.author.displayName}</span>
                    <span className={styles.commentDate}>
                      {new Date(comment.created).toLocaleDateString('nb-NO')}
                    </span>
                  </div>
                  <p className={styles.commentBody}>{comment.body}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className={styles.sectionEmpty}>Ingen kommentarer</p>
          )}
        </div>

        {/* Timelogg */}
        <div className={styles.issueSection}>
          <h3 className={styles.sectionHeader}>
            <Clock size={18} />
            Timelogg ({issueWorklog?.length || 0})
          </h3>
          {loadingWorklog ? (
            <p className={styles.sectionLoading}>Laster timelogg...</p>
          ) : issueWorklog && issueWorklog.length > 0 ? (
            <div className={styles.worklogList}>
              {issueWorklog.map((log) => (
                <div key={log.id} className={styles.worklogItem}>
                  <div className={styles.worklogHeader}>
                    {log.author.avatarUrl && (
                      <img src={log.author.avatarUrl} alt="" className={styles.worklogAvatar} />
                    )}
                    <span className={styles.worklogAuthor}>{log.author.displayName}</span>
                    <Badge size="sm" variant="primary">{log.timeSpent}</Badge>
                    <span className={styles.worklogDate}>
                      {new Date(log.started).toLocaleDateString('nb-NO')}
                    </span>
                  </div>
                  {log.comment && <p className={styles.worklogComment}>{log.comment}</p>}
                </div>
              ))}
              <div className={styles.worklogTotal}>
                Totalt: {formatTotalTime(issueWorklog.reduce((acc, log) => acc + log.timeSpentSeconds, 0))}
              </div>
            </div>
          ) : (
            <p className={styles.sectionEmpty}>Ingen timelogg</p>
          )}
        </div>

        <div className={styles.issueActions}>
          <a
            href={`${jiraBaseUrl}/browse/${selectedIssue.key}`}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.openInJiraButton}
          >
            Åpne i Jira
            <ExternalLink size={16} />
          </a>
        </div>
      </div>
    </Modal>
  );

  // "Mine saker"-visning når filter=mine i URL
  if (filterMine) {
    const mineStatuses = [...new Set((myIssues ?? []).map((i) => i.status.name))];
    const minePriorities = [...new Set((myIssues ?? []).filter((i) => i.priority).map((i) => i.priority!.name))];

    const filteredMyIssues = (myIssues ?? []).filter((issue) => {
      const matchesSearch =
        !mineSearch ||
        issue.summary.toLowerCase().includes(mineSearch.toLowerCase()) ||
        issue.key.toLowerCase().includes(mineSearch.toLowerCase());
      const matchesStatus = !mineStatusFilter || issue.status.name === mineStatusFilter;
      const matchesPriority = !minePriorityFilter || issue.priority?.name === minePriorityFilter;
      return matchesSearch && matchesStatus && matchesPriority;
    });

    const hasActiveFilter = !!mineSearch || !!mineStatusFilter || !!minePriorityFilter;

    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <Link to="/projects" className={styles.backLink}>
            <ArrowLeft size={16} />
            Alle prosjekter
          </Link>
          <h3 className={styles.sectionTitle}>
            Mine åpne saker
            {hasActiveFilter
              ? ` (${filteredMyIssues.length} av ${myIssues?.length ?? 0})`
              : ` (${myIssues?.length ?? 0})`}
          </h3>
        </div>

        {/* Søk og filtrering */}
        {!loadingMyIssues && !errorMyIssues && (myIssues?.length ?? 0) > 0 && (
          <div className={styles.mineFilters}>
            <Input
              placeholder="Søk i tittel eller saksnummer…"
              value={mineSearch}
              onChange={(e) => setMineSearch(e.target.value)}
              icon={<Search size={16} />}
              className={styles.mineSearchInput}
            />
            <div className={styles.filterRow}>
              {mineStatuses.length > 1 && (
                <div className={styles.filterGroup}>
                  <span className={styles.filterGroupLabel}>Status:</span>
                  <div className={styles.statusFilter}>
                    <button
                      className={`${styles.statusFilterBtn} ${!mineStatusFilter ? styles.statusFilterActive : ''}`}
                      onClick={() => setMineStatusFilter(null)}
                    >
                      Alle
                    </button>
                    {mineStatuses.map((s) => (
                      <button
                        key={s}
                        className={`${styles.statusFilterBtn} ${mineStatusFilter === s ? styles.statusFilterActive : ''}`}
                        onClick={() => setMineStatusFilter(mineStatusFilter === s ? null : s)}
                      >
                        {s}
                        {mineStatusFilter === s && <X size={12} />}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {minePriorities.length > 1 && (
                <div className={styles.filterGroup}>
                  <span className={styles.filterGroupLabel}>Prioritet:</span>
                  <div className={styles.statusFilter}>
                    <button
                      className={`${styles.statusFilterBtn} ${!minePriorityFilter ? styles.statusFilterActive : ''}`}
                      onClick={() => setMinePriorityFilter(null)}
                    >
                      Alle
                    </button>
                    {minePriorities.map((p) => (
                      <button
                        key={p}
                        className={`${styles.statusFilterBtn} ${minePriorityFilter === p ? styles.statusFilterActive : ''}`}
                        onClick={() => setMinePriorityFilter(minePriorityFilter === p ? null : p)}
                      >
                        {p}
                        {minePriorityFilter === p && <X size={12} />}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {hasActiveFilter && (
                <button
                  className={styles.clearFilters}
                  onClick={() => { setMineSearch(''); setMineStatusFilter(null); setMinePriorityFilter(null); }}
                >
                  <X size={14} />
                  Nullstill filtre
                </button>
              )}
            </div>
          </div>
        )}

        <div className={styles.issuesList} style={{ height: 'unset', overflow: 'visible' }}>
          {loadingMyIssues ? (
            <LoadingOverlay message="Laster saker..." />
          ) : errorMyIssues ? (
            renderError('Kunne ikke laste dine saker')
          ) : (
            <div className={styles.issuesTable}>
              {filteredMyIssues.length === 0 ? (
                <p className={styles.empty}>
                  {hasActiveFilter ? 'Ingen saker matcher søket' : 'Ingen saker tildelt deg'}
                </p>
              ) : (
                filteredMyIssues.map((issue) => renderIssueRow(issue))
              )}
            </div>
          )}
        </div>

        {issueDetailModal}
      </div>
    );
  }

  const handleIssueSearch = () => {
    if (issueSearchInput.trim()) {
      setIssueSearchQuery(issueSearchInput.trim());
      setSelectedProject(null);
      setStatusFilter(null);
    }
  };

  const clearIssueSearch = () => {
    setIssueSearchInput('');
    setIssueSearchQuery('');
  };

  // Søkeresultater-visning
  if (issueSearchQuery) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <button className={styles.backLink} onClick={clearIssueSearch}>
            <ArrowLeft size={16} />
            Tilbake til prosjekter
          </button>
          <h3 className={styles.sectionTitle}>
            Søkeresultater for «{issueSearchQuery}» ({searchResults?.length ?? '…'})
          </h3>
        </div>
        <div className={styles.issuesList} style={{ height: 'unset', overflow: 'visible' }}>
          {loadingSearch ? (
            <LoadingOverlay message="Søker..." />
          ) : (
            <div className={styles.issuesTable}>
              {!searchResults || searchResults.length === 0 ? (
                <p className={styles.empty}>Ingen saker funnet for «{issueSearchQuery}»</p>
              ) : (
                searchResults.map((issue) => renderIssueRow(issue))
              )}
            </div>
          )}
        </div>
        {issueDetailModal}
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <Input
          placeholder="Søk i prosjekter..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          icon={<Search size={18} />}
          className={styles.searchInput}
        />
        <form
          className={styles.issueSearchForm}
          onSubmit={(e) => { e.preventDefault(); handleIssueSearch(); }}
        >
          <Input
            placeholder="Søk i alle saker..."
            value={issueSearchInput}
            onChange={(e) => setIssueSearchInput(e.target.value)}
            icon={<Search size={18} />}
            className={styles.searchInput}
          />
          <Button type="submit" size="sm" disabled={!issueSearchInput.trim()}>
            Søk
          </Button>
        </form>
      </div>

      <div className={styles.content}>
        {/* Prosjektliste */}
        <div className={styles.projectsList}>
          <h3 className={styles.sectionTitle}>Prosjekter ({filteredProjects?.length || 0})</h3>
          {errorProjects && renderError('Kunne ikke laste prosjekter')}
          <div className={styles.projectsGrid}>
            {filteredProjects?.map((project) => (
              <Card
                key={project.id}
                hoverable
                onClick={() => { setSelectedProject(project); setStatusFilter(null); }}
                className={`${styles.projectCard} ${selectedProject?.id === project.id ? styles.selected : ''}`}
              >
                <CardContent>
                  <div className={styles.projectHeader}>
                    {project.avatarUrl ? (
                      <img src={project.avatarUrl} alt="" className={styles.projectAvatar} />
                    ) : (
                      <div className={styles.projectAvatarPlaceholder}>
                        {project.name.charAt(0)}
                      </div>
                    )}
                    <div className={styles.projectInfo}>
                      <h4 className={styles.projectName}>{project.name}</h4>
                      <span className={styles.projectKey}>{project.key}</span>
                    </div>
                    <ChevronRight size={20} className={styles.chevron} />
                  </div>
                  {project.lead && (
                    <div className={styles.projectLead}>
                      <User size={14} />
                      <span>{project.lead.displayName}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Sakliste */}
        {selectedProject ? (
          <div className={styles.issuesList}>
            <div className={styles.issuesHeader}>
              <h3 className={styles.sectionTitle}>
                {selectedProject.name} – saker ({displayedIssues.length}
                {statusFilter ? ` av ${projectIssues?.length}` : ''})
              </h3>
              <a
                href={`${jiraBaseUrl}/jira/software/projects/${selectedProject.key}/boards`}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.openInJira}
              >
                Åpne i Jira
                <ExternalLink size={14} />
              </a>
            </div>

            {/* Statusfilter */}
            {!loadingIssues && availableStatuses.length > 1 && (
              <div className={styles.statusFilter}>
                <button
                  className={`${styles.statusFilterBtn} ${statusFilter === null ? styles.statusFilterActive : ''}`}
                  onClick={() => setStatusFilter(null)}
                >
                  Alle
                </button>
                {availableStatuses.map((status) => (
                  <button
                    key={status}
                    className={`${styles.statusFilterBtn} ${statusFilter === status ? styles.statusFilterActive : ''}`}
                    onClick={() => setStatusFilter(statusFilter === status ? null : status)}
                  >
                    {status}
                    {statusFilter === status && <X size={12} />}
                  </button>
                ))}
              </div>
            )}

            {loadingIssues ? (
              <LoadingOverlay message="Laster saker..." />
            ) : errorIssues ? (
              renderError('Kunne ikke laste saker for dette prosjektet')
            ) : (
              <div className={styles.issuesTable}>
                {displayedIssues.length === 0 ? (
                  <p className={styles.empty}>Ingen saker funnet</p>
                ) : (
                  displayedIssues.map((issue) => renderIssueRow(issue))
                )}
              </div>
            )}
          </div>
        ) : (
          <div className={styles.noProjectSelected}>
            <p>Velg et prosjekt til venstre for å se saker</p>
          </div>
        )}
      </div>

      {issueDetailModal}
    </div>
  );
}
