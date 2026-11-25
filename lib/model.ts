// The token radar's model: one snapshot of the protocol universe in, one ranked board out.
//
// Rebuilt for token-radar-01: starting multiple 6.0, category adjustments, 7d growth clamp [-40, 150],
// urgency factor from age and TVL (capped at 3.0), confidence tiers, and ~200 total universe rows.

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
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

function categoryMultiplier(category: string | null): number {
  if (!category) return 1.0;
  const c = category.toLowerCase();
  if (c.includes('lend') || c.includes('bridge') || c.includes('restak') || c.includes('derivative') || c.includes('perpetual') || c.includes('cdp') || c.includes('rwa')) return 1.4;
  if (c.includes('dex') || c.includes('yield') || c.includes('staking') || c.includes('liquid staking') || c.includes('cex') || c.includes('farm')) return 0.7;
  if (c.includes('insurance') || c.includes('prediction') || c.includes('curator') || c.includes('allocator')) return 1.2;
  return 1.0;
}

function urgencyFactor(age: number | null): number {
  const days = age ?? 365;
  // Younger protocols with big TVL get higher urgency factor, capped at 3.0
  const raw = 3.0 * (150 / (Math.max(10, days) + 50));
  return Math.min(3.0, Math.max(0.6, raw));
}

export function impliedValue(protocol: SnapshotProtocol, asOf: string, model: ModelConstants) {
  const age = ageDays(asOf, protocol.listed_at);
  const catMult = categoryMultiplier(protocol.category);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const urgency = urgencyFactor(age);
  
  const base = protocol.tvl_usd * model.base_multiple;
  const implied = Math.max(1, Math.round(base * catMult * growthMult * urgency));

  // Confidence tier determination
  let missing = 0;
  if (!protocol.category) missing++;
  if (protocol.chains.length === 0) missing++;
  if (protocol.listed_at === null) missing++;
  if (protocol.change_7d === null) missing++;
  const confidence: 'high' | 'medium' | 'low' = missing === 0 ? 'high' : missing === 1 ? 'medium' : 'low';

  const chainStr = protocol.chains.length > 0 ? protocol.chains.join(', ') : 'multi-chain';
  const why = `Ranked via $${Math.round(protocol.tvl_usd / 1e6)}M TVL on ${chainStr}, base multiple ${model.base_multiple}x, category modifier ${catMult}x, 7d growth ${growthPct}%, and youth urgency factor ${round4(urgency)}x.`;

  return { implied, growthPct, growthMult, catMult, urgency, age, confidence, why };
}

const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const res = impliedValue(p, snapshot.as_of, model);
    return { p, ...res };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    confidence: s.confidence,
    why: s.why,
    model: {
      base_multiple: model.base_multiple,
      category_multiplier: round4(s.catMult),
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      urgency_factor: round4(s.urgency),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold position and verify on official protocol app.`;
  return s;
}

function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'Arbitrum';
}

function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 300;
  if (p.tvl_usd >= 1_000_000_000) return 200;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const name = p.name;
  const c = (p.category ?? '').toLowerCase();

  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) {
    return [
      { text: `Fund a clean non-custodial wallet with ${capital} USDC and native gas on ${chain}.`, cost: `~$2-4 gas`, time: `5 min` },
      { text: `Supply ${capital} USDC as collateral on ${name} and borrow a conservative amount against it.`, cost: `~$3-5 gas & borrow fee`, time: `10 min` },
      { text: `Maintain position health factor above 2.0 and perform weekly interactions for ${hold} days.`, cost: `~$2 gas weekly`, time: `${hold} days` },
      { text: `Verify eligibility on the official ${name} rewards or points dashboard before unwinding.`, cost: `Free check`, time: `5 min` },
    ];
  }
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) {
    return [
      { text: `Prepare a non-custodial wallet with ${capital} USDC and native gas for ${chain}.`, cost: `~$2 gas`, time: `5 min` },
      { text: `Add liquidity to ${name}'s primary trading pair pool and stake LP tokens in their farm vault.`, cost: `~$4-8 LP & gas fees`, time: `12 min` },
      { text: `Hold active LP stake for at least ${hold} days with bi-weekly reward compounding.`, cost: `~$2 gas per compound`, time: `${hold} days` },
      { text: `Check official ${name} governance forum and points portal to claim rewards.`, cost: `Free check`, time: `5 min` },
    ];
  }
  if (c.includes('bridge') || c.includes('canonical bridge')) {
    return [
      { text: `Deposit ${capital} USDC into ${name} from Ethereum or source chain to target chain.`, cost: `~$3-8 bridge fee`, time: `10 min` },
      { text: `Execute at least 2 additional cross-chain transfers or swaps within 14 days.`, cost: `~$4-10 transfer fees`, time: `15 min` },
      { text: `Retain cross-chain balance or LP position for ${hold} days to ensure epoch inclusion.`, cost: `Capital locked`, time: `${hold} days` },
      { text: `Confirm activity logging on official ${name} explorer / points checker.`, cost: `Free check`, time: `5 min` },
    ];
  }
  if (c.includes('perpetual') || c.includes('derivative')) {
    return [
      { text: `Transfer ${capital} USDC margin collateral to ${name} on ${chain}.`, cost: `~$2 gas`, time: `5 min` },
      { text: `Execute 3 or more spot or 2x perpetual trades on ${name} with low slippage.`, cost: `~$3-7 trading fees`, time: `15 min` },
      { text: `Provide liquidity to margin vault or staking pool and hold for ${hold} days.`, cost: `~$2 gas`, time: `${hold} days` },
      { text: `Verify trading volume and points tier on ${name} dashboard.`, cost: `Free check`, time: `5 min` },
    ];
  }

  return [
    { text: `Fund a dedicated wallet with ${capital} USDC and native gas on ${chain}.`, cost: `~$2 gas`, time: `5 min` },
    { text: `Deposit ${capital} USDC into ${name} core contract vault on ${chain}.`, cost: `~$3-5 gas`, time: `10 min` },
    { text: `Maintain active participation without withdrawing for at least ${hold} days.`, cost: `~$1-2 weekly gas`, time: `${hold} days` },
    { text: `Check official ${name} announcements and points portal for snapshots.`, cost: `Free check`, time: `5 min` },
  ];
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

export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  
  const total_tvl_stake = board.reduce((sum, r) => sum + r.tvl_usd, 0);
  const sortedImplied = board.map((r) => r.implied_value_usd).sort((a, b) => a - b);
  const median_implied_value = sortedImplied.length > 0 ? sortedImplied[Math.floor(sortedImplied.length / 2)]! : 0;
  const high_confidence_count = board.filter((r) => r.confidence === 'high').length;

  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    total_tvl_stake,
    median_implied_value,
    high_confidence_count,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
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
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
