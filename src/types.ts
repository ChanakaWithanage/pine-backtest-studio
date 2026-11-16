export interface Candle {
  time: number; // Unix milliseconds at candle open (UTC)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ContractSettings {
  /** Value of a one-point price move per single contract, in account currency. */
  pointvalue: number;
  /** Minimum order quantity/step. Gold brokers may use different contract units. */
  mincontract: number;
  /** Smallest price increment for fills and rounding. */
  mintick: number;
}

export interface Trade {
  id: string;
  direction: 'Long' | 'Short';
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  exitPrice: number;
  size: number;
  profit: number;
  commission: number;
}

export interface EquityPoint { time: number; value: number; }

export interface Results {
  trades: Trade[];
  periodStart: number; // First selected candle open, UTC milliseconds
  periodEnd: number; // Last selected candle open, UTC milliseconds
  equity: EquityPoint[]; // Closed-trade realized equity, not intrabar MTM
  netProfit: number;
  initialCapital: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  grossProfit: number;
  grossLoss: number;
  winRate: number;
  profitFactor: number | null;
  openTrades: number;
  pendingOrders: number;
  warnings: string[];
}

export interface WorkerRequest {
  id: number;
  code: string;
  candles: Candle[];
  contract: ContractSettings;
}

export type WorkerResponse =
  | { id: number; type: 'success'; results: Results }
  | { id: number; type: 'error'; error: string };
