import { useState } from 'react';
import { Package, ShoppingCart } from 'lucide-react';
import { LagerTab } from './LagerTab';
import { BestillingerTab } from './BestillingerTab';
import styles from './Lager.module.css';

type ActiveTab = 'lager' | 'bestillinger';

export function Lager() {
  const [activeTab, setActiveTab]           = useState<ActiveTab>('lager');
  const [lagerNavKey, setLagerNavKey]       = useState(0);
  const [lagerInitialSearch, setLagerInitialSearch] = useState('');
  const [bestNavKey, setBestNavKey]         = useState(0);
  const [bestInitialSearch, setBestInitialSearch]   = useState('');

  function goToLager(varenr: string) {
    setLagerInitialSearch(varenr);
    setLagerNavKey((k) => k + 1);
    setActiveTab('lager');
  }

  function goToBestillinger(varenr: string) {
    setBestInitialSearch(varenr);
    setBestNavKey((k) => k + 1);
    setActiveTab('bestillinger');
  }

  return (
    <div className={styles.container}>
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === 'lager' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('lager')}
        >
          <Package size={15} /> Lager
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'bestillinger' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('bestillinger')}
        >
          <ShoppingCart size={15} /> Bestillinger
        </button>
      </div>

      {activeTab === 'lager' && (
        <LagerTab
          key={lagerNavKey}
          initialSearch={lagerInitialSearch}
          onGoToBestillinger={goToBestillinger}
        />
      )}
      {activeTab === 'bestillinger' && (
        <BestillingerTab
          key={bestNavKey}
          initialSearch={bestInitialSearch}
          onGoToLager={goToLager}
        />
      )}
    </div>
  );
}
