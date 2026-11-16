import { ArrowUpRight, Info, Landmark, Settings2 } from 'lucide-react';
import type { BybitSettings, CommissionPlan } from './lib/commissions';
import type { ContractSettings, Results } from './types';
import './bybit.css';

type Props = {
  settings: BybitSettings;
  preview: CommissionPlan | null;
  error: string;
  contract: ContractSettings;
  onChange: (patch: Partial<BybitSettings>) => void;
};
const cash = (value: number) => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', maximumFractionDigits: 2
}).format(value);
const numeric = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 4 });

export function BybitSettingsPanel({ settings, preview, error, contract, onChange }: Props) {
  return <details className="bybit-cfd-panel" open>
    <summary><Landmark size={16}/><div>Bybit TradFi Gold CFD <span>Optional broker cost simulation</span></div></summary>
    <label className="bybit-switch">
      <input type="checkbox" checked={settings.enabled} onChange={e => onChange({ enabled: e.target.checked })}/>
      <span><strong>Enable Bybit TradFi costs</strong><small>Replaces existing Pine/Binance commission and slippage values; never stacks fees.</small></span>
    </label>
    {settings.enabled && <div className="bybit-fields">
      <label className="bybit-select-label">Account mode
        <select value={settings.mode} onChange={e => {
          const mode = e.target.value === 'tight-spread' ? 'tight-spread' : 'zero-fee';
          onChange({ mode, spreadUsd: mode === 'tight-spread' ? 0.20 : 0.50 });
        }}>
          <option value="zero-fee">Zero-Fee (spread only)</option>
          <option value="tight-spread">Tight-Spread ($6/lot plus spread)</option>
        </select>
      </label>
      <div className="bybit-field-grid">
        <label>Full spread <span>USD / gold ounce</span>
          <input type="number" min="0" max="100" step="0.01" value={settings.spreadUsd}
            onChange={e => onChange({ spreadUsd: Number(e.target.value) })}/>
        </label>
        <label>Ounces / lot <span>assumed standard: 100</span>
          <input type="number" min="0.001" max="1000000" step="1" value={settings.ouncesPerLot}
            onChange={e => onChange({ ouncesPerLot: Number(e.target.value) })}/>
        </label>
        {settings.mode === 'tight-spread' && <label>Commission / lot <span>USD / round trip</span>
          <input type="number" min="0" max="1000" step="0.5" value={settings.commissionPerLotUsd}
            onChange={e => onChange({ commissionPerLotUsd: Number(e.target.value) })}/>
        </label>}
        <label>Overnight swap <span>USD / lot / rollover (optional)</span>
          <input type="number" min="-1000" max="1000" step="0.1" value={settings.overnightUsdPerLot}
            onChange={e => onChange({ overnightUsdPerLot: Number(e.target.value) })}/>
        </label>
      </div>
      <div className="bybit-policy" role="status"><Info size={15}/><div>
        <strong>{error || preview?.description}</strong>
        {preview?.bybit && <small>Effective modeled spread: {cash(preview.bybit.appliedSpreadUsd)}/oz.
          {preview.bybit.ticksPerFill} adverse tick(s) per fill at {contract.mintick} tick size.</small>}
      </div></div>
      <p className="bybit-disclaimer">Default spreads of $0.50 (Zero-Fee) and $0.20 (Tight-Spread) are illustrative assumptions, <strong>not verified Bybit quotes</strong>. PineTS applies half the spread as adverse slippage per execution, rounded up to complete ticks. The model replaces both the script's fee and slippage settings. Bybit's actual $6/lot metal commission is collected at opening; PineTS models the same round-trip total across both fills. Nonzero swap is estimated after the run using UTC rollover boundaries, not Bybit server-time rates.</p>
      <a className="bybit-official" href="https://www.bybit.com/en/help-center/article/Bybit-CFD-Fees-Explained" target="_blank" rel="noreferrer">Official Bybit CFD fee rules <ArrowUpRight size={13}/></a>
    </div>}
  </details>;
}

export function BybitResultsPanel({ results }: { results: Results }) {
  const details = results.fees.bybit;
  if (!details) return null;
  const commission = results.fees.closedTradeCommissions + results.fees.openTradeEntryCommissions;
  return <section className="bybit-cost-results" aria-label="Bybit CFD trading cost breakdown">
    <div className="bybit-cost-heading">
      <div><small>INCLUDED IN BACKTEST</small><h3>Bybit CFD estimated costs</h3><p>{details.mode === 'zero-fee' ? 'Zero-Fee' : 'Tight-Spread'} • Constant-spread research assumptions</p></div>
      <Settings2 size={18}/>
    </div>
    <div className="bybit-cost-grid">
      <div><span>Broker commission</span><strong>{cash(commission)}</strong></div>
      <div><span>Est. full-spread impact</span><strong>{cash(details.closedSpreadCostEstimate)}</strong></div>
      <div><span>Est. swap adjustment</span><strong>{cash(details.swapCostEstimate)}</strong></div>
      <div><span>Combined estimated costs</span><strong>{cash(details.totalCostEstimate)}</strong></div>
    </div>
    <p className="bybit-cost-foot"><Info size={14}/> Spread is already embedded in the simulated execution prices, so it is <strong>not deducted again</strong>. All regular strategy metrics use the modeled executions and commission. Swap (if nonzero) is a post-trade adjustment, and its effect on in-trade risk and order sizing is not simulated. P&L will differ from actual Bybit quotes, stops and fills.</p>
    <div className="bybit-cost-source">Assumptions: {cash(details.appliedSpreadUsd)} full spread per gold ounce; {numeric(details.ouncesPerLot)} oz/lot; {cash(details.commissionPerLotUsd)} per lot round trip{details.mode === 'zero-fee' ? ' (separate commission disabled)' : ''}.</div>
  </section>;
}
