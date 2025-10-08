const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Single-track motifless round trip test.
// Compress -> decompress -> recompress and compare JSON excluding key fields (key may drift due to analysis changes).

describe('Single Track Motifless Round Trip (Key Ignored)', () => {
  jest.setTimeout(20000);
  const projectRoot = path.resolve(__dirname, '..', '..');
  // Choose an existing single-track MIDI (fallback to bwv785-decompressed.mid if canonical single-track not specified)
  const midiCandidates = [
    'bwv785-decompressed.mid',
    'bwv785-from-original-motif-free.mid',
    'debug-decompressed.mid'
  ];
  const midiPath = midiCandidates.map(f => path.join(projectRoot, f)).find(p => fs.existsSync(p));
  if (!midiPath) {
    test.skip('No single-track MIDI file available for test', () => {});
    return;
  }

  function run(cmd) {
    try { return execSync(cmd, { cwd: projectRoot, stdio: 'pipe' }).toString(); }
    catch (e) { throw new Error(`Command failed: ${cmd}\nSTDOUT:${e.stdout?.toString()}\nSTDERR:${e.stderr?.toString()}`); }
  }

  test('round trip JSON identical except key', () => {
    const outDir = path.join(projectRoot, 'tests', 'test-output', 'single-track-roundtrip');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const firstJson = path.join(outDir, 'single_original.json');
    const rtMidi = path.join(outDir, 'single_roundtrip.mid');
    const secondJson = path.join(outDir, 'single_recompressed.json');

    run(`node EncodeDecode.js compress "${midiPath}" "${firstJson}" --motifless`);
    if (!fs.existsSync(firstJson)) throw new Error('First JSON not created');

    run(`node EncodeDecode.js decompress "${firstJson}" "${rtMidi}"`);
    if (!fs.existsSync(rtMidi)) throw new Error('Roundtrip MIDI not created');

    run(`node EncodeDecode.js compress "${rtMidi}" "${secondJson}" --motifless`);
    if (!fs.existsSync(secondJson)) throw new Error('Second JSON not created');

    const a = JSON.parse(fs.readFileSync(firstJson, 'utf8'));
    const b = JSON.parse(fs.readFileSync(secondJson, 'utf8'));

    // Remove key objects before diffing
    delete a.key; delete b.key;

    const diffs = [];
    const cap = 200;
    function push(msg){ if(diffs.length < cap) diffs.push(msg); }

    if (a.ppq !== b.ppq) push(`ppq differs: ${a.ppq} vs ${b.ppq}`);
    if (a.tempo !== b.tempo) push(`tempo differs: ${a.tempo} vs ${b.tempo}`);

    // Track fidelity metadata (if present)
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
      const diffPath = path.join(outDir, 'single_roundtrip_diffs.txt');
      fs.writeFileSync(diffPath, diffs.join('\n'));
      console.log('Differences written to', diffPath);
    }

    expect(diffs).toEqual([]);
  });
});
