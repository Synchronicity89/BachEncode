const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Motif length bias test: ensures we are not only capturing minimum-size (e.g., 4-note) motifs
 * for BWV785. We expect at least one motif length >= 5 (the piece has 5-note thematic cells).
 * Expected (current behavior): FAIL until motif miner prioritizes longest viable motifs.
 */

describe('BWV785 Motif Length Bias', () => {
  const projectRoot = path.resolve(__dirname, '..', '..');
  const midiCandidates = [ 'midi/BWV785.mid','bwv785-fixed-decompressed.mid', 'bwv785-overlap-fixed-decompressed.mid', 'bwv785-decompressed.mid', 'BWV785.mid', 'bwv785.mid' ];
  let midiPath = null;
  for (const c of midiCandidates) {
    const full = path.join(projectRoot, c);
    if (fs.existsSync(full)) { midiPath = full; break; }
  }

  const outDir = path.join(projectRoot, 'tests', 'test-output', 'motif-length-bias');
  const jsonPath = path.join(outDir, 'bwv785-motifs.json');

  function run(cmd) {
    return execSync(cmd, { cwd: projectRoot, stdio: 'pipe' }).toString();
  }

  beforeAll(() => {
    if (midiPath && !fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    if (midiPath) run(`node EncodeDecode.js compress "${midiPath}" "${jsonPath}"`);
  });

  test('contains at least one motif length >= 5 and not all motifs length 4', () => {
    if (!midiPath) throw new Error('BWV785 MIDI asset missing');
    if (!fs.existsSync(jsonPath)) throw new Error('Compressed JSON not found: ' + jsonPath);
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const motifs = data.motifs || [];
    if (motifs.length === 0) {
      // If no motifs at all that's already a failure for our expectation; force a clear assertion.
      expect(motifs.length).toBeGreaterThan(0);
      return;
    }
    const lengths = motifs.map(m => m.deg_rels?.length || 0);
    const maxLen = Math.max(...lengths);
    const allAreFour = lengths.every(l => l === 4);

    // Expectations (deliberately strict to highlight current limitation):
    expect(maxLen).toBeGreaterThanOrEqual(5);
    expect(allAreFour).toBe(false);
  });
});
