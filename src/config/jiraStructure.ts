/**
 * Jira-struktur for avd. Teknologi.
 *
 * Single source of truth for den nye sakstrukturen: arbeidstyper, prioriteter,
 * komponenter (Gruppe:Element), kategorier per team (Team:Kategori) og
 * etiketter (prefiks:verdi). Hentet direkte fra strukturdokumentet.
 *
 * Verdiene er hardkodet her nå. De kan på sikt gjøres redigerbare i Innstillinger
 * uten å endre forbruket i UI-et, så lenge eksportene beholder formen.
 */

// ── Arbeidstype ──────────────────────────────────────────────────────────────

export interface Arbeidstype {
  navn: string;
  beskrivelse: string;
}

export const ARBEIDSTYPER: Arbeidstype[] = [
  { navn: 'Oppgave', beskrivelse: 'Planlagt arbeid — installasjon, konfigurasjon, vedlikehold' },
  { navn: 'Feil', beskrivelse: 'Noe som er ødelagt eller ikke fungerer som det skal, bugs' },
  { navn: 'Historie', beskrivelse: 'Brukerorientert beskrivelse av et behov eller ønsket funksjonalitet' },
  { navn: 'Oppgavesamling', beskrivelse: 'Samlebeholder for relaterte oppgaver innenfor et større arbeid' },
];

export const ARBEIDSTYPE_STANDARD = 'Oppgave';

// ── Status ───────────────────────────────────────────────────────────────────

// Standardflyt: Åpen → Pågår → Ferdig. Nye saker starter i første workflow-status
// (Åpen), så status settes aldri eksplisitt ved oppretting.
export const STATUS_STANDARD = 'Åpen';

// ── Prioritet ────────────────────────────────────────────────────────────────

export interface Prioritet {
  navn: string;
  betydning: string;
}

export const PRIORITETER: Prioritet[] = [
  { navn: 'Høyest', betydning: 'Kritisk — påvirker mange kunder eller kjernetjenester, krever umiddelbar handling' },
  { navn: 'Høy', betydning: 'Viktig — bør løses raskt, men ikke nødvendigvis akkurat nå' },
  { navn: 'Medium', betydning: 'Normal prioritet — løses i tur og orden' },
  { navn: 'Lav', betydning: 'Kan vente — ingen umiddelbar konsekvens' },
  { navn: 'Lavest', betydning: 'Ren «nice to have» — gjøres hvis det er tid' },
];

export const PRIORITET_STANDARD = 'Medium';

// ── Team ─────────────────────────────────────────────────────────────────────

export type Team = 'nettverk' | 'system';

// ── Komponent (Gruppe:Element) ───────────────────────────────────────────────

export interface Komponent {
  gruppe: string;
  element: string;
  /** Fullt komponentnavn på formen Gruppe:Element, f.eks. "Aksess:PON". */
  navn: string;
  forklaring: string;
  /** Hvilket team som typisk eier kategoriene for denne komponenten. */
  team: Team;
}

function lagKomponent(gruppe: string, element: string, forklaring: string, team: Team): Komponent {
  return { gruppe, element, navn: `${gruppe}:${element}`, forklaring, team };
}

export const KOMPONENTER: Komponent[] = [
  lagKomponent('Aksess', 'PON', 'PON-aksessnett (XGS-PON, GPON)', 'nettverk'),
  lagKomponent('Aksess', 'BNG', 'Broadband Network Gateway (aksess-side)', 'nettverk'),
  lagKomponent('Aksess', 'KTV', 'Kabel-TV-nett', 'nettverk'),
  lagKomponent('Kjerne', 'BNG', 'BNG i kjernenettet', 'nettverk'),
  lagKomponent('System', 'NETAdmin', 'NETAdmin som forvaltningssystem', 'system'),
];

/** Gruppe → team. Driver hvilke kategorier som er aktuelle for en komponent. */
export const GRUPPE_TIL_TEAM: Record<string, Team> = {
  Aksess: 'nettverk',
  Kjerne: 'nettverk',
  System: 'system',
};

/** Komponentene gruppert på Gruppe, for visning i picker. */
export function komponenterGruppert(): { gruppe: string; komponenter: Komponent[] }[] {
  const grupper: { gruppe: string; komponenter: Komponent[] }[] = [];
  for (const komp of KOMPONENTER) {
    let bolk = grupper.find((g) => g.gruppe === komp.gruppe);
    if (!bolk) {
      bolk = { gruppe: komp.gruppe, komponenter: [] };
      grupper.push(bolk);
    }
    bolk.komponenter.push(komp);
  }
  return grupper;
}

export function finnKomponent(navn: string): Komponent | undefined {
  return KOMPONENTER.find((k) => k.navn === navn);
}

// ── Kategori (Team:Kategori) ─────────────────────────────────────────────────

export interface Kategori {
  /** Kategori-suffiks uten team-prefiks, f.eks. "feilretting". */
  verdi: string;
  dekker: string;
}

export const KATEGORIER_PER_TEAM: Record<Team, Kategori[]> = {
  nettverk: [
    { verdi: 'installasjon', dekker: 'Nyinstallasjon av utstyr og tjenester' },
    { verdi: 'utvidelse', dekker: 'Kapasitetsutvidelse, nye noder, utbygging' },
    { verdi: 'oppgradering', dekker: 'Programvare-, firmware- og hardwareoppgraderinger' },
    { verdi: 'feilretting', dekker: 'Feilsøking og reparasjon' },
    { verdi: 'vedlikehold', dekker: 'Planlagt vedlikehold' },
    { verdi: 'endring', dekker: 'Planlagte konfigurasjonsendringer' },
  ],
  system: [
    { verdi: 'kunde', dekker: 'Oppgaver relatert til kunde' },
    { verdi: 'adresse', dekker: 'Oppgaver relatert til adresse' },
    { verdi: 'produkt', dekker: 'Oppgaver relatert til abonnement, ordre, provisjonering og sak' },
    { verdi: 'utstyr', dekker: 'Oppgaver relatert til inventar' },
    { verdi: 'system', dekker: 'Oppgaver relatert til selve systemet' },
    { verdi: 'billing', dekker: 'Oppgaver relatert til billpipe, billing og fakturering' },
    { verdi: 'rapporter', dekker: 'Oppgaver relatert til kontrollister, avviksrapporter og diverse uttrekk' },
  ],
};

/** Bygg full kategoriverdi på formen Team:Kategori, f.eks. "nettverk:feilretting". */
export function byggKategori(team: Team, verdi: string): string {
  return `${team}:${verdi}`;
}

/**
 * Aktuelle kategorier (med full Team:Kategori-verdi) for en valgt komponent.
 * Returnerer tom liste dersom komponenten er ukjent.
 */
export function kategorierForKomponent(komponentNavn: string): { team: Team; verdi: string; full: string; dekker: string }[] {
  const komp = finnKomponent(komponentNavn);
  if (!komp) return [];
  return KATEGORIER_PER_TEAM[komp.team].map((k) => ({
    team: komp.team,
    verdi: k.verdi,
    full: byggKategori(komp.team, k.verdi),
    dekker: k.dekker,
  }));
}

/** Alle gyldige kategoriverdier på tvers av team (for validering av AI-forslag). */
export function alleKategorier(): string[] {
  return (Object.keys(KATEGORIER_PER_TEAM) as Team[]).flatMap((team) =>
    KATEGORIER_PER_TEAM[team].map((k) => byggKategori(team, k.verdi))
  );
}

// ── Etiketter (prefiks:verdi) ────────────────────────────────────────────────

export interface EtikettPrefiks {
  prefiks: string;
  formaal: string;
  /** Kjente/foreslåtte verdier (uten prefiks). Fritt tillegg er også lov. */
  verdier: string[];
  /** tmp-etiketter er midlertidige og fjernes når tilstanden er over. */
  midlertidig?: boolean;
}

export const ETIKETT_PREFIKSER: EtikettPrefiks[] = [
  { prefiks: 'geo', formaal: 'Kommune eller område', verdier: ['smola', 'averoy', 'oppdal', 'roros', 'kristiansund'] },
  { prefiks: 'lok', formaal: 'Spesifikk lokasjon (node, sentral, skap)', verdier: ['nordvika', 'kvalvag', 'berkak'] },
  { prefiks: 'vendor', formaal: 'Leverandør eller utstyrsplattform', verdier: ['nokia', 'juniper', 'genexis'] },
  { prefiks: 'seg', formaal: 'Kundesegment', verdier: ['privat', 'bedrift', 'kommune', 'ikt-orkide'] },
  { prefiks: 'tmp', formaal: 'Midlertidig tilstand eller flagg', verdier: ['venter-deler', 'venter-leverandor', 'hastejobb'], midlertidig: true },
];

export const ETIKETT_PREFIKS_NAVN = ETIKETT_PREFIKSER.map((p) => p.prefiks);

/**
 * Normaliser en etikettverdi etter reglene i strukturdokumentet:
 * små bokstaver, norske tegn forenkles (ø→o, å→a, æ→e), mellomrom→bindestrek,
 * og kun [a-z0-9-] beholdes.
 */
export function normaliserEtikettVerdi(verdi: string): string {
  return verdi
    .toLowerCase()
    .replace(/ø/g, 'o')
    .replace(/å/g, 'a')
    .replace(/æ/g, 'e')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Bygg en komplett etikett «prefiks:normalisertverdi». Tom verdi gir tom streng. */
export function byggEtikett(prefiks: string, verdi: string): string {
  const v = normaliserEtikettVerdi(verdi);
  if (!v) return '';
  return `${normaliserEtikettVerdi(prefiks)}:${v}`;
}

/** Sjekk at en etikett har et gyldig prefiks (ingen etiketter uten prefiks). */
export function harGyldigPrefiks(etikett: string): boolean {
  const idx = etikett.indexOf(':');
  if (idx <= 0) return false;
  return ETIKETT_PREFIKS_NAVN.includes(etikett.slice(0, idx));
}

// ── Samlet «allowed»-pakke til AI-klassifisering ──────────────────────────────

/**
 * Komprimert beskrivelse av de tillatte verdiene som sendes til AI-endepunktet,
 * slik at modellen kun foreslår verdier som finnes i strukturen.
 */
export function byggTillatteVerdier() {
  return {
    arbeidstyper: ARBEIDSTYPER.map((a) => a.navn),
    prioriteter: PRIORITETER.map((p) => p.navn),
    komponenter: KOMPONENTER.map((k) => k.navn),
    kategorierPerTeam: {
      nettverk: KATEGORIER_PER_TEAM.nettverk.map((k) => byggKategori('nettverk', k.verdi)),
      system: KATEGORIER_PER_TEAM.system.map((k) => byggKategori('system', k.verdi)),
    },
    etiketter: ETIKETT_PREFIKSER.map((p) => ({ prefiks: p.prefiks, formaal: p.formaal, verdier: p.verdier })),
  };
}
