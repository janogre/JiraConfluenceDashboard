import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Search,
  ExternalLink,
  FileText,
  Folder,
  FolderOpen,
  Clock,
  ChevronRight,
  ChevronDown,
  Loader2,
  Star,
  User,
  CheckSquare,
  Check,
  Plus,
} from 'lucide-react';
import { Card, CardContent, Input, LoadingOverlay, Modal } from '../../components/common';
import { useTodoStore } from '../../store/todoStore';
import type { ConfluenceTask } from '../../types';
import {
  getSpaces,
  getChildPages,
  getSpaceHomePage,
  searchPages,
  getRecentPages,
  getPagesByAuthor,
  findPageByTitle,
  getInlineTasks,
} from '../../services/confluenceService';
import { isConfigured } from '../../services/api';
import type { ConfluencePage, ConfluenceSpace } from '../../types';
import { MeetingNoteEditor } from './MeetingNoteEditor';
import styles from './Confluence.module.css';

interface CreateTodoFromTaskModalProps {
  task: ConfluenceTask;
  onClose: () => void;
}

function CreateTodoFromTaskModal({ task, onClose }: CreateTodoFromTaskModalProps) {
  const { addTodo } = useTodoStore();
  const [content, setContent] = useState(task.body);
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [dueDate, setDueDate] = useState(
    task.dueDate ? new Date(task.dueDate).toISOString().split('T')[0] : ''
  );
  const [created, setCreated] = useState(false);

  const handleCreate = () => {
    addTodo({
      content: content.trim(),
      priority,
      dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
      linkedConfluenceTask: {
        globalId: task.globalId,
        body: task.body,
        pageTitle: task.pageTitle,
        pageUrl: task.pageUrl,
      },
    });
    setCreated(true);
    setTimeout(onClose, 1500);
  };

  return (
    <Modal isOpen onClose={onClose} title="Legg til oppgaveliste" size="sm">
      {created ? (
        <div className={styles.createdConfirm}>
          <Check size={20} className={styles.createdIcon} />
          Lagt til i oppgavelisten!
        </div>
      ) : (
        <div className={styles.createForm}>
          <div className={styles.createFormMeta}>
            <FileText size={13} />
            <a href={task.pageUrl} target="_blank" rel="noopener noreferrer" className={styles.createFormPageLink}>
              {task.pageTitle}
            </a>
          </div>
          <div className={styles.formField}>
            <label className={styles.formLabel}>Innhold</label>
            <input
              className={styles.formInput}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              autoFocus
            />
          </div>
          <div className={styles.formField}>
            <label className={styles.formLabel}>Prioritet</label>
            <select
              className={styles.formSelect}
              value={priority}
              onChange={(e) => setPriority(e.target.value as 'low' | 'medium' | 'high')}
            >
              <option value="low">Lav</option>
              <option value="medium">Middels</option>
              <option value="high">Høy</option>
            </select>
          </div>
          <div className={styles.formField}>
            <label className={styles.formLabel}>Forfallsdato</label>
            <input
              type="date"
              className={styles.formInput}
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
          <div className={styles.formActions}>
            <button className={styles.createBtn} onClick={handleCreate} disabled={!content.trim()}>
              Legg til
            </button>
            <button className={styles.cancelBtn} onClick={onClose}>
              Avbryt
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function PageTreeNode({ page }: { page: ConfluencePage }) {
  const [expanded, setExpanded] = useState(false);
  const configured = isConfigured();

  const { data: children, isFetching } = useQuery({
    queryKey: ['confluenceChildren', page.id],
    queryFn: () => getChildPages(page.id),
    enabled: configured && expanded,
  });

  const canExpand = page.hasChildren !== false;

  return (
    <div className={styles.treeNode}>
      <div className={styles.treeNodeRow}>
        <button
          className={styles.treeToggle}
          style={{ visibility: canExpand ? 'visible' : 'hidden' }}
          onClick={() => canExpand && setExpanded(!expanded)}
          aria-label={expanded ? 'Skjul undersider' : 'Vis undersider'}
        >
          {isFetching ? (
            <Loader2 size={13} className={styles.treeSpinner} />
          ) : expanded ? (
            <ChevronDown size={14} />
          ) : (
            <ChevronRight size={14} />
          )}
        </button>
        {page.type === 'folder' ? (
          <Folder size={14} className={styles.treeFolderIcon} />
        ) : (
          <FileText size={14} className={styles.treePageIcon} />
        )}
        <a
          href={page.url}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.treePageTitle}
          onClick={(e) => e.stopPropagation()}
        >
          {page.title}
        </a>
        <a
          href={page.url}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.treePageLink}
          title="Åpne i Confluence"
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink size={12} />
        </a>
      </div>

      {expanded && children && children.length > 0 && (
        <div className={styles.treeChildren}>
          {children.map((child) => (
            <PageTreeNode key={child.id} page={child} />
          ))}
        </div>
      )}
    </div>
  );
}

function MeetingFolderNode({ folder, formatDate }: { folder: ConfluencePage; formatDate: (d: string) => string }) {
  const [expanded, setExpanded] = useState(false);
  const configured = isConfigured();

  const { data: children, isFetching } = useQuery({
    queryKey: ['confluenceChildren', folder.id],
    queryFn: () => getChildPages(folder.id),
    enabled: configured && expanded,
  });

  const sortedChildren = useMemo(() => {
    if (!children) return [];
    const subFolders = children
      .filter((p) => p.type === 'folder' || p.hasChildren)
      .sort((a, b) => a.title.localeCompare(b.title, 'nb'));
    const pages = children
      .filter((p) => p.type !== 'folder' && !p.hasChildren)
      .sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime());
    return [...subFolders, ...pages];
  }, [children]);

  return (
    <div className={styles.meetingFolder}>
      <button
        className={styles.meetingFolderRow}
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <span className={styles.meetingFolderToggle}>
          {isFetching ? (
            <Loader2 size={13} className={styles.treeSpinner} />
          ) : expanded ? (
            <ChevronDown size={14} />
          ) : (
            <ChevronRight size={14} />
          )}
        </span>
        {expanded ? (
          <FolderOpen size={15} className={styles.treeFolderIcon} />
        ) : (
          <Folder size={15} className={styles.treeFolderIcon} />
        )}
        <span className={styles.meetingFolderTitle}>{folder.title}</span>
      </button>

      {expanded && (
        <div className={styles.meetingFolderChildren}>
          {!isFetching && sortedChildren.length === 0 ? (
            <div className={styles.meetingFolderEmpty}>Ingen sider</div>
          ) : (
            sortedChildren.map((child) =>
              child.type === 'folder' || child.hasChildren ? (
                <MeetingFolderNode key={child.id} folder={child} formatDate={formatDate} />
              ) : (
                <div key={child.id} className={styles.recentFeedItem}>
                  <FileText size={15} className={styles.treePageIcon} />
                  <div className={styles.recentItemContent}>
                    <a
                      href={child.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.recentItemTitle}
                    >
                      {child.title}
                    </a>
                    <div className={styles.recentItemMeta}>
                      {child.lastModified && (
                        <span>
                          <Clock size={11} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 2 }} />
                          {formatDate(child.lastModified)}
                        </span>
                      )}
                      {child.lastModifiedBy && (
                        <>
                          <span>·</span>
                          <span>{child.lastModifiedBy.displayName}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <a
                    href={child.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.treePageLink}
                    title="Åpne i Confluence"
                  >
                    <ExternalLink size={12} />
                  </a>
                </div>
              )
            )
          )}
        </div>
      )}
    </div>
  );
}

const STARRED_SPACES_KEY = 'confluence_starred_spaces';

function loadStarred(): Set<string> {
  try {
    const raw = localStorage.getItem(STARRED_SPACES_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function saveStarred(keys: Set<string>) {
  localStorage.setItem(STARRED_SPACES_KEY, JSON.stringify([...keys]));
}

export function Confluence() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSpace, setSelectedSpace] = useState<ConfluenceSpace | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [spaceSearch, setSpaceSearch] = useState('');
  const [starredKeys, setStarredKeys] = useState<Set<string>>(loadStarred);
  const [treeSearch, setTreeSearch] = useState('');
  const [debouncedTreeSearch, setDebouncedTreeSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'pages' | 'recent' | 'author' | 'meetings' | 'tasks' | 'new-note'>('pages');
  const [taskStatus, setTaskStatus] = useState<'incomplete' | 'complete'>('incomplete');
  const [taskAssigneeFilter, setTaskAssigneeFilter] = useState<string>('');
  const [taskDueDateFilter, setTaskDueDateFilter] = useState<'all' | 'overdue' | 'week' | 'no-due'>('all');
  const [createTodoFromTask, setCreateTodoFromTask] = useState<ConfluenceTask | null>(null);
  const { getTodosByConfluenceTask } = useTodoStore();
  const [selectedAuthorId, setSelectedAuthorId] = useState<string | null>(null);
  const [authorSearch, setAuthorSearch] = useState('');
  const configured = isConfigured();

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setTimeout(() => {
      setDebouncedSearch(value);
    }, 300);
  };

  const handleTreeSearchChange = (value: string) => {
    setTreeSearch(value);
    setTimeout(() => {
      setDebouncedTreeSearch(value);
    }, 250);
  };

  const toggleStar = (e: React.MouseEvent, spaceKey: string) => {
    e.stopPropagation();
    setStarredKeys((prev) => {
      const next = new Set(prev);
      if (next.has(spaceKey)) {
        next.delete(spaceKey);
      } else {
        next.add(spaceKey);
      }
      saveStarred(next);
      return next;
    });
  };

  // Reset author state when selected space changes
  useEffect(() => {
    setSelectedAuthorId(null);
    setAuthorSearch('');
  }, [selectedSpace]);

  const { data: spaces, isLoading: loadingSpaces } = useQuery({
    queryKey: ['confluenceSpaces'],
    queryFn: getSpaces,
    enabled: configured,
  });

  const isSearching = debouncedSearch.length >= 2;

  const { data: homePage, isLoading: loadingHomePage } = useQuery({
    queryKey: ['confluenceHomePage', selectedSpace?.key],
    queryFn: () => getSpaceHomePage(selectedSpace!.key),
    enabled: configured && !!selectedSpace && !isSearching && activeTab === 'pages',
  });

  const { data: searchResults, isLoading: loadingSearch } = useQuery({
    queryKey: ['confluenceSearch', debouncedSearch, selectedSpace?.key],
    queryFn: () => searchPages(debouncedSearch, selectedSpace?.key),
    enabled: configured && isSearching,
  });

  const isTreeSearching = debouncedTreeSearch.length >= 2;

  const { data: treeSearchResults, isLoading: loadingTreeSearch } = useQuery({
    queryKey: ['confluenceTreeSearch', debouncedTreeSearch, selectedSpace?.key],
    queryFn: () => searchPages(debouncedTreeSearch, selectedSpace?.key),
    enabled: configured && !!selectedSpace && isTreeSearching && !isSearching && activeTab === 'pages',
  });

  const { data: recentPages, isLoading: loadingRecent } = useQuery({
    queryKey: ['confluenceRecent', selectedSpace?.key],
    queryFn: () => getRecentPages(30, selectedSpace?.key ?? undefined),
    enabled: configured && activeTab === 'recent' && !isSearching,
  });

  const { data: authorPoolPages } = useQuery({
    queryKey: ['confluenceAuthorPool', selectedSpace?.key],
    queryFn: () => getRecentPages(50, selectedSpace?.key ?? undefined),
    enabled: configured && activeTab === 'author' && !isSearching,
  });

  const { data: authorPages, isLoading: loadingAuthorPages } = useQuery({
    queryKey: ['confluenceAuthorPages', selectedAuthorId, selectedSpace?.key],
    queryFn: () => getPagesByAuthor(selectedAuthorId!, selectedSpace?.key ?? undefined),
    enabled: configured && !!selectedAuthorId && activeTab === 'author' && !isSearching,
  });

  const { data: meetingParent, isLoading: loadingMeetingParent } = useQuery({
    queryKey: ['confluenceMeetingParent', selectedSpace?.key],
    queryFn: () => findPageByTitle('Møtenotater', selectedSpace!.key),
    enabled: configured && !!selectedSpace && activeTab === 'meetings' && !isSearching,
  });

  const { data: meetingNotes, isLoading: loadingMeetingNotes } = useQuery({
    queryKey: ['confluenceMeetingNotes', meetingParent?.id],
    queryFn: () => getChildPages(meetingParent!.id),
    enabled: configured && !!meetingParent && activeTab === 'meetings' && !isSearching,
  });

  const { data: inlineTasks = [], isLoading: loadingTasks } = useQuery({
    queryKey: ['confluenceTasks', selectedSpace?.key, taskStatus],
    queryFn: () => getInlineTasks(selectedSpace?.key ?? undefined, taskStatus),
    enabled: configured && activeTab === 'tasks' && !isSearching,
  });

  const taskAssignees = useMemo(() => {
    const seen = new Map<string, string>();
    inlineTasks.forEach((t) => {
      if (t.assignee?.accountId && !seen.has(t.assignee.accountId)) {
        seen.set(t.assignee.accountId, t.assignee.displayName);
      }
    });
    return [...seen.entries()].map(([accountId, displayName]) => ({ accountId, displayName }));
  }, [inlineTasks]);

  const filteredTasks = useMemo(() => {
    const now = Date.now();
    const startOfWeek = new Date();
    startOfWeek.setHours(0, 0, 0, 0);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay() + 1);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    return inlineTasks.filter((t) => {
      if (taskAssigneeFilter && t.assignee?.accountId !== taskAssigneeFilter) return false;
      if (taskDueDateFilter === 'overdue') return t.dueDate != null && t.dueDate < now;
      if (taskDueDateFilter === 'week') return t.dueDate != null && t.dueDate >= startOfWeek.getTime() && t.dueDate <= endOfWeek.getTime();
      if (taskDueDateFilter === 'no-due') return t.dueDate == null;
      return true;
    });
  }, [inlineTasks, taskAssigneeFilter, taskDueDateFilter]);

  const sortedMeetingNotes = useMemo(() => {
    const notes = [...(meetingNotes ?? [])];
    const folders = notes
      .filter((p) => p.type === 'folder' || p.hasChildren)
      .sort((a, b) => a.title.localeCompare(b.title, 'nb'));
    const pages = notes
      .filter((p) => p.type !== 'folder' && !p.hasChildren)
      .sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime());
    return { folders, pages, total: notes.length };
  }, [meetingNotes]);

  const uniqueAuthors = useMemo(() => {
    if (!authorPoolPages) return [];
    const seen = new Map<string, { id: string; displayName: string; avatarUrl?: string }>();
    authorPoolPages.forEach((p) => {
      if (p.lastModifiedBy?.id && !seen.has(p.lastModifiedBy.id)) {
        seen.set(p.lastModifiedBy.id, {
          id: p.lastModifiedBy.id,
          displayName: p.lastModifiedBy.displayName,
          avatarUrl: p.lastModifiedBy.avatarUrl,
        });
      }
    });
    const all = [...seen.values()];
    if (!authorSearch.trim()) return all;
    const q = authorSearch.toLowerCase();
    return all.filter((a) => a.displayName.toLowerCase().includes(q));
  }, [authorPoolPages, authorSearch]);

  const visibleSpaces = useMemo(() => {
    if (!spaces) return [];
    if (spaceSearch.trim()) {
      const q = spaceSearch.toLowerCase();
      return spaces.filter(
        (s) => s.name.toLowerCase().includes(q) || s.key.toLowerCase().includes(q)
      );
    }
    return spaces.filter((s) => starredKeys.has(s.key));
  }, [spaces, spaceSearch, starredKeys]);

  if (!configured) {
    return (
      <div className={styles.notConfigured}>
        <p>Konfigurer API-innstillinger først.</p>
      </div>
    );
  }

  if (loadingSpaces) {
    return <LoadingOverlay message="Laster inn områder..." />;
  }

  const isLoadingContent = loadingHomePage || loadingSearch;

  const highlightMatch = (text: string, query: string) => {
    if (!query) return text;
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark className={styles.matchHighlight}>{text.slice(idx, idx + query.length)}</mark>
        {text.slice(idx + query.length)}
      </>
    );
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('nb-NO', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getPagesHeaderTitle = () => {
    if (isSearching) return `Søkeresultater (${searchResults?.length || 0})`;
    if (activeTab === 'recent') return selectedSpace ? `Nylig endret i ${selectedSpace.name}` : 'Nylig endrede sider';
    if (activeTab === 'author') return selectedSpace ? `Forfattere i ${selectedSpace.name}` : 'Forfattere';
    return selectedSpace ? selectedSpace.name : 'Velg et område';
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <Input
          placeholder="Søk i sider..."
          value={searchTerm}
          onChange={(e) => handleSearchChange(e.target.value)}
          icon={<Search size={18} />}
          className={styles.searchInput}
        />
      </div>

      <div className={styles.content}>
        {/* Spaces List */}
        <div className={styles.spacesList}>
          <div className={styles.spacesHeader}>
            <h3 className={styles.sectionTitle}>Områder</h3>
          </div>
          <div className={styles.spaceSearchWrapper}>
            <Input
              placeholder="Søk etter område..."
              value={spaceSearch}
              onChange={(e) => setSpaceSearch(e.target.value)}
              icon={<Search size={15} />}
            />
          </div>
          <div className={styles.spacesGrid}>
            {visibleSpaces.length === 0 && (
              <div className={styles.spacesEmpty}>
                {spaceSearch
                  ? 'Ingen områder funnet'
                  : 'Stjernemerk et område for å se det her'}
              </div>
            )}
            {visibleSpaces.map((space) => (
              <Card
                key={space.key}
                hoverable
                onClick={() => { setSelectedSpace(space); setTreeSearch(''); setDebouncedTreeSearch(''); }}
                className={`${styles.spaceCard} ${selectedSpace?.key === space.key ? styles.selected : ''}`}
              >
                <CardContent className={styles.spaceContent}>
                  <div className={styles.spaceIcon}>
                    <FolderOpen size={18} />
                  </div>
                  <div className={styles.spaceInfo}>
                    <h4 className={styles.spaceName}>{space.name}</h4>
                    <span className={styles.spaceKey}>{space.key}</span>
                  </div>
                  <button
                    className={`${styles.starButton} ${starredKeys.has(space.key) ? styles.starActive : ''}`}
                    onClick={(e) => toggleStar(e, space.key)}
                    title={starredKeys.has(space.key) ? 'Fjern bokmerke' : 'Bokmerk område'}
                  >
                    <Star size={15} />
                  </button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Pages / Tree View */}
        <div className={styles.pagesList}>
          <div className={styles.pagesHeader}>
            <h3 className={styles.sectionTitle}>{getPagesHeaderTitle()}</h3>
            {selectedSpace && (
              <a
                href={selectedSpace.url}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.openInConfluence}
              >
                Åpne i Confluence
                <ExternalLink size={14} />
              </a>
            )}
          </div>

          {!isSearching && (
            <div className={styles.tabsBar}>
              <button
                className={`${styles.tab} ${activeTab === 'pages' ? styles.tabActive : ''}`}
                onClick={() => setActiveTab('pages')}
              >
                Sider
              </button>
              <button
                className={`${styles.tab} ${activeTab === 'recent' ? styles.tabActive : ''}`}
                onClick={() => setActiveTab('recent')}
              >
                Nylig endret
              </button>
              <button
                className={`${styles.tab} ${activeTab === 'author' ? styles.tabActive : ''}`}
                onClick={() => setActiveTab('author')}
              >
                Etter forfatter
              </button>
              <button
                className={`${styles.tab} ${activeTab === 'meetings' ? styles.tabActive : ''}`}
                onClick={() => setActiveTab('meetings')}
                disabled={!selectedSpace}
                title={!selectedSpace ? 'Velg et område for å se møtenotater' : undefined}
              >
                Møtenotater
              </button>
              <button
                className={`${styles.tab} ${activeTab === 'tasks' ? styles.tabActive : ''}`}
                onClick={() => setActiveTab('tasks')}
              >
                Handlingselementer
              </button>
              <button
                className={`${styles.tab} ${activeTab === 'new-note' ? styles.tabActive : ''} ${styles.tabNewNote}`}
                onClick={() => setActiveTab('new-note')}
                disabled={!selectedSpace}
                title={!selectedSpace ? 'Velg et område for å skrive møtenotat' : undefined}
              >
                + Nytt notat
              </button>
            </div>
          )}

          {/* Tab: Sider */}
          {(isSearching || activeTab === 'pages') && (
            <>
              {selectedSpace && !isSearching && (
                <div className={styles.treeSearchWrapper}>
                  <Input
                    placeholder={`Søk i ${selectedSpace.name}…`}
                    value={treeSearch}
                    onChange={(e) => handleTreeSearchChange(e.target.value)}
                    icon={<Search size={15} />}
                  />
                </div>
              )}

              {isLoadingContent || loadingTreeSearch ? (
                <LoadingOverlay message="Laster inn..." />
              ) : !selectedSpace && !isSearching ? (
                <div className={styles.emptyState}>
                  <FileText size={48} />
                  <p>Velg et område for å se sidestrukturen</p>
                </div>
              ) : isSearching ? (
                searchResults?.length === 0 ? (
                  <div className={styles.emptyState}>
                    <FileText size={48} />
                    <p>Ingen sider funnet</p>
                  </div>
                ) : (
                  <div className={styles.pagesGrid}>
                    {searchResults?.map((page) => (
                      <Card key={page.id} hoverable className={styles.pageCard}>
                        <CardContent>
                          <div className={styles.pageHeader}>
                            <FileText size={20} className={styles.pageIcon} />
                            <div className={styles.pageInfo}>
                              <h4 className={styles.pageTitle}>{page.title}</h4>
                              {page.spaceName && (
                                <span className={styles.pageSpace}>{page.spaceName}</span>
                              )}
                            </div>
                            <a
                              href={page.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={styles.pageLink}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <ExternalLink size={16} />
                            </a>
                          </div>
                          {page.excerpt && (
                            <p className={styles.pageExcerpt}>{page.excerpt}</p>
                          )}
                          <div className={styles.pageMeta}>
                            {page.lastModified && (
                              <div className={styles.metaItem}>
                                <Clock size={14} />
                                <span>{formatDate(page.lastModified)}</span>
                              </div>
                            )}
                            {page.lastModifiedBy && (
                              <div className={styles.metaItem}>
                                <span>av {page.lastModifiedBy.displayName}</span>
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )
              ) : isTreeSearching && selectedSpace ? (
                treeSearchResults?.length === 0 ? (
                  <div className={styles.emptyState}>
                    <Search size={36} />
                    <p>Ingen sider funnet for «{treeSearch}»</p>
                  </div>
                ) : (
                  <div className={styles.treeSearchResults}>
                    {treeSearchResults?.map((page) => (
                      <div key={page.id} className={styles.treeSearchRow}>
                        <FileText size={14} className={styles.treePageIcon} />
                        <a
                          href={page.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.treeSearchTitle}
                        >
                          {highlightMatch(page.title, debouncedTreeSearch)}
                        </a>
                        <a
                          href={page.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.treePageLink}
                          title="Åpne i Confluence"
                        >
                          <ExternalLink size={12} />
                        </a>
                      </div>
                    ))}
                  </div>
                )
              ) : (
                <div className={styles.treeView}>
                  {homePage && <PageTreeNode page={homePage} />}
                </div>
              )}
            </>
          )}

          {/* Tab: Nylig endret */}
          {!isSearching && activeTab === 'recent' && (
            <>
              {loadingRecent ? (
                <LoadingOverlay message="Laster inn..." />
              ) : !recentPages || recentPages.length === 0 ? (
                <div className={styles.emptyState}>
                  <Clock size={48} />
                  <p>Ingen nylig endrede sider funnet</p>
                </div>
              ) : (
                <div className={styles.recentFeed}>
                  {recentPages.map((page) => (
                    <div key={page.id} className={styles.recentFeedItem}>
                      <FileText size={15} className={styles.treePageIcon} />
                      <div className={styles.recentItemContent}>
                        <a
                          href={page.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.recentItemTitle}
                        >
                          {page.title}
                        </a>
                        <div className={styles.recentItemMeta}>
                          {page.spaceName && <span>{page.spaceName}</span>}
                          {page.spaceName && page.lastModified && <span>·</span>}
                          {page.lastModified && (
                            <span>
                              <Clock size={11} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 2 }} />
                              {formatDate(page.lastModified)}
                            </span>
                          )}
                          {page.lastModifiedBy && (
                            <>
                              <span>·</span>
                              <span>{page.lastModifiedBy.displayName}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <a
                        href={page.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.treePageLink}
                        title="Åpne i Confluence"
                      >
                        <ExternalLink size={12} />
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Tab: Etter forfatter */}
          {!isSearching && activeTab === 'author' && (
            <div className={styles.authorLayout}>
              <div className={styles.authorListPanel}>
                <div className={styles.authorSearch}>
                  <Input
                    placeholder="Søk forfatter..."
                    value={authorSearch}
                    onChange={(e) => setAuthorSearch(e.target.value)}
                    icon={<Search size={13} />}
                  />
                </div>
                <div className={styles.authorList}>
                  {!authorPoolPages ? (
                    <div className={styles.authorLoading}>
                      <Loader2 size={16} className={styles.treeSpinner} />
                    </div>
                  ) : uniqueAuthors.length === 0 ? (
                    <div className={styles.authorEmpty}>Ingen forfattere funnet</div>
                  ) : (
                    uniqueAuthors.map((author) => (
                      <button
                        key={author.id}
                        className={`${styles.authorItem} ${selectedAuthorId === author.id ? styles.authorItemActive : ''}`}
                        onClick={() => setSelectedAuthorId(author.id)}
                      >
                        {author.avatarUrl ? (
                          <img src={author.avatarUrl} alt={author.displayName} className={styles.authorAvatar} />
                        ) : (
                          <span className={styles.authorInitial}>
                            {author.displayName.charAt(0).toUpperCase()}
                          </span>
                        )}
                        <span className={styles.authorName}>{author.displayName}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>

              <div className={styles.authorPages}>
                {!selectedAuthorId ? (
                  <div className={styles.emptyState}>
                    <User size={36} />
                    <p>Velg en forfatter for å se deres sider</p>
                  </div>
                ) : loadingAuthorPages ? (
                  <LoadingOverlay message="Laster inn sider..." />
                ) : !authorPages || authorPages.length === 0 ? (
                  <div className={styles.emptyState}>
                    <FileText size={36} />
                    <p>Ingen sider funnet for denne forfatteren</p>
                  </div>
                ) : (
                  authorPages.map((page) => (
                    <div key={page.id} className={styles.recentFeedItem}>
                      <FileText size={15} className={styles.treePageIcon} />
                      <div className={styles.recentItemContent}>
                        <a
                          href={page.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.recentItemTitle}
                        >
                          {page.title}
                        </a>
                        <div className={styles.recentItemMeta}>
                          {page.spaceName && <span>{page.spaceName}</span>}
                          {page.lastModified && (
                            <>
                              <span>·</span>
                              <span>
                                <Clock size={11} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 2 }} />
                                {formatDate(page.lastModified)}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <a
                        href={page.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.treePageLink}
                        title="Åpne i Confluence"
                      >
                        <ExternalLink size={12} />
                      </a>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
          {/* Tab: Møtenotater */}
          {!isSearching && activeTab === 'meetings' && (
            <>
              {loadingMeetingParent || loadingMeetingNotes ? (
                <LoadingOverlay message="Laster inn møtenotater..." />
              ) : !meetingParent ? (
                <div className={styles.emptyState}>
                  <FileText size={48} />
                  <p>Fant ingen side kalt «Møtenotater» i dette området.</p>
                </div>
              ) : sortedMeetingNotes.total === 0 ? (
                <div className={styles.emptyState}>
                  <FileText size={48} />
                  <p>Ingen møtenotater funnet.</p>
                </div>
              ) : (
                <div className={styles.recentFeed}>
                  {sortedMeetingNotes.folders.map((folder) => (
                    <MeetingFolderNode key={folder.id} folder={folder} formatDate={formatDate} />
                  ))}
                  {sortedMeetingNotes.pages.map((page) => (
                    <div key={page.id} className={styles.recentFeedItem}>
                      <FileText size={15} className={styles.treePageIcon} />
                      <div className={styles.recentItemContent}>
                        <a
                          href={page.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.recentItemTitle}
                        >
                          {page.title}
                        </a>
                        <div className={styles.recentItemMeta}>
                          {page.lastModified && (
                            <span>
                              <Clock size={11} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 2 }} />
                              {formatDate(page.lastModified)}
                            </span>
                          )}
                          {page.lastModifiedBy && (
                            <>
                              <span>·</span>
                              <span>{page.lastModifiedBy.displayName}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <a
                        href={page.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.treePageLink}
                        title="Åpne i Confluence"
                      >
                        <ExternalLink size={12} />
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
          {/* Tab: Nytt notat */}
          {!isSearching && activeTab === 'new-note' && selectedSpace && (
            <MeetingNoteEditor space={selectedSpace} />
          )}

          {/* Tab: Handlingselementer */}
          {!isSearching && activeTab === 'tasks' && (
            <>
              <div className={styles.taskFilterBar}>
                <button
                  className={`${styles.taskStatusBtn} ${taskStatus === 'incomplete' ? styles.taskStatusActive : ''}`}
                  onClick={() => setTaskStatus('incomplete')}
                >Åpne</button>
                <button
                  className={`${styles.taskStatusBtn} ${taskStatus === 'complete' ? styles.taskStatusActive : ''}`}
                  onClick={() => setTaskStatus('complete')}
                >Fullført</button>
                <div className={styles.taskFilterSeparator} />
                <select
                  className={styles.taskFilterSelect}
                  value={taskAssigneeFilter}
                  onChange={(e) => setTaskAssigneeFilter(e.target.value)}
                >
                  <option value="">Alle ansvarlige</option>
                  {taskAssignees.map((a) => (
                    <option key={a.accountId} value={a.accountId}>{a.displayName}</option>
                  ))}
                </select>
                <select
                  className={styles.taskFilterSelect}
                  value={taskDueDateFilter}
                  onChange={(e) => setTaskDueDateFilter(e.target.value as typeof taskDueDateFilter)}
                >
                  <option value="all">Alle frister</option>
                  <option value="overdue">Forfalt</option>
                  <option value="week">Denne uken</option>
                  <option value="no-due">Uten frist</option>
                </select>
              </div>
              {loadingTasks ? (
                <LoadingOverlay message="Laster inn handlingselementer..." />
              ) : filteredTasks.length === 0 ? (
                <div className={styles.emptyState}>
                  <CheckSquare size={48} />
                  <p>{inlineTasks.length === 0 ? 'Ingen handlingselementer funnet.' : 'Ingen treff på valgte filtre.'}</p>
                </div>
              ) : (
                <div className={styles.taskList}>
                  {filteredTasks.map((task) => {
                    const alreadyAdded = getTodosByConfluenceTask(task.globalId).length > 0;
                    return (
                      <div key={task.globalId} className={styles.taskItem}>
                        <span className={`${styles.taskStatus} ${task.status === 'complete' ? styles.taskStatusDone : ''}`} />
                        <button
                          className={`${styles.taskAddTodoBtn} ${alreadyAdded ? styles.taskAddTodoBtnDone : ''}`}
                          title={alreadyAdded ? 'Allerede i oppgavelisten' : 'Legg til oppgaveliste'}
                          onClick={() => !alreadyAdded && setCreateTodoFromTask(task)}
                        >
                          {alreadyAdded ? <><Check size={12} /> Lagt til</> : <><Plus size={12} /> Legg til</>}
                        </button>
                        <div className={styles.taskBody}>
                          <span className={styles.taskText}>{task.body}</span>
                          <div className={styles.taskMeta}>
                            <a href={task.pageUrl} target="_blank" rel="noopener noreferrer"
                              className={styles.taskPageLink}>
                              <FileText size={12} />{task.pageTitle}
                            </a>
                            {task.assignee && <span>· {task.assignee.displayName}</span>}
                            {task.dueDate && (
                              <span className={task.status === 'incomplete' && task.dueDate < Date.now() ? styles.taskOverdue : undefined}>
                                · Frist: {new Date(task.dueDate).toLocaleDateString('nb-NO')}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {createTodoFromTask && (
        <CreateTodoFromTaskModal
          task={createTodoFromTask}
          onClose={() => setCreateTodoFromTask(null)}
        />
      )}
    </div>
  );
}
