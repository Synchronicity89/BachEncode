const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// This test enforces a zero-degradation contract for a full motifless round trip:
//   MIDI (motifless compress) -> JSON -> decompress -> MIDI -> (motifless compress) -> JSON
// Any change in musical content (structure, ordering, timing, pitches, velocities, durations,
// voice segmentation, or counts) is considered a regression and should fail.
// We intentionally also flag differences in ppq/tempo/voice counts as degradations, even if
// they might be musically neutral, to keep the pipeline honest and fully reversible.

describe('BWV785 Motifless Round Trip Degradation Test', () => {
  jest.setTimeout(30000);

  const projectRoot = path.resolve(__dirname, '..', '..');
  const candidateNames = [
    'BWV785.mid',
    'bwv785.mid',
    'bwv785-fixed-decompressed.mid',
    'bwv785-decompressed.mid',
    'bwv785-overlap-fixed-decompressed.mid',
    'bwv785-from-original-motif-free.mid'
  ];

  function findMidi() {
    for (const name of candidateNames) {
      const full = path.join(projectRoot, name);
      if (fs.existsSync(full)) return { path: full, chosen: name };
    }
    return null;
  }

  function run(cmd) {
    try {
      return execSync(cmd, { cwd: projectRoot, stdio: 'pipe' }).toString();
    } catch (e) {
      throw new Error(`Command failed: ${cmd}\nSTDOUT: ${e.stdout?.toString()}\nSTDERR: ${e.stderr?.toString()}`);
    }
  }

  test('should produce identical motifless JSON after round trip', () => {
    const midiInfo = findMidi();
    if (!midiInfo) {
      throw new Error('No BWV785 MIDI file variant found in project root. Add BWV785.mid or a known variant.');
    }
    console.log(`Using MIDI source: ${midiInfo.chosen}`);

    const outDir = path.join(projectRoot, 'tests', 'test-output', 'roundtrip');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const firstJson = path.join(outDir, 'bwv785_roundtrip_original.json');
  const roundTripMidi = path.join(outDir, 'bwv785_roundtrip.mid');
  const secondJson = path.join(outDir, 'bwv785_roundtrip_recompressed.json');
  const diffReport = path.join(outDir, 'bwv785_roundtrip_diffs.txt');

    // Step 1: First motifless compression
    run(`node EncodeDecode.js compress "${midiInfo.path}" "${firstJson}" --force-motifless`);

    // Sanity check first JSON exists
    if (!fs.existsSync(firstJson)) {
      throw new Error('First compression JSON not created.');
    }

    // Step 2: Decompress to MIDI
    run(`node EncodeDecode.js decompress "${firstJson}" "${roundTripMidi}"`);
    if (!fs.existsSync(roundTripMidi)) {
      throw new Error('Round-trip MIDI not created.');
    }

    // Step 3: Recompress motifless
    run(`node EncodeDecode.js compress "${roundTripMidi}" "${secondJson}" --force-motifless`);
    if (!fs.existsSync(secondJson)) {
      throw new Error('Second compression JSON not created.');
    }

    const a = JSON.parse(fs.readFileSync(firstJson, 'utf8'));
    const b = JSON.parse(fs.readFileSync(secondJson, 'utf8'));

    const diffs = [];

    function push(msg) {
      if (diffs.length < 200) diffs.push(msg); // cap to avoid flooding
    }

    // Compare high-level metadata
    if (a.ppq !== b.ppq) push(`ppq differs: ${a.ppq} vs ${b.ppq}`);
    if (a.tempo !== b.tempo) push(`tempo differs: ${a.tempo} vs ${b.tempo}`);
    if (a.key?.tonic !== b.key?.tonic || a.key?.mode !== b.key?.mode) {
      push(`key differs: ${JSON.stringify(a.key)} vs ${JSON.stringify(b.key)}`);
    }

    // Voices structural comparison
    if (!Array.isArray(a.voices) || !Array.isArray(b.voices)) {
      push('voices missing or not arrays');
    } else {
      if (a.voices.length !== b.voices.length) {
        push(`voice count differs: ${a.voices.length} vs ${b.voices.length}`);
      }
      const voiceCount = Math.min(a.voices.length, b.voices.length);
      for (let v = 0; v < voiceCount; v++) {
        const va = a.voices[v];
        const vb = b.voices[v];
        if (va.length !== vb.length) {
          push(`voice ${v} length differs: ${va.length} vs ${vb.length}`);
        }
        const noteCount = Math.min(va.length, vb.length);
        for (let i = 0; i < noteCount; i++) {
          const na = va[i];
          const nb = vb[i];
          // Fields we care about for musical identity
            ['delta','pitch','dur','vel'].forEach(field => {
              if (na[field] !== nb[field]) {
                push(`voice ${v} note ${i} field ${field} differs: ${na[field]} vs ${nb[field]}`);
              }
            });
        }
      }
    }

    if (diffs.length) {
      const header = [
        '=== ROUND TRIP DEGRADATION DETECTED ===',
        `Original JSON: ${firstJson}`,
        `Recompressed JSON: ${secondJson}`,
        `Total differences collected (capped at 200): ${diffs.length}`,
        'First 100 differences:'
      ];
      const lines = header.concat(diffs.slice(0, 100));
      fs.writeFileSync(diffReport, lines.join('\n'));
      console.log('=== ROUND TRIP DEGRADATION DETECTED ===');
      console.log(`Diff report written: ${diffReport}`);
      console.log('First few differences:', diffs.slice(0, 25));
    }

    expect(diffs).toEqual([]); // keep strict failure
  });
});
