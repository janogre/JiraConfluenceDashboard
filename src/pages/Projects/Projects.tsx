import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, ExternalLink, ChevronRight, User, MessageSquare, Clock } from 'lucide-react';
import { Card, CardContent, Badge, Input, LoadingOverlay, Modal } from '../../components/common';
import { getProjects, getIssues, getIssueComments, getIssueWorklog } from '../../services/jiraService';
import { isConfigured, getJiraBaseUrl } from '../../services/api';
import type { JiraProject, JiraIssue } from '../../types';
import styles from './Projects.module.css';

export function Projects() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProject, setSelectedProject] = useState<JiraProject | null>(null);
  const [selectedIssue, setSelectedIssue] = useState<JiraIssue | null>(null);
  const configured = isConfigured();

  const { data: projects, isLoading: loadingProjects } = useQuery({
    queryKey: ['projects'],
    queryFn: getProjects,
    enabled: configured,
  });

  const { data: projectIssues, isLoading: loadingIssues } = useQuery({
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

  if (!configured) {
    return (
      <div className={styles.notConfigured}>
        <p>Please configure your API settings first.</p>
      </div>
    );
  }

  if (loadingProjects) {
    return <LoadingOverlay message="Loading projects..." />;
  }

  const filteredProjects = projects?.filter(
    (project) =>
      project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      project.key.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  let jiraBaseUrl = '';
  try {
    jiraBaseUrl = getJiraBaseUrl();
  } catch {
    // Not configured
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <Input
          placeholder="Search projects..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          icon={<Search size={18} />}
          className={styles.searchInput}
        />
      </div>

      <div className={styles.content}>
        {/* Projects List */}
        <div className={styles.projectsList}>
          <h3 className={styles.sectionTitle}>Projects ({filteredProjects?.length || 0})</h3>
          <div className={styles.projectsGrid}>
            {filteredProjects?.map((project) => (
              <Card
                key={project.id}
                hoverable
                onClick={() => setSelectedProject(project)}
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

        {/* Issues List */}
        {selectedProject && (
          <div className={styles.issuesList}>
            <div className={styles.issuesHeader}>
              <h3 className={styles.sectionTitle}>
                {selectedProject.name} Issues ({projectIssues?.length || 0})
              </h3>
              <a
                href={`${jiraBaseUrl}/jira/software/projects/${selectedProject.key}/boards`}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.openInJira}
              >
                Open in Jira
                <ExternalLink size={14} />
              </a>
            </div>

            {loadingIssues ? (
              <LoadingOverlay message="Loading issues..." />
            ) : (
              <div className={styles.issuesTable}>
                {projectIssues?.length === 0 ? (
                  <p className={styles.empty}>No issues found</p>
                ) : (
                  projectIssues?.map((issue) => (
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
                            {issue.assignee && <span>Assignee: {issue.assignee.displayName}</span>}
                            {issue.dueDate && <span>Due: {new Date(issue.dueDate).toLocaleDateString()}</span>}
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
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Issue Detail Modal */}
      {selectedIssue && (
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
                  <span className={styles.metaLabel}>Priority</span>
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
                  <span className={styles.metaLabel}>Assignee</span>
                  <span>{selectedIssue.assignee.displayName}</span>
                </div>
              )}

              {selectedIssue.reporter && (
                <div className={styles.metaItem}>
                  <span className={styles.metaLabel}>Reporter</span>
                  <span>{selectedIssue.reporter.displayName}</span>
                </div>
              )}

              {selectedIssue.dueDate && (
                <div className={styles.metaItem}>
                  <span className={styles.metaLabel}>Due Date</span>
                  <span>{new Date(selectedIssue.dueDate).toLocaleDateString()}</span>
                </div>
              )}
            </div>

            {selectedIssue.labels.length > 0 && (
              <div className={styles.issueLabels}>
                <span className={styles.metaLabel}>Labels</span>
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
                <span className={styles.metaLabel}>Description</span>
                <p>{selectedIssue.description}</p>
              </div>
            )}

            {/* Comments Section */}
            <div className={styles.issueSection}>
              <h3 className={styles.sectionHeader}>
                <MessageSquare size={18} />
                Comments ({issueComments?.length || 0})
              </h3>
              {loadingComments ? (
                <p className={styles.sectionLoading}>Loading comments...</p>
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
                          {new Date(comment.created).toLocaleDateString()}
                        </span>
                      </div>
                      <p className={styles.commentBody}>{comment.body}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className={styles.sectionEmpty}>No comments</p>
              )}
            </div>

            {/* Worklog Section */}
            <div className={styles.issueSection}>
              <h3 className={styles.sectionHeader}>
                <Clock size={18} />
                Time Logged ({issueWorklog?.length || 0})
              </h3>
              {loadingWorklog ? (
                <p className={styles.sectionLoading}>Loading worklog...</p>
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
                          {new Date(log.started).toLocaleDateString()}
                        </span>
                      </div>
                      {log.comment && <p className={styles.worklogComment}>{log.comment}</p>}
                    </div>
                  ))}
                  <div className={styles.worklogTotal}>
                    Total: {formatTotalTime(issueWorklog.reduce((acc, log) => acc + log.timeSpentSeconds, 0))}
                  </div>
                </div>
              ) : (
                <p className={styles.sectionEmpty}>No time logged</p>
              )}
            </div>

            <div className={styles.issueActions}>
              <a
                href={`${jiraBaseUrl}/browse/${selectedIssue.key}`}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.openInJiraButton}
              >
                Open in Jira
                <ExternalLink size={16} />
              </a>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
