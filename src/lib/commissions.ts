/** Apply exchange fee assumptions to Pine's strategy() declaration before PineTS runs.
 * No P&L post-processing: PineTS calculates entry AND exit fees during fills.
 * We never stack a separate fee on top of an existing Pine commission.
 */
export interface FeeSettings {
  /** Taker commission per execution (entry and exit), expressed as a percent of notional. */
  percent: number;
  /** false: use existing strategy() fees; true: replace them with this percent. */
  overridePine: boolean;
}
export const DEFAULT_FEES: FeeSettings = { percent: 0.05, overridePine: false };

export interface CommissionPlan {
  script: string;
  source: 'pine' | 'app';
  overridden: boolean;
  ratePercent: number | null;
  description: string;
  declaration: string;
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
