// Protocol Intelligence & Valuation Engine
// Generates deterministic implied valuations, confidence tiers, and farm itineraries.

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface ModelConstants {
  base_multiple: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
}

export const MODEL: ModelConstants = {
  base_multiple: 6.0,
  growth_weight: 0.5,
  growth_floor: -40,
  growth_cap: 150,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
};

export const MODEL_VERSION = 'radar-01';

export const EARLY_ROWS = 160;
export const LIVE_ROWS = 24;

export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  confidence: 'high' | 'medium' | 'low';
  why: string;
  model: {
    base_multiple: number;
    category_multiplier: number;
    growth_pct: number;
    growth_multiplier: number;
    urgency_factor: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  confidence: 'high' | 'medium' | 'low';
  why: string;
  growth_multiplier: number;
  urgency_factor: number;
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  total_tvl_stake: number;
  median_implied_value: number;
  high_confidence_count: number;
  rows: RadarRow[];
  live: LiveRow[];
}

export class SnapshotError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'SnapshotError';
  }
}

const MS_PER_DAY = 86_400_000;

function ensureNumber(val: unknown, fallback: number): number {
  return typeof val === 'number' && Number.isFinite(val) ? val : fallback;
}

export function ageDays(dateStr: string, listedStr: string | null): number | null {
  if (listedStr === null) return null;
  const target = Date.parse(`${dateStr}T00:00:00Z`);
  const origin = Date.parse(`${listedStr}T00:00:00Z`);
  if (!Number.isFinite(target) || !Number.isFinite(origin)) return null;
  return Math.max(0, Math.floor((target - origin) / MS_PER_DAY));
}

function computeSectorMultiplier(category: string | null): number {
  if (!category) return 1.0;
  const tag = category.toLowerCase();
  if (tag.includes('lend') || tag.includes('bridge') || tag.includes('restak') || tag.includes('derivative') || tag.includes('perpetual') || tag.includes('cdp') || tag.includes('rwa')) {
    return 1.4;
  }
  if (tag.includes('dex') || tag.includes('yield') || tag.includes('staking') || tag.includes('liquid staking') || tag.includes('cex') || tag.includes('farm')) {
    return 0.7;
  }
  if (tag.includes('insurance') || tag.includes('prediction') || tag.includes('curator') || tag.includes('allocator')) {
    return 1.2;
  }
  return 1.0;
}

function computeUrgency(age: number | null): number {
  const span = age ?? 365;
  const factor = 3.0 * (150 / (Math.max(10, span) + 50));
  return Math.min(3.0, Math.max(0.6, factor));
}

export function impliedValue(item: SnapshotProtocol, asOfDate: string, params: ModelConstants) {
  const age = ageDays(asOfDate, item.listed_at);
  const sectorMult = computeSectorMultiplier(item.category);
  const rawChange = ensureNumber(item.change_7d, 0);
  const growthPct = Math.min(params.growth_cap, Math.max(params.growth_floor, rawChange));
  const growthMult = 1 + (growthPct / 100) * params.growth_weight;
  const urgency = computeUrgency(age);

  const baseline = item.tvl_usd * params.base_multiple;
  const implied = Math.max(1, Math.round(baseline * sectorMult * growthMult * urgency));

  let missingCount = 0;
  if (!item.category) missingCount++;
  if (item.chains.length === 0) missingCount++;
  if (item.listed_at === null) missingCount++;
  if (item.change_7d === null) missingCount++;

  const confidence: 'high' | 'medium' | 'low' = missingCount === 0 ? 'high' : missingCount === 1 ? 'medium' : 'low';
  const networkInfo = item.chains.length > 0 ? item.chains.join(', ') : 'multi-chain';
  const why = `Valued via $${Math.round(item.tvl_usd / 1e6)}M TVL on ${networkInfo}, base multiplier ${params.base_multiple}x, sector weight ${sectorMult}x, 7d movement ${growthPct}%, and youth velocity factor ${roundTo4(urgency)}x.`;

  return { implied, growthPct, growthMult, sectorMult, urgency, age, confidence, why };
}

const VERSION_REGEX = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSION_REGEX.test(p.name);
}

function mapBySlug(list: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(list.map((p) => [p.slug, p]));
}

export function buildBoard(snapshot: Snapshot, params: ModelConstants = MODEL): BoardRow[] {
  const index = mapBySlug(snapshot.protocols);
  const selected = new Map<string, SnapshotProtocol>();

  for (const slug of snapshot.watchlist) {
    const proto = index.get(slug);
    if (proto !== undefined) selected.set(slug, proto);
  }

  const earlyPool = snapshot.protocols
    .filter((p) => !selected.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || a.slug.localeCompare(b.slug))
    .slice(0, EARLY_ROWS);

  for (const p of earlyPool) selected.set(p.slug, p);

  const evaluated = [...selected.values()].map((p) => {
    const evaluation = impliedValue(p, snapshot.as_of, params);
    return { p, ...evaluation };
  });

  evaluated.sort((a, b) => b.implied - a.implied || a.p.slug.localeCompare(b.p.slug));

  return evaluated.map((item, idx) => ({
    rank: idx + 1,
    slug: item.p.slug,
    name: item.p.name,
    category: item.p.category,
    chains: item.p.chains,
    tvl_usd: item.p.tvl_usd,
    change_7d: item.p.change_7d,
    mcap_usd: item.p.mcap_usd,
    listed_at: item.p.listed_at,
    gecko_id: item.p.gecko_id,
    symbol: item.p.symbol,
    token_status: 'pre-token',
    age_days: item.age,
    implied_value_usd: item.implied,
    confidence: item.confidence,
    why: item.why,
    model: {
      base_multiple: params.base_multiple,
      category_multiplier: roundTo4(item.sectorMult),
      growth_pct: item.growthPct,
      growth_multiplier: roundTo4(item.growthMult),
      urgency_factor: roundTo4(item.urgency),
      age_days: item.age,
    },
    farm_steps: farmSteps(item.p, item.age).map(stepText),
  }));
}

const roundTo4 = (num: number): number => Math.round(num * 1e4) / 1e4;

export function stepText(step: FarmStep): string {
  let sentence = `${step.text} Estimated cost: ${step.cost}. Duration: ${step.time}.`;
  if (sentence.length > 600) sentence = `${sentence.slice(0, 596)}...`;
  if (sentence.length < 20) sentence = `${sentence} Confirm protocol credentials on official channels.`;
  return sentence;
}

function primaryChain(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'Arbitrum';
}

function allocationSize(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 300;
  if (p.tvl_usd >= 1_000_000_000) return 200;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

function holdingPeriod(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const net = primaryChain(p);
  const funds = allocationSize(p);
  const duration = holdingPeriod(age);
  const title = p.name;
  const typeTag = (p.category ?? '').toLowerCase();

  if (typeTag.includes('lend') || typeTag.includes('cdp') || typeTag.includes('collateral')) {
    return [
      { text: `Fund a non-custodial address with ${funds} USDC and native gas tokens on ${net}.`, cost: `~$2-4 gas`, time: `5 min` },
      { text: `Deposit ${funds} USDC as collateral into ${nameSafe(title)} and execute a conservative borrow position.`, cost: `~$3-5 fees`, time: `10 min` },
      { text: `Maintain a health score above 2.0 and engage weekly for ${duration} consecutive days.`, cost: `~$2 weekly gas`, time: `${duration} days` },
      { text: `Check official ${title} rewards portal to confirm eligibility before closing position.`, cost: `Free check`, time: `5 min` },
    ];
  }
  if (typeTag.includes('dex') || typeTag.includes('yield') || typeTag.includes('leveraged farm')) {
    return [
      { text: `Setup a secure wallet holding ${funds} USDC and gas on ${net}.`, cost: `~$2 gas`, time: `5 min` },
      { text: `Provide liquidity to the main trading pair on ${title} and stake the resulting LP tokens.`, cost: `~$4-8 LP fees`, time: `12 min` },
      { text: `Hold the staked pool position for at least ${duration} days with periodic reward harvesting.`, cost: `~$2 compounding fee`, time: `${duration} days` },
      { text: `Review ${title} governance updates and claim portal prior to withdrawal.`, cost: `Free check`, time: `5 min` },
    ];
  }
  if (typeTag.includes('bridge') || typeTag.includes('canonical bridge')) {
    return [
      { text: `Transfer ${funds} USDC through ${title} from Ethereum or source network to destination.`, cost: `~$3-8 bridge toll`, time: `10 min` },
      { text: `Perform at least 2 reciprocal transfers or swaps within a 14-day window.`, cost: `~$4-10 transfer fees`, time: `15 min` },
      { text: `Preserve cross-chain liquidity balance for ${duration} days to satisfy epoch rules.`, cost: `Capital locked`, time: `${duration} days` },
      { text: `Verify transaction recording on official ${title} explorer dashboard.`, cost: `Free check`, time: `5 min` },
    ];
  }
  if (typeTag.includes('perpetual') || typeTag.includes('derivative')) {
    return [
      { text: `Deposit ${funds} USDC margin capital into ${title} on ${net}.`, cost: `~$2 gas`, time: `5 min` },
      { text: `Execute 3 or more spot or light leverage perp transactions with minimal slippage.`, cost: `~$3-7 trade fees`, time: `15 min` },
      { text: `Supply liquidity to margin vaults or staking pools for ${duration} days.`, cost: `~$2 gas`, time: `${duration} days` },
      { text: `Confirm volume tracking and points tier on the ${title} interface.`, cost: `Free check`, time: `5 min` },
    ];
  }

  return [
    { text: `Prepare a dedicated wallet with ${funds} USDC and native network gas on ${net}.`, cost: `~$2 gas`, time: `5 min` },
    { text: `Deposit ${funds} USDC into the primary smart contract vault of ${title}.`, cost: `~$3-5 gas`, time: `10 min` },
    { text: `Hold the active deposit position without withdrawal for at least ${duration} days.`, cost: `~$1-2 weekly gas`, time: `${duration} days` },
    { text: `Monitor official ${title} announcements for snapshot verification.`, cost: `Free check`, time: `5 min` },
  ];
}

function nameSafe(n: string): string {
  return n;
}

export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    confidence: row.confidence,
    why: row.why,
    growth_multiplier: row.model.growth_multiplier,
    urgency_factor: row.model.urgency_factor,
  };
}

export function buildRadar(snapshot: Snapshot, params: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, params);
  const live = liveRows(snapshot);
  const earlyCount = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;

  const total_tvl_stake = board.reduce((acc, r) => acc + r.tvl_usd, 0);
  const sortedValuations = board.map((r) => r.implied_value_usd).sort((a, b) => a - b);
  const median_implied_value = sortedValuations.length > 0 ? sortedValuations[Math.floor(sortedValuations.length / 2)]! : 0;
  const high_confidence_count = board.filter((r) => r.confidence === 'high').length;

  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model: params,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: earlyCount,
    live_size: live.length,
    total_tvl_stake,
    median_implied_value,
    high_confidence_count,
    rows: board.map(radarRow),
    live,
  };

  return { board, radar };
}

export function parseSnapshot(rawText: string): Snapshot {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new SnapshotError('snapshot file contains invalid JSON');
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new SnapshotError('snapshot root must be a JSON object');
  }

  const obj = parsed as Record<string, unknown>;
  if (typeof obj.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(obj.as_of)) {
    throw new SnapshotError('snapshot missing valid as_of date');
  }
  if (typeof obj.source !== 'string') {
    throw new SnapshotError('snapshot missing source string');
  }
  if (typeof obj.floor_usd !== 'number' || !Number.isSafeInteger(obj.floor_usd) || obj.floor_usd <= 0) {
    throw new SnapshotError('snapshot missing valid floor_usd integer');
  }
  if (!Array.isArray(obj.protocols)) {
    throw new SnapshotError('snapshot protocols must be an array');
  }
  if (!Array.isArray(obj.watchlist) || obj.watchlist.some((s) => typeof s !== 'string')) {
    throw new SnapshotError('snapshot watchlist must be an array of strings');
  }

  const protocols = obj.protocols.map((item, idx) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      throw new SnapshotError(`protocol at index ${idx} is not an object`);
    }
    const p = item as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`protocol at index ${idx} lacks slug, name, or valid TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });

  return {
    as_of: obj.as_of,
    source: obj.source,
    floor_usd: obj.floor_usd,
    protocols,
    watchlist: obj.watchlist as string[],
  };
}

export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) {
    return `board omits ${missing.length} watchlist protocol(s): ${missing.slice(0, 5).join(', ')}`;
  }

  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) {
    if (ranks[i] !== i + 1) return `rank sequence error at position ${i + 1}`;
  }

  for (let i = 1; i < board.length; i++) {
    if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) {
      return `implied valuation order violation between row ${i} and ${i + 1}`;
    }
  }

  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} entries share identical implied valuation $${board[0]!.implied_value_usd}`;
  }

  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) {
      return `protocol ${r.slug} has invalid farm step count: ${steps.length}`;
    }
    for (const s of steps) {
      if (s.length < 20 || s.length > 600) {
        return `protocol ${r.slug} has farm step length out of bounds: ${s.length}`;
      }
    }
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) {
      return `protocol ${r.slug} has invalid implied value: ${r.implied_value_usd}`;
    }
  }

  return null;
}

export function dataScript(radar: RadarData): string {
  const rowLines = radar.rows.map((r) => JSON.stringify(r)).join(',\n');
  const liveLines = radar.live.map((l) => JSON.stringify(l)).join(',\n');
  const skeleton = { ...radar, rows: [], live: [] };
  const serializedBase = JSON.stringify(skeleton);
  const closingBrace = serializedBase.lastIndexOf('}');
  const composite =
    serializedBase.slice(0, closingBrace) +
    `"rows":[${radar.rows.length ? '\n' + rowLines + '\n' : ''}],"live":[${radar.live.length ? '\n' + liveLines + '\n' : ''}]` +
    serializedBase.slice(closingBrace);
  return `window.RADAR=${composite};\n`;
}
