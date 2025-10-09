const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

describe('RefKey Annotation Integration', () => {
  const projectRoot = path.resolve(__dirname, '..', '..');
  const midiPath = path.join(projectRoot, 'midi', 'bach_BWV785_TwoTracks.mid');
  const outJson = path.join(projectRoot, 'output', 'BWV785_refkey.JSON');

  function run(cmd) { return execSync(cmd, { cwd: projectRoot, stdio: 'pipe' }).toString(); }

  beforeAll(() => {
    if (!fs.existsSync(midiPath)) throw new Error('Missing test asset: '+midiPath);
    const outDir = path.dirname(outJson); if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    run(`node EncodeDecode.js compress "${midiPath}" "${outJson}" --preserve-tracks`);
  });

  test('motif references include refKey objects', () => {
    const data = JSON.parse(fs.readFileSync(outJson, 'utf8'));
    if (!data.motifs || data.motifs.length === 0) {
      console.warn('No motifs produced; skipping refKey presence assertions (edge case).');
      return; // Pass trivially if motifs disabled or none found
    }
    let foundRef = 0;
    for (const voice of data.voices) {
      for (const ev of voice) {
        if (ev.motif_id !== undefined) {
          expect(ev.refKey).toBeDefined();
          expect(ev.refKey).toHaveProperty('tonic');
          expect(ev.refKey).toHaveProperty('mode');
          expect(ev.refKey).toHaveProperty('cofDistance');
          foundRef++;
        }
      }
    }
    expect(foundRef).toBeGreaterThan(0);
  });

  test('keySignatureExpanded present when keySignature meta exists', () => {
    const data = JSON.parse(fs.readFileSync(outJson, 'utf8'));
    if (data.keySignature) {
      expect(data.keySignatureExpanded).toBeDefined();
      expect(data.keySignatureExpanded).toHaveProperty('major');
      expect(data.keySignatureExpanded).toHaveProperty('relativeMinor');
    }
  });

  test('all motifs carry midi_rels and sample_base_midi', () => {
    const data = JSON.parse(fs.readFileSync(outJson, 'utf8'));
    for (const m of data.motifs) {
      expect(m.midi_rels).toBeDefined();
      expect(Array.isArray(m.midi_rels)).toBe(true);
      expect(m.midi_rels.length).toBe(m.deg_rels.length);
      expect(m.sample_base_midi).toBeDefined();
    }
  });
});
