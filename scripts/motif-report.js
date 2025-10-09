#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function loadCompressed(p) {
  const raw = fs.readFileSync(p, 'utf8');
  return JSON.parse(raw);
}

function arrayEquals(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function invertArray(nums) {
  return nums.map(n => -n);
}

function buildInversionIndex(motifs) {
  // Signature: midi_rels joined; require same durs/deltas for inversion pairing
  const byMidiSig = new Map();
  const shapeKey = m => JSON.stringify({ durs: m.durs, deltas: m.deltas });
  const shapeBuckets = new Map();
  motifs.forEach((m, idx) => {
    const sig = (m.midi_rels || []).join(',');
    if (!byMidiSig.has(sig)) byMidiSig.set(sig, []);
    byMidiSig.get(sig).push(idx);
    const sk = shapeKey(m);
    if (!shapeBuckets.has(sk)) shapeBuckets.set(sk, []);
    shapeBuckets.get(sk).push(idx);
  });
  function partnersFor(i) {
    const m = motifs[i];
    if (!m || !m.midi_rels || !m.durs || !m.deltas) return [];
    const invSig = invertArray(m.midi_rels).join(',');
    const shape = JSON.stringify({ durs: m.durs, deltas: m.deltas });
    const sameShape = shapeBuckets.get(shape) || [];
    // Filter to same-shape motifs whose midi_rels matches inverted signature
    return sameShape.filter(j => j !== i && (motifs[j].midi_rels || []).join(',') === invSig);
  }
  return { partnersFor };
}

function analyze(filePath) {
  const data = loadCompressed(filePath);
  const { motifs = [], voices = [] } = data;
  const exactCounts = new Array(motifs.length).fill(0);
  // Count exact motif references present in encoded voices (post-safety expansion)
  for (const v of voices) {
    for (const ev of v) {
      if (ev && typeof ev.motif_id === 'number') exactCounts[ev.motif_id]++;
    }
  }
  const { partnersFor } = buildInversionIndex(motifs);
  const invertedPartners = motifs.map((_, i) => partnersFor(i));
  const invertedCounts = invertedPartners.map(ids => ids.reduce((sum, id) => sum + (exactCounts[id] || 0), 0));

  const unusedMotifs = [];
  const perMotif = motifs.map((m, i) => {
    const entry = {
      motif_id: i,
      length: (m.midi_rels || []).length,
      exactCount: exactCounts[i] || 0,
      invertedPartnerIds: invertedPartners[i],
      invertedCount: invertedCounts[i] || 0,
      midi_rels: m.midi_rels || [],
      durs: m.durs || [],
      deltas: m.deltas || []
    };
    if (entry.exactCount === 0) unusedMotifs.push(i);
    return entry;
  });

  const totals = {
    motifs: motifs.length,
    totalExactRefs: exactCounts.reduce((a,b)=>a+b,0),
    motifsWithInversionPartners: invertedPartners.filter(a=>a.length>0).length,
    totalInvertedRefs: invertedCounts.reduce((a,b)=>a+b,0),
    unusedMotifCount: unusedMotifs.length,
  };

  return { totals, perMotif, unusedMotifs };
}

function writeReport(inputPath, report) {
  const base = inputPath.replace(/\.json$/i, '');
  const outJson = base + '.motif-report.json';
  const outTxt = base + '.motif-report.txt';
  fs.writeFileSync(outJson, JSON.stringify(report, null, 2));
  const lines = [];
  lines.push(`Motif report for ${path.basename(inputPath)}`);
  lines.push(`- motifs: ${report.totals.motifs}`);
  lines.push(`- totalExactRefs: ${report.totals.totalExactRefs}`);
  lines.push(`- motifsWithInversionPartners: ${report.totals.motifsWithInversionPartners}`);
  lines.push(`- totalInvertedRefs (via partner IDs): ${report.totals.totalInvertedRefs}`);
  lines.push(`- unusedMotifCount: ${report.totals.unusedMotifCount}`);
  lines.push('');
  lines.push('Per motif (motif_id, len, exactCount, invertedCount, partners):');
  for (const m of report.perMotif) {
    lines.push(`- #${m.motif_id} len=${m.length} exact=${m.exactCount} inverted=${m.invertedCount} partners=[${m.invertedPartnerIds.join(',')}]`);
  }
  if (report.unusedMotifs.length) {
    lines.push('');
    lines.push('Motifs with no references: ' + report.unusedMotifs.join(', '));
  }
  fs.writeFileSync(outTxt, lines.join('\n'));
  return { outJson, outTxt };
}

(function main(){
  try {
    const input = process.argv[2] || path.join('output','BWV785-tt.json');
    if (!fs.existsSync(input)) {
      console.error('Input JSON not found:', input);
      process.exit(2);
    }
    const report = analyze(input);
    const files = writeReport(input, report);
    console.log('[motif-report] Wrote:', files.outJson, 'and', files.outTxt);
  } catch (e) {
    console.error('[motif-report] Error:', e && e.stack || e);
    process.exit(1);
  }
})();
