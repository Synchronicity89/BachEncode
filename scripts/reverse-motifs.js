#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function reverseArray(arr) {
  return Array.isArray(arr) ? arr.slice().reverse() : arr;
}

function reverseMotif(m) {
  const len = (m && Array.isArray(m.deg_rels)) ? m.deg_rels.length : 0;
  if (len === 0) return m;
  const out = { ...m };
  // Reverse all per-note arrays
  out.deg_rels = reverseArray(m.deg_rels);
  out.accs = reverseArray(m.accs);
  out.durs = reverseArray(m.durs);
  out.vels = reverseArray(m.vels);
  // deltas are between-notes gaps, length N-1
  out.deltas = reverseArray(m.deltas);
  // Reverse midi_rels if present and matching length
  if (Array.isArray(m.midi_rels) && m.midi_rels.length === len) {
    out.midi_rels = reverseArray(m.midi_rels);
  }
  // Keep sample_base_midi as-is (base remains the original first note of the segment)
  return out;
}

function updateReferenceOrigSegment(ev, motif) {
  if (!ev || !Array.isArray(ev.origSegment) || !Array.isArray(motif.durs) || !Array.isArray(motif.deltas)) return;
  const N = motif.durs.length;
  if (ev.origSegment.length !== N) return; // skip mismatched
  // Reverse the segment order
  const reversed = ev.origSegment.slice().reverse().map(n => ({ ...n }));
  // Recompute delta/dur to align with reversed motif timing
  for (let i = 0; i < N; i++) {
    reversed[i].dur = motif.durs[i];
    if (i === 0) {
      // First event should retain the reference-level delta
      reversed[i].delta = ev.delta != null ? ev.delta : reversed[i].delta || 0;
    } else {
      reversed[i].delta = motif.deltas[i - 1] || 0;
    }
  }
  // Clean helper midi cache consistency if present
  // (midi property is allowed to remain; expansion uses it only for pitch checks)
  ev.origSegment = reversed;
  // Prior refKey metadata no longer applies post-transform
  if (ev.refKey) delete ev.refKey;
}

function reverseMotifsInJson(inputPath, outputPath) {
  if (!fs.existsSync(inputPath)) throw new Error(`Input JSON not found: ${inputPath}`);
  const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  if (!Array.isArray(data.motifs)) {
    throw new Error('Input does not appear to be a compressed JSON with a motifs array');
  }
  const originalMotifs = data.motifs;
  const reversedMotifs = originalMotifs.map(reverseMotif);
  data.motifs = reversedMotifs;
  // Update references in voices to keep origSegment consistent with new motif order
  if (Array.isArray(data.voices)) {
    for (const voice of data.voices) {
      if (!Array.isArray(voice)) continue;
      for (const ev of voice) {
        if (ev && ev.motif_id !== undefined && reversedMotifs[ev.motif_id]) {
          updateReferenceOrigSegment(ev, reversedMotifs[ev.motif_id]);
        }
      }
    }
  }
  // Write output
  const target = outputPath || inputPath;
  const dir = path.dirname(target);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(target, JSON.stringify(data, null, 2));
  console.log(`[reverse-motifs] Wrote: ${target}`);
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length < 1 || ['-h','--help'].includes(args[0])) {
    console.log('Usage:');
    console.log('  node scripts/reverse-motifs.js <input.json> [output.json]');
    console.log('Notes:');
    console.log('  - If output.json is omitted, the input file is overwritten in-place.');
    console.log('  - Reverses deg_rels, accs, durs, deltas, vels, and midi_rels within each motif.');
    console.log('  - Updates each motif reference\'s origSegment to match reversed timing/order.');
    process.exit(0);
  }
  const input = args[0];
  const output = args[1];
  try {
    reverseMotifsInJson(input, output);
  } catch (e) {
    console.error('[reverse-motifs] Error:', e && e.message || e);
    process.exit(1);
  }
}

module.exports = { reverseMotifsInJson };
