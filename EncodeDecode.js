const fs = require('fs');
const path = require('path');
const midiParser = require('midi-parser-js');
const MidiWriter = require('midi-writer-js');
const tonal = require('@tonaljs/tonal');

// Configuration: hard-disable retrograde and any (future) time-dilation logic.
// This reduces scope to exact + inversion motif reuse only.
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
  const activeNotes = []; // one map per track (for multi-track voice preservation)

  // Collect metas and notes from all tracks
  debugOutput.push('MIDI tracks: ' + (midi.track ? midi.track.length : 'No tracks found'));
  debugOutput.push('Available properties: ' + Object.keys(midi).join(', '));
  
  const tracks = midi.track || midi.tracks || [];
  debugOutput.push('Using tracks array length: ' + tracks.length);
  console.log('Processing', tracks.length, 'tracks');
  
  for (let trackIndex = 0; trackIndex < tracks.length; trackIndex++) {
    const track = tracks[trackIndex];
    activeNotes[trackIndex] = new Map();
    debugOutput.push(`\n=== TRACK ${trackIndex} ===`);
    debugOutput.push('Track keys: ' + Object.keys(track).join(', '));
    
    let currentTick = 0;
    const events = track.event || track.events || [];
    debugOutput.push('Track events count: ' + events.length);
    console.log(`Track ${trackIndex}: ${events.length} events`);
    
    // Only log first 5 events to debug file to avoid huge files
    const maxEventsToLog = Math.min(events.length, 5);
    debugOutput.push(`\nShowing first ${maxEventsToLog} events:`);
    
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
      
      // Handle MIDI note events - this parser uses type 9 for note on, type 8 for note off
      if (event.type === 9 && event.data && event.data.length >= 2 && event.data[1] > 0) {
        // Note On (type 9 with velocity > 0)
        const noteNumber = event.data[0];
        const velocity = event.data[1];
        if (i < 10) { // Only log first 10 to debug file
          debugOutput.push(`NoteOn found: note=${noteNumber}, vel=${velocity}, tick=${currentTick}`);
        }
        console.log(`NoteOn: note=${noteNumber}, vel=${velocity}, tick=${currentTick}`);
  activeNotes[trackIndex].set(noteNumber, { start: currentTick, vel: velocity });
      }
      else if (event.type === 8 || (event.type === 9 && event.data && event.data.length >= 2 && event.data[1] === 0)) {
        // Note Off (type 8) or Note On with velocity 0 (type 9, vel 0)
        const noteNumber = event.data[0];
        if (i < 10) { // Only log first 10 to debug file
          debugOutput.push(`NoteOff found: note=${noteNumber}, tick=${currentTick}`);
        }
        console.log(`NoteOff: note=${noteNumber}, tick=${currentTick}`);
  const onEvent = activeNotes[trackIndex].get(noteNumber);
        if (onEvent) {
          const note = {
            start: onEvent.start,
            dur: currentTick - onEvent.start,
            pitch: noteNumber,
            vel: onEvent.vel
          };
          if (notes.length < 5) { // Only log first 5 notes to debug file
            debugOutput.push('Adding note: ' + JSON.stringify(note));
          }
          console.log('Adding note:', note);
          // Tag with track index to preserve voice identity
          notes.push({ ...note, track: trackIndex });
          activeNotes[trackIndex].delete(noteNumber);
        }
      }
    }
    
    if (events.length > maxEventsToLog) {
      debugOutput.push(`... and ${events.length - maxEventsToLog} more events`);
    }
  }

  // Quantize timings
  // const quant_unit = 120;
  // notes.forEach(note => {
  //   note.start = Math.round(note.start / quant_unit) * quant_unit;
  //   const end = note.start + note.dur;
  //   const quant_end = Math.round(end / quant_unit) * quant_unit;
  //   note.dur = quant_end - note.start;
  //   if (note.dur <= 0) note.dur = quant_unit;
  // });

  debugOutput.push('\n=== FINAL RESULTS ===');
  debugOutput.push('- PPQ: ' + ppq);
  debugOutput.push('- Tempo: ' + tempo);
  debugOutput.push('- Total notes found: ' + notes.length);
  debugOutput.push('- Active notes arrays: ' + activeNotes.length);
  
  if (notes.length > 0) {
    debugOutput.push('First few notes: ' + JSON.stringify(notes.slice(0, 3), null, 2));
  }

  // Write debug output to file
  fs.writeFileSync('debug-output.txt', debugOutput.join('\n'));
  console.log(`Extraction complete: ${notes.length} notes found. Debug output written to debug-output.txt`);

  return { ppq, tempo, notes, key_sig };
}

function findBestKey(notes, key_sig) {
  if (key_sig) {
    let sf = key_sig.sf;
    let mode = key_sig.mode;
    let major_tonic = (sf * 7 % 12 + 12) % 12;
    let tonic_pc = mode === 'major' ? major_tonic : (major_tonic + 9) % 12;
    return { tonic_pc, mode };
  } else {
    // Find key with minimal accidentals
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
  const oct = Math.floor(midi / 12) - 1; // Fix: MIDI 60 (Middle C) should be octave 4, not 5
  let best_deg = 0;
  let best_acc = 0;
  let best_dist = Infinity;

  for (let d = -14; d <= 21; d++) {
    const d_mod = ((d % 7) + 7) % 7;
    let exp_pc = (tonic_pc + scale_offsets[d_mod]) % 12;
    let acc = pc - exp_pc;
    if (acc < -6) acc += 12;
    else if (acc > 5) acc -= 12;
    if (Math.abs(acc) > 2) continue; // Avoid extreme accidentals
    const dist = Math.abs(acc);
    if (dist < best_dist || (dist === best_dist && Math.abs(d) < Math.abs(best_deg))) {
      best_dist = dist;
      best_acc = acc;
      best_deg = d;
    }
  }

  return { degree: best_deg, acc: best_acc, oct: oct };
}

function separateVoices(notes) {
  // If notes carry a 'track' property, group strictly by track index to preserve original voice separation.
  const byTrack = new Map();
  let hasTrack = false;
  for (const n of notes) {
    if (n.track !== undefined) {
      hasTrack = true;
      if (!byTrack.has(n.track)) byTrack.set(n.track, []);
      byTrack.get(n.track).push(n);
    }
  }
  if (hasTrack) {
    // Sort notes within each track by start time
    const voices = Array.from(byTrack.entries())
      .sort((a,b)=> a[0]-b[0])
      .map(([_, arr]) => arr.sort((x,y)=> x.start - y.start || x.pitch - y.pitch));
    return voices;
  }
  // Fallback to heuristic (legacy path)
  notes.sort((a, b) => a.start - b.start || b.pitch - a.pitch);
  const voices = [];
  for (const note of notes) {
    let bestVoice = null;
    let bestDist = Infinity;
    for (const voice of voices) {
      const lastNote = voice[voice.length - 1];
      if (lastNote.start + lastNote.dur <= note.start) {
        const dist = Math.abs(lastNote.pitch - note.pitch);
        if (dist < bestDist) { bestDist = dist; bestVoice = voice; }
      }
    }
    if (bestVoice) bestVoice.push(note); else voices.push([note]);
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

// Helper function to check if two motifs are retrogrades of each other
function areMotifRetrogrades(motif1, motif2) {
  if (DISABLE_RETROGRADE_AND_TIME_DILATION) return false; // feature disabled
  if (motif1.deg_rels.length !== motif2.deg_rels.length) return false;
  
  // Calculate intervals for both motifs
  const intervals1 = [];
  const intervals2 = [];
  
  for (let i = 1; i < motif1.deg_rels.length; i++) {
    intervals1.push(motif1.deg_rels[i] - motif1.deg_rels[i-1]);
  }
  
  for (let i = 1; i < motif2.deg_rels.length; i++) {
    intervals2.push(motif2.deg_rels[i] - motif2.deg_rels[i-1]);
  }
  
  // Check if intervals2 is the reverse and negation of intervals1 (retrograde inversion)
  const reversedIntervals1 = [...intervals1].reverse();
  const retrogradeInvertedIntervals1 = reversedIntervals1.map(interval => -interval);
  
  for (let i = 0; i < retrogradeInvertedIntervals1.length; i++) {
    if (retrogradeInvertedIntervals1[i] !== intervals2[i]) return false;
  }
  
  // Check that rhythm patterns match (reversed)
  const reversedDeltas = [...motif1.deltas].reverse();
  const reversedDurs = [...motif1.durs].reverse();
  const reversedVels = [...motif1.vels].reverse();
  const reversedAccs = [...motif1.accs].reverse();
  
  for (let i = 0; i < motif2.deltas.length; i++) {
    if (reversedDeltas[i] !== motif2.deltas[i]) return false;
  }
  for (let i = 0; i < motif2.durs.length; i++) {
    if (reversedDurs[i] !== motif2.durs[i]) return false;
  }
  for (let i = 0; i < motif2.vels.length; i++) {
    if (reversedVels[i] !== motif2.vels[i]) return false;
  }
  for (let i = 0; i < motif2.accs.length; i++) {
    if (reversedAccs[i] !== motif2.accs[i]) return false;
  }
  
  return true;
}

// Helper function to check if two motifs are inversions of each other (pitch inversion, same time order)
function areMotifInversions(motif1, motif2) {
  if (motif1.deg_rels.length !== motif2.deg_rels.length) return false;
  
  // Calculate intervals for both motifs
  const intervals1 = [];
  const intervals2 = [];
  
  for (let i = 1; i < motif1.deg_rels.length; i++) {
    intervals1.push(motif1.deg_rels[i] - motif1.deg_rels[i-1]);
  }
  
  for (let i = 1; i < motif2.deg_rels.length; i++) {
    intervals2.push(motif2.deg_rels[i] - motif2.deg_rels[i-1]);
  }
  
  // Check if intervals2 is the negation of intervals1 (pitch inversion, same time order)
  const invertedIntervals1 = intervals1.map(interval => -interval);
  
  for (let i = 0; i < invertedIntervals1.length; i++) {
    if (invertedIntervals1[i] !== intervals2[i]) return false;
  }
  
  // Check that rhythm patterns match (same order)
  for (let i = 0; i < motif2.deltas.length; i++) {
    if (motif1.deltas[i] !== motif2.deltas[i]) return false;
  }
  for (let i = 0; i < motif2.durs.length; i++) {
    if (motif1.durs[i] !== motif2.durs[i]) return false;
  }
  for (let i = 0; i < motif2.vels.length; i++) {
    if (motif1.vels[i] !== motif2.vels[i]) return false;
  }
  for (let i = 0; i < motif2.accs.length; i++) {
    if (motif1.accs[i] !== motif2.accs[i]) return false;
  }
  
  return true;
}

function findMotifs(encodedVoices, key, options = {}) {
  const { tonic_pc, mode } = key;
  // Make minLength configurable with a more reasonable default
  const minLength = options.minLength || 2;
  const maxLength = options.maxLength || 20;
  // Make minimum occurrences configurable 
  const minOccurrences = options.minOccurrences || 2;
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

  // Filter and sort candidates by savings, but prioritize longer motifs even more strongly
  let candidates = Array.from(patternMap.entries()).filter(([k, v]) => v.length >= minOccurrences);
  candidates.sort((a, b) => {
    const lenA = getLenFromKey(a[0]);
    const lenB = getLenFromKey(b[0]);
    const saveA = lenA * (a[1].length - 1);
    const saveB = lenB * (b[1].length - 1);
    
    // First priority: longer motifs (stronger bias towards length)
    if (lenA !== lenB) {
      return lenB - lenA;  // Longer motifs first
    }
    
    // Second priority: higher total savings
    return saveB - saveA;
  });

  const motifs = [];
  const motifMap = new Map();
  const selectedOccurrences = new Set(); // Track which positions are already used
  let id = 0;
  
  for (const [key_str, occs] of candidates) {
    // Filter out occurrences that overlap with already selected longer motifs
    const nonOverlappingOccs = occs.filter(occ => {
      const motifLength = getLenFromKey(key_str);
      // Check if any position in this motif is already used
      for (let i = 0; i < motifLength; i++) {
        const posKey = `${occ.voice}-${occ.start + i}`;
        if (selectedOccurrences.has(posKey)) {
          return false; // This occurrence overlaps with a selected longer motif
        }
      }
      return true;
    });
    
    // Only proceed if we still have enough non-overlapping occurrences
    if (nonOverlappingOccs.length >= minOccurrences) {
      // Mark all positions in these occurrences as used
      const motifLength = getLenFromKey(key_str);
      for (const occ of nonOverlappingOccs) {
        for (let i = 0; i < motifLength; i++) {
          selectedOccurrences.add(`${occ.voice}-${occ.start + i}`);
        }
      }
      
      // Create the motif
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
      motifs.push({ deg_rels, accs, deltas, durs, vels });
      
      // Update the pattern map to only include non-overlapping occurrences
      patternMap.set(key_str, nonOverlappingOccs);
      motifMap.set(key_str, id++);
    }
  }

  // Detect and consolidate retrogrades
  const keyToMotifId = new Map(); // Maps pattern key to motif ID
  for (const [key_str, motifId] of motifMap.entries()) {
    keyToMotifId.set(key_str, motifId);
  }
  
  const transformationPairs = [];
  const toRemove = new Set();
  const keyTransformationMap = new Map(); // Maps pattern key to transformation type
  
  // Initialize all keys as no transformation
  for (const key_str of motifMap.keys()) {
    keyTransformationMap.set(key_str, 'none');
  }
  
  for (let i = 0; i < motifs.length; i++) {
    if (toRemove.has(i)) continue;
    for (let j = i + 1; j < motifs.length; j++) {
      if (toRemove.has(j)) continue;
      if (!DISABLE_RETROGRADE_AND_TIME_DILATION && areMotifRetrogrades(motifs[i], motifs[j])) {
        transformationPairs.push({ keep: i, remove: j, type: 'retrograde' });
        toRemove.add(j);
        for (const [key_str, motifId] of motifMap.entries()) {
          if (motifId === j) keyTransformationMap.set(key_str, 'retrograde');
        }
        break;
      } else if (areMotifInversions(motifs[i], motifs[j])) {
        transformationPairs.push({ keep: i, remove: j, type: 'inverted' });
        toRemove.add(j);
        for (const [key_str, motifId] of motifMap.entries()) {
          if (motifId === j) keyTransformationMap.set(key_str, 'inverted');
        }
        break;
      }
    }
  }

  // Create new consolidated motifs array and update mappings
  const consolidatedMotifs = [];
  const oldToNewId = new Map();
  let newId = 0;

  for (let i = 0; i < motifs.length; i++) {
    if (!toRemove.has(i)) {
      consolidatedMotifs.push(motifs[i]);
      oldToNewId.set(i, newId);
      
      // Check if this motif had a transformation pair that was removed
      const transformationPair = transformationPairs.find(pair => pair.keep === i);
      if (transformationPair) {
        oldToNewId.set(transformationPair.remove, newId);
      }
      
      newId++;
    }
  }

  // Update motifMap with new IDs
  const newMotifMap = new Map();
  for (const [key_str, oldId] of motifMap.entries()) {
    if (oldToNewId.has(oldId)) {
      newMotifMap.set(key_str, oldToNewId.get(oldId));
    }
  }

  return { motifs: consolidatedMotifs, motifMap: newMotifMap, patternMap, keyTransformationMap };
}

function applyMotifs(encodedVoices, motifs, motifMap, patternMap, keyTransformationMap) {
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
        const transformation = keyTransformationMap.get(key) || 'none';
        const replacement = {
          start: occ.start,
          len: len,
          motif_id: mid,
          base_pitch: occ.base_pitch,
          delta: encodedVoices[occ.voice][occ.start].delta
        };
        if (transformation === 'retrograde' && !DISABLE_RETROGRADE_AND_TIME_DILATION) {
          replacement.retrograde = true;
        } else if (transformation === 'inverted') {
          replacement.inverted = true;
        }
        replacements[occ.voice].push(replacement);
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
      const motifReplacement = {
        delta: repl.delta,
        motif_id: repl.motif_id,
        base_pitch: repl.base_pitch
      };
      if (repl.retrograde && !DISABLE_RETROGRADE_AND_TIME_DILATION) {
        motifReplacement.retrograde = true;
      }
      if (repl.inverted) {
        motifReplacement.inverted = true;
      }
      newVoice.push(motifReplacement);
      pos = repl.start + repl.len;
    }
    for (let j = pos; j < encodedVoices[v].length; j++) {
      newVoice.push(encodedVoices[v][j]);
    }
    newEncodedVoices.push(newVoice);
  }
  return newEncodedVoices;
}

function compressMidiToJson(inputMidi, outputJson, options = {}) {
  const midi = parseMidi(inputMidi);
  const { ppq, tempo, notes, key_sig } = extractTempoAndPPQAndNotes(midi);
  const key = findBestKey(notes, key_sig);
  const tonic_name = tonal.Note.pitchClass(tonal.Note.fromMidi(key.tonic_pc + 60, true));
  const voices = separateVoices(notes);
  let encodedVoices = encodeVoices(voices);
  let newMotifs = [];
  // Skip motif detection entirely if forced motifless
  if (!options.forceMotifless) {
    const motifOptions = {
      minLength: 2,     // Allow 2-note motifs
      maxLength: 20,    // Keep existing max
      minOccurrences: 2 // Keep existing minimum repetition requirement
    };
    const { motifs, motifMap, patternMap, keyTransformationMap } = findMotifs(encodedVoices, key, motifOptions);
    encodedVoices = applyMotifs(encodedVoices, motifs, motifMap, patternMap, keyTransformationMap);
    // Remove unused motifs
    const used = new Set();
    for (const voice of encodedVoices) {
      for (const item of voice) {
        if (item.motif_id !== undefined) {
          used.add(item.motif_id);
        }
      }
    }
    const sortedUsed = Array.from(used).sort((a, b) => a - b);
    newMotifs = sortedUsed.map(oldId => motifs[oldId]);
    const newMap = new Map();
    sortedUsed.forEach((oldId, index) => newMap.set(oldId, index));
    for (const voice of encodedVoices) {
      for (const item of voice) {
        if (item.motif_id !== undefined) {
          item.motif_id = newMap.get(item.motif_id);
        }
      }
    }
  }

  const compressed = { ppq, tempo, key: { tonic: tonic_name, mode: key.mode }, voices: encodedVoices };
  if (!options.forceMotifless && newMotifs.length) {
    compressed.motifs = newMotifs;
  }
  
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
        // Handle motif
        if (item.delta !== undefined) {
          currentTick += item.delta;
        } else if (item.start !== undefined) {
          currentTick = item.start;
        }
        const motif = motifs[item.motif_id];
        if (motif) {
          // Handle motif retrograde if specified
          let deg_rels = motif.deg_rels;
          let accs = motif.accs;
          let deltas = motif.deltas;
          let durs = motif.durs;
          let vels = motif.vels;
          
          if (item.retrograde === true && !DISABLE_RETROGRADE_AND_TIME_DILATION) {
            deg_rels = [...motif.deg_rels].reverse().map(deg => -deg);
            accs = [...motif.accs].reverse();
            deltas = [...motif.deltas].reverse();
            durs = [...motif.durs].reverse();
            vels = [...motif.vels].reverse();
          } else if (item.inverted === true) {
            // Apply inversion to the motif by negating the degree relationships (same time order)
            deg_rels = motif.deg_rels.map(deg => -deg);
            // Other attributes remain in the same order for pure inversion
            accs = [...motif.accs];
            deltas = [...motif.deltas];
            durs = [...motif.durs];
            vels = [...motif.vels];
          }
          
          // Handle both pitch as MIDI number and as note name
          let base_midi;
          const pitchValue = item.base_pitch || item.pitch;
          if (typeof pitchValue === 'number') {
            base_midi = pitchValue;
          } else {
            base_midi = tonal.Note.midi(pitchValue);
          }
          const base_diatonic = pitchToDiatonic(base_midi, tonic_pc, mode);
          let subTick = currentTick;
          for (let j = 0; j < deg_rels.length; j++) {
            const total_deg = base_diatonic.degree + deg_rels[j];
            const deg_mod = ((total_deg % 7) + 7) % 7;
            const oct_add = Math.trunc(total_deg / 7); // Fix: Use trunc instead of floor for correct octave calculation
            let exp_pc = (tonic_pc + scale_offsets[deg_mod]) % 12;
            let pc = (exp_pc + accs[j]) % 12;
            if (pc < 0) pc += 12;
            const oct = base_diatonic.oct + oct_add;
            const p = pc + oct * 12;
            notes.push({
              start: subTick,
              dur: durs[j],
              pitch: p,
              vel: vels[j]
            });
            subTick += durs[j];
            if (j < deg_rels.length - 1) {
              subTick += deltas[j];
            }
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

// Expand motifs into plain note voices (regular_note style)
function expandMotifsToRegularVoices(compressed) {
  const { ppq, motifs = [], voices, key = { tonic: 'C', mode: 'major' } } = compressed;
  const tonic_pc = tonal.Note.midi(key.tonic + '4') % 12;
  const mode = key.mode;
  const scale_offsets = mode === 'major' ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 11];
  const expandedVoices = [];
  // Per voice expansion retaining ordering
  for (const voice of voices) {
    const expandedNotes = [];
    let currentTick = 0;
    for (const item of voice) {
      if (item.motif_id !== undefined && motifs[item.motif_id]) {
        // Advance by delta first
        currentTick += (item.delta || 0);
        const motif = motifs[item.motif_id];
        let deg_rels = motif.deg_rels;
        let accs = motif.accs;
        let deltas = motif.deltas;
        let durs = motif.durs;
        let vels = motif.vels;
        if (item.retrograde === true && !DISABLE_RETROGRADE_AND_TIME_DILATION) {
          deg_rels = [...deg_rels].reverse().map(d => -d);
          accs = [...accs].reverse();
          deltas = [...deltas].reverse();
          durs = [...durs].reverse();
          vels = [...vels].reverse();
        } else if (item.inverted === true) {
          deg_rels = deg_rels.map(d => -d);
        }
        // Determine base midi
        const pitchValue = item.base_pitch || item.pitch;
        const base_midi = typeof pitchValue === 'number' ? pitchValue : tonal.Note.midi(pitchValue);
        const base_diatonic = pitchToDiatonic(base_midi, tonic_pc, mode);
        let subTick = currentTick;
        for (let j = 0; j < deg_rels.length; j++) {
          const total_deg = base_diatonic.degree + deg_rels[j];
          const deg_mod = ((total_deg % 7) + 7) % 7;
          const oct_add = Math.trunc(total_deg / 7);
          let exp_pc = (tonic_pc + scale_offsets[deg_mod]) % 12;
          let pc = (exp_pc + accs[j]) % 12;
          if (pc < 0) pc += 12;
          const oct = base_diatonic.oct + oct_add;
          const midiPitch = pc + oct * 12;
          expandedNotes.push({ start: subTick, dur: durs[j], pitch: midiPitch, vel: vels[j] });
          subTick += durs[j];
          if (j < deg_rels.length - 1) subTick += deltas[j];
        }
        currentTick = subTick; // Move to end of motif
      } else {
        currentTick += item.delta;
        const midiPitch = tonal.Note.midi(item.pitch);
        if (midiPitch != null) {
          expandedNotes.push({ start: currentTick, dur: item.dur, pitch: midiPitch, vel: item.vel });
        }
        currentTick += item.dur;
      }
    }
    // Convert expanded notes back to regular_note JSON
    expandedNotes.sort((a,b)=> a.start - b.start || a.pitch - b.pitch);
    const regularVoice = [];
    let prevEnd = 0;
    for (const n of expandedNotes) {
      const delta = n.start - prevEnd;
      regularVoice.push({
        type: 'regular_note',
        delta,
        pitch: tonal.Note.fromMidi(n.pitch, true),
        dur: n.dur,
        vel: n.vel
      });
      prevEnd = n.start + n.dur;
    }
    expandedVoices.push(regularVoice);
  }
  return expandedVoices;
}

// Expanded variant that annotates each produced note with motif / transformation metadata.
function expandMotifsToAnnotatedVoices(compressed) {
  const { motifs = [], voices, key = { tonic: 'C', mode: 'major' } } = compressed;
  const tonic_pc = tonal.Note.midi(key.tonic + '4') % 12;
  const mode = key.mode;
  const scale_offsets = mode === 'major' ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 11];
  const annotatedVoices = [];
  for (const voice of voices) {
    const expanded = [];
    let currentTick = 0;
    for (const item of voice) {
      if (item.motif_id !== undefined && motifs[item.motif_id]) {
        currentTick += (item.delta || 0);
        const motif = motifs[item.motif_id];
        let deg_rels = motif.deg_rels;
        let accs = motif.accs;
        let deltas = motif.deltas;
        let durs = motif.durs;
        let vels = motif.vels;
        let transformation = 'none';
        if (item.retrograde === true && !DISABLE_RETROGRADE_AND_TIME_DILATION) {
          transformation = 'retrograde';
          deg_rels = [...deg_rels].reverse().map(d => -d);
          accs = [...accs].reverse();
          deltas = [...deltas].reverse();
          durs = [...durs].reverse();
          vels = [...vels].reverse();
        } else if (item.inverted === true) {
          transformation = 'inverted';
          deg_rels = deg_rels.map(d => -d);
        }
        const pitchValue = item.base_pitch || item.pitch;
        const base_midi = typeof pitchValue === 'number' ? pitchValue : tonal.Note.midi(pitchValue);
        const base_diatonic = pitchToDiatonic(base_midi, tonic_pc, mode);
        let subTick = currentTick;
        for (let j = 0; j < deg_rels.length; j++) {
          const total_deg = base_diatonic.degree + deg_rels[j];
          const deg_mod = ((total_deg % 7) + 7) % 7;
          const oct_add = Math.trunc(total_deg / 7);
          let exp_pc = (tonic_pc + scale_offsets[deg_mod]) % 12;
            let pc = (exp_pc + accs[j]) % 12; if (pc < 0) pc += 12;
          const oct = base_diatonic.oct + oct_add;
          const midiPitch = pc + oct * 12;
          expanded.push({
            start: subTick,
            dur: durs[j],
            pitch: midiPitch,
            vel: vels[j],
            motif_id: item.motif_id,
            motif_note_index: j,
            transformation
          });
          subTick += durs[j];
          if (j < deg_rels.length - 1) subTick += deltas[j];
        }
        currentTick = subTick;
      } else {
        currentTick += item.delta;
        const midiPitch = tonal.Note.midi(item.pitch);
        if (midiPitch != null) {
          expanded.push({ start: currentTick, dur: item.dur, pitch: midiPitch, vel: item.vel, motif_id: null, motif_note_index: null, transformation: 'none' });
        }
        currentTick += item.dur;
      }
    }
    annotatedVoices.push(expanded.sort((a,b)=> a.start - b.start || a.pitch - b.pitch));
  }
  return annotatedVoices;
}

function decompressJsonToMidi(inputJson, outputMidi, options = {}) {
  const compressed = JSON.parse(fs.readFileSync(inputJson, 'utf8'));
  const { ppq, tempo, motifs = [], voices, key = { tonic: 'C', mode: 'major' } } = compressed;

  // Expand each voice separately so we can write one MIDI track per voice to preserve separation.
  const expandedVoices = expandMotifsToRegularVoices(compressed);

  // Optional motifless JSON export during decompression (now reuse expandedVoices directly)
  if (options.exportMotiflessJson) {
    const motiflessJson = { ppq, tempo, key, voices: expandedVoices };
    const exportPath = typeof options.exportMotiflessJson === 'string'
      ? options.exportMotiflessJson
      : outputMidi.replace(/\.[^.]+$/, '-motifless.json');
    const outDir = path.dirname(exportPath);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(exportPath, JSON.stringify(motiflessJson, null, 2));
    console.log(`Motifless JSON exported to: ${exportPath}`);
  }

  // Build multi-track MIDI (one track per voice) to minimize re-separation drift.
  const tracks = [];
  expandedVoices.forEach((voice, vIndex) => {
    const track = new MidiWriter.Track();
    track.addTrackName(`Voice ${vIndex}`);
    if (vIndex === 0) {
      // Put tempo in first track only
      track.addEvent(new MidiWriter.TempoEvent({ bpm: tempo }));
    }
    // Reconstruct absolute timing from deltas to avoid relying on any implicit state.
    let absoluteTick = 0;
    for (const note of voice) {
      // Safety: ensure required fields
      const delta = typeof note.delta === 'number' ? note.delta : 0;
      const dur = typeof note.dur === 'number' ? note.dur : 0;
      absoluteTick += delta;
      // Preserve original pitch spelling if it was already a string; fall back to MIDI number if necessary.
      let pitchToken;
      if (typeof note.pitch === 'string') {
        // Convert note.pitch string to midi to ensure writer acceptance, but keep original spelling if needed later.
        const midiVal = tonal.Note.midi(note.pitch);
        pitchToken = midiVal != null ? midiVal : note.pitch;
      } else if (typeof note.pitch === 'number') {
        pitchToken = note.pitch;
      } else {
        continue; // skip malformed note
      }
      track.addEvent(new MidiWriter.NoteEvent({
        pitch: [pitchToken],
        duration: 'T' + dur,
        velocity: note.vel,
        startTick: absoluteTick
      }));
      absoluteTick += dur;
    }
    tracks.push(track);
  });

  // MidiWriter still assumes 128 PPQ internally; to preserve raw timing we leave values literal.
  // (Future improvement: swap to a library supporting custom PPQ or write a minimal SMF encoder.)
  const writer = new MidiWriter.Writer(tracks);
  const outputDir = path.dirname(outputMidi);
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputMidi, Buffer.from(writer.buildFile()));
  console.log('Multi-track MIDI file written successfully');
}

function main() {
  try {
    const args = process.argv.slice(2);
    if (args.length < 3) {
      console.log('Usage: node EncodeDecode.js compress <input.midi> <output.json> [--force-motifless]');
      console.log('   or: node EncodeDecode.js decompress <input.json> <output.midi> [--export-motifless-json [path]]');
      console.log('\nOptions:');
      console.log('  --force-motifless           Skip motif detection and store only regular notes');
      console.log('  --export-motifless-json     While decompressing, emit an expanded motifless JSON (optional path)');
      return;
    }

    const command = args[0];
    const input = args[1];
    const output = args[2];
    const cliOptions = { forceMotifless: false, exportMotiflessJson: false };
    for (let i = 3; i < args.length; i++) {
      const arg = args[i];
      if (arg === '--force-motifless') {
        cliOptions.forceMotifless = true;
      } else if (arg === '--export-motifless-json') {
        // Optional custom path
        if (i + 1 < args.length && !args[i+1].startsWith('--')) {
          cliOptions.exportMotiflessJson = args[i+1];
          i++;
        } else {
          cliOptions.exportMotiflessJson = true; // use default naming
        }
      }
    }

    console.log(`Command: ${command}, Input: ${input}, Output: ${output}`);

    if (command === 'compress') {
      compressMidiToJson(input, output, { forceMotifless: cliOptions.forceMotifless });
      console.log('Compression completed successfully');
    } else if (command === 'decompress') {
      decompressJsonToMidi(input, output, { exportMotiflessJson: cliOptions.exportMotiflessJson });
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
module.exports = {
  compressMidiToJson,
  decompressJsonToMidi,
  decodeVoices,
  expandMotifsToRegularVoices,
  expandMotifsToAnnotatedVoices
};

if (require.main === module) {
  main();
}