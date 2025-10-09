const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Integration test: ensure keyChanges array is produced and contains an initial Bb major segment
 * when compressing the two-track BWV785 source.
 *
 * Expectation (current user suspicion): the produced JSON at output/BWV785_2.JSON may lack correct keyChanges,
 * so this test should FAIL if either keyChanges missing/empty or first tonic not Bb.
 */

describe('BWV785 Two-Track Key Changes Detection', () => {
  const projectRoot = path.resolve(__dirname, '..', '..');
  const midiPath = path.join(projectRoot, 'midi', 'bach_BWV785_TwoTracks.mid');
  const outJson = path.join(projectRoot, 'output', 'BWV785_2.JSON');

  function run(cmd) {
    return execSync(cmd, { cwd: projectRoot, stdio: 'pipe' }).toString();
  }

  beforeAll(() => {
    if (!fs.existsSync(midiPath)) {
      throw new Error('Missing test asset: ' + midiPath);
    }
    const outDir = path.dirname(outJson);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    // Recreate JSON fresh
    run(`node EncodeDecode.js compress "${midiPath}" "${outJson}" --preserve-tracks`);
  });

  test('produces keyChanges with initial Bb major segment', () => {
    if (!fs.existsSync(outJson)) {
      throw new Error('Expected compressed JSON not found: ' + outJson);
    }
    const data = JSON.parse(fs.readFileSync(outJson, 'utf8'));
    expect(Array.isArray(data.keyChanges)).toBe(true);
    expect(data.keyChanges.length).toBeGreaterThan(0);
    const first = data.keyChanges[0];
    // Fail if missing expected tonic Bb major
    expect(first).toBeTruthy();
    expect(first.tonic).toBe('Bb');
    expect(['major','ionian']).toContain(first.mode);
  });
});
