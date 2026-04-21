import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, RefreshCw, ShoppingCart } from 'lucide-react';
import { fetchBcPurchaseOrders, fetchBcLocations } from '../../services/bcService';
import type { BcPurchaseOrder, BcPurchaseOrderLine } from '../../types';
import styles from './Lager.module.css';

type OrderSortField = 'number' | 'orderDate' | 'vendorName';
type SortDir = 'asc' | 'desc';

function formatDate(iso: string): string {
  if (!iso) return '–';
  return new Date(iso).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric' });
}

function sortIcon(field: OrderSortField, current: OrderSortField, dir: SortDir): string {
  if (field !== current) return ' ↕';
  return dir === 'asc' ? ' ↑' : ' ↓';
}

function statusClass(status: string): string {
  switch (status) {
    case 'Bestilt':        return styles.statusBadgeBestilt;
    case 'Delvis mottatt': return styles.statusBadgeDelvis;
    case 'Mottatt':        return styles.statusBadgeMottatt;
    case 'Ufullstendig':   return styles.statusBadgeUfullstendig;
    default:               return styles.statusBadgeUfullstendig;
  }
}

interface Props {
  initialSearch?: string;
  onGoToLager: (varenr: string) => void;
}

export function BestillingerTab({ initialSearch = '', onGoToLager }: Props) {
  const [search, setSearch]           = useState(initialSearch);
  const [statusFilter, setStatusFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [vendorFilter, setVendorFilter] = useState('');
  const [showIncomplete, setShowIncomplete] = useState(false);
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  const [sortField, setSortField]     = useState<OrderSortField>('orderDate');
  const [sortDir, setSortDir]         = useState<SortDir>('desc');

  const { data, isLoading, isError, error, refetch, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ['bc-purchase-orders'],
    queryFn: fetchBcPurchaseOrders,
    staleTime: 1000 * 60 * 5,
  });

  // Locations hentes for NEAS-whitelist til dropdown
  const { data: locData } = useQuery({
    queryKey: ['bc-locations'],
    queryFn: fetchBcLocations,
    staleTime: 1000 * 60 * 60 * 24,
  });

  const neasLocations: string[] = locData?.neasLocationCodes ?? [];

  const allVendors = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.orders.map((o) => o.vendorName))].sort();
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.toLowerCase();
    return data.orders.filter((order) => {
      if (!showIncomplete && order.derivedStatus === 'Ufullstendig') return false;
      if (statusFilter && order.derivedStatus !== statusFilter) return false;
      if (vendorFilter && order.vendorName !== vendorFilter) return false;
      if (locationFilter) {
        const hasLocation = order.purchaseOrderLines.some((l) => l.locationCode === locationFilter);
        if (!hasLocation) return false;
      }
      if (q) {
        const matchOrder = order.number.toLowerCase().includes(q) || order.vendorName.toLowerCase().includes(q);
        const matchLine = order.purchaseOrderLines.some((l) =>
          l.lineObjectNumber.toLowerCase().includes(q) || l.description.toLowerCase().includes(q)
        );
        if (!matchOrder && !matchLine) return false;
      }
      return true;
    });
  }, [data, search, statusFilter, locationFilter, vendorFilter, showIncomplete]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'number')    cmp = a.number.localeCompare(b.number);
      if (sortField === 'orderDate') cmp = a.orderDate.localeCompare(b.orderDate);
      if (sortField === 'vendorName') cmp = a.vendorName.localeCompare(b.vendorName);
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortField, sortDir]);

  function toggleSort(field: OrderSortField) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  }

  function toggleOrder(id: string) {
    setExpandedOrders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const totalLines = useMemo(
    () => (data?.orders ?? []).reduce((sum, o) => sum + o.purchaseOrderLines.length, 0),
    [data]
  );

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
      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.searchWrapper}>
          <Search size={15} className={styles.searchIcon} />
          <input
            className={styles.searchInput}
            placeholder="Søk ordrenr / leverandør / vare…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <select className={styles.select} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">Alle statuser</option>
          <option value="Bestilt">Bestilt</option>
          <option value="Delvis mottatt">Delvis mottatt</option>
          <option value="Mottatt">Mottatt</option>
        </select>

        <select className={styles.select} value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)}>
          <option value="">Alle lokasjoner</option>
          {neasLocations.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>

        <select className={styles.select} value={vendorFilter} onChange={(e) => setVendorFilter(e.target.value)}>
          <option value="">Alle leverandører</option>
          {allVendors.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>

        <label className={styles.toggleLabel}>
          <div
            className={`${styles.toggle} ${showIncomplete ? styles.toggleActive : ''}`}
            onClick={() => setShowIncomplete((v) => !v)}
          />
          Vis ufullstendige
        </label>

        <button className={styles.refreshBtn} onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw size={14} />
          {isFetching ? 'Henter…' : 'Oppdater'}
        </button>
      </div>

      {/* Statuslinje */}
      {data && (
        <div className={styles.statusBar}>
          <span>
            Viser {sorted.length} av {data.orders.length} ordrer · {totalLines} linjer totalt
            {!showIncomplete && (() => {
              const hidden = data.orders.filter((o) => o.derivedStatus === 'Ufullstendig').length;
              return hidden > 0 ? ` (${hidden} ufullstendige skjult)` : '';
            })()}
          </span>
          {fetchedAt && <span>Hentet kl. {fetchedAt}</span>}
        </div>
      )}

      {/* Feilmelding */}
      {isError && (
        <div className={styles.error}>
          <div className={styles.errorTitle}>⚠ Feil ved henting av bestillinger</div>
          <div className={styles.errorText}>{errorMessage}</div>
          <button className={styles.retryBtn} onClick={() => refetch()}>↻ Prøv igjen</button>
        </div>
      )}

      {/* Laster */}
      {isLoading && (
        <div className={styles.loading}>
          <ShoppingCart size={20} />
          Henter innkjøpsordrer fra Business Central…
        </div>
      )}

      {/* Tabell */}
      {data && !isError && (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th style={{ width: '32px' }}></th>
                <th className={styles.sortable} onClick={() => toggleSort('number')}>
                  ORDRENR{sortIcon('number', sortField, sortDir)}
                </th>
                <th className={styles.sortable} onClick={() => toggleSort('orderDate')}>
                  DATO{sortIcon('orderDate', sortField, sortDir)}
                </th>
                <th className={styles.sortable} onClick={() => toggleSort('vendorName')}>
                  LEVERANDØR{sortIcon('vendorName', sortField, sortDir)}
                </th>
                <th>LEVERES TIL</th>
                <th>INNKJØPER</th>
                <th>STATUS</th>
                <th style={{ textAlign: 'right' }}>LINJER</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((order: BcPurchaseOrder) => {
                const isExpanded = expandedOrders.has(order.id);
                return (
                  <React.Fragment key={order.id}>
                    <tr
                      className={styles.orderRow}
                      onClick={() => toggleOrder(order.id)}
                    >
                      <td className={styles.expandBtn}>{isExpanded ? '▼' : '▶'}</td>
                      <td className={styles.varenr}>{order.number}</td>
                      <td className={styles.dateCell}>{formatDate(order.orderDate)}</td>
                      <td>{order.vendorName}</td>
                      <td className={styles.dateCell}>{order.shipToName}</td>
                      <td className={styles.dateCell}>{order.purchaser}</td>
                      <td>
                        <span className={statusClass(order.derivedStatus)}>
                          {order.derivedStatus}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }} className={styles.dateCell}>
                        {order.purchaseOrderLines.length}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className={styles.linesRow}>
                        <td colSpan={8} style={{ padding: 0 }}>
                          <table className={styles.lineTable}>
                            <thead>
                              <tr>
                                <th>VARENR</th>
                                <th>BESKRIVELSE</th>
                                <th>LOKASJON</th>
                                <th style={{ textAlign: 'right' }}>BESTILT</th>
                                <th style={{ textAlign: 'right' }}>MOTTATT</th>
                                <th>ENHET</th>
                                <th>FORV. DATO</th>
                              </tr>
                            </thead>
                            <tbody>
                              {order.purchaseOrderLines.map((line: BcPurchaseOrderLine) => (
                                <tr key={line.lineObjectNumber} className={styles.lineRow}>
                                  <td>
                                    <button
                                      className={styles.lineVarenr}
                                      onClick={(e) => { e.stopPropagation(); onGoToLager(line.lineObjectNumber); }}
                                      title="Vis i Lager-fanen"
                                    >
                                      {line.lineObjectNumber}
                                    </button>
                                  </td>
                                  <td>{line.description}</td>
                                  <td>
                                    <span className={styles.locationBadge}>{line.locationCode}</span>
                                  </td>
                                  <td style={{ textAlign: 'right' }} className={styles.dateCell}>{line.quantity}</td>
                                  <td
                                    style={{ textAlign: 'right' }}
                                    className={`${styles.dateCell} ${line.quantity > 0 && line.receivedQuantity >= line.quantity ? styles.receivedFull : ''}`}
                                  >
                                    {line.receivedQuantity}
                                  </td>
                                  <td className={styles.dateCell}>{line.unitOfMeasureCode}</td>
                                  <td className={styles.dateCell}>{formatDate(line.expectedReceiptDate)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
              {sorted.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '32px', color: 'var(--color-text-secondary)' }}>
                    Ingen ordrer matcher søket.
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
