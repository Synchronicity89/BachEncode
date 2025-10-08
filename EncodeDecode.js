/**
 * EncodeDecode.js (Reverted Baseline)
 *
 * Reverted to stable snapshot (see EncodeDecode-950271d.js) to establish a clean degradation baseline.
 * Removed experimental overlapping-note layering export + internal _absStarts metadata usage that
 * previously corrupted findBestKey function.
 *
 * Planned reintroductions (future steps):
 *  1. Add deterministic multi-track export (one MIDI track per logical voice) WITHOUT altering key logic.
 *  2. (Baseline simplified) No automatic overlap handling. Track-preserve mode assumes each track is already a single logical voice; any intra-track overlaps simply pass through (as in the original 1-diff snapshot).
 *  3. (Deferred) Future (if reintroduced): import-time merging of layering tracks back into a single logical voice preserving original deltas.
 *  4. Maintain pitch fidelity (already previously verified 580/580 identical) while pursuing duration fidelity under no-overlap assumption.
 *
 * Baseline objective now: run motifless roundtrip degradation test to capture current single diff
 * (expected: first note dur mismatch) before reintroducing layering cleanly.
 */
const fs = require('fs');
const path = require('path');
const midiParser = require('midi-parser-js');
// Removed dependency on midi-writer-js for precise PPQ + velocity preservation.
// We'll implement a minimal Standard MIDI File writer below to avoid hidden
// quantization or velocity scaling.
const tonal = require('@tonaljs/tonal');

// NOTE: Retrograde/time-dilation experimentation postponed until after zero-loss baseline achieved.
const DISABLE_RETROGRADE_AND_TIME_DILATION = true;

function parseMidi(filePath) {
  console.log('Reading MIDI file:', filePath);
  const midiData = fs.readFileSync(filePath, 'base64');
  console.log('MIDI data length:', midiData.length);

  const parsed = midiParser.parse(midiData);
  console.log('Parsed MIDI type:', typeof parsed);
  console.log('Parsed MIDI keys:', parsed ? Object.keys(parsed) : 'null/undefined');

  return parsed;
}

function extractTempoAndPPQAndNotes(midi) {
  const debugOutput = [];
  debugOutput.push('=== MIDI PARSING DEBUG ===');
  debugOutput.push('MIDI object structure: ' + JSON.stringify(midi, null, 2));
  debugOutput.push('MIDI keys: ' + Object.keys(midi).join(', '));

  // Handle different possible structures
  let ppq = 480; // default
  if (midi.header && midi.header.ticksPerBeat) {
    ppq = midi.header.ticksPerBeat;
  } else if (midi.ticksPerBeat) {
    ppq = midi.ticksPerBeat;
  } else if (midi.timeDivision) {
    ppq = midi.timeDivision;
  }

  debugOutput.push('PPQ found: ' + ppq);
  console.log('PPQ found:', ppq);

  let tempo = 120; // default
  let key_sig = null;
  const notes = [];
  const perTrackNotes = []; // For track-preserving mode
  const trackNames = [];    // Track names (aligned with original track indices)
  const activeNotes = new Map();

  // Collect metas and notes from all tracks
  debugOutput.push('MIDI tracks: ' + (midi.track ? midi.track.length : 'No tracks found'));
  debugOutput.push('Available properties: ' + Object.keys(midi).join(', '));

  const tracks = midi.track || midi.tracks || [];
  debugOutput.push('Using tracks array length: ' + tracks.length);
  console.log('Processing', tracks.length, 'tracks');

  // Potential embedded voice split metadata (single-track reconstruction aid)
  const recoveredVoiceSplitMetaParts = [];

  for (let trackIndex = 0; trackIndex < tracks.length; trackIndex++) {
    const track = tracks[trackIndex];
    debugOutput.push(`\n=== TRACK ${trackIndex} ===`);
    debugOutput.push('Track keys: ' + Object.keys(track).join(', '));

    let currentTick = 0;
  const events = track.event || track.events || [];
    debugOutput.push('Track events count: ' + events.length);
    console.log(`Track ${trackIndex}: ${events.length} events`);

    // Only log first 5 events to debug file to avoid huge files
    const maxEventsToLog = Math.min(events.length, 5);
    debugOutput.push(`\nShowing first ${maxEventsToLog} events:`);

  const localNotes = [];
  let trackName = null;
    for (let i = 0; i < events.length; i++) {
      const event = events[i];

      // Handle different deltaTime property names
      const deltaTime = event.deltaTime || event.delta || event.tick || 0;
      currentTick += deltaTime;

      // Only log details for first few events
      if (i < maxEventsToLog) {
        debugOutput.push(`Event ${i}: ${JSON.stringify(event, null, 2)}`);
        debugOutput.push(`  -> type: ${event.type}, subtype: ${event.subtype}, deltaTime: ${deltaTime}, currentTick: ${currentTick}`);
      }

      // Handle tempo meta events (type 255, metaType 81)
      if (event.type === 255 && event.metaType === 81) {
        tempo = 60000000 / event.data;
        debugOutput.push('Found tempo: ' + tempo);
        console.log('Found tempo:', tempo);
      }

      // Handle key signature meta events (type 255, metaType 89)
      if (event.type === 255 && event.metaType === 89) {
        let sf = 0, mi = 0;
        if (Array.isArray(event.data) && event.data.length >= 2) {
          sf = event.data[0] > 127 ? event.data[0] - 256 : event.data[0];
          mi = event.data[1];
        } else if (typeof event.data === 'number') {
          // Single byte might encode both sf and mode
          sf = event.data > 127 ? event.data - 256 : event.data;
          mi = 0; // Default to major
        }
        key_sig = { sf, mode: mi === 1 ? 'minor' : 'major' };
        debugOutput.push('Found key signature: sf=' + sf + ', mode=' + key_sig.mode);
        console.log('Found key signature: sf=' + sf + ', mode=' + key_sig.mode);
      }

      // Track name meta (type 255, metaType 3)
      if (event.type === 255 && event.metaType === 3 && trackName == null) {
        // event.data may be an array of char codes or a string
        if (Array.isArray(event.data)) {
          trackName = event.data.map(c => String.fromCharCode(c)).join('').replace(/\0+$/, '');
        } else if (typeof event.data === 'string') {
          trackName = event.data.replace(/\0+$/, '');
        } else {
          trackName = 'Track '+trackIndex;
        }
      }

      // Embedded text meta events (metaType 1) for voiceSplitMeta recovery
      if (event.type === 255 && event.metaType === 1) {
        let txt;
        if (Array.isArray(event.data)) {
          txt = event.data.map(c => String.fromCharCode(c)).join('').replace(/\0+$/, '');
        } else if (typeof event.data === 'string') {
          txt = event.data.replace(/\0+$/, '');
        }
        if (txt && txt.startsWith('VSPLIT:')) {
            // Everything after prefix is base64 JSON of voiceSplitMeta
            recoveredVoiceSplitMetaParts.push({ order: recoveredVoiceSplitMetaParts.length, data: txt.slice(7) });
        }
      }

      // Handle MIDI note events - this parser uses type 9 for note on, type 8 for note off
      if (event.type === 9 && event.data && event.data.length >= 2 && event.data[1] > 0) {
        // Note On (type 9 with velocity > 0)
        const noteNumber = event.data[0];
        const velocity = event.data[1];
        if (i < 10) { // Only log first 10 to debug file
          debugOutput.push(`NoteOn found: note=${noteNumber}, vel=${velocity}, tick=${currentTick}`);
        }
        console.log(`NoteOn: note=${noteNumber}, vel=${velocity}, tick=${currentTick}`);
        activeNotes.set(noteNumber, { start: currentTick, vel: velocity });
      }
      else if (event.type === 8 || (event.type === 9 && event.data && event.data.length >= 2 && event.data[1] === 0)) {
        // Note Off (type 8) or Note On with velocity 0 (type 9, vel 0)
        const noteNumber = event.data[0];
        if (i < 10) { // Only log first 10 to debug file
          debugOutput.push(`NoteOff found: note=${noteNumber}, tick=${currentTick}`);
        }
        console.log(`NoteOff: note=${noteNumber}, tick=${currentTick}`);
        const onEvent = activeNotes.get(noteNumber);
        if (onEvent) {
          const note = { start: onEvent.start, dur: currentTick - onEvent.start, pitch: noteNumber, vel: onEvent.vel };
          if (notes.length < 5) { debugOutput.push('Adding note: ' + JSON.stringify(note)); }
          console.log('Adding note:', note);
          notes.push(note);
          localNotes.push(note);
          activeNotes.delete(noteNumber);
        }
      }
    }
  perTrackNotes.push(localNotes);
  trackNames[trackIndex] = trackName;

    if (events.length > maxEventsToLog) {
      debugOutput.push(`... and ${events.length - maxEventsToLog} more events`);
    }
  }

  // De-quantization: preserve raw tick timings (previous baseline rounded to 120 tick grid).

  debugOutput.push('\n=== FINAL RESULTS ===');
  debugOutput.push('- PPQ: ' + ppq);
  debugOutput.push('- Tempo: ' + tempo);
  debugOutput.push('- Total notes found: ' + notes.length);
  debugOutput.push('- Active notes remaining: ' + activeNotes.size);

  if (notes.length > 0) {
    debugOutput.push('First few notes: ' + JSON.stringify(notes.slice(0, 3), null, 2));
  }

  fs.writeFileSync('debug-output.txt', debugOutput.join('\n'));
  console.log(`Extraction complete: ${notes.length} notes found. Debug output written to debug-output.txt`);

  let recoveredVoiceSplitMeta = null;
  if (recoveredVoiceSplitMetaParts.length > 0) {
    // Single part expected; if multiple, concatenate
    try {
      const b64 = recoveredVoiceSplitMetaParts.sort((a,b)=> a.order - b.order).map(p=>p.data).join('');
      const json = Buffer.from(b64, 'base64').toString('utf8');
      recoveredVoiceSplitMeta = JSON.parse(json);
      debugOutput.push('Recovered voiceSplitMeta from embedded meta event. Voices: '+ (recoveredVoiceSplitMeta.length || 0));
    } catch (e) {
      debugOutput.push('Failed to parse embedded voiceSplitMeta: '+ e.message);
    }
  }
  return { ppq, tempo, notes, key_sig, perTrackNotes, trackNames, recoveredVoiceSplitMeta };
}

function findBestKey(notes, key_sig) {
  if (key_sig) {
    let sf = key_sig.sf;
    let mode = key_sig.mode;
    let major_tonic = (sf * 7 % 12 + 12) % 12;
    let tonic_pc = mode === 'major' ? major_tonic : (major_tonic + 9) % 12;
    return { tonic_pc, mode };
  } else {
    // Find key with minimal accidentals (baseline logic)
    let best = { sum: Infinity, tonic_pc: 0, mode: 'major' };
    for (let t = 0; t < 12; t++) {
      for (let m of ['major', 'minor']) {
        let sum_acc = 0;
        for (let note of notes) {
          let d = pitchToDiatonic(note.pitch, t, m);
          sum_acc += Math.abs(d.acc);
        }
        if (sum_acc < best.sum) {
          best.sum = sum_acc;
          best.tonic_pc = t;
          best.mode = m;
        }
      }
    }
    return best;
  }
}

function pitchToDiatonic(midi, tonic_pc, mode) {
  const scale_offsets = mode === 'major' ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 11];
  const pc = midi % 12;
  const oct = Math.floor(midi / 12);
  let best_deg = 0;
  let best_acc = 0;
  let best_dist = Infinity;

  for (let d = -14; d <= 21; d++) {
    const d_mod = ((d % 7) + 7) % 7;
    let exp_pc = (tonic_pc + scale_offsets[d_mod]) % 12;
    let acc = pc - exp_pc;
    if (acc < -6) acc += 12; else if (acc > 5) acc -= 12;
    if (Math.abs(acc) > 2) continue; // Avoid extreme accidentals
    const dist = Math.abs(acc);
    if (dist < best_dist || (dist === best_dist && Math.abs(d) < Math.abs(best_deg))) {
      best_dist = dist;
      best_acc = acc;
      best_deg = d;
    }
  }
  return { degree: best_deg, acc: best_acc, oct };
}
function separateVoices(notes) {
  notes.sort((a, b) => a.start - b.start || b.pitch - a.pitch); // Sort by start, then descending pitch for ties
  const voices = [];

  for (const note of notes) {
    let bestVoice = null;
    let bestDist = Infinity;

    for (const voice of voices) {
      const lastNote = voice[voice.length - 1];
      if (lastNote.start + lastNote.dur <= note.start) {
        const dist = Math.abs(lastNote.pitch - note.pitch);
        if (dist < bestDist) {
          bestDist = dist;
          bestVoice = voice;
        }
      }
    }

    if (bestVoice) {
      bestVoice.push(note);
    } else {
      voices.push([note]);
    }
  }

  return voices;
}

function encodeVoices(voices) {
  return voices.map(voice => {
    const encoded = [];
    let prevEnd = 0;
    for (const note of voice) {
      const delta = note.start - prevEnd;
      encoded.push({
        delta,
        pitch: tonal.Note.fromMidi(note.pitch, true), // Use sharps
        dur: note.dur,
        vel: note.vel
      });
      prevEnd = note.start + note.dur;
    }
    return encoded;
  });
}

// (Retrograde / inversion helpers removed in baseline revert – will re-add if needed post-baseline.)

function findMotifs(encodedVoices, key) {
  const { tonic_pc, mode } = key;
  const minLength = 4;
  const maxLength = 20;
  const patternMap = new Map();

  // Add diatonic info to each note
  for (const voice of encodedVoices) {
    for (const item of voice) {
      item.midi = tonal.Note.midi(item.pitch);
      item.diatonic = pitchToDiatonic(item.midi, tonic_pc, mode);
    }
  }

  // Precompute start_ticks for each note in each voice
  const startTicks = encodedVoices.map(voice => {
    const ticks = [];
    let tick = 0;
    for (const item of voice) {
      tick += item.delta;
      ticks.push(tick);
      tick += item.dur;
    }
    return ticks;
  });

  for (let v = 0; v < encodedVoices.length; v++) {
    const voice = encodedVoices[v];
    for (let len = minLength; len <= maxLength; len++) {
      for (let i = 0; i <= voice.length - len; i++) {
        const subseq = voice.slice(i, i + len);
        const base_diatonic = subseq[0].diatonic;
        const rel_degs = [0];
        for (let j = 1; j < len; j++) {
          const d = subseq[j].diatonic;
          rel_degs.push((d.degree - base_diatonic.degree) + 7 * (d.oct - base_diatonic.oct));
        }
        const accs = subseq.map(s => s.diatonic.acc);
        const rhythm = [];
        // Exclude initial delta for better matching
        rhythm.push(subseq[0].dur);
        for (let j = 1; j < len; j++) {
          rhythm.push(subseq[j].delta);
          rhythm.push(subseq[j].dur);
        }
        const vels = subseq.map(s => s.vel);
        const key_str = rel_degs.join(',') + '|' + accs.join(',') + '|' + rhythm.join(',') + '|' + vels.join(',');
        if (!patternMap.has(key_str)) {
          patternMap.set(key_str, []);
        }
        patternMap.get(key_str).push({
          voice: v,
          start: i,
          base_pitch: subseq[0].pitch,
          start_tick: startTicks[v][i]
        });
      }
    }
  }

  // Get length from key
  function getLenFromKey(key) {
    return key.split('|')[0].split(',').length;
  }

  // Filter and sort candidates by savings
  let candidates = Array.from(patternMap.entries()).filter(([k, v]) => v.length >= 2);
  candidates.sort((a, b) => {
    const saveA = getLenFromKey(a[0]) * (a[1].length - 1);
    const saveB = getLenFromKey(b[0]) * (b[1].length - 1);
    return saveB - saveA;
  });

  const motifs = [];
  const motifMap = new Map();
  let id = 0;
  for (const [key_str, occs] of candidates) {
    const parts = key_str.split('|');
    const rel_deg_str = parts[0];
    const acc_str = parts[1];
    const rhythm_str = parts[2];
    const vels_str = parts[3];
    const deg_rels = rel_deg_str.split(',').map(Number);
    const accs = acc_str.split(',').map(Number);
    const rhythm_nums = rhythm_str.split(',').map(Number);
    const vels = vels_str.split(',').map(Number);
    const durs = [];
    const deltas = [];
    durs.push(rhythm_nums[0]); // First dur
    for (let k = 1; k < rhythm_nums.length; k += 2) {
      deltas.push(rhythm_nums[k]);
      durs.push(rhythm_nums[k + 1]);
    }
    // Compute relative MIDI intervals (midi_rels) from first occurrence to preserve exact octave when expanding.
    let midi_rels = null;
    try {
      if (occs && occs.length > 0) {
        const sample = occs[0];
        const seq = encodedVoices[sample.voice].slice(sample.start, sample.start + deg_rels.length);
        if (seq.length === deg_rels.length) {
          const baseMidi = tonal.Note.midi(seq[0].pitch);
            if (baseMidi !== null) {
            midi_rels = seq.map(n => tonal.Note.midi(n.pitch) - baseMidi);
          }
        }
      }
    } catch (e) {
      midi_rels = null;
    }
    motifs.push({ deg_rels, accs, deltas, durs, vels, midi_rels });
    motifMap.set(key_str, id++);
  }

  return { motifs, motifMap, patternMap };
}

function applyMotifs(encodedVoices, motifs, motifMap, patternMap) {
  function getLenFromKey(key) {
    return key.split('|')[0].split(',').length;
  }

  const candidates = Array.from(patternMap.entries()).filter(([k, v]) => v.length >= 2);

  const covered = encodedVoices.map(() => new Set());
  const replacements = encodedVoices.map(() => []);

  for (const [key, occs] of candidates) {
    const len = getLenFromKey(key);
    const mid = motifMap.get(key);
    if (mid === undefined) continue;

    for (const occ of occs) {
      let isCovered = false;
      for (let j = occ.start; j < occ.start + len; j++) {
        if (covered[occ.voice].has(j)) {
          isCovered = true;
          break;
        }
      }
      if (!isCovered) {
        for (let j = occ.start; j < occ.start + len; j++) {
          covered[occ.voice].add(j);
        }
        const base_pitch = occ.base_pitch;
        const base_midi = tonal.Note.midi(base_pitch);
        replacements[occ.voice].push({
          start: occ.start,
          len: len,
          motif_id: mid,
          base_pitch,
          base_midi,
          delta: encodedVoices[occ.voice][occ.start].delta
        });
      }
    }
  }

  const newEncodedVoices = [];
  for (let v = 0; v < encodedVoices.length; v++) {
    const repls = replacements[v].sort((a, b) => a.start - b.start);
    const newVoice = [];
    let pos = 0;
    for (const repl of repls) {
      for (let j = pos; j < repl.start; j++) {
        newVoice.push(encodedVoices[v][j]);
      }
      newVoice.push({
        delta: repl.delta,
        motif_id: repl.motif_id,
        base_pitch: repl.base_pitch,
        base_midi: repl.base_midi
      });
      pos = repl.start + repl.len;
    }
    for (let j = pos; j < encodedVoices[v].length; j++) {
      newVoice.push(encodedVoices[v][j]);
    }
    newEncodedVoices.push(newVoice);
  }
  return newEncodedVoices;
}

// Helper: reconstruct RAW voices (arrays of note objects) from a recovered voiceSplitMeta
function reconstructRawVoicesFromSplitMeta(allNotes, voiceSplitMeta) {
  if (!voiceSplitMeta || !Array.isArray(voiceSplitMeta) || voiceSplitMeta.length === 0) return null;
  const ordered = allNotes.slice().sort((a,b)=> a.start - b.start || a.pitch - b.pitch);
  return voiceSplitMeta.map(indexList => {
    const voiceNotes = indexList.map(i => ordered[i]).filter(Boolean).sort((a,b)=> a.start - b.start || a.pitch - b.pitch);
    return voiceNotes;
  });
}

function compressMidiToJson(inputMidi, outputJson) {
  const midi = parseMidi(inputMidi);
  const argv = process.argv.slice(2); // after node script
  const motiflessFlags = ['--no-motifs','--motifless','--force-motifless'];
  const disableMotifsExplicit = motiflessFlags.some(f => argv.includes(f)) || process.env.NO_MOTIFS === '1';
  const preserveTracksFlag = argv.includes('--preserve-tracks') || process.env.PRESERVE_TRACKS === '1';

  const { ppq, tempo, notes, key_sig, perTrackNotes, trackNames, recoveredVoiceSplitMeta } = extractTempoAndPPQAndNotes(midi);
  const key = findBestKey(notes, key_sig);
  const tonic_name = tonal.Note.pitchClass(tonal.Note.fromMidi(key.tonic_pc + 60, true));
  let voices;
  let voiceMeta = [];
  // Auto-enable track preservation if file has >1 tracks with notes (one logical voice per track assumption)
  const autoPreserve = perTrackNotes.length > 1 && perTrackNotes.some(t => t.length > 0);
  const preserveTracks = preserveTracksFlag || autoPreserve;
  let voiceToTrack = [];
  if (preserveTracks && perTrackNotes.length > 0 && perTrackNotes.some(t => t.length > 0)) {
    // Simple per-track mapping (original 1-diff snapshot behavior), no overlap validation or splitting.
    voices = [];
    for (let idx=0; idx<perTrackNotes.length; idx++) {
      const arr = perTrackNotes[idx];
      if (arr.length === 0) continue; // skip empty tracks for voices array (but keep mapping metadata)
      const sorted = arr.slice().sort((a,b)=> a.start - b.start || a.pitch - b.pitch);
      voiceMeta.push({ trackIndex: idx, noteCount: sorted.length });
      voiceToTrack.push(idx);
      voices.push(sorted);
    }
  } else {
    voices = separateVoices(notes);
    voiceMeta = voices.map((v,i)=>({ heuristic:true, index:i, noteCount:v.length }));
    voiceToTrack = voices.map((_,i)=> i);
  }

  // If we recovered a voiceSplitMeta from an earlier compression (single-track case), override heuristic segmentation
  if (recoveredVoiceSplitMeta && perTrackNotes.length === 1) {
    const reconstructed = reconstructRawVoicesFromSplitMeta(notes, recoveredVoiceSplitMeta);
    if (reconstructed) {
      voices = reconstructed;
      voiceMeta = voices.map((v,i)=> ({ restored:true, index:i, noteCount:v.length }));
      voiceToTrack = voices.map((_,i)=> i);
    }
  }
  let encodedVoices = encodeVoices(voices);
  const disableMotifs = disableMotifsExplicit; // Honor explicit disabling only
  let motifs = [];
  if (!disableMotifs) {
    const motifResults = findMotifs(encodedVoices, key);
    motifs = motifResults.motifs;
    encodedVoices = applyMotifs(encodedVoices, motifResults.motifs, motifResults.motifMap, motifResults.patternMap);
    // Remove unused motifs
    const used = new Set();
    for (const voice of encodedVoices) {
      for (const item of voice) {
        if (item.motif_id !== undefined) used.add(item.motif_id);
      }
    }
    const sortedUsed = Array.from(used).sort((a, b) => a - b);
    const newMotifs = sortedUsed.map(oldId => motifs[oldId]);
    const newMap = new Map();
    sortedUsed.forEach((oldId, index) => newMap.set(oldId, index));
    for (const voice of encodedVoices) {
      for (const item of voice) {
        if (item.motif_id !== undefined) item.motif_id = newMap.get(item.motif_id);
      }
    }
    motifs = newMotifs;
  }
  // Persist voice segmentation metadata ONLY if original track count was 1 but we produced >1 voices
  // so we can reconstruct the same segmentation on roundtrip.
  let voiceSplitMeta = null;
  if ((perTrackNotes.length === 1) && voices.length > 1) {
    // Build global ordering from concatenation of all voice notes so indices are stable
    const globalNotes = voices.flat().slice().sort((a,b)=> a.start - b.start || a.pitch - b.pitch);
    const indexMap = new Map(globalNotes.map((n,i)=>[n,i]));
    voiceSplitMeta = voices.map(v => v.map(n => indexMap.get(n)).filter(i => i !== undefined));
  }
  const compressed = {
    ppq,
    tempo,
    key: { tonic: tonic_name, mode: key.mode },
  motifs: disableMotifs ? [] : motifs,
    voices: encodedVoices,
    voiceMeta,
  motifsDisabled: !!disableMotifs,
    originalTrackCount: perTrackNotes.length,
    trackNames,
    voiceToTrack,
    keySignature: key_sig ? { sf: key_sig.sf, mode: key_sig.mode } : null,
    voiceSplitMeta
  };
  
  // Ensure output directory exists
  const outputDir = path.dirname(outputJson);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  fs.writeFileSync(outputJson, JSON.stringify(compressed, null, 2)); // Pretty print for editability
}

function decodeVoices(encodedVoices, ppq, motifs = [], key = { tonic: 'C', mode: 'major' }) {
  const tonic_pc = tonal.Note.midi(key.tonic + '4') % 12;
  const mode = key.mode;
  const scale_offsets = mode === 'major' ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 11];
  const notes = [];
  for (const voice of encodedVoices) {
    let currentTick = 0;
    for (const item of voice) {
      if (item.motif_id !== undefined) {
        currentTick += item.delta;
        const motif = motifs[item.motif_id];
        if (motif) {
          const base_midi = item.base_midi != null ? item.base_midi : tonal.Note.midi(item.base_pitch);
          let subTick = currentTick;
          for (let j = 0; j < motif.deg_rels.length; j++) {
            let pitchMidi;
            if (motif.midi_rels && motif.midi_rels.length === motif.deg_rels.length && base_midi != null) {
              pitchMidi = base_midi + motif.midi_rels[j];
            } else {
              // Fallback to diatonic reconstruction
              const base_diatonic = pitchToDiatonic(base_midi, tonic_pc, mode);
              const total_deg = base_diatonic.degree + motif.deg_rels[j];
              const deg_mod = ((total_deg % 7) + 7) % 7;
              const oct_add = Math.floor(total_deg / 7);
              let exp_pc = (tonic_pc + scale_offsets[deg_mod]) % 12;
              let pc = (exp_pc + motif.accs[j]) % 12;
              if (pc < 0) pc += 12;
              const oct = base_diatonic.oct + oct_add;
              pitchMidi = pc + oct * 12;
            }
            notes.push({ start: subTick, dur: motif.durs[j], pitch: pitchMidi, vel: motif.vels[j] });
            subTick += motif.durs[j];
            if (j < motif.deg_rels.length - 1) subTick += motif.deltas[j];
          }
          currentTick = subTick;
        }
      } else {
        // Handle single note
        currentTick += item.delta;
        const pitchNum = tonal.Note.midi(item.pitch);
        if (pitchNum !== null) {
          notes.push({
            start: currentTick,
            dur: item.dur,
            pitch: pitchNum,
            vel: item.vel
          });
        }
        currentTick += item.dur;
      }
    }
  }
  return notes;
}

// (Expansion helpers removed from baseline revert; will reintroduce when layering export returns.)

// Helper: decode a single encoded voice into raw notes (used for multi-track export)
function decodeSingleVoice(encodedVoice, ppq, motifs = [], key = { tonic: 'C', mode: 'major' }) {
  const tonic_pc = tonal.Note.midi(key.tonic + '4') % 12;
  const mode = key.mode;
  const scale_offsets = mode === 'major' ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 11];
  const notes = [];
  let currentTick = 0;
  for (const item of encodedVoice) {
    if (item.motif_id !== undefined) {
      currentTick += item.delta;
      const motif = motifs[item.motif_id];
      if (motif) {
        const base_midi = item.base_midi != null ? item.base_midi : tonal.Note.midi(item.base_pitch);
        let subTick = currentTick;
        for (let j = 0; j < motif.deg_rels.length; j++) {
          let pitchMidi;
          if (motif.midi_rels && motif.midi_rels.length === motif.deg_rels.length && base_midi != null) {
            pitchMidi = base_midi + motif.midi_rels[j];
          } else {
            const base_diatonic = pitchToDiatonic(base_midi, tonic_pc, mode);
            const total_deg = base_diatonic.degree + motif.deg_rels[j];
            const deg_mod = ((total_deg % 7) + 7) % 7;
            const oct_add = Math.floor(total_deg / 7);
            let exp_pc = (tonic_pc + scale_offsets[deg_mod]) % 12;
            let pc = (exp_pc + motif.accs[j]) % 12;
            if (pc < 0) pc += 12;
            const oct = base_diatonic.oct + oct_add;
            pitchMidi = pc + oct * 12;
          }
          notes.push({ start: subTick, dur: motif.durs[j], pitch: pitchMidi, vel: motif.vels[j] });
          subTick += motif.durs[j];
          if (j < motif.deg_rels.length - 1) subTick += motif.deltas[j];
        }
        currentTick = subTick;
      }
    } else {
      currentTick += item.delta;
      const pitchNum = tonal.Note.midi(item.pitch);
      if (pitchNum !== null) {
        notes.push({ start: currentTick, dur: item.dur, pitch: pitchNum, vel: item.vel });
      }
      currentTick += item.dur;
    }
  }
  return notes;
}

// ===== Minimal MIDI Writer (Type 1) for precise reproduction =====
function encodeVariableLength(value) {
  let buffer = value & 0x7F;
  const bytes = [];
  while ((value >>= 7)) {
    buffer <<= 8;
    buffer |= ((value & 0x7F) | 0x80);
  }
  while (true) {
    bytes.push(buffer & 0xFF);
    if (buffer & 0x80) buffer >>= 8; else break;
  }
  return bytes;
}

function buildTrackChunk(events) {
  // events: array of { tick, data: [bytes...] }
  events.sort((a,b)=> a.tick - b.tick);
  let lastTick = 0;
  const bytes = [];
  for (const ev of events) {
    const delta = ev.tick - lastTick;
    lastTick = ev.tick;
    bytes.push(...encodeVariableLength(delta));
    bytes.push(...ev.data);
  }
  // End of track meta
  bytes.push(0x00, 0xFF, 0x2F, 0x00);
  const header = Buffer.from('MTrk');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(bytes.length,0);
  return Buffer.concat([header, lenBuf, Buffer.from(bytes)]);
}

function buildMidiFile({ ppq, tempo, tracks, keySignature = null }) {
  const header = Buffer.from('MThd');
  const hdrLen = Buffer.alloc(4); hdrLen.writeUInt32BE(6,0);
  const format = Buffer.alloc(2); format.writeUInt16BE(tracks.length > 1 ? 1 : 0,0);
  const nTracks = Buffer.alloc(2); nTracks.writeUInt16BE(tracks.length,0);
  const division = Buffer.alloc(2); division.writeUInt16BE(ppq,0);
  const headerChunk = Buffer.concat([header, hdrLen, format, nTracks, division]);

  const microPerQuarter = Math.round(60000000 / tempo);

  const trackChunks = tracks.map((t, idx) => {
    const events = [];
    // Track name
    if (t.name) {
      const nameBytes = Buffer.from(t.name, 'ascii');
      events.push({ tick:0, data: [0xFF, 0x03, nameBytes.length, ...nameBytes] });
    }
    if (idx === 0) {
      // Tempo event
      const mpq = [ (microPerQuarter>>16)&0xFF, (microPerQuarter>>8)&0xFF, microPerQuarter &0xFF ];
      events.push({ tick:0, data: [0xFF, 0x51, 0x03, ...mpq] });
      if (keySignature) {
        let sfClamped = keySignature.sf;
        if (sfClamped > 7) sfClamped = 7; else if (sfClamped < -7) sfClamped = -7;
        // Convert to signed byte two's complement representation
        const sf = sfClamped < 0 ? 256 + sfClamped : sfClamped;
        const mode = (keySignature.mode === 'minor' || keySignature.mode === 1) ? 1 : 0;
        events.push({ tick:0, data: [0xFF, 0x59, 0x02, sf, mode] });
      }
    }
    if (t.embeddedVoiceSplitMeta) {
      try {
        const jsonStr = JSON.stringify(t.embeddedVoiceSplitMeta);
        const b64 = Buffer.from(jsonStr, 'utf8').toString('base64');
        const chunkSize = 100; // keep <128 so single-byte length works
        for (let off = 0; off < b64.length; off += chunkSize) {
          const chunk = b64.slice(off, off + chunkSize);
            // Prefix first chunk with VSPLIT:, continuation chunks with VSPLIT:+ (marker retained but we reconstruct by concatenating)
          const prefix = 'VSPLIT:'; // same prefix for simplicity
          const txtBuf = Buffer.from(prefix + chunk, 'ascii');
          events.push({ tick:0, data: [0xFF, 0x01, txtBuf.length, ...txtBuf] });
        }
      } catch (e) {
        // swallow errors silently; embedding is best-effort
      }
    }
    for (const n of t.notes) {
      events.push({ tick: n.start, data: [0x90, n.pitch & 0x7F, Math.max(0, Math.min(127, n.vel || 64))] });
      events.push({ tick: n.start + n.dur, data: [0x90, n.pitch & 0x7F, 0x00] });
    }
    return buildTrackChunk(events);
  });

  return Buffer.concat([headerChunk, ...trackChunks]);
}

function decompressJsonToMidi(inputJson, outputMidi) {
  const compressed = JSON.parse(fs.readFileSync(inputJson, 'utf8'));
  const { ppq, tempo, motifs = [], voices, key = { tonic: 'C', mode: 'major' }, originalTrackCount, voiceToTrack = [], trackNames = [], keySignature = null, voiceSplitMeta = null } = compressed;

  // Decode each voice to raw notes
  const decodedVoiceNotes = voices.map(v => decodeSingleVoice(v, ppq, motifs, key));
  let trackTotal = originalTrackCount || voices.length;
  // If original had 1 track but multiple voices AND we stored voiceSplitMeta, we will still emit a single track
  // (to preserve originalTrackCount) but keep an ordered concatenation of voice notes for re-splitting later.
  const tracks = Array.from({ length: trackTotal }, (_,i)=> ({ name: trackNames[i] || undefined, notes: [] }));
  if (trackTotal === 1) {
    // Merge all voices into single track preserving chronological order
    const merged = decodedVoiceNotes.flat().sort((a,b)=> a.start - b.start || a.pitch - b.pitch);
    tracks[0].notes.push(...merged);
  } else {
    if (voiceToTrack.length === decodedVoiceNotes.length) {
      for (let i=0;i<decodedVoiceNotes.length;i++) {
        const tIndex = voiceToTrack[i] ?? i;
        if (!tracks[tIndex]) continue;
        tracks[tIndex].notes.push(...decodedVoiceNotes[i]);
      }
    } else {
      for (let i=0;i<decodedVoiceNotes.length;i++) {
        tracks[i] && tracks[i].notes.push(...decodedVoiceNotes[i]);
      }
    }
  }

  // Embed voiceSplitMeta for single-track multi-voice reconstruction on future recompression
  if (voiceSplitMeta && originalTrackCount === 1 && tracks[0]) {
    tracks[0].embeddedVoiceSplitMeta = voiceSplitMeta;
  }

  const midiBuffer = buildMidiFile({ ppq, tempo, tracks, keySignature });
  const outputDir = path.dirname(outputMidi);
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputMidi, midiBuffer);
  console.log('MIDI file written successfully (custom writer)');
}

function main() {
  try {
    const args = process.argv.slice(2);
    if (args.length < 3) {
      console.log('Usage: node program.js compress input.midi output.json');
      console.log('Or: node program.js decompress input.json output.midi');
      return;
    }

    const command = args[0];
    const input = args[1];
    const output = args[2];

    console.log(`Command: ${command}, Input: ${input}, Output: ${output}`);

    if (command === 'compress') {
      compressMidiToJson(input, output);
      console.log('Compression completed successfully');
    } else if (command === 'decompress') {
      decompressJsonToMidi(input, output);
      console.log('Decompression completed successfully');
    } else {
      console.log('Unknown command');
    }
  } catch (error) {
    console.error('Error occurred:', error.message);
    console.error('Stack trace:', error.stack);
    process.exitCode = 1;
  }
}

// Export functions for testing
// Export baseline functions for tests
module.exports = {
  compressMidiToJson,
  decompressJsonToMidi,
  decodeVoices,
  // Expose internals for advanced key analysis / future integration tests
  parseMidi,
  extractTempoAndPPQAndNotes,
  separateVoices,
  reconstructVoicesFromSplitMeta
};

if (require.main === module) {
  main();
}

// Helper: given decoded single-track notes and a voiceSplitMeta array of index arrays (global note indices),
// reconstruct encoded voices deterministically for later recompression parity.
function reconstructVoicesFromSplitMeta(allNotes, voiceSplitMeta) {
  if (!voiceSplitMeta || !Array.isArray(voiceSplitMeta) || voiceSplitMeta.length === 0) return null;
  // Sort allNotes by start then pitch to build same index ordering used in compression when capturing voiceSplitMeta
  const ordered = allNotes.slice().sort((a,b)=> a.start - b.start || a.pitch - b.pitch);
  // Build encoded voices out of those note groups preserving original relative timing (delta) semantics
  return voiceSplitMeta.map(indexList => {
    const voiceNotes = indexList.map(i => ordered[i]).filter(Boolean).sort((a,b)=> a.start - b.start || a.pitch - b.pitch);
    // Re-encode into delta/pitch/dur/vel objects
    const encoded = [];
    let prevEnd = 0;
    for (const n of voiceNotes) {
      const delta = n.start - prevEnd;
      encoded.push({ delta, pitch: tonal.Note.fromMidi(n.pitch, true), dur: n.dur, vel: n.vel });
      prevEnd = n.start + n.dur;
    }
    return encoded;
  });
}