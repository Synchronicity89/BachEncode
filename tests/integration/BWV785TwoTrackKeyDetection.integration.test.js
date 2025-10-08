const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Two-track key detection test: ensures multi-track (voice-per-track) compression
 * detects global key as Bb major (B-flat major) for BWV785.
 * This test is now authoritative (no longer an expected fail). If the asset is missing, the test fails
 * so that CI surfaces the provisioning issue rather than silently skipping.
 */

describe('BWV785 Two-Track Key Detection', () => {
  // tests/integration -> repo root is two levels up
  const projectRoot = path.resolve(__dirname, '..', '..');
  const midiCandidates = [ 'midi/BWV785.MID','midi/BWV785.mid','bwv785-fixed-decompressed.mid', 'bwv785-overlap-fixed-decompressed.mid', 'bwv785-decompressed.mid', 'BWV785.MID', 'BWV785.mid', 'bwv785.mid' ];
  let midiPath = null;
  const candidateStatus = [];
  for (const c of midiCandidates) {
    const full = path.join(projectRoot, c);
    const exists = fs.existsSync(full);
    candidateStatus.push({ candidate: c, exists });
    if (exists) { midiPath = full; break; }
  }

  const outDir = path.join(projectRoot, 'tests', 'test-output', 'two-track-key');
  const jsonPath = path.join(outDir, 'bwv785-two-track.json');

  function run(cmd) {
    return execSync(cmd, { cwd: projectRoot, stdio: 'pipe' }).toString();
  }

  beforeAll(() => {
    if (midiPath && !fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    if (midiPath) {
      run(`node EncodeDecode.js compress \"${midiPath}\" \"${jsonPath}\" --preserve-tracks`);
    }
  });

  test('should detect global key Bb major', () => {
    if (!midiPath) {
      throw new Error('BWV785 MIDI asset not found. Candidate scan: ' + JSON.stringify(candidateStatus));
    }
    if (!fs.existsSync(jsonPath)) {
      throw new Error('Compressed JSON not produced at: ' + jsonPath);
    }
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const keyObj = typeof data.key === 'string' ? { tonic: data.key.split(' ')[0], mode: data.key.split(' ')[1] || 'major' } : data.key;
    expect(keyObj.tonic).toBe('Bb');
    expect(['major','ionian']).toContain(keyObj.mode);
  });
});
