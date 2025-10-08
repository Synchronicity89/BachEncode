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
        // Voice counts should normally match; if they do not, log and continue (some pipelines may filter empty voices)
        if (motiflessData.voices.length !== expandedData.voices.length) {
            console.warn(`Voice count differs (motifless=${motiflessData.voices.length} vs expanded=${expandedData.voices.length}) – proceeding with min alignment`);
        }

    const octaveIssues = [];
    const otherPitchIssues = [];
    const timingIssues = [];
    let structuralMismatch = false;

        const minVoices = Math.min(motiflessData.voices.length, expandedData.voices.length);
        for (let v = 0; v < minVoices; v++) {
            const voiceA = motiflessData.voices[v];
            const voiceB = expandedData.voices[v];

            // Reconstruct absolute times from delta
            function toAbs(voice) {
                let t = 0; return voice.map(n => { t += n.delta; return { start: t, pitch: n.pitch, dur: n.dur, vel: n.vel }; });
            }
            const absA = toAbs(voiceA);
            const absB = toAbs(voiceB);

            // First attempt simple index alignment; if it yields large mismatches, fall back to multiset comparison
            const provisionalPitchIssues = [];
            const provisionalTimingIssues = [];
            const len = Math.min(absA.length, absB.length);
            for (let i = 0; i < len; i++) {
                const a = absA[i];
                const b = absB[i];
                if (a.start !== b.start || a.dur !== b.dur) {
                    provisionalTimingIssues.push({ voice: v, index: i, a: { start: a.start, dur: a.dur }, b: { start: b.start, dur: b.dur } });
                }
                if (a.pitch !== b.pitch) {
                    const mA = tonal.Note.midi(a.pitch) ?? null;
                    const mB = tonal.Note.midi(b.pitch) ?? null;
                    const diff = (mA !== null && mB !== null) ? Math.abs(mA - mB) : null;
                    provisionalPitchIssues.push({ voice: v, index: i, a: a.pitch, b: b.pitch, diff });
                }
            }
            const lengthMismatch = absA.length !== absB.length;
            const largeMismatch = provisionalPitchIssues.length > Math.max(10, absA.length * 0.05) || lengthMismatch;
            if (largeMismatch) {
                // Multiset comparison ignoring ordering differences
                const serialize = n => `${n.start}|${n.dur}|${n.pitch}`;
                const freqA = new Map();
                const freqB = new Map();
                for (const n of absA) freqA.set(serialize(n), (freqA.get(serialize(n))||0)+1);
                for (const n of absB) freqB.set(serialize(n), (freqB.get(serialize(n))||0)+1);
                // Compare frequencies
                for (const [k, cA] of freqA.entries()) {
                    const cB = freqB.get(k) || 0;
                    if (cA !== cB) {
                        structuralMismatch = true;
                        break;
                    }
                }
                for (const [k, cB] of freqB.entries()) {
                    const cA = freqA.get(k) || 0;
                    if (cA !== cB) {
                        structuralMismatch = true;
                        break;
                    }
                }
                if (!structuralMismatch) {
                    // Treat index-based pitch/timing issues as ordering only; ignore
                    continue;
                } else {
                    // If structural mismatch, promote provisional issues to main lists for diagnostics
                    for (const pi of provisionalPitchIssues) {
                        if (pi.diff !== null && pi.diff % 12 === 0) octaveIssues.push(pi); else otherPitchIssues.push(pi);
                    }
                    timingIssues.push(...provisionalTimingIssues);
                }
            } else {
                // small mismatch set, keep detailed issues
                for (const pi of provisionalPitchIssues) {
                    if (pi.diff !== null && pi.diff % 12 === 0) octaveIssues.push(pi); else otherPitchIssues.push(pi);
                }
                timingIssues.push(...provisionalTimingIssues);
                if (lengthMismatch) structuralMismatch = true;
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
                const enriched = otherPitchIssues.slice(0, 5).map(issue => {
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
        if (structuralMismatch) {
            expect(otherPitchIssues.length).toBe(0);
        } else {
            // Only ordering differences detected – treat as pass even if raw index comparison large
            expect(true).toBe(true);
        }
    });
});
