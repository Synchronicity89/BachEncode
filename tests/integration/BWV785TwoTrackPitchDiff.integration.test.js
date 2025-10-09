const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Roundtrip pitch-diff test for the two-track BWV785 MIDI.
 * Steps:
 *  1. Compress original two-track MIDI -> output/BWV785_roundtrip_source.json
 *  2. Decompress that JSON back to MIDI -> output/BWV785_roundtrip_reconstructed.mid
 *  3. Re-compress reconstructed MIDI -> output/BWV785_roundtrip_second.json
 *  4. Extract ordered pitch sequences from both JSON files and compare.
 * This test is EXPECTED TO FAIL right now (assertion enforces equality) if any pitch drift exists.
 */

describe('BWV785 Two-Track Roundtrip Pitch Fidelity', () => {
  const projectRoot = path.resolve(__dirname, '..', '..');
  const midiPath = path.join(projectRoot, 'midi', 'bach_BWV785_TwoTracks.mid');
  const outDir = path.join(projectRoot, 'output');
  const firstJson = path.join(outDir, 'BWV785_roundtrip_source.json');
  const reconstructedMid = path.join(outDir, 'BWV785_roundtrip_reconstructed.mid');
  const secondJson = path.join(outDir, 'BWV785_roundtrip_second.json');

  function run(cmd) { return execSync(cmd, { cwd: projectRoot, stdio: 'pipe' }).toString(); }

  beforeAll(() => {
    if (!fs.existsSync(midiPath)) throw new Error('Missing test asset: ' + midiPath);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    run(`node EncodeDecode.js compress "${midiPath}" "${firstJson}" --preserve-tracks`);
    run(`node EncodeDecode.js decompress "${firstJson}" "${reconstructedMid}"`);
    run(`node EncodeDecode.js compress "${reconstructedMid}" "${secondJson}" --preserve-tracks`);
  });

  function extractPitchSequence(jsonPath) {
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    // Expand motifs to absolute midi pitch sequence (flatten voices chronologically) for comparison.
    const tonal = require('@tonaljs/tonal');
    const seq = [];
    const motifs = data.motifs || [];
    for (const voice of data.voices) {
      let currentTick = 0;
      for (const ev of voice) {
        currentTick += ev.delta || 0;
        if (ev.motif_id !== undefined && motifs[ev.motif_id]) {
          const m = motifs[ev.motif_id];
          // Use midi_rels if possible
          const baseMidi = ev.base_midi != null ? ev.base_midi : (ev.base_pitch ? tonal.Note.midi(ev.base_pitch) : null);
          if (baseMidi != null && m.midi_rels && m.midi_rels.length === m.deg_rels.length) {
            let t = currentTick;
            for (let i=0;i<m.midi_rels.length;i++) {
              seq.push({ start: t, pitch: baseMidi + m.midi_rels[i] });
              t += m.durs[i];
              if (i < m.deltas.length) t += m.deltas[i];
            }
            currentTick = t;
          } else {
            // Fallback: just push a placeholder to keep ordering
            seq.push({ start: currentTick, pitch: -999 });
          }
        } else if (ev.pitch) {
          const midi = require('@tonaljs/tonal').Note.midi(ev.pitch);
          if (midi != null) {
            seq.push({ start: currentTick, pitch: midi });
            currentTick += ev.dur || 0;
          }
        } else if (ev.dur) {
          currentTick += ev.dur;
        }
      }
    }
    // Normalize ordering by start then pitch
    return seq.sort((a,b)=> a.start - b.start || a.pitch - b.pitch).map(x=>x.pitch);
  }

  test('pitch sequences should match exactly (expected failing if drift)', () => {
    const seqA = extractPitchSequence(firstJson);
    const seqB = extractPitchSequence(secondJson);

    // Length must match first
    expect(seqB.length).toBe(seqA.length);

    const diffs = [];
    for (let i=0;i<seqA.length;i++) {
      if (seqA[i] !== seqB[i]) {
        diffs.push({ index:i, a: seqA[i], b: seqB[i] });
        if (diffs.length >= 10) break; // cap preview
      }
    }

    if (diffs.length > 0) {
      console.log('\nFirst pitch diffs (up to 10):', diffs);
    }

    // Force equality assertion (will fail if any difference)
    expect(diffs.length).toBe(0);
  });

  afterAll(() => {
    console.log('\nRoundtrip artifacts:');
    console.log(' Source JSON:        ' + firstJson);
    console.log(' Reconstructed MIDI: ' + reconstructedMid);
    console.log(' Second JSON:        ' + secondJson);
  });
});
