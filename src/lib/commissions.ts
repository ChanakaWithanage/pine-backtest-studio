/** Apply exchange fee assumptions to Pine's strategy() declaration before PineTS runs.
 * No P&L post-processing: PineTS calculates entry AND exit fees during fills.
 * We never stack a separate fee on top of an existing Pine commission.
 */
export type BybitMode = 'zero-fee' | 'tight-spread';

export interface BybitSettings {
  enabled: boolean;
  mode: BybitMode;
  /** What-if full bid/ask spread in USD per gold ounce. Not a live quote. */
  spreadUsd: number;
  /** Bybit metals Tight-Spread commission, USD per standard lot, per round trip. */
  commissionPerLotUsd: number;
  /** Gold ounces in one Bybit standard lot. A custom assumption. */
  ouncesPerLot: number;
  /** Optional manually supplied swap cost per lot per UTC midnight rollover; zero by default. */
  overnightUsdPerLot: number;
}
export const DEFAULT_BYBIT: BybitSettings = {
  enabled: false, mode: 'zero-fee', spreadUsd: 0.50,
  commissionPerLotUsd: 6, ouncesPerLot: 100, overnightUsdPerLot: 0
};

export interface BybitPlan {
  mode: BybitMode;
  requestedSpreadUsd: number;
  appliedSpreadUsd: number;
  ticksPerFill: number;
  commissionPerLotUsd: number;
  ouncesPerLot: number;
  overnightUsdPerLot: number;
}

export interface FeeSettings {
  /** Taker commission per execution (entry and exit), expressed as a percent of notional. */
  percent: number;
  /** false: use existing strategy() fees; true: replace them with this percent. */
  overridePine: boolean;
  bybit?: BybitSettings;
}
export const DEFAULT_FEES: FeeSettings = { percent: 0.05, overridePine: false };

export interface CommissionPlan {
  script: string;
  source: 'pine' | 'app' | 'bybit';
  overridden: boolean;
  ratePercent: number | null;
  description: string;
  declaration: string;
  bybit?: BybitPlan;
}

const isIdent = (char: string | undefined) => !!char && /[a-zA-Z0-9_]/.test(char);

function findDeclaration(code: string) {
  // Finds a real strategy( token outside quoted strings/comments; tracks
  // nested function calls and comments inside the declaration.
  let quote: string | null = null, comment: 'line' | 'block' | null = null;
  let depth = 0, open = -1, start = -1;
  for (let i = 0; i < code.length; i++) {
    const ch = code[i], next = code[i + 1];
    if (comment === 'line') {
      if (ch === '\n') comment = null;
      continue;
    }
    if (comment === 'block') {
      if (ch === '*' && next === '/') { comment = null; i++; }
      continue;
    }
    if (quote) {
      if (ch === '\\') { i++; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '/' && next === '/') { comment = 'line'; i++; continue; }
    if (ch === '/' && next === '*') { comment = 'block'; i++; continue; }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (open < 0 && ch === 's' && code.slice(i, i + 8) === 'strategy' &&
        !isIdent(code[i - 1]) && !isIdent(code[i + 8])) {
      let j = i + 8;
      while (/\s/.test(code[j] || '')) j++;
      if (code[j] === '(') { open = j; start = i; depth = 1; i = j; }
      continue;
    }
    if (open >= 0) {
      if (ch === '(') depth++;
      if (ch === ')') {
        depth--;
        if (!depth) return { start, open, end: i };
      }
    }
  }
  throw new Error('Cannot find a complete strategy(...) declaration. Review the Pine Script header.');
}

function splitArguments(content: string) {
  let quote: string | null = null, comment: 'line' | 'block' | null = null;
  let depth = 0, offset = 0;
  const args: string[] = [];
  for (let i = 0; i < content.length; i++) {
    const ch = content[i], next = content[i + 1];
    if (comment === 'line') { if (ch === '\n') comment = null; continue; }
    if (comment === 'block') { if (ch === '*' && next === '/') { comment = null; i++; } continue; }
    if (quote) {
      if (ch === '\\') { i++; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '/' && next === '/') { comment = 'line'; i++; continue; }
    if (ch === '/' && next === '*') { comment = 'block'; i++; continue; }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') depth--;
    else if (ch === ',' && depth === 0) {
      args.push(content.slice(offset, i));
      offset = i + 1;
    }
  }
  args.push(content.slice(offset));
  return args;
}

function stripComments(text: string) {
  let result = '', quote: string | null = null;
  let block = false, line = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i], next = text[i + 1];
    if (line) { if (ch === '\n') { line = false; result += ' '; } continue; }
    if (block) { if (ch === '*' && next === '/') { block = false; i++; } continue; }
    if (quote) {
      if (ch === '\\') { result += ch + (next || ''); i++; continue; }
      if (ch === quote) quote = null;
      result += ch; continue;
    }
    if (ch === '/' && next === '/') { line = true; i++; continue; }
    if (ch === '/' && next === '*') { block = true; i++; continue; }
    if (ch === '"' || ch === "'") { quote = ch; result += ch; continue; }
    result += ch;
  }
  return result;
}

function commissionArguments(content: string) {
  const args = splitArguments(content);
  const named = args.map(a => ({
    original: a,
    normalized: stripComments(a).trim()
  }));
  const type = named.find(x => /^commission_type\s*=/.test(x.normalized));
  const value = named.find(x => /^commission_value\s*=/.test(x.normalized));
  return { args, type, value };
}

export function planCommissions(source: string, settings: FeeSettings = DEFAULT_FEES): CommissionPlan {
  if (!Number.isFinite(settings.percent) || settings.percent < 0 || settings.percent > 5) {
    throw new Error('Fee rate must be a finite percentage between 0% and 5% per execution.');
  }
  const decl = findDeclaration(source);
  const inner = source.slice(decl.open + 1, decl.end);
  const { args, type, value } = commissionArguments(inner);
  const hasPineFee = Boolean(type || value);
  const declaration = hasPineFee
    ? 'Pine strategy commission: ' +
      (type ? type.normalized.split('=').slice(1).join('=').trim() : 'default percent') +
      ', ' + (value ? value.normalized.split('=').slice(1).join('=').trim() : '0')
    : 'Pine strategy has no explicit commission';

  if (hasPineFee && !settings.overridePine) {
    return {
      script: source, source: 'pine', overridden: false, ratePercent: null,
      description: 'Using the commission already declared in strategy(); the app fee is NOT added.',
      declaration
    };
  }
  // Important: override explicitly REPLACES both Pine header fields. PineTS
  // computes fee at fills, and t.profit is already net of both legs.
  const kept = args.filter(a => {
    const normalized = stripComments(a).trim();
    return normalized && !/^commission_(?:type|value)\s*=/.test(normalized);
  });
  const indent = '\n     ';
  const feeArgs = [
    'commission_type = strategy.commission.percent',
    'commission_value = ' + Number(settings.percent.toFixed(6))
  ];
  const rewritten = kept.map(x => x.trim()).concat(feeArgs).join(',' + indent);
  const output = source.slice(0, decl.open + 1) +
    '\n     ' + rewritten + '\n' + source.slice(decl.end);
  return {
    script: output,
    source: 'app',
    overridden: hasPineFee && settings.overridePine,
    ratePercent: settings.percent,
    description: hasPineFee
      ? 'The app REPLACED the Pine declaration with ' + settings.percent + '% per entry and exit fill.'
      : 'The app added ' + settings.percent + '% per entry and exit fill because Pine had no commission.',
    declaration
  };
}


function replaceStrategyFields(source: string, replacements: Record<string, string>): string {
  const decl = findDeclaration(source);
  const args = splitArguments(source.slice(decl.open + 1, decl.end));
  const keys = Object.keys(replacements);
  const kept = args.filter(part => {
    const normalized = stripComments(part).trim();
    if (!normalized) return false;
    return !keys.some(key => new RegExp('^' + key + '\\s*=').test(normalized));
  });
  const inside = '\n     ' + [...kept.map(s => s.trim()), ...Object.values(replacements)]
    .join(',\n     ') + '\n';
  return source.slice(0, decl.open + 1) + inside + source.slice(decl.end);
}

/**
 * Bybit CFD cost assumptions are injected BEFORE simulation, so net P&L,
 * profit factor and fee-aware equity sizing use the same execution pass.
 *
 * PineTS applies its cash_per_contract fee on BOTH fills. Bybit's documented
 * $6/lot CFD fee is collected at opening. We split that round-trip amount
 * $3/lot per fill to avoid charging $12 per lot. Closed position total is
 * correct; open-position fee timing is only an approximation.
 *
 * PineTS slippage is expressed in price ticks per execution, not dollar P&L.
 * Half the configured full spread is applied against each fill, so an
 * ordinary complete round trip incurs approximately one full spread.
 * This is a constant-spread what-if model, NOT actual Bybit bid/ask quotes.
 */
export function planExecutionCosts(
  source: string,
  settings: FeeSettings = DEFAULT_FEES,
  pointvalue = 1,
  mintick = 0.01
): CommissionPlan {
  if (!settings.bybit?.enabled) return planCommissions(source, settings);
  const bybit = settings.bybit;
  const finiteInRange = (value: number, low: number, high: number, name: string) => {
    if (!Number.isFinite(value) || value < low || value > high) {
      throw new Error(name + ' must be between ' + low + ' and ' + high + '.');
    }
  };
  if (bybit.mode !== 'zero-fee' && bybit.mode !== 'tight-spread') {
    throw new Error('Choose Bybit Zero-Fee or Tight-Spread account mode.');
  }
  finiteInRange(bybit.spreadUsd, 0, 100, 'Estimated full spread (USD/oz)');
  finiteInRange(bybit.commissionPerLotUsd, 0, 1000, 'Commission per standard lot (USD)');
  finiteInRange(bybit.ouncesPerLot, 0.001, 1000000, 'Gold ounces per lot');
  finiteInRange(bybit.overnightUsdPerLot, -1000, 1000, 'Estimated overnight swap (USD/lot)');
  finiteInRange(pointvalue, 0.00000001, 1000000, 'Instrument point value');
  finiteInRange(mintick, 0.00000001, 1000, 'Instrument minimum tick');

  // Round spread UP to a whole number of per-leg ticks rather than
  // silently simulating a smaller spread than the entered assumption.
  const ticksPerFill = Math.ceil(bybit.spreadUsd / (2 * mintick) - 1e-9);
  const appliedSpreadUsd = Number((2 * ticksPerFill * mintick).toPrecision(12));
  const feePerContractPerFill = bybit.mode === 'tight-spread'
    ? (bybit.commissionPerLotUsd * pointvalue) / (2 * bybit.ouncesPerLot)
    : 0;
  const old = findDeclaration(source);
  const original = source.slice(old.open + 1, old.end);
  const commission = commissionArguments(original);
  const oldPine = commission.type || commission.value;
  const declaration = oldPine
    ? 'Original Pine fees replaced by Bybit CFD simulation'
    : 'No Pine commission specified; using Bybit CFD simulation';
  const rewritten = replaceStrategyFields(source, {
    commission_type: 'commission_type = strategy.commission.cash_per_contract',
    commission_value: 'commission_value = ' + Number(feePerContractPerFill.toPrecision(12)),
    slippage: 'slippage = ' + ticksPerFill
  });
  const description = (bybit.mode === 'tight-spread' ? 'Bybit CFD Tight-Spread' : 'Bybit CFD Zero-Fee') +
    ': modeled ' + appliedSpreadUsd.toFixed(2) + ' USD/oz spread' +
    (bybit.mode === 'tight-spread'
      ? ' plus $' + bybit.commissionPerLotUsd.toFixed(2) + '/lot round-trip commission'
      : ', no separate commission') +
    '. Both Pine commission and Pine slippage are replaced, not stacked.';
  return {
    script: rewritten, source: 'bybit', overridden: Boolean(oldPine),
    ratePercent: null, description, declaration,
    bybit: {
      mode: bybit.mode,
      requestedSpreadUsd: bybit.spreadUsd,
      appliedSpreadUsd,
      ticksPerFill,
      commissionPerLotUsd: bybit.mode === 'tight-spread' ? bybit.commissionPerLotUsd : 0,
      ouncesPerLot: bybit.ouncesPerLot,
      overnightUsdPerLot: bybit.overnightUsdPerLot
    }
  };
}

/** Approximate number of UTC-midnight boundaries crossed. Bybit's actual
 * rollover uses its server clock and may charge three-day rates on Wednesday. */
export function estimatedUtcRollovers(entryTime: number, exitTime: number): number {
  if (exitTime <= entryTime || !Number.isFinite(entryTime) || !Number.isFinite(exitTime)) return 0;
  return Math.max(0, Math.floor(exitTime / 86400000) - Math.floor(entryTime / 86400000));
}
