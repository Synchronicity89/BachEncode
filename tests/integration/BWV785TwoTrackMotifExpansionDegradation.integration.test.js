const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Motif expansion degradation test for two-track canonical file.
// Procedure:
// 1. Compress original two-track MIDI with motifs enabled -> withMotifs.json
// 2. Compress same MIDI motifless -> motifless.json (baseline structural JSON representation)
// 3. Decompress withMotifs.json to MIDI -> expanded.mid (motif applications materialized)
// 4. Re-compress expanded.mid motifless -> expanded_recompressed.json
// 5. Compare expanded_recompressed.json to motifless.json structurally (ignore key & motif arrays)
// If motifs expand and re-flatten without altering underlying note event sequence, the JSONs match.

describe('BWV785 Two-Track Motif Expansion Degradation', () => {
  jest.setTimeout(45000);
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

  test('motif expansion roundtrip matches motifless baseline', () => {
    const outDir = path.join(projectRoot, 'tests', 'test-output', 'two-track-motif-expansion');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    const withMotifs = path.join(outDir, 'withMotifs.json');
    const motifless = path.join(outDir, 'motifless.json');
    const expandedMidi = path.join(outDir, 'expanded.mid');
    const expandedRecompressed = path.join(outDir, 'expanded_recompressed.json');

    // Step 1: compress with motifs enabled
    run(`node EncodeDecode.js compress "${midiPath}" "${withMotifs}"`);
    expect(fs.existsSync(withMotifs)).toBe(true);
    const withData = JSON.parse(fs.readFileSync(withMotifs, 'utf8'));
    expect(Array.isArray(withData.motifs)).toBe(true);
    expect(withData.motifs.length).toBeGreaterThan(0); // sanity: motifs found

    // Step 2: compress motifless baseline
    run(`node EncodeDecode.js compress "${midiPath}" "${motifless}" --motifless`);
    expect(fs.existsSync(motifless)).toBe(true);
    const baseData = JSON.parse(fs.readFileSync(motifless, 'utf8'));

    // Step 3: decompress with motifs (expansion)
    run(`node EncodeDecode.js decompress "${withMotifs}" "${expandedMidi}"`);
    expect(fs.existsSync(expandedMidi)).toBe(true);

    // Step 4: re-compress expanded MIDI motifless
    run(`node EncodeDecode.js compress "${expandedMidi}" "${expandedRecompressed}" --motifless`);
    expect(fs.existsSync(expandedRecompressed)).toBe(true);
    const expandedData = JSON.parse(fs.readFileSync(expandedRecompressed, 'utf8'));

    // Step 5: structural comparison ignoring key and motif arrays
    function normalize(obj) {
      const clone = JSON.parse(JSON.stringify(obj));
      delete clone.key;
      delete clone.motifs; // baseline motifless has empty anyway; ignore for symmetry
      delete clone.motifsDisabled; // may differ true/false
      return clone;
    }

    const A = normalize(baseData);
    const B = normalize(expandedData);

    const diffs = [];
    const cap = 200;
    function push(msg){ if(diffs.length < cap) diffs.push(msg); }

    if (A.ppq !== B.ppq) push(`ppq differs: ${A.ppq} vs ${B.ppq}`);
    if (A.tempo !== B.tempo) push(`tempo differs: ${A.tempo} vs ${B.tempo}`);

    if (A.originalTrackCount !== B.originalTrackCount) push(`originalTrackCount differs: ${A.originalTrackCount} vs ${B.originalTrackCount}`);
    if (JSON.stringify(A.voiceToTrack) !== JSON.stringify(B.voiceToTrack)) push('voiceToTrack mapping differs');
    if (JSON.stringify(A.trackNames) !== JSON.stringify(B.trackNames)) push('trackNames differ');

    if (A.voices.length !== B.voices.length) push(`voice count differs: ${A.voices.length} vs ${B.voices.length}`);
    const vc = Math.min(A.voices.length, B.voices.length);
    for (let v = 0; v < vc; v++) {
      const va = A.voices[v]; const vb = B.voices[v];
      if (va.length !== vb.length) push(`voice ${v} length differs: ${va.length} vs ${vb.length}`);
      const nCount = Math.min(va.length, vb.length);
      for (let i = 0; i < nCount; i++) {
        const na = va[i]; const nb = vb[i];
        ['delta','pitch','dur','vel'].forEach(f => { if (na[f] !== nb[f]) push(`voice ${v} note ${i} field ${f} differs: ${na[f]} vs ${nb[f]}`); });
      }
    }

    if (diffs.length) {
      const diffPath = path.join(outDir, 'motif_expansion_diffs.txt');
      fs.writeFileSync(diffPath, diffs.join('\n'));
      console.log('Differences written to', diffPath);
    }

    expect(diffs).toEqual([]);
  });
});
