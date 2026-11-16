/**
 * Felles visningshjelpere for Jira-saker: prioritetsnivå og forfall.
 *
 * Jira-instansen bruker norske prioritetsnavn som varierer mellom prosjekter
 * (Høyest/Høy/Medium/Lav/Lavest og Kritisk/Alvorlig/Middels/Lav/Lavest),
 * i tillegg til de engelske standardnavnene. Alt mappes til et felles nivå 1–5.
 */

const PRIORITETSNIVAA: Record<string, number> = {
  // 5 – kritisk
  highest: 5, høyest: 5, kritisk: 5, blocker: 5, critical: 5,
  // 4 – høy
  high: 4, høy: 4, alvorlig: 4, major: 4,
  // 3 – normal
  medium: 3, middels: 3, normal: 3,
  // 2 – lav
  low: 2, lav: 2, minor: 2,
  // 1 – lavest
  lowest: 1, lavest: 1, trivial: 1,
};

/** Prioritetsnivå 1–5, eller undefined for ukjent/manglende prioritet. */
export function prioritetsNivaa(navn?: string): number | undefined {
  if (!navn) return undefined;
  return PRIORITETSNIVAA[navn.trim().toLowerCase()];
}

/** Sorteringsverdi: ukjent prioritet havner i midten, manglende nederst. */
export function prioritetsSortering(navn?: string): number {
  if (!navn) return 0;
  return prioritetsNivaa(navn) ?? 3;
}

/** Badge-variant for en prioritet. Ukjente navn vises nøytralt. */
export function prioritetsVariant(navn?: string): 'danger' | 'warning' | 'default' {
  const nivaa = prioritetsNivaa(navn);
  if (nivaa === undefined) return 'default';
  if (nivaa >= 4) return 'danger';
  if (nivaa === 3) return 'warning';
  return 'default';
}

/** Dagens dato som YYYY-MM-DD i lokal tid. */
function iDag(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/**
 * Er fristen passert? Sammenligner kalenderdatoer i lokal tid, slik at en sak
 * med frist i dag ikke regnes som forfalt. Ferdige saker er aldri forfalt.
 */
export function erForfalt(frist?: string, statusKategori?: string): boolean {
  if (!frist || statusKategori === 'done') return false;
  return frist.slice(0, 10) < iDag();
}
