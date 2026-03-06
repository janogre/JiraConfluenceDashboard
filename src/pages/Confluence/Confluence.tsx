import { useState, useMemo } from 'react';
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
} from 'lucide-react';
import { Card, CardContent, Input, LoadingOverlay } from '../../components/common';
import {
  getSpaces,
  getChildPages,
  getSpaceHomePage,
  searchPages,
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
  const configured = isConfigured();

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setTimeout(() => {
      setDebouncedSearch(value);
    }, 300);
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

  const { data: spaces, isLoading: loadingSpaces } = useQuery({
    queryKey: ['confluenceSpaces'],
    queryFn: getSpaces,
    enabled: configured,
  });

  const isSearching = debouncedSearch.length >= 2;

  const { data: homePage, isLoading: loadingHomePage } = useQuery({
    queryKey: ['confluenceHomePage', selectedSpace?.key],
    queryFn: () => getSpaceHomePage(selectedSpace!.key),
    enabled: configured && !!selectedSpace && !isSearching,
  });

  const { data: searchResults, isLoading: loadingSearch } = useQuery({
    queryKey: ['confluenceSearch', debouncedSearch, selectedSpace?.key],
    queryFn: () => searchPages(debouncedSearch, selectedSpace?.key),
    enabled: configured && isSearching,
  });

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

  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('nb-NO', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
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
                onClick={() => setSelectedSpace(space)}
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
            <h3 className={styles.sectionTitle}>
              {isSearching
                ? `Søkeresultater (${searchResults?.length || 0})`
                : selectedSpace
                ? selectedSpace.name
                : 'Velg et område'}
            </h3>
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

          {isLoadingContent ? (
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
          ) : (
            // Tree view
            <div className={styles.treeView}>
              {homePage && <PageTreeNode page={homePage} />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
