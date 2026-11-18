#!/usr/bin/env node
/**
 * Block unapproved personal-use Dukascopy history in public/history/.
 * The separately attributed CC-BY 4.0 dataset is built in /open-gold/ by
 * prepare-licensed-gold.mjs after this guard completes.
 */
import { readdir } from 'node:fs/promises';
const folder = new URL('../public/history/', import.meta.url);
const files = await readdir(folder).catch(error => {
  if (error?.code === 'ENOENT') return [];
  throw error;
});
const marketFiles = files.filter(name => /\.(?:csv|json|parquet|zip|gz)$/i.test(name));
if (marketFiles.length && process.env.V2_PUBLIC_DATA_LICENSE_CONFIRMED !== 'yes') {
  console.error('[public v2] Refusing to publish historical market files: ' + marketFiles.join(', '));
  console.error('Set V2_PUBLIC_DATA_LICENSE_CONFIRMED=yes ONLY when you have redistribution rights.');
  process.exit(1);
}
console.log('[public v2] No unauthorized /history/ assets. Preparing the attributed CC BY Gold snapshot next.');
