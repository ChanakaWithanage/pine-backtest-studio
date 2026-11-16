export interface Candle {
  time: number; // Unix milliseconds at candle open (UTC)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
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
  warnings: string[];
}

export interface WorkerRequest {
  id: number;
  code: string;
  candles: Candle[];
}

export type WorkerResponse =
  | { id: number; type: 'success'; results: Results }
  | { id: number; type: 'error'; error: string };
