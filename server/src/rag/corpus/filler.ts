import {
  CORPUS_PEOPLE,
  DISTRACTORS,
  FILLER_FORBIDDEN,
  PLANTED,
  type Person,
  type RoomKey,
} from './facts.js';

/**
 * Background chatter for the evaluation corpus.
 *
 * Deterministic: a seeded PRNG means every run produces the same messages in
 * the same order, so 8.8's numbers can be reproduced exactly. Only the ULIDs
 * and timestamps differ between seedings, and the evaluation resolves answers by
 * message body, never by id.
 */

/** mulberry32 - small, fast, and good enough for picking template slots. */
export function prng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rand = () => number;

const pick = <T>(rand: Rand, items: readonly T[]): T => items[Math.floor(rand() * items.length)]!;
const between = (rand: Rand, lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));

const SERVICES = ['billing-api', 'auth-service', 'search-api', 'notifications', 'ingest-worker', 'gateway', 'reports', 'exporter', 'scheduler', 'media-proxy'];
const LIBS = ['zod', 'pino', 'axios', 'drizzle', 'vitest', 'undici', 'bullmq', 'react-query'];
const TESTS = ['retry', 'pagination', 'cache warmup', 'serializer', 'permissions', 'csv parsing'];
const HOSTS = ['api-node-02', 'api-node-05', 'cache-01', 'cache-04', 'queue-03', 'web-06', 'worker-09'];
// db-replica-07 is planted; every other replica is fair game.
const REPLICAS = ['db-replica-01', 'db-replica-02', 'db-replica-03', 'db-replica-04', 'db-replica-05', 'db-replica-06', 'db-replica-08', 'db-replica-09'];
// 4.18.0 is planted, and 4.17.2 is left out because it contains "17.2".
const VERSIONS = ['4.15.1', '4.15.3', '4.16.0', '4.16.2', '4.17.0', '4.17.1', '4.17.3', '4.19.1', '4.20.0'];
const CUSTOMERS = ['Acme Health', 'Halcyon Media', 'Orbitly', 'Pinecrest Bank', 'Quarry Labs', 'Tidewater Freight', 'Lumen Retail', 'Corvid Games', 'Fernhill Schools', 'Solace Insurance'];
const FEATURES = ['bulk import', 'dark mode', 'saved filters', 'audit trail', 'webhooks', 'csv export', '2fa enforcement', 'custom roles', 'usage alerts', 'shared inboxes'];
const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
const TIMES = ['9am', '10am', 'noon', '2pm', '3:30pm', '4pm'];
const MONTHS = ['january', 'february', 'april', 'may', 'june', 'august', 'september', 'november'];
const NEWCOMERS = ['harriet', 'omar', 'lena', 'kofi', 'ines'];
const TEAMS = ['data', 'design', 'support', 'infra', 'sales'];
const FOODS = ['thai', 'pizza', 'burritos', 'sushi', 'ramen', 'falafel'];
const BOOKS = ['The Pragmatic Programmer', 'Deep Work', 'Thinking in Systems', 'Working in Public'];
const TOPICS = ['observability', 'accessibility', 'sql tuning', 'writing good docs', 'feature flags'];

/** Short acknowledgements. Under 15 characters, so never embedded - as in a real room. */
const ACKS = ['ok', 'thanks!', 'lgtm', 'on it', '+1', 'nice', 'will do', 'sounds good', 'yep', 'done', 'haha', 'ty', 'got it', 'agreed', 'on my list'];

interface Slots {
  p: Person;
  p2: Person;
  svc: string;
  lib: string;
  test: string;
  host: string;
  replica: string;
  ver: string;
  ver2: string;
  inc: string;
  inc2: string;
  plat: string;
  plat2: string;
  cust: string;
  feat: string;
  feat2: string;
  day: string;
  time: string;
  month: string;
  n: number;
  n2: number;
  pct: number;
  newbie: string;
  team: string;
  food: string;
  book: string;
  topic: string;
}

type Template = (s: Slots) => string;

// Ranges skip the planted ids: INC-4471 and PLAT-2208.
const incident = (rand: Rand) => {
  let n: number;
  do n = between(rand, 4300, 4699);
  while (n === 4471);
  return `INC-${n}`;
};
const ticket = (rand: Rand) => {
  let n: number;
  do n = between(rand, 2100, 2399);
  while (n === 2208);
  return `PLAT-${n}`;
};

const TEMPLATES: Record<RoomKey, Template[]> = {
  eng: [
    (s) => `${s.svc} build is green again, the flaky ${s.test} test was the culprit`,
    (s) => `can someone review my PR for ${s.svc}, it is the ${s.feat} change`,
    (s) => `${s.plat} is ready for review`,
    (s) => `merged ${s.plat}, thanks ${s.p}`,
    (s) => `staging deploy of ${s.svc} is done, smoke tests pass`,
    (s) => `${s.svc} p99 went from ${s.n}ms to ${s.n2}ms after the last change, looking into it`,
    (s) => `bumping ${s.lib} to the latest minor in ${s.svc}`,
    (s) => `who has context on the ${s.svc} retry logic`,
    (s) => `${s.ver} is tagged, notes are in the release doc`,
    (s) => `cherry-picking the fix into ${s.ver}`,
    (s) => `${s.p} is out ${s.day}, ping ${s.p2} for ${s.svc} questions`,
    (s) => `turning on ${s.feat} for internal users first`,
    (s) => `the ${s.svc} dockerfile still pins node 18, I will bump it`,
    (s) => `reminder: code freeze starts ${s.day} at ${s.time}`,
    (s) => `added a dashboard for ${s.svc} queue depth`,
    (s) => `${s.host} got recycled, nothing to worry about`,
    (s) => `pairing with ${s.p} on the ${s.svc} migration this afternoon`,
    (s) => `the ${s.lib} upgrade broke two type definitions in ${s.svc}`,
    (s) => `design review for ${s.feat} moved to ${s.day} ${s.time}`,
    (s) => `does anyone know why ${s.svc} logs are so noisy at info level`,
    (s) => `${s.svc} memory usage keeps creeping up, maybe a leak in the cache layer`,
    (s) => `lint rules updated, run the formatter before pushing`,
    (s) => `${s.plat} and ${s.plat2} look like the same bug to me`,
    (s) => `rolling back ${s.svc} to ${s.ver2}, the new build errors on startup`,
    (s) => `load test on ${s.svc} held ${s.n} rps before latency climbed`,
    (s) => `feature flag for ${s.feat} is at ${s.pct} percent rollout`,
    (s) => `I will write up an ADR for splitting ${s.svc}`,
    (s) => `moved the ${s.svc} report job to run at ${s.time}`,
    (s) => `the monorepo build takes ${s.n2} seconds on a cold cache now`,
    (s) => `${s.p} can you double check the ${s.svc} env vars in staging`,
    (s) => `opened a draft for the ${s.feat} api, comments welcome`,
    (s) => `${s.svc} health check is too aggressive, it restarts under normal load`,
  ],
  incidents: [
    (s) => `${s.inc} opened: elevated 5xx on ${s.svc}`,
    (s) => `${s.inc} resolved, root cause was a bad config push to ${s.svc}`,
    (s) => `paging ${s.p} for ${s.inc}`,
    (s) => `${s.replica} replication lag is ${s.n} seconds, watching it`,
    (s) => `${s.host} cpu pinned at ${s.pct} percent, restarting the pod`,
    (s) => `acking ${s.inc}, looking now`,
    (s) => `${s.inc} is a duplicate of ${s.inc2}`,
    (s) => `status page updated for ${s.inc}`,
    (s) => `customer impact on ${s.inc} was limited to ${s.cust}`,
    (s) => `postmortem for ${s.inc} is ${s.day} at ${s.time}`,
    (s) => `${s.svc} error rate is back to baseline`,
    (s) => `disk alert on ${s.replica} was a false positive`,
    (s) => `${s.inc} timeline doc is in the incidents folder`,
    (s) => `on call handoff: nothing open except ${s.inc}`,
    (s) => `rotated the ${s.svc} api keys as a precaution`,
    (s) => `${s.inc}: queue backlog on ${s.svc} is draining`,
    (s) => `the latency alert for ${s.svc} is too tight, it paged three times for nothing`,
    (s) => `failover drill on ${s.replica} went fine, ${s.n} seconds of write unavailability`,
    (s) => `who is incident commander for ${s.inc}`,
    (s) => `${s.cust} reported slowness, tying it to ${s.inc}`,
    (s) => `certificate renewals for the staging domains are done`,
    (s) => `${s.host} ran out of inodes, cleaned up old log files`,
    (s) => `backup verification for ${s.replica} passed`,
    (s) => `${s.inc} closed with no action items`,
    (s) => `pagerduty schedule for ${s.month} is published`,
    (s) => `${s.svc} dropped connections for ${s.n} seconds during the node drain`,
    (s) => `${s.p} is shadowing on call this rotation`,
  ],
  product: [
    (s) => `${s.cust} wants ${s.feat} on the roadmap`,
    (s) => `notes from the ${s.cust} call are in the crm`,
    (s) => `${s.feat} beta feedback is mostly positive, two complaints about speed`,
    (s) => `roadmap review is ${s.day} at ${s.time}`,
    (s) => `${s.cust} renewal comes up in ${s.month}`,
    (s) => `we should talk pricing for ${s.feat} before it ships`,
    (s) => `${s.p} drafted the spec for ${s.feat}`,
    (s) => `churn last month was ${s.pct} percent, mostly small teams`,
    (s) => `${s.cust} asked whether we support ${s.feat}`,
    (s) => `win-loss notes: lost ${s.cust} to a competitor on price`,
    (s) => `usage of ${s.feat} doubled since the email campaign`,
    (s) => `${s.cust} trial converted, ${s.n} seats`,
    (s) => `support volume on ${s.feat} is up this week`,
    (s) => `nps survey goes out ${s.day}`,
    (s) => `${s.feat} copy needs another pass before launch`,
    (s) => `${s.cust} is interested in an on-prem option, I said not this year`,
    (s) => `a competitor just launched their own ${s.feat}`,
    (s) => `prioritising ${s.feat} over ${s.feat2} for next quarter`,
    (s) => `the pricing page a/b test ended, variant b won by ${s.pct} percent`,
    (s) => `${s.cust} escalated the invoice issue, finance is on it`,
    (s) => `customer advisory board meets in ${s.month}`,
    (s) => `${s.p} is running user interviews on ${s.feat} all week`,
    (s) => `legal reviewed the ${s.cust} dpa, two redlines`,
    (s) => `sales wants a one-pager on ${s.feat}`,
    (s) => `${s.cust} is asking for a discount to expand to ${s.n} seats`,
  ],
  team: [
    (s) => `happy birthday ${s.p}!`,
    (s) => `lunch is ${s.food} today`,
    (s) => `${s.p} is out sick, ${s.p2} is covering`,
    (s) => `all hands moved to ${s.day} at ${s.time}`,
    (s) => `reminder to submit timesheets by ${s.day}`,
    (s) => `welcome ${s.newbie}, who joins the ${s.team} team on ${s.day}`,
    (s) => `the wifi on floor ${s.n % 5 + 1} is flaky again`,
    (s) => `who is up for trivia on ${s.day}`,
    (s) => `book club is reading ${s.book} this month`,
    (s) => `${s.p} and ${s.p2} are running the ${s.day} lunch and learn on ${s.topic}`,
    (s) => `new parking passes are at the front desk`,
    (s) => `please rsvp for the holiday party by ${s.day}`,
    (s) => `friendly reminder to update your emergency contacts`,
    (s) => `${s.p} is on parental leave from ${s.month}`,
    (s) => `the coffee machine is fixed`,
    (s) => `okr drafts are due ${s.day}`,
    (s) => `anyone want to split a taxi to the airport ${s.day}`,
    (s) => `desk moves happen ${s.day}, pack your stuff`,
    (s) => `the quiet room on floor ${s.n % 5 + 1} is bookable again`,
    (s) => `shoutout to ${s.p} for handling the ${s.svc} migration so smoothly`,
    (s) => `standup is async today, post updates in the thread`,
    (s) => `benefits enrollment closes ${s.day}`,
    (s) => `${s.p} brought cookies, kitchen, now`,
    (s) => `the team photo is on the drive`,
  ],
};

function slots(rand: Rand): Slots {
  const p = pick(rand, CORPUS_PEOPLE);
  let p2 = pick(rand, CORPUS_PEOPLE);
  if (p2 === p) p2 = CORPUS_PEOPLE[(CORPUS_PEOPLE.indexOf(p) + 1) % CORPUS_PEOPLE.length]!;
  return {
    p,
    p2,
    svc: pick(rand, SERVICES),
    lib: pick(rand, LIBS),
    test: pick(rand, TESTS),
    host: pick(rand, HOSTS),
    replica: pick(rand, REPLICAS),
    ver: pick(rand, VERSIONS),
    ver2: pick(rand, VERSIONS),
    inc: incident(rand),
    inc2: incident(rand),
    plat: ticket(rand),
    plat2: ticket(rand),
    cust: pick(rand, CUSTOMERS),
    feat: pick(rand, FEATURES),
    feat2: pick(rand, FEATURES),
    day: pick(rand, DAYS),
    time: pick(rand, TIMES),
    month: pick(rand, MONTHS),
    n: between(rand, 2, 900),
    n2: between(rand, 2, 900),
    pct: between(rand, 2, 95),
    newbie: pick(rand, NEWCOMERS),
    team: pick(rand, TEAMS),
    food: pick(rand, FOODS),
    book: pick(rand, BOOKS),
    topic: pick(rand, TOPICS),
  };
}

/**
 * True when text contains a forbidden term at the start of a word. Word-start
 * rather than substring, so "ebs" does not match "websocket" while "reimburs"
 * still matches "reimbursement".
 */
export function containsForbidden(text: string): string | null {
  const lower = text.toLowerCase();
  for (const term of FILLER_FORBIDDEN) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`(^|[^a-z0-9])${escaped}`).test(lower)) return term;
  }
  return null;
}

export type CorpusKind = 'filler' | 'planted' | 'distractor';

export interface CorpusEntry {
  sender: Person;
  body: string;
  kind: CorpusKind;
  /** Planted messages only. */
  key?: string;
}

const ROOM_SEEDS: Record<RoomKey, number> = { eng: 101, incidents: 202, product: 303, team: 404 };

/** Share of filler that is a short acknowledgement, as in a real room. */
const ACK_RATE = 0.18;

export const DEFAULT_MESSAGES_PER_ROOM = 1000;

/**
 * The full ordered timeline for one room: filler with the room's planted
 * answers and near misses spliced in at seeded positions.
 */
export function buildRoom(room: RoomKey, fillerCount = DEFAULT_MESSAGES_PER_ROOM): CorpusEntry[] {
  const rand = prng(ROOM_SEEDS[room]);
  const templates = TEMPLATES[room];
  const entries: CorpusEntry[] = [];

  while (entries.length < fillerCount) {
    if (rand() < ACK_RATE) {
      entries.push({ sender: pick(rand, CORPUS_PEOPLE), body: pick(rand, ACKS), kind: 'filler' });
      continue;
    }
    const s = slots(rand);
    const body = pick(rand, templates)(s);
    // Defence in depth: templates are written to avoid the planted anchors, and
    // anything that slips through is dropped rather than seeded.
    if (containsForbidden(body)) continue;
    entries.push({ sender: s.p, body, kind: 'filler' });
  }

  const inserts: CorpusEntry[] = [
    ...PLANTED.filter((m) => m.room === room).map((m) => ({
      sender: m.sender,
      body: m.body,
      kind: 'planted' as const,
      key: m.key,
    })),
    ...DISTRACTORS.filter((m) => m.room === room).map((m) => ({
      sender: m.sender,
      body: m.body,
      kind: 'distractor' as const,
    })),
  ];

  // Spread them across the timeline rather than bunching them at one end.
  for (const entry of inserts) {
    const at = Math.floor(rand() * (entries.length + 1));
    entries.splice(at, 0, entry);
  }

  return entries;
}

export function buildCorpus(fillerCount = DEFAULT_MESSAGES_PER_ROOM): Record<RoomKey, CorpusEntry[]> {
  return {
    eng: buildRoom('eng', fillerCount),
    incidents: buildRoom('incidents', fillerCount),
    product: buildRoom('product', fillerCount),
    team: buildRoom('team', fillerCount),
  };
}
