import { useState, useRef, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Calendar, AlertCircle, Eye, EyeOff, Star, ArrowUpDown, X, Tag, Layers, ChevronDown, Search, AlertOctagon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge, LoadingOverlay } from '../../components/common';
import {
  getProjects,
  getMyIssues,
  getIssues,
  getTransitions,
  transitionIssue,
  getCurrentUser,
  searchIssuesInProjects,
} from '../../services/jiraService';
import { isConfigured, getJiraBaseUrl } from '../../services/api';
import type { JiraIssue } from '../../types';
import { Timeline } from './Timeline';
import { ProjectPulse } from './ProjectPulse';
import { IssueList } from './IssueList';
import { SprintView } from './SprintView';
import { SubtaskList } from './SubtaskList';
import { IssueModal } from './IssueModal';
import styles from './Board.module.css';

const STARRED_PROJECTS_KEY = 'board_starred_projects';

function loadStarredProjects(): Set<string> {
  try {
    const raw = localStorage.getItem(STARRED_PROJECTS_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function saveStarredProjects(keys: Set<string>) {
  localStorage.setItem(STARRED_PROJECTS_KEY, JSON.stringify([...keys]));
}

const COLUMNS = [
  { id: 'new', label: 'Å gjøre' },
  { id: 'indeterminate', label: 'Pågår' },
  { id: 'done', label: 'Ferdig' },
] as const;

type ColumnId = (typeof COLUMNS)[number]['id'];

export function Board() {
  const [mode, setMode] = useState<'mine' | 'project' | 'list' | 'timeline' | 'activity' | 'pulse' | 'sprint' | 'search'>('mine');
  const [searchQuery, setSearchQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [selectedProjectKey, setSelectedProjectKey] = useState('');
  const [selectedIssue, setSelectedIssue] = useState<JiraIssue | null>(null);
  const [showAllDone, setShowAllDone] = useState(false);
  const [starredProjects, setStarredProjects] = useState<Set<string>>(loadStarredProjects);
  const [expandedSubtasks, setExpandedSubtasks] = useState<Set<string>>(new Set());
  const [filterPriority, setFilterPriority] = useState('');
  const [filterAssignee, setFilterAssignee] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterIssueType, setFilterIssueType] = useState('');
  const [filterLabels, setFilterLabels] = useState<Set<string>>(new Set());
  const [labelDropdownOpen, setLabelDropdownOpen] = useState(false);
  const [labelSearch, setLabelSearch] = useState('');
  const [filterComponents, setFilterComponents] = useState<Set<string>>(new Set());
  const [componentDropdownOpen, setComponentDropdownOpen] = useState(false);
  const [componentSearch, setComponentSearch] = useState('');
  const [sortByDueDate, setSortByDueDate] = useState(false);
  const [includeDone, setIncludeDone] = useState(false);
  const labelDropdownRef = useRef<HTMLDivElement>(null);
  const componentDropdownRef = useRef<HTMLDivElement>(null);

  const toggleStarProject = (key: string) => {
    setStarredProjects((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      saveStarredProjects(next);
      return next;
    });
  };
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (labelDropdownRef.current && !labelDropdownRef.current.contains(e.target as Node)) {
        setLabelDropdownOpen(false);
        setLabelSearch('');
      }
      if (componentDropdownRef.current && !componentDropdownRef.current.contains(e.target as Node)) {
        setComponentDropdownOpen(false);
        setComponentSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggleLabel = (label: string) => {
    setFilterLabels((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const toggleComponent = (component: string) => {
    setFilterComponents((prev) => {
      const next = new Set(prev);
      if (next.has(component)) next.delete(component);
      else next.add(component);
      return next;
    });
  };

  const configured = isConfigured();
  const queryClient = useQueryClient();

  const projectJql = selectedProjectKey
    ? includeDone
      ? `project = "${selectedProjectKey}" ORDER BY updated DESC`
      : `project = "${selectedProjectKey}" AND statusCategory != Done ORDER BY updated DESC`
    : '';

  const boardQueryKey = ['boardIssues', mode === 'sprint' ? 'sprint' : mode, selectedProjectKey, includeDone] as const;

  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: getProjects,
    enabled: configured,
  });

  const { data: issues, isLoading, isError, refetch } = useQuery({
    queryKey: boardQueryKey,
    queryFn: () =>
      mode === 'mine' || (mode === 'list' && !selectedProjectKey)
        ? getMyIssues()
        : getIssues(undefined, projectJql, true),
    enabled:
      configured &&
      (mode === 'mine' ||
        (mode === 'list' && !selectedProjectKey) ||
        (!!selectedProjectKey &&
          (mode === 'project' || mode === 'list' || mode === 'timeline' || mode === 'activity' || mode === 'pulse'))),
  });

  const starredProjectKeys = [...starredProjects];

  const { data: searchResults, isLoading: searchLoading } = useQuery({
    queryKey: ['boardSearch', submittedQuery, starredProjectKeys],
    queryFn: () => searchIssuesInProjects(submittedQuery, starredProjectKeys),
    enabled: configured && mode === 'search' && submittedQuery.length > 0 && starredProjectKeys.length > 0,
  });

  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: getCurrentUser,
    enabled: configured,
    staleTime: 1000 * 60 * 30,
  });

  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination) return;
    const { draggableId: issueKey, source, destination } = result;
    if (source.droppableId === destination.droppableId) return;

    const targetCategory = destination.droppableId as ColumnId;
    const previousData = queryClient.getQueryData<JiraIssue[]>(boardQueryKey);

    // Optimistisk oppdatering direkte i query-cache
    queryClient.setQueryData<JiraIssue[]>(boardQueryKey, (old) =>
      (old ?? []).map((issue) =>
        issue.key === issueKey
          ? { ...issue, status: { ...issue.status, category: targetCategory } }
          : issue
      )
    );

    try {
      const available = await getTransitions(issueKey);
      const transition = available.find((t) => t.to.statusCategoryKey === targetCategory);
      if (!transition) {
        queryClient.setQueryData(boardQueryKey, previousData);
        return;
      }
      await transitionIssue(issueKey, transition.id);
      // Oppdater også statusnavn etter vellykket overgang
      queryClient.setQueryData<JiraIssue[]>(boardQueryKey, (old) =>
        (old ?? []).map((issue) =>
          issue.key === issueKey
            ? { ...issue, status: { ...issue.status, name: transition.to.name } }
            : issue
        )
      );
      queryClient.invalidateQueries({ queryKey: ['boardIssues'] });
    } catch {
      queryClient.setQueryData(boardQueryKey, previousData);
    }
  };

  if (!configured) {
    return (
      <div className={styles.notConfigured}>
        <AlertCircle size={48} />
        <p>Vennligst konfigurer API-innstillingene dine for å bruke boardet.</p>
        <Link to="/settings">Gå til innstillinger</Link>
      </div>
    );
  }

  let jiraBaseUrl = '';
  try {
    jiraBaseUrl = getJiraBaseUrl();
  } catch {
    // not configured
  }

  const getPriorityVariant = (priority?: string) => {
    switch (priority?.toLowerCase()) {
      case 'highest':
      case 'high':
        return 'danger' as const;
      case 'medium':
        return 'warning' as const;
      default:
        return 'default' as const;
    }
  };

  const isOverdue = (dueDate?: string) =>
    dueDate ? new Date(dueDate) < new Date() : false;

  const displayedIssues = issues ?? [];

  // Bygg kart over barn basert på parent-felt (dekker vanlige child-saker, ikke bare suboppgavetypen)
  const derivedChildrenMap = new Map<string, JiraIssue[]>();
  displayedIssues.forEach((issue) => {
    if (issue.parent?.key) {
      const existing = derivedChildrenMap.get(issue.parent.key) ?? [];
      existing.push(issue);
      derivedChildrenMap.set(issue.parent.key, existing);
    }
  });

  // Sett med saks-nøkler i den nåværende visningen — brukes til deduplisering av barn/forelder
  const myIssueKeys = new Set(displayedIssues.map((i) => i.key));

  // Innlogget brukers visningsnavn — brukes til "Meg"-merket i underoppgavelisten.
  const currentUserDisplayName = currentUser?.displayName;

  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

  // Derive unique priorities, assignees and labels for filter dropdowns
  const availablePriorities = [...new Set(
    displayedIssues.map((i) => i.priority?.name).filter(Boolean) as string[]
  )];
  const availableAssignees = [...new Map(
    displayedIssues
      .filter((i) => i.assignee)
      .map((i) => [i.assignee!.displayName, i.assignee!])
  ).values()];
  const availableLabels = [...new Set(
    displayedIssues.flatMap((i) => i.labels ?? [])
  )].sort();
  const availableComponents = [...new Set(
    displayedIssues.flatMap((i) => (i.components ?? []).map((c) => c.name))
  )].sort();

  const availableIssueTypes = [...new Map(
    displayedIssues.map((i) => [i.issueType.name, i.issueType])
  ).values()].sort((a, b) => a.name.localeCompare(b.name));

  const availableStatuses = [...new Map(
    displayedIssues.map((i) => [i.status.name, i.status])
  ).values()].sort((a, b) => {
    const catOrder = { new: 0, indeterminate: 1, done: 2 };
    return catOrder[a.category] - catOrder[b.category] || a.name.localeCompare(b.name);
  });

  const getColumnIssues = (columnId: ColumnId) => {
    // Skjul saker der foreldresaken også finnes i listen — de vises som underoppgaver der
    let result = displayedIssues.filter(
      (issue) => !issue.parent?.key || !myIssueKeys.has(issue.parent.key)
    ).filter((issue) => issue.status.category === columnId);

    // Done-filter: siste måned
    if (columnId === 'done' && !showAllDone) {
      result = result.filter((issue) => {
        const date = issue.resolutionDate || issue.updated;
        return new Date(date) >= oneMonthAgo;
      });
    }

    // Prioritetsfilter
    if (filterPriority) {
      result = result.filter((issue) => issue.priority?.name === filterPriority);
    }

    // Tildelt-filter
    if (filterAssignee) {
      result = result.filter((issue) => issue.assignee?.displayName === filterAssignee);
    }

    // Etikett-filter (saken må ha alle valgte etiketter)
    if (filterLabels.size > 0) {
      result = result.filter((issue) =>
        [...filterLabels].every((label) => (issue.labels ?? []).includes(label))
      );
    }

    // Komponent-filter (saken må ha alle valgte komponenter)
    if (filterComponents.size > 0) {
      result = result.filter((issue) =>
        [...filterComponents].every((comp) => (issue.components ?? []).some((c) => c.name === comp))
      );
    }

    // Sortering på forfallsdato
    if (sortByDueDate) {
      result = [...result].sort((a, b) => {
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      });
    }

    return result;
  };

  const matchesLabelFilter = (issue: JiraIssue) =>
    filterLabels.size === 0 || [...filterLabels].every((l) => (issue.labels ?? []).includes(l));

  const matchesComponentFilter = (issue: JiraIssue) =>
    filterComponents.size === 0 || [...filterComponents].every((comp) => (issue.components ?? []).some((c) => c.name === comp));

  // Timeline filtering: all shared filters apply
  const timelineIssues = displayedIssues.filter((issue) => {
    if (filterPriority && issue.priority?.name !== filterPriority) return false;
    if (filterAssignee && issue.assignee?.displayName !== filterAssignee) return false;
    if (!matchesLabelFilter(issue)) return false;
    if (!matchesComponentFilter(issue)) return false;
    if (filterStatus) {
      if (filterStatus.startsWith('cat:')) {
        if (issue.status.category !== filterStatus.slice(4)) return false;
      } else {
        if (issue.status.name !== filterStatus) return false;
      }
    }
    if (filterIssueType && issue.issueType.name !== filterIssueType) return false;
    return true;
  });

  // List filtering: priority/assignee/label/component/status/issueType filters apply
  const listIssues = displayedIssues.filter((issue) => {
    if (filterPriority && issue.priority?.name !== filterPriority) return false;
    if (filterAssignee && issue.assignee?.displayName !== filterAssignee) return false;
    if (!matchesLabelFilter(issue)) return false;
    if (!matchesComponentFilter(issue)) return false;
    if (filterStatus) {
      if (filterStatus.startsWith('cat:')) {
        if (issue.status.category !== filterStatus.slice(4)) return false;
      } else {
        if (issue.status.name !== filterStatus) return false;
      }
    }
    if (filterIssueType && issue.issueType.name !== filterIssueType) return false;
    return true;
  });

  // Pulse filtering: priority/assignee/label/component filters apply; category filtering handled inside ProjectPulse
  const pulseIssues = displayedIssues.filter((issue) => {
    if (filterPriority && issue.priority?.name !== filterPriority) return false;
    if (filterAssignee && issue.assignee?.displayName !== filterAssignee) return false;
    if (!matchesLabelFilter(issue)) return false;
    if (!matchesComponentFilter(issue)) return false;
    return true;
  });

  const relativeTime = (dateString: string): string => {
    const diff = Date.now() - new Date(dateString).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'akkurat nå';
    if (minutes < 60) return `${minutes} min siden`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} t siden`;
    const days = Math.floor(hours / 24);
    if (days === 1) return 'i går';
    if (days < 7) return `${days} dager siden`;
    return new Date(dateString).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' });
  };

  const activityIssues = [...displayedIssues]
    .filter((issue) => {
      if (filterPriority && issue.priority?.name !== filterPriority) return false;
      if (filterAssignee && issue.assignee?.displayName !== filterAssignee) return false;
      if (!matchesLabelFilter(issue)) return false;
      if (!matchesComponentFilter(issue)) return false;
      return true;
    })
    .sort((a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime());

  const renderCard = (issue: JiraIssue, index: number) => (
    <Draggable key={issue.key} draggableId={issue.key} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className={`${styles.card} ${snapshot.isDragging ? styles.dragging : ''}`}
          onClick={() => setSelectedIssue(issue)}
        >
          <div className={styles.cardTop}>
            <div className={styles.cardId}>
              {issue.issueType.iconUrl && (
                <img
                  src={issue.issueType.iconUrl}
                  alt={issue.issueType.name}
                  className={styles.issueTypeIcon}
                />
              )}
              <a
                href={`${jiraBaseUrl}/browse/${issue.key}`}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.issueKey}
                onClick={(e) => e.stopPropagation()}
              >
                {issue.key}
              </a>
            </div>
            {issue.assignee &&
              (issue.assignee.avatarUrl ? (
                <img
                  src={issue.assignee.avatarUrl}
                  alt={issue.assignee.displayName}
                  className={styles.assigneeAvatar}
                  title={issue.assignee.displayName}
                />
              ) : (
                <div
                  className={styles.assigneeInitial}
                  title={issue.assignee.displayName}
                >
                  {issue.assignee.displayName.charAt(0)}
                </div>
              ))}
          </div>

          <p className={styles.cardSummary}>{issue.summary}</p>

          <div className={styles.cardFooter}>
            {issue.priority && (
              <Badge variant={getPriorityVariant(issue.priority.name)} size="sm">
                {issue.priority.name}
              </Badge>
            )}
            {issue.dueDate && (
              <Badge variant={isOverdue(issue.dueDate) ? 'danger' : 'default'} size="sm">
                <Calendar size={10} />
                {new Date(issue.dueDate).toLocaleDateString('nb-NO')}
              </Badge>
            )}
          </div>
          {issue.labels && issue.labels.length > 0 && (
            <div className={styles.cardLabels}>
              {issue.labels.map((label) => (
                <span key={label} className={styles.cardLabel}>{label}</span>
              ))}
            </div>
          )}
          {issue.links?.filter((l) => {
            const t = l.type.name.toLowerCase();
            return !!l.inwardIssue && (t.includes('block') || t.includes('blokkerer'));
          }).map((l) => (
            <div key={l.id} className={styles.cardBlockedBadge}>
              <AlertOctagon size={11} />
              Blokkert av{' '}
              <a
                href={`${jiraBaseUrl}/browse/${l.inwardIssue!.key}`}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.cardBlockedLink}
                onClick={(e) => e.stopPropagation()}
                title={l.inwardIssue!.summary}
              >
                {l.inwardIssue!.key}
              </a>
            </div>
          ))}
          {(() => {
            const derivedChildren = derivedChildrenMap.get(issue.key) ?? [];
            const hasChildren = (issue.subtasks?.length ?? 0) > 0 || derivedChildren.length > 0;
            if (!hasChildren) return null;
            const knownCount = Math.max(issue.subtasks?.length ?? 0, derivedChildren.length);
            return (
              <div className={styles.subtasksSection}>
                <button
                  className={`${styles.subtasksToggle} ${expandedSubtasks.has(issue.key) ? styles.subtasksToggleOpen : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpandedSubtasks((prev) => {
                      const next = new Set(prev);
                      if (next.has(issue.key)) next.delete(issue.key);
                      else next.add(issue.key);
                      return next;
                    });
                  }}
                >
                  <span className={styles.subtasksCount}>{knownCount}</span>
                  underoppgaver
                  <ChevronDown size={11} className={styles.subtasksChevron} />
                </button>
                {expandedSubtasks.has(issue.key) && (
                  <SubtaskList
                    parentKey={issue.key}
                    jiraBaseUrl={jiraBaseUrl}
                    fallback={derivedChildren}
                    currentUserDisplayName={currentUserDisplayName}
                  />
                )}
              </div>
            );
          })()}
        </div>
      )}
    </Draggable>
  );

  return (
    <div className={styles.container}>
      {/* Kontroller */}
      <div className={styles.header}>
        <div className={styles.modeToggle}>
          <button
            className={`${styles.modeButton} ${mode === 'mine' ? styles.modeButtonActive : ''}`}
            onClick={() => setMode('mine')}
          >
            Mine saker
          </button>
          <button
            className={`${styles.modeButton} ${mode === 'project' ? styles.modeButtonActive : ''}`}
            onClick={() => setMode('project')}
          >
            Prosjekt
          </button>
          <button
            className={`${styles.modeButton} ${mode === 'list' ? styles.modeButtonActive : ''}`}
            onClick={() => setMode('list')}
          >
            Liste
          </button>
          <button
            className={`${styles.modeButton} ${mode === 'timeline' ? styles.modeButtonActive : ''}`}
            onClick={() => setMode('timeline')}
            disabled={!selectedProjectKey}
            title={!selectedProjectKey ? 'Velg et prosjekt for å bruke tidslinje' : 'Vis tidslinje'}
          >
            Tidslinje
          </button>
          <button
            className={`${styles.modeButton} ${mode === 'activity' ? styles.modeButtonActive : ''}`}
            onClick={() => setMode('activity')}
            disabled={!selectedProjectKey}
            title={!selectedProjectKey ? 'Velg et prosjekt for å se aktivitetsfeed' : 'Vis aktivitetsfeed'}
          >
            Aktivitet
          </button>
          <button
            className={`${styles.modeButton} ${mode === 'pulse' ? styles.modeButtonActive : ''}`}
            onClick={() => setMode('pulse')}
            disabled={!selectedProjectKey}
            title={!selectedProjectKey ? 'Velg et prosjekt for å bruke arbeidsflate' : 'Vis arbeidsflate'}
          >
            Arbeidsflate
          </button>
          <button
            className={`${styles.modeButton} ${mode === 'sprint' ? styles.modeButtonActive : ''}`}
            onClick={() => setMode('sprint')}
            disabled={!selectedProjectKey}
            title={!selectedProjectKey ? 'Velg et prosjekt for å se sprint' : 'Vis sprint'}
          >
            Sprint
          </button>
          <button
            className={`${styles.modeButton} ${mode === 'search' ? styles.modeButtonActive : ''}`}
            onClick={() => setMode('search')}
            title={starredProjects.size === 0 ? 'Stjernemerk prosjekter for å søke i dem' : `Søk i ${starredProjects.size} stjernemerkede prosjekter`}
          >
            <Search size={13} />
            Søk
          </button>
        </div>

        {mode === 'search' && (
          <form
            className={styles.searchForm}
            onSubmit={(e) => { e.preventDefault(); setSubmittedQuery(searchQuery.trim()); }}
          >
            <div className={styles.searchInputWrapper}>
              <Search size={14} className={styles.searchIcon} />
              <input
                type="text"
                className={styles.searchInput}
                placeholder={
                  starredProjects.size === 0
                    ? 'Stjernemerk prosjekter først…'
                    : `Søk i ${starredProjects.size} stjernemerkede prosjekter…`
                }
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                disabled={starredProjects.size === 0}
                autoFocus
              />
              {searchQuery && (
                <button
                  type="button"
                  className={styles.searchClear}
                  onClick={() => { setSearchQuery(''); setSubmittedQuery(''); }}
                >
                  <X size={13} />
                </button>
              )}
            </div>
            <button
              type="submit"
              className={styles.sortButton}
              disabled={starredProjects.size === 0 || !searchQuery.trim()}
            >
              Søk
            </button>
          </form>
        )}

        {(mode === 'project' || mode === 'list' || mode === 'timeline' || mode === 'activity' || mode === 'pulse' || mode === 'sprint') && (
          <div className={styles.projectSelectWrapper}>
            <select
              className={styles.projectSelect}
              value={selectedProjectKey}
              onChange={(e) => setSelectedProjectKey(e.target.value)}
            >
              <option value="">Velg prosjekt…</option>
              {starredProjects.size > 0 && (
                <optgroup label="Stjernemerket">
                  {projects
                    ?.filter((p) => starredProjects.has(p.key))
                    .map((p) => (
                      <option key={p.key} value={p.key}>
                        ★ {p.name}
                      </option>
                    ))}
                </optgroup>
              )}
              <optgroup label="Alle prosjekter">
                {projects
                  ?.filter((p) => !starredProjects.has(p.key))
                  .map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.name}
                    </option>
                  ))}
              </optgroup>
            </select>
            {selectedProjectKey && (
              <button
                className={`${styles.projectStarButton} ${starredProjects.has(selectedProjectKey) ? styles.projectStarActive : ''}`}
                onClick={() => toggleStarProject(selectedProjectKey)}
                title={starredProjects.has(selectedProjectKey) ? 'Fjern stjernemerke' : 'Stjernemerk prosjekt'}
              >
                <Star size={15} />
              </button>
            )}
          </div>
        )}

        {selectedProjectKey && mode !== 'mine' && mode !== 'sprint' && (
          <button
            className={`${styles.sortButton} ${includeDone ? styles.sortButtonActive : ''}`}
            onClick={() => setIncludeDone((v) => !v)}
            title={includeDone ? 'Skjul ferdigstilte saker' : 'Inkluder ferdigstilte saker'}
          >
            {includeDone ? <EyeOff size={14} /> : <Eye size={14} />}
            Ferdig
          </button>
        )}

        {displayedIssues.length > 0 && (
          <div className={styles.filters}>
            <select
              className={styles.filterSelect}
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value)}
              title="Filtrer på prioritet"
            >
              <option value="">Alle prioriteter</option>
              {availablePriorities.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>

            <select
              className={styles.filterSelect}
              value={filterAssignee}
              onChange={(e) => setFilterAssignee(e.target.value)}
              title="Filtrer på tildelt"
            >
              <option value="">Alle tildelte</option>
              {availableAssignees.map((a) => (
                <option key={a.displayName} value={a.displayName}>{a.displayName}</option>
              ))}
            </select>

            {availableLabels.length > 0 && (
              <div className={styles.labelDropdownWrapper} ref={labelDropdownRef}>
                <button
                  className={`${styles.sortButton} ${filterLabels.size > 0 ? styles.sortButtonActive : ''}`}
                  onClick={() => { setLabelDropdownOpen((v) => !v); setLabelSearch(''); }}
                  title="Filtrer på etiketter"
                >
                  <Tag size={14} />
                  Etiketter{filterLabels.size > 0 ? ` (${filterLabels.size})` : ''}
                  <ChevronDown size={12} />
                </button>
                {labelDropdownOpen && (
                  <div className={styles.labelDropdown}>
                    <div className={styles.labelSearchWrapper}>
                      <input
                        type="text"
                        className={styles.labelSearchInput}
                        placeholder="Søk etiketter…"
                        value={labelSearch}
                        onChange={(e) => setLabelSearch(e.target.value)}
                        autoFocus
                      />
                    </div>
                    <div className={styles.labelOptionList}>
                      {availableLabels
                        .filter((label) =>
                          label.toLowerCase().includes(labelSearch.toLowerCase())
                        )
                        .map((label) => (
                          <label key={label} className={styles.labelOption}>
                            <input
                              type="checkbox"
                              checked={filterLabels.has(label)}
                              onChange={() => toggleLabel(label)}
                            />
                            <span>{label}</span>
                          </label>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {availableComponents.length > 0 && (
              <div className={styles.labelDropdownWrapper} ref={componentDropdownRef}>
                <button
                  className={`${styles.sortButton} ${filterComponents.size > 0 ? styles.sortButtonActive : ''}`}
                  onClick={() => { setComponentDropdownOpen((v) => !v); setComponentSearch(''); }}
                  title="Filtrer på komponenter"
                >
                  <Layers size={14} />
                  Komponent{filterComponents.size > 0 ? ` (${filterComponents.size})` : ''}
                  <ChevronDown size={12} />
                </button>
                {componentDropdownOpen && (
                  <div className={styles.labelDropdown}>
                    <div className={styles.labelSearchWrapper}>
                      <input
                        type="text"
                        className={styles.labelSearchInput}
                        placeholder="Søk komponenter…"
                        value={componentSearch}
                        onChange={(e) => setComponentSearch(e.target.value)}
                        autoFocus
                      />
                    </div>
                    <div className={styles.labelOptionList}>
                      {availableComponents
                        .filter((comp) =>
                          comp.toLowerCase().includes(componentSearch.toLowerCase())
                        )
                        .map((comp) => (
                          <label key={comp} className={styles.labelOption}>
                            <input
                              type="checkbox"
                              checked={filterComponents.has(comp)}
                              onChange={() => toggleComponent(comp)}
                            />
                            <span>{comp}</span>
                          </label>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {(mode === 'list' || mode === 'timeline') && availableIssueTypes.length > 0 && (
              <select
                className={styles.filterSelect}
                value={filterIssueType}
                onChange={(e) => setFilterIssueType(e.target.value)}
                title="Filtrer på oppgavetype"
              >
                <option value="">Alle typer</option>
                {availableIssueTypes.map((t) => (
                  <option key={t.name} value={t.name}>{t.name}</option>
                ))}
              </select>
            )}

            {(mode === 'list' || mode === 'timeline') && availableStatuses.length > 0 && (
              <select
                className={styles.filterSelect}
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                title="Filtrer på status"
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

            {mode !== 'timeline' && (
              <button
                className={`${styles.sortButton} ${sortByDueDate ? styles.sortButtonActive : ''}`}
                onClick={() => setSortByDueDate((v) => !v)}
                title="Sorter etter forfallsdato"
              >
                <ArrowUpDown size={14} />
                Forfallsdato
              </button>
            )}

            {(filterPriority || filterAssignee || filterLabels.size > 0 || filterComponents.size > 0 || filterStatus || filterIssueType || sortByDueDate) && (
              <button
                className={styles.clearFiltersButton}
                onClick={() => { setFilterPriority(''); setFilterAssignee(''); setFilterLabels(new Set()); setFilterComponents(new Set()); setFilterStatus(''); setFilterIssueType(''); setSortByDueDate(false); }}
                title="Fjern alle filtre"
              >
                <X size={14} />
              </button>
            )}
          </div>
        )}

        <button className={styles.refreshButton} onClick={() => refetch()} title="Oppdater">
          <RefreshCw size={16} />
        </button>

        {mode !== 'search' && (
          <span className={styles.issueCount}>{displayedIssues.length} saker totalt</span>
        )}
      </div>

      {/* Feilmelding */}
      {isError && (
        <div className={styles.errorBanner}>
          <AlertCircle size={16} />
          Kunne ikke laste saker —{' '}
          <Link to="/settings">sjekk API-innstillinger</Link>
        </div>
      )}

      {/* Board */}
      {mode === 'search' ? (
        searchLoading ? (
          <LoadingOverlay message="Søker…" />
        ) : starredProjects.size === 0 ? (
          <div className={styles.searchHint}>
            <Star size={32} />
            <p>Stjernemerk minst ett prosjekt for å søke i det.</p>
            <p className={styles.searchHintSub}>Velg et prosjekt i modus <strong>Prosjekt</strong> og trykk stjernen ved siden av velgeren.</p>
          </div>
        ) : !submittedQuery ? (
          <div className={styles.searchHint}>
            <Search size={32} />
            <p>Skriv et søkeord og trykk Søk.</p>
            <p className={styles.searchHintSub}>Søker i sammendrag og beskrivelse i {starredProjects.size} stjernemerkede prosjekter.</p>
          </div>
        ) : (searchResults ?? []).length === 0 ? (
          <div className={styles.searchHint}>
            <p>Ingen saker funnet for <strong>"{submittedQuery}"</strong>.</p>
          </div>
        ) : (
          <>
            <p className={styles.searchResultCount}>{searchResults!.length} saker funnet for "{submittedQuery}"</p>
            <IssueList
              issues={searchResults!}
              jiraBaseUrl={jiraBaseUrl}
              onIssueClick={setSelectedIssue}
            />
          </>
        )
      ) : isLoading ? (
        <LoadingOverlay message="Laster saker…" />
      ) : mode === 'sprint' && selectedProjectKey ? (
        <SprintView
          projectKey={selectedProjectKey}
          jiraBaseUrl={jiraBaseUrl}
          onIssueClick={setSelectedIssue}
        />
      ) : mode === 'list' ? (
        <IssueList
          issues={listIssues}
          jiraBaseUrl={jiraBaseUrl}
          onIssueClick={setSelectedIssue}
        />
      ) : mode === 'pulse' && selectedProjectKey ? (
        <ProjectPulse issues={pulseIssues} jiraBaseUrl={jiraBaseUrl} />
      ) : mode === 'timeline' && selectedProjectKey ? (
        <Timeline issues={timelineIssues} jiraBaseUrl={jiraBaseUrl} />
      ) : mode === 'activity' && selectedProjectKey ? (
        <div className={styles.activityFeed}>
          {activityIssues.length === 0 ? (
            <p className={styles.emptyColumn}>Ingen saker funnet</p>
          ) : (
            activityIssues.map((issue) => (
              <div
                key={issue.key}
                className={styles.activityItem}
                onClick={() => setSelectedIssue(issue)}
              >
                <span
                  className={`${styles.activityDot} ${
                    issue.status.category === 'done'
                      ? styles.activityDotDone
                      : issue.status.category === 'indeterminate'
                      ? styles.activityDotActive
                      : styles.activityDotNew
                  }`}
                />
                <div className={styles.activityMain}>
                  <div className={styles.activityTop}>
                    {issue.issueType.iconUrl && (
                      <img
                        src={issue.issueType.iconUrl}
                        alt={issue.issueType.name}
                        className={styles.issueTypeIcon}
                      />
                    )}
                    <a
                      href={`${jiraBaseUrl}/browse/${issue.key}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.issueKey}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {issue.key}
                    </a>
                    <span className={styles.activitySummary}>{issue.summary}</span>
                  </div>
                  <div className={styles.activityMeta}>
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
                    {issue.assignee && (
                      issue.assignee.avatarUrl ? (
                        <img
                          src={issue.assignee.avatarUrl}
                          alt={issue.assignee.displayName}
                          className={styles.activityAvatar}
                          title={issue.assignee.displayName}
                        />
                      ) : (
                        <span
                          className={styles.assigneeInitial}
                          title={issue.assignee.displayName}
                        >
                          {issue.assignee.displayName.charAt(0)}
                        </span>
                      )
                    )}
                  </div>
                </div>
                <span className={styles.activityTime}>{relativeTime(issue.updated)}</span>
              </div>
            ))
          )}
        </div>
      ) : (
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className={styles.board}>
            {COLUMNS.map((column) => {
              const columnIssues = getColumnIssues(column.id);
              return (
                <div key={column.id} className={styles.column}>
                  <div className={styles.columnHeader}>
                    <h3 className={styles.columnTitle}>{column.label}</h3>
                    <span className={styles.columnCount}>{columnIssues.length}</span>
                    {column.id === 'done' && (
                      <button
                        className={styles.doneFilterButton}
                        onClick={() => setShowAllDone((v) => !v)}
                        title={showAllDone ? 'Vis kun siste måned' : 'Vis alle ferdige'}
                      >
                        {showAllDone ? <EyeOff size={14} /> : <Eye size={14} />}
                        <span>{showAllDone ? 'Siste måned' : 'Alle'}</span>
                      </button>
                    )}
                  </div>
                  <Droppable droppableId={column.id}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`${styles.columnContent} ${
                          snapshot.isDraggingOver ? styles.draggingOver : ''
                        }`}
                      >
                        {columnIssues.length === 0 && !snapshot.isDraggingOver && (
                          <p className={styles.emptyColumn}>Ingen saker</p>
                        )}
                        {columnIssues.map((issue, index) => renderCard(issue, index))}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </div>
              );
            })}
          </div>
        </DragDropContext>
      )}

      {/* Sak-detalj-modal */}
      {selectedIssue && (
        <IssueModal
          issue={selectedIssue}
          jiraBaseUrl={jiraBaseUrl}
          isOpen={!!selectedIssue}
          onClose={() => setSelectedIssue(null)}
          onTransitioned={(issueKey, newStatus) => {
            queryClient.setQueryData<JiraIssue[]>(boardQueryKey, (old) =>
              (old ?? []).map((issue) =>
                issue.key === issueKey ? { ...issue, status: newStatus } : issue
              )
            );
            setSelectedIssue((prev) => (prev ? { ...prev, status: newStatus } : null));
            queryClient.invalidateQueries({ queryKey: ['boardIssues'] });
          }}
        />
      )}
    </div>
  );
}
