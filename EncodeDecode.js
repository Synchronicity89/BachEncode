const fs = require('fs');
const midiParser = require('midi-parser-js');
const MidiWriter = require('midi-writer-js');
const tonal = require('@tonaljs/tonal');

// Optional motif compression - only load if needed
let MotifCompressor = null;
function getMotifCompressor() {
    if (!MotifCompressor) {
        try {
            MotifCompressor = require('./MotifCompressor');
        } catch (error) {
            console.warn('MotifCompressor not available:', error.message);
            return null;
        }
    }
    return MotifCompressor;
}

// Factory function for creating compression configurations
function createCompressionConfig(options = {}) {
    return {
        useMotifCompression: options.useMotifCompression || false,
        motifOptions: {
            compressionThreshold: options.compressionThreshold || 0.5,
            minMotifMatches: options.minMotifMatches || 1,
            ...options.motifOptions
        }
    };
}

function parseMidi(filePath) {
  console.log('Reading MIDI file:', filePath);
  
  // Validate MIDI file header before parsing
  const buffer = fs.readFileSync(filePath);
  if (buffer.length < 14) {
    throw new Error('Invalid MIDI file: File corrupted or truncated - too small to contain complete MIDI header (minimum 14 bytes required)');
  }
  
  const header = buffer.toString('ascii', 0, 4);
  if (header !== 'MThd') {
    throw new Error(`Invalid MIDI file: Expected 'MThd' header, found '${header}'`);
  }
  
  // Validate header length field (should be 6 for standard MIDI)
  const headerLength = buffer.readUInt32BE(4);
  if (headerLength !== 6) {
    throw new Error(`Invalid MIDI file: Expected header length 6, found ${headerLength}`);
  }
  
  // Check if file is truncated by ensuring we have at least the header + first track header
  if (buffer.length < 14 + 8) { // MThd(4) + length(4) + data(6) + MTrk(4) + track_length(4)
    throw new Error('Invalid MIDI file: File appears to be truncated or incomplete');
  }
  
  const midiData = buffer.toString('base64');
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

  debugOutput.push('\n=== FINAL RESULTS ===');
  debugOutput.push('- PPQ: ' + ppq);
  debugOutput.push('- Tempo: ' + tempo);
  debugOutput.push('- Total notes found: ' + notes.length);
  debugOutput.push('- Active notes remaining: ' + activeNotes.size);
  
  if (notes.length > 0) {
    debugOutput.push('First few notes: ' + JSON.stringify(notes.slice(0, 3), null, 2));
  }

  // ZERO-DURATION NOTE FIX: Apply minimum duration to prevent silent notes
  const minDuration = Math.max(1, Math.round(ppq * 0.05)); // 5% of quarter note
  let zeroDurationCount = 0;
  notes.forEach(note => {
    if (note.dur === 0) {
      note.dur = minDuration;
      zeroDurationCount++;
    }
  });
  
  if (zeroDurationCount > 0) {
    debugOutput.push(`Fixed ${zeroDurationCount} zero-duration notes (applied minimum duration: ${minDuration} ticks)`);
    console.log(`Fixed ${zeroDurationCount} zero-duration notes with minimum duration: ${minDuration} ticks`);
  }

  // CHORD HANDLING FIX: Sort notes deterministically 
  // Primary sort: by start time (earliest first)
  // Secondary sort: by pitch (lowest first) for simultaneous notes
  // This ensures consistent ordering across compression/decompression cycles
  notes.sort((a, b) => {
    if (a.start !== b.start) {
      return a.start - b.start; // Sort by start time first
    }
    return a.pitch - b.pitch; // For simultaneous notes, sort by pitch (lowest first)
  });
  
  debugOutput.push('Notes sorted by time then pitch for consistent chord handling');

  // Write debug output to file
  fs.writeFileSync('debug-output.txt', debugOutput.join('\n'));
  console.log(`Extraction complete: ${notes.length} notes found. Debug output written to debug-output.txt`);

  return { ppq, tempo, notes };
}

function separateVoices(notes) {
  // Notes should already be sorted by the extractTempoAndPPQAndNotes function,
  // but ensure consistent sorting: by start time, then by pitch (lowest first)
  notes.sort((a, b) => a.start - b.start || a.pitch - b.pitch);
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
        vel: note.vel,
      });
      prevEnd = note.start + note.dur;
    }
    return encoded;
  });
}

function compressMidiToJson(inputMidi, outputJson, options = {}) {
  const midi = parseMidi(inputMidi);
  const { ppq, tempo, notes } = extractTempoAndPPQAndNotes(midi);
  const voices = separateVoices(notes);
  const encodedVoices = encodeVoices(voices);
  let compressed = { ppq, tempo, voices: encodedVoices };
  
  let compressionResults = {
    originalNoteCount: notes.length,
    compressionRatio: 1.0,
    motifCount: 0,
    useMotifs: false
  };
  
  // Apply motif compression if enabled
  if (options.useMotifCompression || options.useMotifs) {
    console.log('Applying motif compression...');
    const MotifCompressorClass = getMotifCompressor();
    if (MotifCompressorClass) {
      const motifCompressor = new MotifCompressorClass();
      // Apply custom configuration if provided
      if (options.motifOptions) {
        Object.assign(motifCompressor, options.motifOptions);
      }
      compressed = motifCompressor.compress(compressed);
      
      // Extract compression metrics from the compressed data
      if (compressed.motifCompression && compressed.motifCompression.compressionStats) {
        compressionResults.compressionRatio = compressed.motifCompression.compressionStats.compressionRatio;
        compressionResults.motifCount = compressed.motifCompression.motifLibrary ? compressed.motifCompression.motifLibrary.length : 0;
        compressionResults.useMotifs = true;
      }
    } else {
      console.warn('Motif compression requested but MotifCompressor not available');
    }
  }
  
  fs.writeFileSync(outputJson, JSON.stringify(compressed, null, 2)); // Pretty print for editability
  return compressionResults;
}

function decodeVoices(encodedVoices, ppq) {
  const notes = [];
  for (const voice of encodedVoices) {
    let currentTick = 0;
    for (const item of voice) {
      currentTick += item.delta;
      const pitchNum = tonal.Note.midi(item.pitch);
      if (pitchNum !== null) {
        notes.push({
          start: currentTick,
          dur: item.dur,
          pitch: pitchNum,
          vel: item.vel,
        });
      }
      currentTick += item.dur;
    }
  }
  return notes;
}

function decompressJsonToMidi(inputJson, outputMidi, options = {}) {
  let compressed = JSON.parse(fs.readFileSync(inputJson, 'utf8'));
  
  // Validate JSON schema before processing
  if (typeof compressed.tempo !== 'number' || compressed.tempo <= 0) {
    throw new Error(`Invalid JSON: tempo must be a positive number, got ${typeof compressed.tempo}: ${compressed.tempo}`);
  }
  if (typeof compressed.ppq !== 'number' || compressed.ppq <= 0) {
    throw new Error(`Invalid JSON: ppq must be a positive number, got ${typeof compressed.ppq}: ${compressed.ppq}`);
  }
  if (!Array.isArray(compressed.voices)) {
    throw new Error(`Invalid JSON: voices must be an array, got ${typeof compressed.voices}: ${compressed.voices}`);
  }
  
  // Apply motif decompression if needed
  if (compressed.motifCompression && compressed.motifCompression.enabled) {
    console.log('Applying motif decompression...');
    const MotifCompressorClass = getMotifCompressor();
    if (MotifCompressorClass) {
      const motifCompressor = new MotifCompressorClass();
      compressed = motifCompressor.decompress(compressed);
    } else {
      console.warn('Motif compression detected but MotifCompressor not available');
    }
  }
  
  const { ppq, tempo } = compressed;
  const notes = decodeVoices(compressed.voices, ppq);

  // MidiWriter.js uses default PPQ of 128, so we need to scale our timing
  const defaultPPQ = 128;
  const scaleFactor = defaultPPQ / ppq;
  
  // Scale note timing to match MidiWriter's expected PPQ
  const scaledNotes = notes.map(note => ({
    ...note,
    start: Math.round(note.start * scaleFactor),
    dur: Math.round(note.dur * scaleFactor)
  }));

  const track = new MidiWriter.Track();
  // Add tempo event using BPM directly (not microseconds per beat)
  track.addEvent(
    new MidiWriter.TempoEvent({
      bpm: tempo
    })
  );

  for (const note of scaledNotes) {
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
}

function main() {
  try {
    const args = process.argv.slice(2);
    if (args.length < 3) {
      console.log('Usage: node program.js compress input.midi output.json [--motif]');
      console.log('Or: node program.js decompress input.json output.midi');
      console.log('Options:');
      console.log('  --motif    Enable motif-based compression (experimental)');
      return;
    }

    const command = args[0];
    const input = args[1];
    const output = args[2];
    
    // Parse options
    const options = {};
    for (let i = 3; i < args.length; i++) {
      if (args[i] === '--motif') {
        options.useMotifCompression = true;
      }
    }

    console.log(`Command: ${command}, Input: ${input}, Output: ${output}`);
    if (options.useMotifCompression) {
      console.log('Motif compression enabled');
    }

    if (command === 'compress') {
      compressMidiToJson(input, output, options);
      console.log('Compression completed successfully');
    } else if (command === 'decompress') {
      decompressJsonToMidi(input, output, options);
      console.log('Decompression completed successfully');
    } else {
      console.log('Unknown command');
    }
  } catch (error) {
    console.error('Error occurred:', error.message);
    console.error('Stack trace:', error.stack);
    debugger; // This will break in the debugger when an error occurs
    process.exitCode = 1;
  }
}

// Export functions for use as a module
module.exports = {
  compressMidiToJson,
  decompressJsonToMidi,
  createCompressionConfig,
  parseMidi,
  extractTempoAndPPQAndNotes,
  separateVoices,
  encodeVoices,
  decodeVoices
};

if (require.main === module) {
  main();
}
