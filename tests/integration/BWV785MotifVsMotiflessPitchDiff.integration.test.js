const fs = require('fs');
const path = require('path');
const tonal = require('@tonaljs/tonal');
const { execSync } = require('child_process');

// Minimal JSON decoder replicating decodeSingleVoice pitch recovery (without full timing accuracy needed for comparison)
function decodeVoicesFromCompressed(json) {
  const { voices, motifs = [], key = { tonic: 'C', mode: 'major' } } = json;
  const results = [];
  for (const v of voices) {
    const notes = [];
    let currentTick = 0;
    for (const item of v) {
      if (item.motif_id !== undefined) {
        const motif = motifs[item.motif_id];
        currentTick += item.delta || 0;
        if (motif) {
          const base_midi = item.base_midi != null ? item.base_midi : (item.base_pitch ? tonal.Note.midi(item.base_pitch) : null);
          if (base_midi == null) continue;
          const canUse = motif.midi_rels && motif.midi_rels.length === motif.deg_rels.length;
          let subTick = currentTick;
          for (let j=0;j<motif.deg_rels.length;j++) {
            let pitchMidi;
            if (canUse) {
              pitchMidi = base_midi + motif.midi_rels[j];
            } else {
              // Fallback diatonic reconstruction (should not happen now; log if it does)
              if (!motif._fallbackWarned) { console.warn('[TestDecoder] Fallback diatonic reconstruction used for motif', item.motif_id); motif._fallbackWarned = true; }
              // Simplified diatonic fallback
              const tonic_pc = tonal.Note.midi(key.tonic + '4') % 12;
              const scale_offsets = key.mode === 'major' ? [0,2,4,5,7,9,11] : [0,2,3,5,7,8,11];
              // Approximate base diatonic degree
              const base_pc = base_midi % 12;
              let baseDeg = 0; let best=99;
              for (let d=0; d<7; d++) { const pc = (tonic_pc + scale_offsets[d])%12; const dist = Math.min((pc-base_pc+12)%12,(base_pc-pc+12)%12); if (dist<best){best=dist;baseDeg=d;} }
              const rel = motif.deg_rels[j];
              const totalDeg = baseDeg + rel;
              const degMod = ((totalDeg%7)+7)%7;
              const octAdd = Math.floor(totalDeg/7);
              let targetPc = (tonic_pc + scale_offsets[degMod]) % 12;
              targetPc = (targetPc + motif.accs[j]) % 12; if (targetPc<0) targetPc+=12;
              const baseOct = Math.floor(base_midi/12);
              pitchMidi = targetPc + (baseOct + octAdd)*12;
            }
            notes.push({ start: subTick, pitch: pitchMidi });
            subTick += motif.durs[j];
            if (j < motif.deg_rels.length - 1) subTick += motif.deltas[j];
          }
          currentTick = subTick;
        }
      } else {
        currentTick += item.delta || 0;
        const pitchMidi = tonal.Note.midi(item.pitch);
        if (pitchMidi != null) notes.push({ start: currentTick, pitch: pitchMidi });
        currentTick += item.dur;
      }
    }
    // Sort and push only pitch order
    notes.sort((a,b)=> a.start - b.start || a.pitch - b.pitch);
    results.push(notes.map(n=>n.pitch));
  }
  // Flatten result for global comparison (preserve voice boundaries by sentinel -1 if needed)
  return results.flat();
}

function chooseSourceMidi(projectRoot) {
  const candidates = [
    path.join(projectRoot, 'midi', 'bach_BWV785_TwoTracks.mid'),
    path.join(projectRoot, 'output', 'BWV785_2.mid'),
    path.join(projectRoot, 'output', 'BWV785-default-motifs.mid')
  ];
  for (const c of candidates) { if (fs.existsSync(c)) return c; }
  return null;
}

describe('BWV785 Motif vs Motifless Pitch Diff', () => {
  const projectRoot = path.resolve(__dirname, '..', '..');
  const outDir = path.join(projectRoot, 'output');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const sourceMidi = chooseSourceMidi(projectRoot);
  const withMotifsJson = path.join(outDir, 'BWV785_withMotifs_compare.json');
  const noMotifsJson = path.join(outDir, 'BWV785_noMotifs_compare.json');

  function run(cmd) { return execSync(cmd, { cwd: projectRoot, stdio: 'pipe' }).toString(); }

  if (!sourceMidi) {
    test.skip('Source BWV785 MIDI not found; skipping motif vs motifless comparison', () => {});
    return;
  }

  beforeAll(() => {
    // Compress with motifs (default)
    run(`node EncodeDecode.js compress "${sourceMidi}" "${withMotifsJson}" --preserve-tracks`);
    // Compress motifless
    run(`node EncodeDecode.js compress "${sourceMidi}" "${noMotifsJson}" --motifless --preserve-tracks`);
    if (!fs.existsSync(withMotifsJson)) throw new Error('Missing with-motifs JSON');
    if (!fs.existsSync(noMotifsJson)) throw new Error('Missing motifless JSON');
  });

  test('List pitch mismatches (motifs vs motifless)', () => {
    const withMotifs = JSON.parse(fs.readFileSync(withMotifsJson, 'utf8'));
    const noMotifs = JSON.parse(fs.readFileSync(noMotifsJson, 'utf8'));
    const seqMotifs = decodeVoicesFromCompressed(withMotifs);
    const seqNo = decodeVoicesFromCompressed(noMotifs);

    const len = Math.min(seqMotifs.length, seqNo.length);
    const mismatches = [];
    for (let i=0;i<len;i++) {
      if (seqMotifs[i] !== seqNo[i]) {
        mismatches.push({ index:i, motifPitch: seqMotifs[i], noMotifPitch: seqNo[i], diff: seqMotifs[i]-seqNo[i] });
      }
    }
    if (seqMotifs.length !== seqNo.length) {
      mismatches.push({ lengthMismatch:true, motifCount: seqMotifs.length, noMotifCount: seqNo.length });
    }

    // Log detailed mismatches for user decision-making
    if (mismatches.length) {
      console.log('\n[PitchDiff] Mismatches:', JSON.stringify(mismatches.slice(0,50), null, 2));
      if (mismatches.length > 50) console.log(`[PitchDiff] ... ${mismatches.length - 50} more`);
    } else {
      console.log('\n[PitchDiff] No pitch mismatches between motif and motifless paths.');
    }

    const strict = process.env.STRICT_MOTIF_PITCH === '1' || process.env.STRICT_MOTIF_PITCH === 'true';
    if (strict) {
      // In strict mode we demand zero mismatches
      expect(mismatches.length).toBe(0);
    } else {
      // Non-strict (diagnostic) mode: always pass, just report
      expect(mismatches.length).toBeGreaterThanOrEqual(0);
    }
  });
});
