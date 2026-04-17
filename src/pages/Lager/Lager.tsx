import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, RefreshCw, Package } from 'lucide-react';
import { fetchBcItems } from '../../services/bcService';
import type { BcItem } from '../../types';
import styles from './Lager.module.css';

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

export function Lager() {
  const [search, setSearch]         = useState('');
  const [group, setGroup]           = useState('');
  const [hideEmpty, setHideEmpty]   = useState(false);
  const [sortField, setSortField]   = useState<SortField>('number');
  const [sortDir, setSortDir]       = useState<SortDir>('asc');

  const { data, isLoading, isError, error, refetch, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ['bc-items'],
    queryFn: fetchBcItems,
    staleTime: 1000 * 60 * 5,
  });

  const allGroups = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.items.map((i) => i.inventoryPostingGroupCode))].sort();
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.toLowerCase();
    return data.items.filter((item) => {
      if (hideEmpty && item.inventory === 0) return false;
      if (group && item.inventoryPostingGroupCode !== group) return false;
      if (q && !item.number.toLowerCase().includes(q) && !item.displayName.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [data, search, group, hideEmpty]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'number')      cmp = a.number.localeCompare(b.number);
      if (sortField === 'displayName') cmp = a.displayName.localeCompare(b.displayName);
      if (sortField === 'inventory')   cmp = a.inventory - b.inventory;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortField, sortDir]);

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
    <div className={styles.container}>
      {/* Toolbar */}
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

      {/* Statuslinje */}
      {data && (
        <div className={styles.statusBar}>
          <span>
            Viser {sorted.length} av {data.items.length} varer
            {hideEmpty && ` (${data.items.filter(i => i.inventory === 0).length} med lager = 0 skjult)`}
          </span>
          {fetchedAt && <span>Hentet kl. {fetchedAt}</span>}
        </div>
      )}

      {/* Feilmelding */}
      {isError && (
        <div className={styles.error}>
          <div className={styles.errorTitle}>⚠ Feil ved henting av lagerdata</div>
          <div className={styles.errorText}>{errorMessage}</div>
          <button className={styles.retryBtn} onClick={() => refetch()}>↻ Prøv igjen</button>
        </div>
      )}

      {/* Laster */}
      {isLoading && (
        <div className={styles.loading}>
          <Package size={20} />
          Henter lagerdata fra Business Central…
        </div>
      )}

      {/* Tabell */}
      {data && !isError && (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
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
                  LAGER{sortIcon('inventory', sortField, sortDir)}
                </th>
                <th>OPPDATERT</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((item: BcItem) => (
                <tr
                  key={item.number}
                  className={`${styles.row} ${item.inventory === 0 ? styles.rowEmpty : ''}`}
                >
                  <td className={styles.varenr}>{item.number}</td>
                  <td>{item.displayName}</td>
                  <td className={styles.desc2}>{item.displayName2}</td>
                  <td><span className={styles.groupBadge}>{item.inventoryPostingGroupCode}</span></td>
                  <td className={`${styles.inventory} ${inventoryClass(item.inventory)}`}>
                    {item.inventory}
                  </td>
                  <td className={styles.dateCell}>{formatDate(item.lastModifiedDateTime)}</td>
                </tr>
              ))}
              {sorted.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '32px', color: 'var(--color-text-secondary)' }}>
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
