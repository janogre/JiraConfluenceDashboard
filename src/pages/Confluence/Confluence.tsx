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
} from 'lucide-react';
import { Card, CardContent, Input, LoadingOverlay } from '../../components/common';
import {
  getSpaces,
  getChildPages,
  getSpaceHomePage,
  searchPages,
  getRecentPages,
  getPagesByAuthor,
} from '../../services/confluenceService';
import { isConfigured } from '../../services/api';
import type { ConfluencePage, ConfluenceSpace } from '../../types';
import styles from './Confluence.module.css';

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
  const [activeTab, setActiveTab] = useState<'pages' | 'recent' | 'author'>('pages');
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
        </div>
      </div>
    </div>
  );
}
