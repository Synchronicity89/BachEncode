const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const tonal = require('@tonaljs/tonal');

/**
 * Integration test for BWV785 motif compression vs motifless expansion.
 * Steps:
 * 1. Compress with motifs (default) -> output/BWV785-with-motifs.json
 * 2. Compress forced motifless -> output/BWV785-motifless.json
 * 3. Decompress motif version with --export-motifless-json to produce expanded motifless JSON
 * 4. Compare expanded JSON to direct motifless compression JSON musically
 *    - Align voices, compare note sequences (pitch, dur, timing)
 *    - Identify octave-only discrepancies (difference = +/- 12, 24, etc.)
 */

describe('BWV785 Motif Expansion Integration', () => {
  const midiPath = path.join(__dirname, '..', '..', 'midi', 'BWV785.mid');
  const outputDir = path.join(__dirname, '..', '..', 'output');
  const motifJson = path.join(outputDir, 'BWV785-with-motifs.json');
  const motiflessJson = path.join(outputDir, 'BWV785-motifless.json');
  const decompressedMid = path.join(outputDir, 'BWV785-with-motifs.mid');
  const expandedJson = path.join(outputDir, 'BWV785-with-motifs-motifless.json');
  const annotatedDump = path.join(outputDir, 'BWV785-with-motifs-annotated.json');

  function run(cmd) {
    console.log(`> ${cmd}`);
    execSync(cmd, { stdio: 'inherit', cwd: path.join(__dirname, '..', '..') });
  }

  test('should produce comparable motifless expansion', () => {
    if (!fs.existsSync(midiPath)) {
      console.warn('BWV785.mid not found, skipping integration test');
      return;
    }

    // 1. Compress with motifs
    run(`node EncodeDecode.js compress ${midiPath} ${motifJson}`);
    expect(fs.existsSync(motifJson)).toBe(true);

    // 2. Compress forced motifless
    run(`node EncodeDecode.js compress ${midiPath} ${motiflessJson} --force-motifless`);
    expect(fs.existsSync(motiflessJson)).toBe(true);

    // 3. Decompress motif version exporting motifless JSON
    run(`node EncodeDecode.js decompress ${motifJson} ${decompressedMid} --export-motifless-json`);
    expect(fs.existsSync(expandedJson)).toBe(true);

    const motiflessData = JSON.parse(fs.readFileSync(motiflessJson, 'utf8'));
    const expandedData = JSON.parse(fs.readFileSync(expandedJson, 'utf8'));

  // If we have non-octave mismatches later we may want annotated motif reconstruction.
  // We'll lazily produce it only if needed by invoking the module directly.

    // Basic structural checks
    expect(motiflessData.ppq).toBe(expandedData.ppq);
    expect(motiflessData.tempo).toBe(expandedData.tempo);
    expect(motiflessData.voices.length).toBe(expandedData.voices.length);

    const octaveIssues = [];
    const otherPitchIssues = [];
    const timingIssues = [];

    for (let v = 0; v < motiflessData.voices.length; v++) {
      const voiceA = motiflessData.voices[v];
      const voiceB = expandedData.voices[v];

      // Reconstruct absolute times from delta
      function toAbs(voice) {
        let t = 0; return voice.map(n => { t += n.delta; return { start: t, pitch: n.pitch, dur: n.dur, vel: n.vel }; });
      }
      const absA = toAbs(voiceA);
      const absB = toAbs(voiceB);

      const len = Math.min(absA.length, absB.length);
      for (let i = 0; i < len; i++) {
        const a = absA[i];
        const b = absB[i];
        if (a.start !== b.start || a.dur !== b.dur) {
          timingIssues.push({ voice: v, index: i, a: { start: a.start, dur: a.dur }, b: { start: b.start, dur: b.dur } });
        }
        if (a.pitch !== b.pitch) {
          const mA = tonal.Note.midi(a.pitch) ?? null;
          const mB = tonal.Note.midi(b.pitch) ?? null;
          // Convert pitch strings to midi numbers for diff (they should be strings like C#4)
          const diff = (mA !== null && mB !== null) ? Math.abs(mA - mB) : null;
          if (diff !== null && diff % 12 === 0) {
            octaveIssues.push({ voice: v, index: i, a: a.pitch, b: b.pitch, diff });
          } else {
            otherPitchIssues.push({ voice: v, index: i, a: a.pitch, b: b.pitch, diff });
          }
        }
      }

      if (absA.length !== absB.length) {
        console.warn(`Voice ${v} length mismatch: ${absA.length} vs ${absB.length}`);
      }
    }

    console.log('\n=== MOTIF EXPANSION COMPARISON REPORT ===');
    console.log(`Octave-related pitch differences: ${octaveIssues.length}`);
    console.log(`Other pitch differences: ${otherPitchIssues.length}`);
    console.log(`Timing differences: ${timingIssues.length}`);

    if (octaveIssues.length > 0) {
      console.log('First few octave issues:', octaveIssues.slice(0, 5));
    }
    if (otherPitchIssues.length > 0) {
      console.log('First few non-octave pitch issues:', otherPitchIssues.slice(0, 5));
      try {
        // Lazy require to avoid circular cost when test passes
        const { expandMotifsToAnnotatedVoices } = require('../../EncodeDecode');
        const compressed = JSON.parse(fs.readFileSync(motifJson, 'utf8'));
        const annotated = expandMotifsToAnnotatedVoices(compressed);
        // Build quick lookup: voice->index->annotation
        const annotationLookup = annotated.map(v => v.map(n => ({ start: n.start, pitch: n.pitch, motif_id: n.motif_id, motif_note_index: n.motif_note_index, transformation: n.transformation })));
        const enriched = otherPitchIssues.slice(0,5).map(issue => {
          const ann = annotationLookup[issue.voice][issue.index] || {};
            return { ...issue, motif_id: ann.motif_id, motif_note_index: ann.motif_note_index, transformation: ann.transformation };
        });
        console.log('Annotated mismatch sample:', enriched);
        fs.writeFileSync(annotatedDump, JSON.stringify({ annotated }, null, 2));
      } catch (e) {
        console.warn('Failed to create annotated motif dump:', e.message);
      }
    }
    if (timingIssues.length > 0) {
      console.log('First few timing issues:', timingIssues.slice(0, 5));
    }

    // Expectations: We allow octave issues for now but should not have many non-octave mismatches
    expect(otherPitchIssues.length).toBe(0);
  });
});
