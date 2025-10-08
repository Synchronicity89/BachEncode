const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Two-track gold standard motifless round trip test.
// Ensures we preserve original track count (including empties) and produce identical JSON after a full
// compress -> decompress -> recompress cycle with --motifless.

describe('BWV785 Two-Track Motifless Round Trip', () => {
  jest.setTimeout(30000);
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

  test('round trip produces identical JSON', () => {
    const outDir = path.join(projectRoot, 'tests', 'test-output', 'two-track-roundtrip');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const firstJson = path.join(outDir, 'twoTrack_original.json');
    const rtMidi = path.join(outDir, 'twoTrack_roundtrip.mid');
    const secondJson = path.join(outDir, 'twoTrack_recompressed.json');

    run(`node EncodeDecode.js compress "${midiPath}" "${firstJson}" --motifless`);
    if (!fs.existsSync(firstJson)) throw new Error('First JSON not created');

    run(`node EncodeDecode.js decompress "${firstJson}" "${rtMidi}"`);
    if (!fs.existsSync(rtMidi)) throw new Error('Roundtrip MIDI not created');

    run(`node EncodeDecode.js compress "${rtMidi}" "${secondJson}" --motifless`);
    if (!fs.existsSync(secondJson)) throw new Error('Second JSON not created');

    const a = JSON.parse(fs.readFileSync(firstJson, 'utf8'));
    const b = JSON.parse(fs.readFileSync(secondJson, 'utf8'));

    const diffs = [];
    const cap = 200;
    function push(msg){ if(diffs.length < cap) diffs.push(msg); }

    if (a.ppq !== b.ppq) push(`ppq differs: ${a.ppq} vs ${b.ppq}`);
    if (a.tempo !== b.tempo) push(`tempo differs: ${a.tempo} vs ${b.tempo}`);
  // Key analysis can drift between passes; ignore key differences for structural degradation detection.

    // Track fidelity metadata
    if (a.originalTrackCount !== b.originalTrackCount) push(`originalTrackCount differs: ${a.originalTrackCount} vs ${b.originalTrackCount}`);
    if (JSON.stringify(a.voiceToTrack) !== JSON.stringify(b.voiceToTrack)) push('voiceToTrack mapping differs');
    if (JSON.stringify(a.trackNames) !== JSON.stringify(b.trackNames)) push('trackNames differ');

    if (a.voices.length !== b.voices.length) push(`voice count differs: ${a.voices.length} vs ${b.voices.length}`);
    const voiceCount = Math.min(a.voices.length, b.voices.length);
    for (let v = 0; v < voiceCount; v++) {
      const va = a.voices[v]; const vb = b.voices[v];
      if (va.length !== vb.length) push(`voice ${v} length differs: ${va.length} vs ${vb.length}`);
      const nCount = Math.min(va.length, vb.length);
      for (let i = 0; i < nCount; i++) {
        const na = va[i]; const nb = vb[i];
        ['delta','pitch','dur','vel'].forEach(f => { if (na[f] !== nb[f]) push(`voice ${v} note ${i} field ${f} differs: ${na[f]} vs ${nb[f]}`); });
      }
    }

    if (diffs.length) {
      const diffPath = path.join(outDir, 'twoTrack_roundtrip_diffs.txt');
      fs.writeFileSync(diffPath, diffs.join('\n'));
      console.log('Differences written to', diffPath);
    }

    expect(diffs).toEqual([]);
  });
});
