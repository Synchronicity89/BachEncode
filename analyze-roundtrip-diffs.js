const fs = require('fs');
const path = require('path');
const tonal = require('@tonaljs/tonal');

// Analyze two motifless JSON files (original vs recompressed) for pitch differences.
// Outputs statistics: total comparisons, identical, octave-only (+/-12*n), other interval diffs.
// Usage: node analyze-roundtrip-diffs.js <original.json> <recompressed.json> [report.txt]

function flattenVoices(json) {
  const seq = [];
  json.voices.forEach((voice, vIndex) => {
    let absTime = 0;
    voice.forEach((n, i) => {
      absTime += n.delta || 0;
      seq.push({
        voice: vIndex,
        index: i,
        start: absTime,
        pitchName: n.pitch,
        pitchMidi: tonal.Note.midi(n.pitch),
        dur: n.dur,
        vel: n.vel
      });
      absTime += n.dur;
    });
  });
  return seq;
}

function classifyPitchDiff(aMidi, bMidi) {
  if (aMidi == null || bMidi == null) return 'non-comparable';
  if (aMidi === bMidi) return 'identical';
  const diff = bMidi - aMidi;
  if (diff % 12 === 0) return 'octave-shift';
  return 'other';
}

function main() {
  const [,, origPath, recompPath, outPath] = process.argv;
  if (!origPath || !recompPath) {
    console.error('Usage: node analyze-roundtrip-diffs.js <original.json> <recompressed.json> [report.txt]');
    process.exit(1);
  }
  const a = JSON.parse(fs.readFileSync(origPath, 'utf8'));
  const b = JSON.parse(fs.readFileSync(recompPath, 'utf8'));

  const flatA = flattenVoices(a);
  const flatB = flattenVoices(b);
  const count = Math.min(flatA.length, flatB.length);

  const stats = { totalCompared: count, identical: 0, octaveShift: 0, other: 0, nonComparable: 0 };
  const samples = { octave: [], other: [] };

  for (let i = 0; i < count; i++) {
    const A = flatA[i];
    const B = flatB[i];
    const cls = classifyPitchDiff(A.pitchMidi, B.pitchMidi);
    if (cls === 'identical') stats.identical++;
    else if (cls === 'octave-shift') {
      stats.octaveShift++;
      if (samples.octave.length < 10) samples.octave.push({ i, a: A.pitchName, b: B.pitchName, diff: B.pitchMidi - A.pitchMidi });
    } else if (cls === 'other') {
      stats.other++;
      if (samples.other.length < 10) samples.other.push({ i, a: A.pitchName, b: B.pitchName, diff: B.pitchMidi - A.pitchMidi });
    } else stats.nonComparable++;
  }

  const lines = [];
  lines.push('=== ROUNDTRIP PITCH DIFFERENCE ANALYSIS ===');
  lines.push(`Original:    ${origPath}`);
  lines.push(`Recompressed:${recompPath}`);
  lines.push(JSON.stringify(stats, null, 2));
  lines.push('Sample octave diffs:');
  lines.push(JSON.stringify(samples.octave, null, 2));
  lines.push('Sample other diffs:');
  lines.push(JSON.stringify(samples.other, null, 2));
  const report = lines.join('\n');
  console.log(report);
  if (outPath) {
    fs.writeFileSync(outPath, report);
    console.log('Report written to', outPath);
  }
}

if (require.main === module) {
  main();
}
