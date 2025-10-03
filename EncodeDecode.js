const fs = require('fs');
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
  const quant_unit = 120;
  notes.forEach(note => {
    note.start = Math.round(note.start / quant_unit) * quant_unit;
    const end = note.start + note.dur;
    const quant_end = Math.round(end / quant_unit) * quant_unit;
    note.dur = quant_end - note.start;
    if (note.dur <= 0) note.dur = quant_unit;
  });

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

  return { ppq, tempo, notes };
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

function findMotifs(encodedVoices) {
  const minLength = 4;
  const maxLength = 20;
  const patternMap = new Map();

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
        const base = tonal.Note.midi(subseq[0].pitch);
        const relatives = [0];
        for (let j = 1; j < len; j++) {
          relatives.push(tonal.Note.midi(subseq[j].pitch) - base);
        }
        const rhythm = [];
        for (let j = 0; j < len; j++) {
          rhythm.push(subseq[j].delta);
          rhythm.push(subseq[j].dur);
        }
        const vels = subseq.map(s => s.vel);
        const key = relatives.join(',') + '|' + rhythm.join(',') + '|' + vels.join(',');
        if (!patternMap.has(key)) {
          patternMap.set(key, []);
        }
        patternMap.get(key).push({
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
  for (const [key, occs] of candidates) {
    const parts = key.split('|');
    const rel_str = parts[0];
    const rhythm_str = parts[1];
    const vels_str = parts[2];
    const intervals = rel_str.split(',').map(Number);
    const rhythm_nums = rhythm_str.split(',').map(Number);
    const vels = vels_str.split(',').map(Number);
    const deltas = [];
    const durs = [];
    for (let k = 0; k < rhythm_nums.length; k += 2) {
      deltas.push(rhythm_nums[k]);
      durs.push(rhythm_nums[k + 1]);
    }
    motifs.push({ intervals, deltas, durs, vels });
    motifMap.set(key, id++);
  }

  return { motifs, motifMap, patternMap: patternMap };
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
        replacements[occ.voice].push({
          start: occ.start,
          len: len,
          motif_id: mid,
          base_pitch: occ.base_pitch,
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
        base_pitch: repl.base_pitch
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

function compressMidiToJson(inputMidi, outputJson) {
  const midi = parseMidi(inputMidi);
  const { ppq, tempo, notes } = extractTempoAndPPQAndNotes(midi);
  const voices = separateVoices(notes);
  let encodedVoices = encodeVoices(voices);
  const { motifs, motifMap, patternMap } = findMotifs(encodedVoices);
  encodedVoices = applyMotifs(encodedVoices, motifs, motifMap, patternMap);
  const compressed = { ppq, tempo, motifs, voices: encodedVoices };
  fs.writeFileSync(outputJson, JSON.stringify(compressed, null, 2)); // Pretty print for editability
}

function decodeVoices(encodedVoices, ppq, motifs = []) {
  const notes = [];
  for (const voice of encodedVoices) {
    let currentTick = 0;
    for (const item of voice) {
      if (item.motif_id !== undefined) {
        // Handle motif
        currentTick += item.delta;
        const motif = motifs[item.motif_id];
        if (motif) {
          const base = tonal.Note.midi(item.base_pitch);
          let subTick = currentTick;
          for (let j = 0; j < motif.intervals.length; j++) {
            const p = base + motif.intervals[j];
            notes.push({
              start: subTick,
              dur: motif.durs[j],
              pitch: p,
              vel: motif.vels[j]
            });
            subTick += motif.durs[j];
            if (j < motif.intervals.length - 1) {
              subTick += motif.deltas[j + 1];
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
  const { ppq, tempo, motifs = [], voices } = compressed;
  const notes = decodeVoices(voices, ppq, motifs);

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
    console.log('Adding note:', note);
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

if (require.main === module) {
  main();
}