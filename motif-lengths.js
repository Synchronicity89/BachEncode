#!/usr/bin/env node
/**
 * motif-lengths.js
 * Quick utility to inspect motif length distribution in one or more compressed JSON files.
 *
 * Usage:
 *   node motif-lengths.js <file1.json> <file2.json> ... [--details]
 *
 * Output: For each file prints
 *   File: <name>
 *   Motifs: <count>
 *   Lengths (unique sorted): <l1,l2,...>
 *   Min/Max: <min>/<max>
 *   Histogram:
 *     len -> count (and %)
 *   (Optional) --details will print each motif index + length on one line.
 */

const fs = require('fs');
const path = require('path');

function analyzeFile(fp, opts) {
  let raw;
  try { raw = fs.readFileSync(fp, 'utf8'); } catch (e) {
    console.error(`Cannot read ${fp}: ${e.message}`); return; }
  let json;
  try { json = JSON.parse(raw); } catch (e) { console.error(`Invalid JSON ${fp}: ${e.message}`); return; }
  const motifs = json.motifs || [];
  const lengths = motifs.map(m => Array.isArray(m.deg_rels) ? m.deg_rels.length : 0);
  if (lengths.length === 0) {
    console.log(`File: ${fp}\n  Motifs: 0 (no motif data)\n`); return;
  }
  const uniq = Array.from(new Set(lengths)).sort((a,b)=>a-b);
  const min = Math.min(...lengths);
  const max = Math.max(...lengths);
  const freq = lengths.reduce((acc,l)=>{ acc[l] = (acc[l]||0)+1; return acc; },{});
  const total = lengths.length;
  console.log(`File: ${fp}`);
  console.log(`  Motifs: ${total}`);
  console.log(`  Lengths (unique): ${uniq.join(',')}`);
  console.log(`  Min/Max: ${min}/${max}`);
  console.log('  Histogram:');
  uniq.forEach(l => {
    const c = freq[l];
    const pct = ((c/total)*100).toFixed(1).padStart(5,' ');
    console.log(`    ${String(l).padStart(3,' ')} -> ${String(c).padStart(4,' ')} (${pct}%)`);
  });
  if (opts.details) {
    console.log('  Details:');
    lengths.forEach((l,i)=> console.log(`    #${i}: len=${l}`));
  }
  console.log('');
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: node motif-lengths.js <compressed1.json> [more.json] [--details]');
    process.exit(1);
  }
  const details = args.includes('--details');
  const files = args.filter(a => a !== '--details');
  files.forEach(f => analyzeFile(path.resolve(process.cwd(), f), { details }));
}

if (require.main === module) main();
