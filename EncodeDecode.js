const fs = require('fs');
const path = require('path');
const midiParser = require('midi-parser-js');
const MidiWriter = require('midi-writer-js');
const tonal = require('@tonaljs/tonal');

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
  const activeNotes = new Map();

  // Collect metas and notes from all tracks
  debugOutput.push('MIDI tracks: ' + (midi.track ? midi.track.length : 'No tracks found'));
  debugOutput.push('Available properties: ' + Object.keys(midi).join(', '));
  
  const tracks = midi.track || midi.tracks || [];
  debugOutput.push('Using tracks array length: ' + tracks.length);
  console.log('Processing', tracks.length, 'tracks');
  
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
          notes.push(note);
          activeNotes.delete(noteNumber);
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
  debugOutput.push('- Active notes remaining: ' + activeNotes.size);
  
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
  const oct = Math.floor(midi / 12);
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

// Helper function to check if two motifs are retrogrades of each other
function areMotifRetrogrades(motif1, motif2) {
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
    motifs.push({ deg_rels, accs, deltas, durs, vels });
    motifMap.set(key_str, id++);
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
      
      if (areMotifRetrogrades(motifs[i], motifs[j])) {
        // Found a retrograde pair - keep the first one, remove the second
        transformationPairs.push({ keep: i, remove: j, type: 'retrograde' });
        toRemove.add(j);
        
        // Find the keys that map to the removed motif and mark them as retrograde
        for (const [key_str, motifId] of motifMap.entries()) {
          if (motifId === j) {
            keyTransformationMap.set(key_str, 'retrograde');
          }
        }
        break; // Each motif should only have one transformation
      } else if (areMotifInversions(motifs[i], motifs[j])) {
        // Found an inversion pair - keep the first one, remove the second
        transformationPairs.push({ keep: i, remove: j, type: 'inverted' });
        toRemove.add(j);
        
        // Find the keys that map to the removed motif and mark them as inverted
        for (const [key_str, motifId] of motifMap.entries()) {
          if (motifId === j) {
            keyTransformationMap.set(key_str, 'inverted');
          }
        }
        break; // Each motif should only have one transformation
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
        if (transformation === 'retrograde') {
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
      if (repl.retrograde) {
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

function compressMidiToJson(inputMidi, outputJson) {
  const midi = parseMidi(inputMidi);
  const { ppq, tempo, notes, key_sig } = extractTempoAndPPQAndNotes(midi);
  const key = findBestKey(notes, key_sig);
  const tonic_name = tonal.Note.pitchClass(tonal.Note.fromMidi(key.tonic_pc + 60, true));
  const voices = separateVoices(notes);
  let encodedVoices = encodeVoices(voices);
  const { motifs, motifMap, patternMap, keyTransformationMap } = findMotifs(encodedVoices, key);
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
  const newMotifs = sortedUsed.map(oldId => motifs[oldId]);
  const newMap = new Map();
  sortedUsed.forEach((oldId, index) => {
    newMap.set(oldId, index);
  });
  for (const voice of encodedVoices) {
    for (const item of voice) {
      if (item.motif_id !== undefined) {
        item.motif_id = newMap.get(item.motif_id);
      }
    }
  }

  const compressed = { ppq, tempo, key: { tonic: tonic_name, mode: key.mode }, motifs: newMotifs, voices: encodedVoices };
  
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
          
          if (item.retrograde === true) {
            // Apply retrograde to the motif by reversing the degree relationships
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
            const oct_add = Math.floor(total_deg / 7);
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

function decompressJsonToMidi(inputJson, outputMidi) {
  const compressed = JSON.parse(fs.readFileSync(inputJson, 'utf8'));
  const { ppq, tempo, motifs = [], voices, key = { tonic: 'C', mode: 'major' } } = compressed;
  const notes = decodeVoices(voices, ppq, motifs, key);

  const track = new MidiWriter.Track();
  
  // Add track name using the correct API
  track.addTrackName('Track 0');
  
  // Add tempo event
  track.addEvent(
    new MidiWriter.TempoEvent({
      bpm: tempo
    })
  );

  for (const note of notes) {
    track.addEvent(
      new MidiWriter.NoteEvent({
        pitch: [note.pitch],
        duration: 'T' + note.dur,
        velocity: note.vel,
        startTick: note.start,
      })
    );
  }

  const write = new MidiWriter.Writer(track);
  
  // Ensure output directory exists
  const outputDir = path.dirname(outputMidi);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  fs.writeFileSync(outputMidi, Buffer.from(write.buildFile()));
  console.log('MIDI file written successfully');
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
module.exports = {
  compressMidiToJson,
  decompressJsonToMidi,
  decodeVoices
};

if (require.main === module) {
  main();
}