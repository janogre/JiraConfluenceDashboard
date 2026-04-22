import { Fragment, useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, RefreshCw, Package, ChevronRight, ChevronDown } from 'lucide-react';
import { fetchBcItems } from '../../services/bcService';
import type { BcItem } from '../../types';
import styles from './Lager.module.css';

const NEAS_LOCATION_CODES = new Set([
  'M1', 'OPPDAL HK', 'RØROS HK', 'CAMPUS', 'DIR', 'SINUS BNN', 'SINUS SSJ',
]);

type SortField = 'number' | 'displayName' | 'inventory';
type SortDir = 'asc' | 'desc';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric' });
}

function inventoryClass(n: number): string {
  if (n >= 10) return styles.inventoryGreen;
  if (n >= 1)  return styles.inventoryOrange;
  return styles.inventoryRed;
}

function sortIcon(field: SortField, current: SortField, dir: SortDir): string {
  if (field !== current) return ' ↕';
  return dir === 'asc' ? ' ↑' : ' ↓';
}

interface Props {
  initialSearch?: string;
  onGoToBestillinger: (varenr: string) => void;
}

export function LagerTab({ initialSearch = '', onGoToBestillinger }: Props) {
  const [search, setSearch]         = useState(initialSearch);
  const [group, setGroup]           = useState('');
  const [location, setLocation]     = useState('');
  const [hideEmpty, setHideEmpty]   = useState(false);
  const [sortField, setSortField]   = useState<SortField>('number');
  const [sortDir, setSortDir]       = useState<SortDir>('asc');
  const [expanded, setExpanded]     = useState<Set<string>>(new Set());

  function toggleExpand(number: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(number)) next.delete(number);
      else next.add(number);
      return next;
    });
  }

  const { data, isLoading, isError, error, refetch, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ['bc-items'],
    queryFn: fetchBcItems,
    staleTime: 1000 * 60 * 5,
  });

  const allGroups = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.items.map((i) => i.inventoryPostingGroupCode))].sort();
  }, [data]);

  const allLocations = useMemo(() => {
    if (!data) return [];
    const seen = new Set<string>();
    for (const item of data.items) {
      for (const [loc, qty] of Object.entries(item.inventoryByLocation ?? {})) {
        if (qty > 0) seen.add(loc);
      }
    }
    const neas = [...seen].filter((l) => NEAS_LOCATION_CODES.has(l)).sort();
    const ext  = [...seen].filter((l) => !NEAS_LOCATION_CODES.has(l)).sort();
    return [...neas, ...ext];
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.toLowerCase();
    return data.items.filter((item) => {
      if (hideEmpty && item.inventory === 0) return false;
      if (group && item.inventoryPostingGroupCode !== group) return false;
      if (location && !((item.inventoryByLocation?.[location] ?? 0) > 0)) return false;
      if (q && !item.number.toLowerCase().includes(q) && !item.displayName.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [data, search, group, location, hideEmpty]);

  const qtyFor = (item: BcItem) =>
    location ? (item.inventoryByLocation?.[location] ?? 0) : item.inventory;

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'number')      cmp = a.number.localeCompare(b.number);
      if (sortField === 'displayName') cmp = a.displayName.localeCompare(b.displayName);
      if (sortField === 'inventory')   cmp = qtyFor(a) - qtyFor(b);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, sortField, sortDir, location]);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  }

  const fetchedAt = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })
    : null;

  const errorMessage = (() => {
    if (!isError || !error) return null;
    const msg = (error as { response?: { data?: { error?: string } }; message?: string })
      ?.response?.data?.error ?? (error as Error).message;
    if (msg?.includes('autentisering')) return msg;
    if (msg?.includes('Business Central')) return msg;
    return 'Kunne ikke nå Business Central. Sjekk nettverkstilkobling og prøv igjen.';
  })();

  return (
    <div className={styles.tabContent}>
      <div className={styles.toolbar}>
        <div className={styles.searchWrapper}>
          <Search size={15} className={styles.searchIcon} />
          <input
            className={styles.searchInput}
            placeholder="Søk varenr / navn…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <select
          className={styles.select}
          value={group}
          onChange={(e) => setGroup(e.target.value)}
        >
          <option value="">Alle grupper</option>
          {allGroups.map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>

        <select
          className={styles.select}
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          title="Vis bare varer som står på valgt lokasjon"
        >
          <option value="">Alle lokasjoner</option>
          {allLocations.map((l) => (
            <option key={l} value={l}>
              {NEAS_LOCATION_CODES.has(l) ? l : `${l} (ekstern)`}
            </option>
          ))}
        </select>

        <label className={styles.toggleLabel}>
          <div
            className={`${styles.toggle} ${hideEmpty ? styles.toggleActive : ''}`}
            onClick={() => setHideEmpty((v) => !v)}
          />
          Skjul tomt lager
        </label>

        <button
          className={styles.refreshBtn}
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw size={14} />
          {isFetching ? 'Henter…' : 'Oppdater'}
        </button>
      </div>

      {data && (
        <div className={styles.statusBar}>
          <span>
            Viser {sorted.length} av {data.items.length} varer
            {hideEmpty && ` (${data.items.filter(i => i.inventory === 0).length} med lager = 0 skjult)`}
          </span>
          {fetchedAt && <span>Hentet kl. {fetchedAt}</span>}
        </div>
      )}

      {isError && (
        <div className={styles.error}>
          <div className={styles.errorTitle}>⚠ Feil ved henting av lagerdata</div>
          <div className={styles.errorText}>{errorMessage}</div>
          <button className={styles.retryBtn} onClick={() => refetch()}>↻ Prøv igjen</button>
        </div>
      )}

      {isLoading && (
        <div className={styles.loading}>
          <Package size={20} />
          Henter lagerdata fra Business Central…
        </div>
      )}

      {data && !isError && (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th style={{ width: 32 }}></th>
                <th className={styles.sortable} onClick={() => toggleSort('number')}>
                  VARENR{sortIcon('number', sortField, sortDir)}
                </th>
                <th className={styles.sortable} onClick={() => toggleSort('displayName')}>
                  NAVN{sortIcon('displayName', sortField, sortDir)}
                </th>
                <th>BESKRIVELSE 2</th>
                <th>GRUPPE</th>
                <th
                  className={styles.sortable}
                  style={{ textAlign: 'right' }}
                  onClick={() => toggleSort('inventory')}
                >
                  {location ? `LAGER (${location})` : 'LAGER'}{sortIcon('inventory', sortField, sortDir)}
                </th>
                <th>OPPDATERT</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((item: BcItem) => {
                const isExpanded = expanded.has(item.number);
                const locationEntries = Object.entries(item.inventoryByLocation ?? {})
                  .filter(([, qty]) => qty !== 0)
                  .sort((a, b) => b[1] - a[1]);
                const hasLocationData = locationEntries.length > 0;

                return (
                  <Fragment key={item.number}>
                    <tr
                      className={`${styles.row} ${item.inventory === 0 ? styles.rowEmpty : ''}`}
                      onClick={() => hasLocationData && toggleExpand(item.number)}
                      style={{ cursor: hasLocationData ? 'pointer' : 'default' }}
                    >
                      <td>
                        {hasLocationData && (
                          <button
                            className={styles.expandToggle}
                            onClick={(e) => { e.stopPropagation(); toggleExpand(item.number); }}
                            title={isExpanded ? 'Skjul lokasjoner' : 'Vis lokasjoner'}
                          >
                            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </button>
                        )}
                      </td>
                      <td className={styles.varenr}>{item.number}</td>
                      <td>{item.displayName}</td>
                      <td className={styles.desc2}>{item.displayName2 ?? ''}</td>
                      <td><span className={styles.groupBadge}>{item.inventoryPostingGroupCode}</span></td>
                      <td
                        className={`${styles.inventory} ${inventoryClass(qtyFor(item))}`}
                        title={location ? `Totalt på tvers av alle lokasjoner: ${item.inventory}` : undefined}
                      >
                        {qtyFor(item)}
                      </td>
                      <td className={styles.dateCell}>{formatDate(item.lastModifiedDateTime)}</td>
                      <td>
                        {item.inventory <= 3 && (
                          <button
                            className={styles.crossTabLink}
                            onClick={(e) => { e.stopPropagation(); onGoToBestillinger(item.number); }}
                            title="Vis bestillinger for denne varen"
                          >
                            Bestillinger →
                          </button>
                        )}
                      </td>
                    </tr>
                    {isExpanded && hasLocationData && (
                      <tr className={styles.expandRow}>
                        <td></td>
                        <td colSpan={7}>
                          <div className={styles.locationGrid}>
                            {locationEntries.map(([loc, qty]) => (
                              <div
                                key={loc}
                                className={`${styles.locationChip} ${NEAS_LOCATION_CODES.has(loc) ? styles.locationChipNeas : ''}`}
                              >
                                <span className={styles.locationChipCode}>{loc}</span>
                                <span className={styles.locationChipQty}>{qty}</span>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {sorted.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '32px', color: 'var(--color-text-secondary)' }}>
                    Ingen varer matcher søket.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
