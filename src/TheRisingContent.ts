/**
 * 1916: The Rising — content and data model.
 *
 * Defines the typed spirit roster (figures), the seven era chapters, the
 * first-person testimonies used by the conversation mechanic, and the
 * published source citations behind them. This module is deliberately
 * renderer-free so it can be consumed headlessly by the rules, economy,
 * transcript and scene layers.
 *
 * Everything here is data plus pure validation/selection helpers:
 * - {@link ROSTER} is the shipped roster.
 * - {@link SOURCES} is the structured citation table (mirrored from
 *   `src/data/sources.json`).
 * - {@link validateRoster} enforces the content contract.
 * - {@link selectSpirits} performs the seeded, reproducible subset draw used
 *   by demo and headless runs.
 *
 * @module TheRisingContent
 */

import { createSeededRng } from '@core-engine/SeededRng';
import { shuffleArray } from '@card-system';
import sourcesJson from './data/sources.json';

/** Minimum number of spirit cards every era chapter must define. */
export const REQUIRED_SPIRITS_PER_ERA = 3;

/** Minimum number of testimonies every spirit card must define. */
export const REQUIRED_TESTIMONIES_PER_SPIRIT = 3;

/** The kinds of published source the game accepts for attribution. */
export type SourceKind = 'book' | 'paper' | 'archive';

/** A published, citable source (book, scholarly chapter/paper, or archive). */
export interface Source {
  /** Stable identifier referenced by {@link SourceRef}. */
  readonly id: string;
  /** Title of the work. */
  readonly title: string;
  /** Author or editor(s). */
  readonly author: string;
  /** Year of publication (or of the edition consulted). */
  readonly year: number;
  /** Source category. */
  readonly kind: SourceKind;
  /** Publisher, journal or archive. */
  readonly publisher?: string;
  /** Public URL, where the source is available online. */
  readonly url?: string;
  /** ISBN, where applicable. */
  readonly isbn?: string;
}

/** A reference from a spirit or testimony into the source table. */
export interface SourceRef {
  /** The {@link Source} `id` this reference resolves to. */
  readonly id: string;
  /** Optional pointer within the source (chapter, page, catalogue number). */
  readonly locator?: string;
}

/**
 * A documented date range for a figure: birth–death where known, otherwise the
 * figure's attested active period.
 */
export interface DateRange {
  /** Lower bound: birth year, or the start of the documented active period. */
  readonly from: number;
  /** Upper bound: death year, or the end of the documented active period. */
  readonly to: number;
  /** Human-readable display label, e.g. `c. 1110–1171`. */
  readonly label: string;
}

/** A first-person period clue revealed by the conversation mechanic. */
export interface Testimony {
  /** The question the player puts to the spirit. */
  readonly question: string;
  /** The spirit's answer — the period clue. */
  readonly answer: string;
  /** Attribution for the answer's historical claim. */
  readonly source: SourceRef;
}

/** A single historical figure the player can meet. */
export interface Spirit {
  /** Stable identifier (unique across the roster). */
  readonly id: string;
  /** Full name as used on the card face. */
  readonly name: string;
  /** Common or anglicised name. */
  readonly commonName: string;
  /** The era chapter this spirit belongs to. */
  readonly eraId: string;
  /** Documented date range. */
  readonly dateRange: DateRange;
  /** One-line introduction shown before the conversation. */
  readonly summary: string;
  /** The spirit's primary historical reference. */
  readonly primaryReference: SourceRef;
  /** The first-person testimonies (at least {@link REQUIRED_TESTIMONIES_PER_SPIRIT}). */
  readonly testimonies: readonly Testimony[];
}

/** An era chapter of the timeline, grouping its ordered spirits. */
export interface Era {
  /** Stable identifier (unique across the roster). */
  readonly id: string;
  /** Chapter title. */
  readonly title: string;
  /** Start year of the era's span. */
  readonly from: number;
  /** End year of the era's span. */
  readonly to: number;
  /** Short description of the era. */
  readonly description: string;
  /** Spirit ids in chronological order (oldest first). */
  readonly spiritIds: readonly string[];
}

/** The complete roster: era chapters plus the flat spirit list. */
export interface Roster {
  readonly eras: readonly Era[];
  readonly spirits: readonly Spirit[];
}

/** A deterministic seed: an integer or a string hashed to one. */
export type Seed = number | string;

/** Machine-readable validation failure codes. */
export type RosterErrorCode =
  | 'empty-roster'
  | 'duplicate-id'
  | 'duplicate-era-id'
  | 'empty-name'
  | 'invalid-date-range'
  | 'unknown-era'
  | 'unknown-era-spirit'
  | 'spirit-era-mismatch'
  | 'era-too-few-spirits'
  | 'era-dates-not-chronological'
  | 'missing-primary-reference'
  | 'unknown-source'
  | 'too-few-testimonies'
  | 'invalid-testimony'
  | 'missing-testimony-source';

/** A single validation failure. */
export interface RosterValidationError {
  readonly code: RosterErrorCode;
  readonly message: string;
  readonly spiritId?: string;
  readonly eraId?: string;
}

/** The result of {@link validateRoster}. */
export interface RosterValidationResult {
  readonly ok: boolean;
  readonly errors: readonly RosterValidationError[];
}

/** The structured source table, keyed by source id. */
export const SOURCES: Readonly<Record<string, Source>> =
  sourcesJson as unknown as Readonly<Record<string, Source>>;

/**
 * The seven era chapters, oldest first. Each chapter lists its spirits in
 * chronological order.
 */
export const ERAS: readonly Era[] = [
  {
    id: 'norman-lordship',
    title: 'The Norman Landing & the Lordship',
    from: 1169,
    to: 1300,
    description:
      'From the first Norman landings in Wexford to the consolidation of the English lordship of Ireland.',
    spiritIds: ['diarmait-mac-murchada', 'ruaidri-ua-conchobair', 'aoife-mac-murrough'],
  },
  {
    id: 'gaelic-resurgence',
    title: 'Gaelic Resurgence & the Tudor Conquest',
    from: 1357,
    to: 1603,
    description:
      'The late-medieval Gaelic recovery and the long Tudor attempt to complete the conquest.',
    spiritIds: ['art-macmurrough-kavanagh', 'grace-omalley', 'hugh-oneill'],
  },
  {
    id: 'plantation-cromwell',
    title: 'Plantation, Rebellion & Cromwell',
    from: 1603,
    to: 1691,
    description:
      'The Flight of the Earls, the Plantation of Ulster, the 1641 rebellion and the wars of the 1640s, ending at Limerick.',
    spiritIds: ['rory-odonnell', 'owen-roe-oneill', 'patrick-sarsfield'],
  },
  {
    id: 'penal-united-irishmen',
    title: 'Penal Laws & the United Irishmen',
    from: 1691,
    to: 1798,
    description:
      'The penal era and the rise of the United Irishmen, culminating in the rebellion of 1798.',
    spiritIds: ['jonathan-swift', 'lord-edward-fitzgerald', 'wolfe-tone'],
  },
  {
    id: 'union-emancipation-famine',
    title: 'Union, Emancipation & the Famine',
    from: 1801,
    to: 1870,
    description:
      'The Act of Union, Catholic Emancipation, the Great Famine and the Young Ireland movement.',
    spiritIds: ['daniel-oconnell', 'asenath-nicholson', 'thomas-davis'],
  },
  {
    id: 'fenians-land-war-home-rule',
    title: 'Fenians, the Land War & Home Rule',
    from: 1825,
    to: 1913,
    description:
      'The Fenian brotherhood, the Land War and the constitutional struggle for Home Rule.',
    spiritIds: ['james-stephens', 'michael-davitt', 'charles-stewart-parnell', 'maud-gonne'],
  },
  {
    id: 'road-to-the-rising',
    title: 'The Road to the Rising',
    from: 1868,
    to: 1916,
    description:
      'From the Dublin Lockout and the Irish Volunteers to the Easter Rising of 1916.',
    spiritIds: ['james-connolly', 'constance-markievicz', 'patrick-pearse'],
  },
];

/**
 * The shipped spirit roster. Figures are grouped by era and listed here in
 * roughly chronological order; each carries at least three sourced
 * testimonies.
 */
export const SPIRITS: readonly Spirit[] = [
  // ── Era 1: The Norman Landing & the Lordship ──────────────────────────
  {
    id: 'diarmait-mac-murchada',
    name: 'Diarmait Mac Murchada',
    commonName: 'Dermot MacMurrough',
    eraId: 'norman-lordship',
    dateRange: { from: 1110, to: 1171, label: 'c. 1110–1171' },
    summary: 'King of Leinster whose appeal for foreign help began the Norman invasion.',
    primaryReference: { id: 'dib' },
    testimonies: [
      {
        question: 'Why did you look beyond Ireland for help?',
        answer:
          "I was driven from my kingdom of Leinster in 1166 and sought allies overseas. In 1167 I returned with Norman and Flemish mercenaries, and in 1169 the first Norman landing came ashore in Wexford. I promised lands and my daughter's hand to win that help.",
        source: { id: 'roche-norman-invasion' },
      },
      {
        question: 'What did you offer Strongbow?',
        answer:
          'I offered Richard de Clare, called Strongbow, the lordship of Leinster and the hand of my daughter Aoife, so that he would bring an army across the sea to restore me.',
        source: { id: 'flanagan-anglo-norman' },
      },
      {
        question: 'How did you see your own kingship?',
        answer:
          'I ruled as King of Leinster, not King of all Ireland; the high-kingship belonged to others. I died in 1171, before the newcomers had made themselves masters of the land.',
        source: { id: 'new-history-ireland-2' },
      },
    ],
  },
  {
    id: 'ruaidri-ua-conchobair',
    name: 'Ruaidrí Ua Conchobair',
    commonName: 'Rory O’Connor',
    eraId: 'norman-lordship',
    dateRange: { from: 1116, to: 1198, label: 'c. 1116–1198' },
    summary: 'Last effective High King of Ireland, who contested the Norman advance.',
    primaryReference: { id: 'dib' },
    testimonies: [
      {
        question: 'What did it mean to be High King?',
        answer:
          'I was King of Connacht and, from 1166, was acknowledged as High King by most of the Irish kings. But the high-kingship was a lordship won by the sword, not a crown passed in peace; my hold rested on the submission of other kings.',
        source: { id: 'new-history-ireland-2' },
      },
      {
        question: 'How did you answer the Normans?',
        answer:
          'I besieged Dublin in 1171 and tried to halt the incomers, but Henry II crossed to Ireland that same year to claim the land for his sons. By the Treaty of Windsor in 1175 my authority was recognised only outside the Norman lordships.',
        source: { id: 'new-history-ireland-2' },
      },
      {
        question: 'Were you the last of the high kings?',
        answer:
          'After me no Irish ruler again held an undisputed high-kingship. I abdicated in 1186 and my line continued as kings of Connacht, but the age of the high-kingship closed with me.',
        source: { id: 'oxford-companion-irish-history' },
      },
    ],
  },
  {
    id: 'aoife-mac-murrough',
    name: 'Aoife Mac Murrough',
    commonName: 'Eva of Leinster',
    eraId: 'norman-lordship',
    dateRange: { from: 1145, to: 1188, label: 'c. 1145–1188' },
    summary: 'Daughter of Diarmait and wife of Strongbow, a bridge between Gaelic and Norman worlds.',
    primaryReference: { id: 'dib' },
    testimonies: [
      {
        question: 'What was the price of your marriage?',
        answer:
          "My father offered me to Strongbow as the seal of an alliance. Our marriage at Waterford in 1170 bound the Norman lord to my family's claim on Leinster. Whether I chose it or not, the chronicles remember me as the link that made his title.",
        source: { id: 'flanagan-anglo-norman' },
      },
      {
        question: 'What became of your children?',
        answer:
          'My daughter Isabella became heir of Leinster and married William Marshal. Through her the de Clare claim passed into the Marshal line and, later, into the hands of the English crown.',
        source: { id: 'dib' },
      },
      {
        question: 'Do the annals name you?',
        answer:
          'The annals often leave women unnamed, and the Norman writers call me only the daughter of Diarmait. My name survives chiefly in the Irish genealogies that call me Aoife.',
        source: { id: 'new-history-ireland-2' },
      },
    ],
  },

  // ── Era 2: Gaelic Resurgence & the Tudor Conquest ─────────────────────
  {
    id: 'art-macmurrough-kavanagh',
    name: 'Art Mac Murrough Kavanagh',
    commonName: 'Art Mór Mac Murchadha',
    eraId: 'gaelic-resurgence',
    dateRange: { from: 1357, to: 1417, label: 'c. 1357–1417' },
    summary: 'King of Leinster who led a powerful Gaelic recovery in the late fourteenth century.',
    primaryReference: { id: 'dib' },
    testimonies: [
      {
        question: 'You were called Mór — the great. What did you rule?',
        answer:
          'I was King of Leinster, of the Uí Muireadhaigh and the Mac Murchadha, and I fought to recover lands the settlers had taken. From the mountains of Wicklow I harried the Pale for years.',
        source: { id: 'nicholls-gaelic-recovery' },
      },
      {
        question: 'What did the Dublin government think of you?',
        answer:
          'To the government I was a rebel and a standing threat, and they wrote of me with fear. I took the sons of settler families as hostages and was paid tribute for peace, but I never submitted for long.',
        source: { id: 'oxford-companion-irish-history' },
      },
      {
        question: 'Did your recovery last?',
        answer:
          'I died in 1417. My son Diarmait continued the kingship and my descendants took the name Kavanagh. The recovery I led did not last, but it showed that the lordship was far from conquered.',
        source: { id: 'dib' },
      },
    ],
  },
  {
    id: 'grace-omalley',
    name: 'Gráinne Ní Mháille',
    commonName: 'Grace O’Malley / Granuaile',
    eraId: 'gaelic-resurgence',
    dateRange: { from: 1530, to: 1603, label: 'c. 1530–c. 1603' },
    summary: 'Sea-captain and chieftain of Connacht who met Elizabeth I.',
    primaryReference: { id: 'chambers-grace-omalley' },
    testimonies: [
      {
        question: 'How did a woman come to command a fleet?',
        answer:
          "I was born to the O'Malley lordship of Umhaill in Mayo, a seafaring family. I commanded the galleys, levied tolls on shipping in Clew Bay, and traded and fought along the western coast. My strength came from the sea, not from a husband's name.",
        source: { id: 'chambers-grace-omalley' },
      },
      {
        question: 'Is it true you sailed to London?',
        answer:
          'In 1593 I went to Greenwich to petition Elizabeth I for the return of lands and to plead for my sons. We spoke in Latin, the only tongue we shared. I came home with promises, though the English captains in Connacht still pressed on me.',
        source: { id: 'chambers-grace-omalley' },
      },
      {
        question: 'Why were the Tudor authorities wary of you?',
        answer:
          'I sheltered men they called rebels, controlled the trade of a whole coast, and answered to no governor. The sea was my country, and the sea was not easily mapped or taxed.',
        source: { id: 'dib' },
      },
    ],
  },
  {
    id: 'hugh-oneill',
    name: 'Aodh Mór Ó Néill',
    commonName: 'Hugh O’Neill, 2nd Earl of Tyrone',
    eraId: 'gaelic-resurgence',
    dateRange: { from: 1550, to: 1616, label: 'c. 1550–1616' },
    summary: "The last great Gaelic lord to challenge Elizabeth's conquest of Ireland.",
    primaryReference: { id: 'morgan-tyrones-rebellion' },
    testimonies: [
      {
        question: 'You were raised among the English, were you not?',
        answer:
          'I was fostered in the Pale and took the title Earl of Tyrone, yet I ruled as Ó Néill. I fought Elizabeth in the Nine Years’ War for the survival of the Gaelic order, not merely for my own lands.',
        source: { id: 'morgan-tyrones-rebellion' },
      },
      {
        question: 'How did the war end?',
        answer:
          'We met the English at Kinsale in 1601 and were defeated. I submitted in 1603 to James I, hoping to keep my lands and my people, but the terms grew harsher and the government pressed me to conform.',
        source: { id: 'new-history-ireland-3' },
      },
      {
        question: 'What became of you in the end?',
        answer:
          'In 1607 I left Ireland with the earls in the Flight of the Earls and died in Rome in 1616. The conquest was completed after me, but the memory of the great O’Neill endured.',
        source: { id: 'dib' },
      },
    ],
  },

  // ── Era 3: Plantation, Rebellion & Cromwell ───────────────────────────
  {
    id: 'rory-odonnell',
    name: 'Rudhraighe Ó Domhnaill',
    commonName: "Rory O'Donnell, 1st Earl of Tyrconnell",
    eraId: 'plantation-cromwell',
    dateRange: { from: 1575, to: 1608, label: '1575–1608' },
    summary: "Flight of the Earls figure and claimant to the O'Donnell lordship.",
    primaryReference: { id: 'dib' },
    testimonies: [
      {
        question: 'Why did you leave Ireland in 1607?',
        answer:
          'I feared my lands and title were being stripped from me by a government that distrusted the Gael. With Hugh O’Neill and others I sailed from Rathmullan in September 1607, intending to reach Spain. It was called the Flight of the Earls.',
        source: { id: 'new-history-ireland-3' },
      },
      {
        question: 'Did Spain help you?',
        answer:
          'Spain gave us welcome but no army to win back what we had lost. Our departure was used to declare the northern lands forfeit and to open the way for the Plantation of Ulster.',
        source: { id: 'new-history-ireland-3' },
      },
      {
        question: 'How did your life end?',
        answer:
          'I fell ill in Rome and died in 1608, an exile still in my early thirties. My family remained on the continent, and the lordship of Tyrconnell passed from our hands for ever.',
        source: { id: 'dib' },
      },
    ],
  },
  {
    id: 'owen-roe-oneill',
    name: 'Eoghan Rua Ó Néill',
    commonName: 'Owen Roe O’Neill',
    eraId: 'plantation-cromwell',
    dateRange: { from: 1585, to: 1649, label: 'c. 1585–1649' },
    summary: 'Commander of the Confederate Ulster army during the wars of the 1640s.',
    primaryReference: { id: 'dib' },
    testimonies: [
      {
        question: 'You spent years in Spanish service?',
        answer:
          'I served Spain in the Low Countries for many years and learned to command an army there. In 1642 I returned to Ulster to lead the Irish Confederates’ northern army.',
        source: { id: 'ohart-confederate-ireland' },
      },
      {
        question: 'What did the Confederation want?',
        answer:
          'The Confederation of Kilkenny — Old English and Gaelic Irish together — sought a self-governing Catholic Ireland under the crown, with its own parliament and church. We fought for terms, not for mere conquest.',
        source: { id: 'new-history-ireland-3' },
      },
      {
        question: 'How are you remembered?',
        answer:
          'I won the field at Benburb in 1646, and when I died in 1649 I had not been defeated in battle. But the wars had drained us, and Cromwell was not long in coming.',
        source: { id: 'oxford-companion-irish-history' },
      },
    ],
  },
  {
    id: 'patrick-sarsfield',
    name: 'Pádraig Sáirséal',
    commonName: 'Patrick Sarsfield, 1st Earl of Lucan',
    eraId: 'plantation-cromwell',
    dateRange: { from: 1655, to: 1693, label: 'c. 1655–1693' },
    summary: 'Jacobite commander at Limerick during the Williamite war.',
    primaryReference: { id: 'simms-jacobite-ireland' },
    testimonies: [
      {
        question: 'What did you defend at Limerick?',
        answer:
          'I commanded the Jacobite forces in the Williamite war. In 1690 I led a night raid that destroyed the Williamite siege train on the road to Limerick — the guns were lost at Ballyneety.',
        source: { id: 'simms-jacobite-ireland' },
      },
      {
        question: 'What was the Treaty of Limerick?',
        answer:
          "In 1691 the city surrendered on articles that promised the Catholic townspeople their liberties and gave the army leave to sail for France. I chose to go with the 'Wild Geese' rather than trust the terms.",
        source: { id: 'new-history-ireland-3' },
      },
      {
        question: 'How did your life end?',
        answer:
          'I took service in the French army and fell at the battle of Landen in 1693, not yet forty. The cause I had fought for at home was lost, but Ireland remembered the ride to Ballyneety.',
        source: { id: 'dib' },
      },
    ],
  },

  // ── Era 4: Penal Laws & the United Irishmen ───────────────────────────
  {
    id: 'jonathan-swift',
    name: 'Jonathan Swift',
    commonName: 'Dean Swift',
    eraId: 'penal-united-irishmen',
    dateRange: { from: 1667, to: 1745, label: '1667–1745' },
    summary: "Satirist and Dean of St Patrick's, who chafed against English misrule.",
    primaryReference: { id: 'damrosch-swift' },
    testimonies: [
      {
        question: 'You were born in Dublin, not England?',
        answer:
          'I was born in Dublin in 1667 and educated at Trinity College. Though I spent years in England, I returned as Dean of St Patrick’s. I am often claimed by England, but my grave is in my own city.',
        source: { id: 'damrosch-swift' },
      },
      {
        question: 'What did your satire attack?',
        answer:
          'I wrote A Modest Proposal in 1729, a bitter jest proposing that the poor sell their children for food, to shame England for Ireland’s poverty. In the Drapier’s Letters I defended Irish coin against a patent that would have harmed us.',
        source: { id: 'damrosch-swift' },
      },
      {
        question: 'Did you believe Ireland could prosper?',
        answer:
          'I despaired of it in my own time, but I wrote that whoever could make two ears of corn grow where only one grew before deserved better of mankind than all the race of politicians. The lesson I left was to value Ireland’s own.',
        source: { id: 'oxford-companion-irish-history' },
      },
    ],
  },
  {
    id: 'lord-edward-fitzgerald',
    name: 'Lord Edward FitzGerald',
    commonName: 'Lord Edward',
    eraId: 'penal-united-irishmen',
    dateRange: { from: 1763, to: 1798, label: '1763–1798' },
    summary: 'United Irishmen leader who died for the rebellion of 1798.',
    primaryReference: { id: 'curtin-united-irishmen' },
    testimonies: [
      {
        question: 'You were an aristocrat — why join the United Irishmen?',
        answer:
          'I sat in the Irish parliament and saw that reform would never come from it. With Wolfe Tone and the United Irishmen I came to seek a republic and an end to the connection with England.',
        source: { id: 'curtin-united-irishmen' },
      },
      {
        question: 'What was the rising of 1798?',
        answer:
          'It was a general outbreak in Leinster and Ulster, and I was to lead the Dublin part. But troops were sent to arrest us, and the rising went forward without a coherent plan. Many thousands died on both sides.',
        source: { id: 'new-history-ireland-4' },
      },
      {
        question: 'How did your life end?',
        answer:
          'I was arrested in Dublin on 19 May 1798 after a struggle, wounded in the arm. I died of that wound in Newgate prison on 4 June, before the fighting had ended.',
        source: { id: 'dib' },
      },
    ],
  },
  {
    id: 'wolfe-tone',
    name: 'Theobald Wolfe Tone',
    commonName: 'Wolfe Tone',
    eraId: 'penal-united-irishmen',
    dateRange: { from: 1763, to: 1798, label: '1763–1798' },
    summary: 'Founder of the United Irishmen and a father of Irish republicanism.',
    primaryReference: { id: 'elliott-wolfe-tone' },
    testimonies: [
      {
        question: 'What did the United Irishmen stand for?',
        answer:
          'We were founded in Belfast in 1791 to unite Protestant, Catholic and Dissenter in one movement, first for reform and then for a republic. I wrote that the weight of English influence was the radical vice of our government.',
        source: { id: 'curtin-united-irishmen' },
      },
      {
        question: 'You sought French help?',
        answer:
          'I went to France and persuaded the Directory to send expeditions to Ireland: to Bantry Bay in 1796, and a smaller landing in 1798. The fleet was scattered by weather, and the rising was broken before real help arrived.',
        source: { id: 'elliott-wolfe-tone' },
      },
      {
        question: 'And your own end?',
        answer:
          'I was taken aboard a French ship at Lough Swilly in October 1798. Condemned to be hanged as a traitor, I took my own life in prison rather than give them the satisfaction. I asked to be buried at Bodenstown.',
        source: { id: 'elliott-wolfe-tone' },
      },
    ],
  },

  // ── Era 5: Union, Emancipation & the Famine ───────────────────────────
  {
    id: 'daniel-oconnell',
    name: 'Dónall Ó Conaill',
    commonName: "Daniel O'Connell, the Liberator",
    eraId: 'union-emancipation-famine',
    dateRange: { from: 1775, to: 1847, label: '1775–1847' },
    summary: 'The Liberator, who won Catholic Emancipation through mass politics.',
    primaryReference: { id: 'macdonagh-oconnell' },
    testimonies: [
      {
        question: 'The Emancipation of 1829 — how was it won?',
        answer:
          'By the Catholic Association and the forty-shilling freeholders. In the Clare by-election of 1828 I stood for parliament and won, though as a Catholic I could not take the oath. The government yielded and passed the Catholic Relief Act in 1829.',
        source: { id: 'macdonagh-oconnell' },
      },
      {
        question: 'What did you do after that?',
        answer:
          'I campaigned to repeal the Act of Union and restore an Irish parliament, and held monster meetings of hundreds of thousands. In 1843 the government banned the meeting at Clontarf, and I called it off rather than risk slaughter.',
        source: { id: 'new-history-ireland-5' },
      },
      {
        question: 'How does your story end?',
        answer:
          'My health and my party broke in the famine years, and I died in Genoa in 1847 on pilgrimage to Rome. I never saw repeal, but I had shown that the Irish people could be organised into a force Westminster could not ignore.',
        source: { id: 'dib' },
      },
    ],
  },
  {
    id: 'asenath-nicholson',
    name: 'Asenath Nicholson',
    commonName: 'Asenath Hatch Nicholson',
    eraId: 'union-emancipation-famine',
    dateRange: { from: 1792, to: 1855, label: '1792–1855' },
    summary: 'American reformer who walked Ireland during the Great Famine and wrote what she saw.',
    primaryReference: { id: 'nicholson-annals' },
    testimonies: [
      {
        question: 'Why did an American come to Ireland?',
        answer:
          'I came first in 1844 to distribute scripture among the poor, and I returned in 1847 at the height of the famine. I walked from town to town, from Dublin into the west, and would not take shelter when those around me had none.',
        source: { id: 'nicholson-annals' },
      },
      {
        question: 'What did you find?',
        answer:
          'I found people eating grass and starving in their cabins while the ships carried away the harvest. I recorded names, faces and their own words, because I believed the plain truth would move those who could help.',
        source: { id: 'nicholson-annals' },
      },
      {
        question: 'Did your writing matter?',
        answer:
          'My Annals of the Famine in Ireland were published in 1851 to little praise and much dispute. Only later were they read as one of the most direct witnesses we have of the hunger years.',
        source: { id: 'kinealy-great-calamity' },
      },
    ],
  },
  {
    id: 'thomas-davis',
    name: 'Thomas Davis',
    commonName: 'Thomas Osborne Davis',
    eraId: 'union-emancipation-famine',
    dateRange: { from: 1814, to: 1845, label: '1814–1845' },
    summary: 'Young Ireland poet and writer who shaped a cultural nationalism.',
    primaryReference: { id: 'dib' },
    testimonies: [
      {
        question: 'You founded a newspaper?',
        answer:
          'With Charles Gavan Duffy and John Blake Dillon I founded The Nation in 1842, to teach the Irish to think of themselves as a nation through song, history and essay. We were called Young Ireland.',
        source: { id: 'new-history-ireland-5' },
      },
      {
        question: 'What did you want for Ireland?',
        answer:
          'A self-governing Ireland in which all creeds shared the nation, and a culture that looked to its own past. I wrote A Nation Once Again, which schoolchildren still sing.',
        source: { id: 'dib' },
      },
      {
        question: 'Your life was short, was it not?',
        answer:
          'I died of scarlet fever in 1845, aged thirty, before the worst of the famine. My friends carried on, and the writers of 1916 took up ideas I had put into verse.',
        source: { id: 'new-history-ireland-5' },
      },
    ],
  },

  // ── Era 6: Fenians, the Land War & Home Rule ──────────────────────────
  {
    id: 'james-stephens',
    name: 'James Stephens',
    commonName: 'Seamus Mac Stiofáin',
    eraId: 'fenians-land-war-home-rule',
    dateRange: { from: 1825, to: 1901, label: '1825–1901' },
    summary: 'Founder of the Irish Republican Brotherhood.',
    primaryReference: { id: 'comerford-fenians' },
    testimonies: [
      {
        question: 'What was the IRB?',
        answer:
          'It was a secret, oath-bound brotherhood founded in Dublin in 1858 — the Fenians — sworn to establish an independent Irish republic by force of arms. I had learned the trade in Paris in 1848 and brought it home.',
        source: { id: 'comerford-fenians' },
      },
      {
        question: 'Why did the rising of 1867 fail?',
        answer:
          'The plans were betrayed and the government moved first, so the rising collapsed and its leaders were transported. Ireland and America had fallen out, and no two leaders trusted each other.',
        source: { id: 'oxford-companion-irish-history' },
      },
      {
        question: 'Did you remain at the head?',
        answer:
          'No. I was deposed as head centre in 1866 and lived long in exile afterwards. The Fenian ideal outlived me, and the men of 1916 traced themselves to it.',
        source: { id: 'dib' },
      },
    ],
  },
  {
    id: 'michael-davitt',
    name: 'Michael Davitt',
    commonName: 'Mícheál Mac Dáibhí',
    eraId: 'fenians-land-war-home-rule',
    dateRange: { from: 1846, to: 1906, label: '1846–1906' },
    summary: 'Land League founder and champion of the small tenant farmer.',
    primaryReference: { id: 'jordan-land-popular-politics' },
    testimonies: [
      {
        question: 'What happened to your family?',
        answer:
          'We were evicted from our holding in Mayo in 1850 and went to England. I lost my right arm as a boy in a factory accident. I became a Fenian, was imprisoned for it, and turned my mind to the land question in prison.',
        source: { id: 'jordan-land-popular-politics' },
      },
      {
        question: 'What was the Land League?',
        answer:
          'Founded in 1879 with Charles Stewart Parnell as its president, it fought for fair rent, fixity of tenure and free sale, and against unjust eviction. The boycott took its name from Captain Boycott of Mayo.',
        source: { id: 'new-history-ireland-6' },
      },
      {
        question: 'What did you achieve?',
        answer:
          'The Land Acts from 1881 onwards began the transfer of the land to the tenants, and by the early twentieth century the tenants were buying out the landlords. I died in 1906, having helped break the landlord’s power.',
        source: { id: 'dib' },
      },
    ],
  },
  {
    id: 'charles-stewart-parnell',
    name: 'Charles Stewart Parnell',
    commonName: 'C. S. Parnell',
    eraId: 'fenians-land-war-home-rule',
    dateRange: { from: 1846, to: 1891, label: '1846–1891' },
    summary: 'Home Rule leader who brought constitutional nationalism to its height.',
    primaryReference: { id: 'lyons-parnell' },
    testimonies: [
      {
        question: 'You were an unlikely leader, were you not?',
        answer:
          'I was a Protestant landlord from Wicklow, yet I led the Home Rule party and the Land League. I came to politics in the 1870s and used obstruction in the Commons to force Home Rule onto the agenda.',
        source: { id: 'lyons-parnell' },
      },
      {
        question: 'What was your greatest moment?',
        answer:
          'The alliance with the Liberals after 1885, when Gladstone introduced the first Home Rule Bill in 1886. It was defeated, but the cause had become a question of government, not a fringe hope.',
        source: { id: 'new-history-ireland-6' },
      },
      {
        question: 'And the divorce case?',
        answer:
          'My fall in 1890 came when I was named in a divorce case. The party split, the church turned against me, and I died at Brighton in 1891. Yet Home Rule was not abandoned.',
        source: { id: 'lyons-parnell' },
      },
    ],
  },
  {
    id: 'maud-gonne',
    name: 'Maud Gonne',
    commonName: 'Maud Gonne MacBride',
    eraId: 'fenians-land-war-home-rule',
    dateRange: { from: 1866, to: 1953, label: '1866–1953' },
    summary: 'Nationalist activist and founder of Inghinidhe na hÉireann.',
    primaryReference: { id: 'ward-maud-gonne' },
    testimonies: [
      {
        question: 'You were born in England — why take up Ireland’s cause?',
        answer:
          'My mother was Irish and I chose Ireland. I campaigned against evictions in the west, and in 1900 I founded Inghinidhe na hÉireann, the Daughters of Ireland, to teach nationalism to the young and to feed the poor of Dublin.',
        source: { id: 'ward-maud-gonne' },
      },
      {
        question: 'What did you do for the cause?',
        answer:
          'I acted on the stage, wrote in the nationalist press, and spoke at meetings from Dublin to America, and I argued against the Boer War and against the recruitment of Irishmen into the British army.',
        source: { id: 'new-history-ireland-6' },
      },
      {
        question: 'What did you think of the Rising?',
        answer:
          'I was in France when it came in 1916, and I returned to find my friends dead. My marriage to John MacBride, executed for the Rising, had ended badly, but I carried on the work into my last years.',
        source: { id: 'dib' },
      },
    ],
  },

  // ── Era 7: The Road to the Rising ─────────────────────────────────────
  {
    id: 'james-connolly',
    name: 'James Connolly',
    commonName: 'Seamas Ó Conghaile',
    eraId: 'road-to-the-rising',
    dateRange: { from: 1868, to: 1916, label: '1868–1916' },
    summary: 'Socialist and labour leader who commanded the Dublin rising.',
    primaryReference: { id: 'nevin-connolly' },
    testimonies: [
      {
        question: 'You were born in Edinburgh, not Ireland?',
        answer:
          'I was born in Edinburgh to Irish parents and came to Dublin in 1896. I founded the Irish Socialist Republican Party and later the Irish Citizen Army, because I believed the worker’s cause and Ireland’s cause were one.',
        source: { id: 'nevin-connolly' },
      },
      {
        question: 'What happened in the Lockout?',
        answer:
          'In 1913 the Dublin employers locked out their workers for months, and I stood with Jim Larkin and the Irish Transport and General Workers’ Union. The men starved rather than give up the union, and from that struggle came the Citizen Army.',
        source: { id: 'townshend-easter-1916' },
      },
      {
        question: 'Why did you join the Rising?',
        answer:
          'I judged that England’s difficulty was Ireland’s opportunity, and I took the Citizen Army into the fight beside the Irish Volunteers. Wounded in the General Post Office, I was carried to Kilmainham and shot on 12 May 1916.',
        source: { id: 'nevin-connolly' },
      },
    ],
  },
  {
    id: 'constance-markievicz',
    name: 'Constance Markievicz',
    commonName: 'Countess Markievicz',
    eraId: 'road-to-the-rising',
    dateRange: { from: 1868, to: 1927, label: '1868–1927' },
    summary: 'Revolutionary, labour advocate and the first woman elected to Westminster.',
    primaryReference: { id: 'haverty-markievicz' },
    testimonies: [
      {
        question: 'You were born to wealth — why give it up?',
        answer:
          'I was born Constance Gore-Booth at Lissadell in Sligo, and I might have lived at ease. Instead I gave myself to Ireland’s poor and to its freedom, and I served in the Citizen Army in the Rising.',
        source: { id: 'haverty-markievicz' },
      },
      {
        question: 'What was your part in 1916?',
        answer:
          'I was second-in-command at St Stephen’s Green and helped hold the Royal College of Surgeons. I was condemned to death, and the sentence was commuted to penal servitude because I was a woman.',
        source: { id: 'mcgarry-the-rising' },
      },
      {
        question: 'What came after?',
        answer:
          'In 1918 I was elected to Westminster for Dublin St Patrick’s — the first woman returned — but I would not take the seat. I served in the first Dáil and carried on in politics until my death in 1927.',
        source: { id: 'haverty-markievicz' },
      },
    ],
  },
  {
    id: 'patrick-pearse',
    name: 'Pádraig Mac Piarais',
    commonName: 'Patrick Pearse',
    eraId: 'road-to-the-rising',
    dateRange: { from: 1879, to: 1916, label: '1879–1916' },
    summary: 'Teacher, writer and leader of the Easter Rising.',
    primaryReference: { id: 'augusteijn-pearse' },
    testimonies: [
      {
        question: 'You were a teacher, not a soldier?',
        answer:
          'I founded St Enda’s School at Rathfarnham to teach Irish language and pride, and I wrote plays, poems and essays. But I came to believe that only sacrifice could wake the nation, and I joined the Irish Volunteers and the IRB.',
        source: { id: 'augusteijn-pearse' },
      },
      {
        question: 'What did you declare on Easter Monday?',
        answer:
          'I read the Proclamation of the Irish Republic from the steps of the General Post Office, on behalf of the Provisional Government. It promised equal rights and equal opportunities to all, and it named the republic in the name of the dead generations.',
        source: { id: 'nli-1916', locator: 'Proclamation of the Irish Republic, Easter 1916' },
      },
      {
        question: 'How did it end?',
        answer:
          'I surrendered to avoid more civilian deaths, though I knew what the price would be. I was shot in the yard of Kilmainham Gaol on 3 May 1916, at thirty-six, and not a man of my family lived to see Ireland free.',
        source: { id: 'augusteijn-pearse' },
      },
    ],
  },
];

/** The shipped roster: {@link ERAS} plus {@link SPIRITS}. */
export const ROSTER: Roster = { eras: ERAS, spirits: SPIRITS };

function pushError(
  errors: RosterValidationError[],
  code: RosterErrorCode,
  message: string,
  extra?: { spiritId?: string; eraId?: string },
): void {
  errors.push({ code, message, ...extra });
}

function isNonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Validate a roster against the content contract.
 *
 * Enforces: unique spirit and era ids; non-empty names; sane date ranges;
 * spirits bound to a known era; at least {@link REQUIRED_SPIRITS_PER_ERA}
 * spirits per era listed in non-decreasing chronological order; at least
 * {@link REQUIRED_TESTIMONIES_PER_SPIRIT} testimonies per spirit, each with a
 * question, an answer and a resolvable source citation; a resolvable primary
 * historical reference per spirit.
 *
 * @param roster  The roster to validate (defaults to {@link ROSTER}).
 * @param sources The source table to resolve references against (defaults to
 *                {@link SOURCES}).
 * @returns `{ ok, errors }` — `ok` is true only when `errors` is empty.
 */
export function validateRoster(
  roster: Roster = ROSTER,
  sources: Readonly<Record<string, Source>> = SOURCES,
): RosterValidationResult {
  const errors: RosterValidationError[] = [];

  if (roster.eras.length === 0 || roster.spirits.length === 0) {
    pushError(errors, 'empty-roster', 'Roster must define at least one era and one spirit.');
    return { ok: false, errors };
  }

  // ── Duplicate ids ─────────────────────────────────────────────────────
  const spiritIds = new Set<string>();
  for (const spirit of roster.spirits) {
    if (spiritIds.has(spirit.id)) {
      pushError(errors, 'duplicate-id', `Duplicate spirit id "${spirit.id}".`, {
        spiritId: spirit.id,
      });
    }
    spiritIds.add(spirit.id);
  }

  const eraIds = new Set<string>();
  for (const era of roster.eras) {
    if (eraIds.has(era.id)) {
      pushError(errors, 'duplicate-era-id', `Duplicate era id "${era.id}".`, { eraId: era.id });
    }
    eraIds.add(era.id);
  }

  // ── Per-spirit checks ─────────────────────────────────────────────────
  const spiritById = new Map<string, Spirit>();
  for (const spirit of roster.spirits) {
    spiritById.set(spirit.id, spirit);

    if (!isNonEmpty(spirit.name)) {
      pushError(errors, 'empty-name', `Spirit "${spirit.id}" has an empty name.`, {
        spiritId: spirit.id,
      });
    }
    if (!isNonEmpty(spirit.commonName)) {
      pushError(errors, 'empty-name', `Spirit "${spirit.id}" has an empty common name.`, {
        spiritId: spirit.id,
      });
    }

    const { from, to } = spirit.dateRange;
    if (!Number.isFinite(from) || !Number.isFinite(to) || from > to || !isNonEmpty(spirit.dateRange.label)) {
      pushError(
        errors,
        'invalid-date-range',
        `Spirit "${spirit.id}" has an invalid date range (${from}–${to}).`,
        { spiritId: spirit.id },
      );
    }

    if (!eraIds.has(spirit.eraId)) {
      pushError(errors, 'unknown-era', `Spirit "${spirit.id}" references unknown era "${spirit.eraId}".`, {
        spiritId: spirit.id,
      });
    }

    if (!isNonEmpty(spirit.primaryReference?.id)) {
      pushError(
        errors,
        'missing-primary-reference',
        `Spirit "${spirit.id}" is missing a primary reference.`,
        { spiritId: spirit.id },
      );
    } else if (sources[spirit.primaryReference.id] === undefined) {
      pushError(
        errors,
        'unknown-source',
        `Spirit "${spirit.id}" cites unknown primary source "${spirit.primaryReference.id}".`,
        { spiritId: spirit.id },
      );
    }

    if (spirit.testimonies.length < REQUIRED_TESTIMONIES_PER_SPIRIT) {
      pushError(
        errors,
        'too-few-testimonies',
        `Spirit "${spirit.id}" has only ${spirit.testimonies.length} testimonies; at least ${REQUIRED_TESTIMONIES_PER_SPIRIT} are required.`,
        { spiritId: spirit.id },
      );
    }

    for (const [index, testimony] of spirit.testimonies.entries()) {
      if (!isNonEmpty(testimony.question) || !isNonEmpty(testimony.answer)) {
        pushError(
          errors,
          'invalid-testimony',
          `Spirit "${spirit.id}" testimony ${index} is missing a question or an answer.`,
          { spiritId: spirit.id },
        );
      }
      if (!isNonEmpty(testimony.source?.id)) {
        pushError(
          errors,
          'missing-testimony-source',
          `Spirit "${spirit.id}" testimony ${index} is missing a source citation.`,
          { spiritId: spirit.id },
        );
      } else if (sources[testimony.source.id] === undefined) {
        pushError(
          errors,
          'unknown-source',
          `Spirit "${spirit.id}" testimony ${index} cites unknown source "${testimony.source.id}".`,
          { spiritId: spirit.id },
        );
      }
    }
  }

  // ── Per-era checks ────────────────────────────────────────────────────
  for (const era of roster.eras) {
    if (era.spiritIds.length < REQUIRED_SPIRITS_PER_ERA) {
      pushError(
        errors,
        'era-too-few-spirits',
        `Era "${era.id}" has only ${era.spiritIds.length} spirits; at least ${REQUIRED_SPIRITS_PER_ERA} are required.`,
        { eraId: era.id },
      );
    }

    let previousFrom = Number.NEGATIVE_INFINITY;
    for (const spiritId of era.spiritIds) {
      const spirit = spiritById.get(spiritId);
      if (!spirit) {
        pushError(errors, 'unknown-era-spirit', `Era "${era.id}" references unknown spirit "${spiritId}".`, {
          eraId: era.id,
        });
        continue;
      }
      if (spirit.eraId !== era.id) {
        pushError(
          errors,
          'spirit-era-mismatch',
          `Spirit "${spiritId}" is listed under era "${era.id}" but declares era "${spirit.eraId}".`,
          { spiritId, eraId: era.id },
        );
      }
      if (spirit.dateRange.from < previousFrom) {
        pushError(
          errors,
          'era-dates-not-chronological',
          `Era "${era.id}" lists "${spiritId}" out of chronological order.`,
          { spiritId, eraId: era.id },
        );
      }
      previousFrom = spirit.dateRange.from;
    }
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Return the spirits belonging to an era chapter, in the era's declared order.
 *
 * @param eraId  The era id to look up.
 * @param roster The roster to search (defaults to {@link ROSTER}).
 * @returns The matching spirits, or `[]` for an unknown era.
 */
export function getSpiritsByEra(eraId: string, roster: Roster = ROSTER): Spirit[] {
  const era = roster.eras.find((candidate) => candidate.id === eraId);
  if (!era) {
    return [];
  }
  const byId = new Map(roster.spirits.map((spirit) => [spirit.id, spirit]));
  return era.spiritIds
    .map((id) => byId.get(id))
    .filter((spirit): spirit is Spirit => spirit !== undefined);
}

/**
 * Deterministically select a subset of the roster.
 *
 * The roster is copied, shuffled with a seeded RNG and truncated to `count`.
 * The same seed always yields the same subset in the same order; the source
 * roster is never mutated.
 *
 * @param seed   A deterministic seed (integer or string).
 * @param count  Number of spirits to draw. Clamped to `[0, roster length]`.
 * @param roster The roster to draw from (defaults to {@link ROSTER}).
 * @returns The selected spirits, in shuffled order.
 */
export function selectSpirits(seed: Seed, count: number, roster: Roster = ROSTER): Spirit[] {
  const pool = roster.spirits.slice();
  shuffleArray(pool, createSeededRng(seedToNumber(seed)));
  const clamped = Math.max(0, Math.min(Math.trunc(count), pool.length));
  return pool.slice(0, clamped);
}

/**
 * Reduce a {@link Seed} to a 32-bit integer for {@link createSeededRng}.
 *
 * Numbers are truncated; strings are hashed with FNV-1a so that string seeds
 * are reproducible across runs.
 */
export function seedToNumber(seed: Seed): number {
  if (typeof seed === 'number') {
    return Math.trunc(seed) | 0;
  }
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
