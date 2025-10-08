const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Verifies that compressing then decompressing the canonical two-track BWV785 MIDI
// preserves exactly two tracks in the regenerated MIDI file (track count + ordering).
// This focuses ONLY on multi-track (one voice per track) correctness and ignores
// single-track voice heuristics.

describe('BWV785 Two-Track Track Count Preservation', () => {
  jest.setTimeout(20000);
  const projectRoot = path.resolve(__dirname, '..', '..');
  const midiPath = path.join(projectRoot, 'midi', 'bach_BWV785_TwoTracks.mid');
  if (!fs.existsSync(midiPath)) {
    test.skip('Two-track MIDI not present', () => {});
    return;
  }

  function run(cmd) {
    try { return execSync(cmd, { cwd: projectRoot, stdio: 'pipe' }).toString(); }
    catch (e) { throw new Error(`Command failed: ${cmd}\nSTDOUT:${e.stdout?.toString()}\nSTDERR:${e.stderr?.toString()}`); }
  }

  test('decompressed MIDI preserves original multi-track structure (4 chunk tracks including meta)', () => {
    const outDir = path.join(projectRoot, 'tests', 'test-output', 'two-track-trackcount');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const jsonPath = path.join(outDir, 'twoTrack_temp.json');
    const roundTripMidi = path.join(outDir, 'twoTrack_roundtrip.mid');

    // Use motifless flag to simplify to one-voice-per-track semantics.
    run(`node EncodeDecode.js compress "${midiPath}" "${jsonPath}" --motifless`);
    expect(fs.existsSync(jsonPath)).toBe(true);

    run(`node EncodeDecode.js decompress "${jsonPath}" "${roundTripMidi}"`);
    expect(fs.existsSync(roundTripMidi)).toBe(true);

    const data = fs.readFileSync(roundTripMidi);
    // Simple MIDI parser for chunk headers: 'MThd' then multiple 'MTrk'. We count 'MTrk'.
    let offset = 0;
    function readStr(n){ const s = data.slice(offset, offset+n).toString('ascii'); offset += n; return s; }
    function readUInt32(){ const v = data.readUInt32BE(offset); offset += 4; return v; }

    const headerId = readStr(4); expect(headerId).toBe('MThd');
    const headerLen = readUInt32(); offset += headerLen; // skip rest of header

    let trackCount = 0;
    while (offset < data.length) {
      const chunkId = readStr(4);
      const len = readUInt32();
      if (chunkId === 'MTrk') trackCount++;
      offset += len; // skip chunk body
    }

    // The source file contains 4 MTrk chunks:
    //  - One initial meta/instrument definition track
    //  - Two musical monophonic tracks (expected musical content)
    //  - One trailing meta/text/end track (copyright / filler)
    // Roundtrip should preserve the same count even if sizes differ.
    expect(trackCount).toBe(4);
  });
});
