const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Verifies that enabling motifs produces at least one motif and disabling removes them.
// NOTE: Current code forces motifless (disableMotifs = true). This test will initially fail
// until motif forcing logic is relaxed. We include it to lock in expected behavior.

describe('Motif Toggle Presence', () => {
  jest.setTimeout(30000);
  const projectRoot = path.resolve(__dirname, '..', '..');
  const midiCandidates = [
    'midi/bach_BWV785_TwoTracks.mid',
    'bwv785-decompressed.mid'
  ];
  const midiPath = midiCandidates.map(f => path.join(projectRoot, f)).find(p => fs.existsSync(p));
  if (!midiPath) {
    test.skip('No BWV785 MIDI found for motif test', () => {});
    return;
  }

  function run(cmd) {
    try { return execSync(cmd, { cwd: projectRoot, stdio: 'pipe' }).toString(); }
    catch (e) { throw new Error(`Command failed: ${cmd}\nSTDOUT:${e.stdout?.toString()}\nSTDERR:${e.stderr?.toString()}`); }
  }

  test('motifs appear when enabled and absent when motifless flag used', () => {
    const outDir = path.join(projectRoot, 'tests', 'test-output', 'motif-toggle');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const withMotifs = path.join(outDir, 'withMotifs.json');
    const withoutMotifs = path.join(outDir, 'withoutMotifs.json');

    // Attempt compression WITH motifs (no motifless flags)
    run(`node EncodeDecode.js compress "${midiPath}" "${withMotifs}"`);
    const a = JSON.parse(fs.readFileSync(withMotifs, 'utf8'));

    // Compression WITH motifless flag
    run(`node EncodeDecode.js compress "${midiPath}" "${withoutMotifs}" --motifless`);
    const b = JSON.parse(fs.readFileSync(withoutMotifs, 'utf8'));

    // Expectation: a.motifs length > 0; b.motifs length == 0
    expect(Array.isArray(a.motifs)).toBe(true);
    expect(Array.isArray(b.motifs)).toBe(true);

    expect(a.motifs.length).toBeGreaterThan(0); // should discover motifs
    expect(b.motifs.length).toBe(0);            // motifless path yields none
  });
});
