import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, ExternalLink, FileText, FolderOpen, Clock } from 'lucide-react';
import { Card, CardContent, Input, LoadingOverlay } from '../../components/common';
import { getSpaces, getPages, searchPages } from '../../services/confluenceService';
import { isConfigured } from '../../services/api';
import type { ConfluenceSpace } from '../../types';
import styles from './Confluence.module.css';

export function Confluence() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSpace, setSelectedSpace] = useState<ConfluenceSpace | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const configured = isConfigured();

  // Debounce search
  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setTimeout(() => {
      setDebouncedSearch(value);
    }, 300);
  };

  const { data: spaces, isLoading: loadingSpaces } = useQuery({
    queryKey: ['confluenceSpaces'],
    queryFn: getSpaces,
    enabled: configured,
  });

  const { data: spacePages, isLoading: loadingPages } = useQuery({
    queryKey: ['confluencePages', selectedSpace?.key],
    queryFn: () => getPages(selectedSpace?.key),
    enabled: configured && !!selectedSpace,
  });

  const { data: searchResults, isLoading: loadingSearch } = useQuery({
    queryKey: ['confluenceSearch', debouncedSearch, selectedSpace?.key],
    queryFn: () => searchPages(debouncedSearch, selectedSpace?.key),
    enabled: configured && debouncedSearch.length >= 2,
  });

  if (!configured) {
    return (
      <div className={styles.notConfigured}>
        <p>Please configure your API settings first.</p>
      </div>
    );
  }

  if (loadingSpaces) {
    return <LoadingOverlay message="Loading spaces..." />;
  }

  const displayPages = debouncedSearch.length >= 2 ? searchResults : spacePages;
  const isLoadingContent = loadingPages || loadingSearch;

  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <Input
          placeholder="Search pages..."
          value={searchTerm}
          onChange={(e) => handleSearchChange(e.target.value)}
          icon={<Search size={18} />}
          className={styles.searchInput}
        />
      </div>

      <div className={styles.content}>
        {/* Spaces List */}
        <div className={styles.spacesList}>
          <h3 className={styles.sectionTitle}>Spaces ({spaces?.length || 0})</h3>
          <div className={styles.spacesGrid}>
            <Card
              hoverable
              onClick={() => setSelectedSpace(null)}
              className={`${styles.spaceCard} ${!selectedSpace ? styles.selected : ''}`}
            >
              <CardContent className={styles.spaceContent}>
                <div className={styles.spaceIcon}>
                  <FolderOpen size={20} />
                </div>
                <div className={styles.spaceInfo}>
                  <h4 className={styles.spaceName}>All Spaces</h4>
                  <span className={styles.spaceKey}>View all pages</span>
                </div>
              </CardContent>
            </Card>

            {spaces?.map((space) => (
              <Card
                key={space.key}
                hoverable
                onClick={() => setSelectedSpace(space)}
                className={`${styles.spaceCard} ${selectedSpace?.key === space.key ? styles.selected : ''}`}
              >
                <CardContent className={styles.spaceContent}>
                  <div className={styles.spaceIcon}>
                    <FolderOpen size={20} />
                  </div>
                  <div className={styles.spaceInfo}>
                    <h4 className={styles.spaceName}>{space.name}</h4>
                    <span className={styles.spaceKey}>{space.key}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Pages List */}
        <div className={styles.pagesList}>
          <div className={styles.pagesHeader}>
            <h3 className={styles.sectionTitle}>
              {debouncedSearch
                ? `Search Results (${displayPages?.length || 0})`
                : selectedSpace
                ? `${selectedSpace.name} Pages (${displayPages?.length || 0})`
                : 'Select a space'}
            </h3>
            {selectedSpace && (
              <a
                href={selectedSpace.url}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.openInConfluence}
              >
                Open in Confluence
                <ExternalLink size={14} />
              </a>
            )}
          </div>

          {isLoadingContent ? (
            <LoadingOverlay message="Loading pages..." />
          ) : !selectedSpace && !debouncedSearch ? (
            <div className={styles.emptyState}>
              <FileText size={48} />
              <p>Select a space to view pages</p>
            </div>
          ) : displayPages?.length === 0 ? (
            <div className={styles.emptyState}>
              <FileText size={48} />
              <p>No pages found</p>
            </div>
          ) : (
            <div className={styles.pagesGrid}>
              {displayPages?.map((page) => (
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
                          <span>by {page.lastModifiedBy.displayName}</span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
