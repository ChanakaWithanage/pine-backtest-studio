import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { parseLicensedGoldManifest, readLicensedGoldManifest } from '../src/lib/licensed-gold.ts';

function manifest() {
  const startYear=2017;
  const files=Array.from({length:10},(_,i)=>({
    file:'/open-gold/xauusd-m15-'+(startYear+i)+'.csv',
    count:20000,first:Date.UTC(startYear+i,0,2),
    last:Date.UTC(startYear+i,11,29),bytes:1500000
  }));
  return {
    schemaVersion:1,instrument:'XAUUSD',timeframeMinutes:15,
    provider:'Yllvar/fx-historical-data',
    providerUrl:'https://huggingface.co/datasets/Yllvar/fx-historical-data',
    license:'CC-BY-4.0',licenseUrl:'https://creativecommons.org/licenses/by/4.0/',
    generatedAt:'2026-11-18T00:00:00Z',
    first:files[0].first,last:files.at(-1)!.last,count:200000,files
  };
}
test('accepts attributed licensed gold manifest with validated yearly segments',()=>{
  assert.equal(parseLicensedGoldManifest(manifest()).count,200000);
});
test('rejects malformed source, uncredited, incomplete or malicious data manifests',()=>{
  const sample=manifest();
  assert.throws(()=>parseLicensedGoldManifest({...sample,license:'private'}),/license or coverage/);
  assert.throws(()=>parseLicensedGoldManifest({...sample,count:240000}),/inconsistent/);
  assert.throws(()=>parseLicensedGoldManifest({...sample,files:[...sample.files.slice(0,9),{...sample.files[9],file:'https://example.com/attack.csv'}]}),/invalid CSV/);
});
test('Cloudflare fallback HTML is not mistaken for real Gold price history',async()=>{
  const html='<!doctype html><html><body><h1>Pine Backtest Studio</h1></body></html>';
  assert.equal(await readLicensedGoldManifest(new Response(html,{headers:{'content-type':'text/html'}})),null);
  assert.equal(await readLicensedGoldManifest(new Response('404',{status:404})),null);
});
test('works with valid JSON and rejects invalid historical JSON',async()=>{
  const ok=await readLicensedGoldManifest(new Response(JSON.stringify(manifest()),{headers:{'content-type':'application/json'}}));
  assert.equal(ok?.count,200000);
  await assert.rejects(()=>readLicensedGoldManifest(new Response('invalid',{headers:{'content-type':'application/json'}})),/invalid JSON/);
});
