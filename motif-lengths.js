#!/usr/bin/env node
/**
 * motif-lengths.js
 * Quick utility to inspect motif length distribution in one or more compressed JSON files.
 *
 * Usage:
 *   node motif-lengths.js <file1.json> <file2.json> ... [--details] [--csv=out.csv] [--summary-only]
 *
 * Options:
 *   --details       Print each motif index w/ length
 *   --csv=FILE      Export CSV with columns: file,motif_index,length
 *   --summary-only  When used with --csv also writes a summary section (prefixed with '#') of aggregate stats per file
 */

const fs = require('fs');
const path = require('path');

function analyzeFile(fp, opts, accum) {
  let raw;
  try { raw = fs.readFileSync(fp, 'utf8'); } catch (e) {
    console.error(`Cannot read ${fp}: ${e.message}`); return; }
  let json;
  try { json = JSON.parse(raw); } catch (e) { console.error(`Invalid JSON ${fp}: ${e.message}`); return; }
  const motifs = json.motifs || [];
  const lengths = motifs.map(m => Array.isArray(m.deg_rels) ? m.deg_rels.length : 0);
  if (lengths.length === 0) {
    console.log(`File: ${fp}\n  Motifs: 0 (no motif data)\n`);
    if (opts.csvStream) accum.push({ file: fp, motif_index: '', length: '' });
    return;
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
  if (opts.csvStream) {
    if (!opts.summaryOnly) {
      lengths.forEach((l,i)=> accum.push({ file: fp, motif_index: i, length: l }));
    }
    accum.push({ file: fp, motif_index: 'SUMMARY_TOTAL', length: total });
    accum.push({ file: fp, motif_index: 'SUMMARY_MIN', length: min });
    accum.push({ file: fp, motif_index: 'SUMMARY_MAX', length: max });
  }
}

function writeCsv(outPath, rows) {
  const header = 'file,motif_index,length';
  const lines = [header];
  for (const r of rows) {
    lines.push(`${r.file},${r.motif_index},${r.length}`);
  }
  fs.writeFileSync(outPath, lines.join('\n'));
  console.log(`CSV written: ${outPath}`);
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: node motif-lengths.js <compressed1.json> [more.json] [--details] [--csv=out.csv] [--summary-only]');
    process.exit(1);
  }
  const details = args.includes('--details');
  const summaryOnly = args.includes('--summary-only');
  const csvArg = args.find(a => a.startsWith('--csv='));
  const csvPath = csvArg ? csvArg.split('=')[1] : null;
  const files = args.filter(a => a !== '--details' && a !== '--summary-only' && !a.startsWith('--csv='));
  const accum = [];
  const opts = { details, csvStream: !!csvPath, summaryOnly };
  files.forEach(f => analyzeFile(path.resolve(process.cwd(), f), opts, accum));
  if (csvPath) writeCsv(path.resolve(process.cwd(), csvPath), accum);
}

if (require.main === module) main();
