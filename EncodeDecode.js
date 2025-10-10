/**
 * EncodeDecode.js
 * Baseline encode/decode with motif mining and key detection.
 * Recent changes: ensure motifs always capture midi_rels + sample_base_midi at creation;
 * remove late reconstruction/backfill that caused semitone drift.
 */
const fs = require('fs');
const path = require('path');
const midiParser = require('midi-parser-js');
// Added missing tonal import (used for key/interval calculations below)
const tonal = require('@tonaljs/tonal');
// Removed dependency on midi-writer-js for precise PPQ + velocity preservation.
// Minimal SMF writer implemented below.

// Restored parseMidi (was lost during earlier patch cleanup)
function parseMidi(filePath) {
  console.log('Reading MIDI file:', filePath);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Input MIDI not found: ${filePath} (cwd=${process.cwd()})`);
  }
  const midiData = fs.readFileSync(filePath, 'base64');
  const parsed = midiParser.parse(midiData);
  return parsed;
}
function extractTempoAndPPQAndNotes(midi) {
  const debugOutput = [];
  debugOutput.push('=== MIDI PARSING DEBUG ===');
  debugOutput.push('MIDI object structure: ' + JSON.stringify(midi, null, 2));
  debugOutput.push('MIDI keys: ' + Object.keys(midi).join(', '));

  let keyOverride = null;
  // Defaults
  let ppq = 480;
  if (midi.header && midi.header.ticksPerBeat) ppq = midi.header.ticksPerBeat; else if (midi.ticksPerBeat) ppq = midi.ticksPerBeat; else if (midi.timeDivision) ppq = midi.timeDivision;
  let tempo = 120;
  let key_sig = null;
  const notes = [];
  const perTrackNotes = [];
  const trackNames = [];
  const activeNotes = new Map();
  const recoveredVoiceSplitMetaParts = [];
  const tracks = midi.track || midi.tracks || [];
  const recovered = [];
  for (let trackIndex=0; trackIndex<tracks.length; trackIndex++) {
    const track = tracks[trackIndex];
    let currentTick = 0;
    const events = track.event || track.events || [];
    const maxEventsToLog = Math.min(events.length,5);
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
            // Sanitize sf: valid MIDI range is -7..7. If corrupted (e.g. widened 0xFD00 -> 64768), attempt recovery.
            function sanitizeSf(raw) {
              if (raw >= -7 && raw <= 7) return raw;
              // If high byte carries the signed value (e.g., 0xFD00 = -3 << 8)
              const high = (raw >> 8) & 0xFF;
                // Detect pattern where low byte is 0 and high byte is signed candidate
              if ((raw & 0xFF) === 0 && high !== 0) {
                let candidate = high > 127 ? high - 256 : high;
                if (candidate >= -7 && candidate <= 7) return candidate;
              }
              // If lower byte holds candidate but raw exceeded range through sign extension / packing
              const low = raw & 0xFF;
              let lowSigned = low > 127 ? low - 256 : low;
              if (lowSigned >= -7 && lowSigned <= 7) return lowSigned;
              // Fallback: clamp extreme values into range while preserving sign tendency
              if (raw < 0) return -7; if (raw > 0) return 7; return 0;
            }
            const sanitized = sanitizeSf(sf);
            if (sanitized !== sf) {
              console.log(`[KeySig] Sanitized corrupted sf ${sf} -> ${sanitized}`);
              sf = sanitized;
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
          recoveredVoiceSplitMetaParts.push({ order: recoveredVoiceSplitMetaParts.length, data: txt.slice(7) });
        }
        if (txt && txt.startsWith('KOVERRIDE:')) {
          const parts = txt.split(':');
          if (parts.length >= 3) {
            keyOverride = { tonic: parts[1], mode: parts[2] };
          }
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
    if (events.length > maxEventsToLog) debugOutput.push(`... and ${events.length - maxEventsToLog} more events`);
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
  if (recoveredVoiceSplitMetaParts.length) {
    try {
      const b64 = recoveredVoiceSplitMetaParts.sort((a,b)=> a.order - b.order).map(p=>p.data).join('');
      recoveredVoiceSplitMeta = JSON.parse(Buffer.from(b64,'base64').toString('utf8'));
    } catch(e) { console.warn('[VSPLIT] Failed to parse embedded voiceSplitMeta:', e.message); }
  }
  return { ppq, tempo, notes, key_sig, perTrackNotes, trackNames, recoveredVoiceSplitMeta, keyOverride };
}

function findBestKey(notes, key_sig) {
  // If explicit key signature meta is present, retain but still validate if ambiguous
  if (key_sig) {
    let sf = key_sig.sf; let mode = key_sig.mode === 1 || key_sig.mode === 'minor' ? 'minor' : 'major';
    const major_tonic = ((sf * 7) % 12 + 12) % 12; // circle of fifths mapping
    const tonic_pc = mode === 'major' ? major_tonic : (major_tonic + 9) % 12; // minor relative (down 3 semitones)
    return { tonic_pc, mode };
  }
  if (!notes || notes.length === 0) return { tonic_pc: 0, mode: 'major' };

  // Build pitch-class histogram
  const pcCounts = new Array(12).fill(0);
  for (const n of notes) pcCounts[n.pitch % 12]++;

  // Cadence weighting: emphasize first N and last N strong notes
  const STRONG_WINDOW = Math.min(16, Math.floor(notes.length / 4));
  const firstWindow = notes.slice(0, STRONG_WINDOW).map(n => n.pitch % 12);
  const lastWindow = notes.slice(-STRONG_WINDOW).map(n => n.pitch % 12);
  const cadenceCounts = new Array(12).fill(0);
  for (const pc of firstWindow) cadenceCounts[pc] += 1.5; // slightly heavier start
  for (const pc of lastWindow) cadenceCounts[pc] += 2.0; // heavier end cadence

  // Accidental direction heuristic: count raw sharps vs flats based on nearest natural mapping around C major
  // (Simplified: compute diatonic fits for C major to detect tendency toward sharps or flats)
  let sharpBias = 0, flatBias = 0;
  for (const n of notes) {
    const pc = n.pitch % 12;
    // crude mapping: if closer to a sharp name vs flat name
    const flatPreferred = [1,3,6,8,10]; // pcs with common flat enharmonics
    if (flatPreferred.includes(pc)) flatBias++; else sharpBias++;
  }
  const biasScore = flatBias - sharpBias; // positive -> favor flat keys

  const MODES = ['major','minor'];
  let best = null;
  for (let tonic_pc = 0; tonic_pc < 12; tonic_pc++) {
    for (const mode of MODES) {
      // Compute diatonic accidentals & score
      let accPenalty = 0;
      let coverage = 0; // sum of counts for scale tones
      const scale_offsets = mode === 'major' ? [0,2,4,5,7,9,11] : [0,2,3,5,7,8,11];
      for (let degree = 0; degree < 7; degree++) {
        const pc = (tonic_pc + scale_offsets[degree]) % 12;
        const cnt = pcCounts[pc];
        coverage += cnt;
      }
      // Accidentals: pass through notes to compute needed acc for each actual pitch relative to candidate
      for (const n of notes) {
        const d = pitchToDiatonic(n.pitch, tonic_pc, mode);
        accPenalty += Math.abs(d.acc);
      }
      // Cadence boost if tonic appears in cadence windows or dominant-tonic pattern strong at end
      const tonicCountCad = cadenceCounts[tonic_pc];
      const dominant_pc = (tonic_pc + 7) % 12;
      const dominantCad = cadenceCounts[dominant_pc];
      const cadenceBoost = (tonicCountCad * 2) + dominantCad;
      // Flat bias: if candidate tonic is a flat-friendly pc (10=Bb, 3=Eb, 8=Ab, 1=Db/F# ambiguous) and biasScore>0 boost
      const flatFriendly = [10,3,8,1,6];
      const flatBoost = flatFriendly.includes(tonic_pc) ? Math.max(0, biasScore) * 0.5 : 0;
      // Composite score (higher better) vs penalty (lower better)
      const score = coverage + cadenceBoost + flatBoost - accPenalty * 1.2;
      if (!best || score > best.score) {
        best = { tonic_pc, mode, score };
      }
    }
  }
  return { tonic_pc: best.tonic_pc, mode: best.mode };
}

// Local key detection over sliding windows to identify intra-piece modulations.
// Returns array of segments: [{ start, end, tonic, mode }]
function detectKeyChanges(notes, ppq) {
  if (!notes || notes.length === 0) return [];
  const sorted = notes.slice().sort((a,b)=> a.start - b.start);
  const lastEnd = Math.max(...sorted.map(n => n.start + n.dur));
  const measureTicks = ppq * 4; // Assume 4/4 in absence of time signature parsing.
  const WINDOW_MEASURES = 2; // 2-measure windows
  const windowSize = measureTicks * WINDOW_MEASURES;
  const stepSize = windowSize / 2; // 50% overlap
  const MIN_NOTES_PER_WINDOW = 6; // skip sparse windows

  // Internal scorer (copy of findBestKey logic without key_sig short-circuit + minor leading tone bonus)
  function scoreKey(windowNotes) {
    if (!windowNotes.length) return { tonic_pc:0, mode:'major', score: -Infinity };
    const pcCounts = new Array(12).fill(0);
    for (const n of windowNotes) pcCounts[n.pitch % 12]++;
    // First/last emphasis inside window
    const STRONG_WINDOW = Math.min(8, Math.floor(windowNotes.length / 3));
    const firstWindow = windowNotes.slice(0, STRONG_WINDOW).map(n => n.pitch % 12);
    const lastWindow = windowNotes.slice(-STRONG_WINDOW).map(n => n.pitch % 12);
    const cadenceCounts = new Array(12).fill(0);
    for (const pc of firstWindow) cadenceCounts[pc] += 1.2;
    for (const pc of lastWindow) cadenceCounts[pc] += 1.8;
    let sharpBias = 0, flatBias = 0;
    const flatPreferred = [1,3,6,8,10];
    for (const n of windowNotes) { const pc = n.pitch % 12; if (flatPreferred.includes(pc)) flatBias++; else sharpBias++; }
    const biasScore = flatBias - sharpBias;
    const MODES = ['major','minor'];
    let best = { tonic_pc:0, mode:'major', score:-Infinity };
    for (let tonic_pc=0; tonic_pc<12; tonic_pc++) {
      for (const mode of MODES) {
        let coverage = 0; let accPenalty = 0;
        const scale_offsets = mode === 'major' ? [0,2,4,5,7,9,11] : [0,2,3,5,7,8,11];
        for (let d=0; d<7; d++) coverage += pcCounts[(tonic_pc + scale_offsets[d]) % 12];
        for (const n of windowNotes) { const di = pitchToDiatonic(n.pitch, tonic_pc, mode); accPenalty += Math.abs(di.acc); }
        const tonicCad = cadenceCounts[tonic_pc];
        const dominantCad = cadenceCounts[(tonic_pc + 7) % 12];
        const cadenceBoost = tonicCad * 2 + dominantCad;
        const flatFriendly = [10,3,8,1,6];
        const flatBoost = flatFriendly.includes(tonic_pc) ? Math.max(0, biasScore) * 0.4 : 0;
        // Minor leading-tone bonus: if candidate is minor and raised 7th present (e.g., F# in g minor)
        let leadingToneBonus = 0;
        if (mode === 'minor') {
          // Natural minor scale 7th degree pc
          const natMinor7 = (tonic_pc + 10) % 12; // (tonic + 10) mod 12 is the subtonic
            // Leading tone would be natMinor7 + 1
          const leadingTone = (natMinor7 + 1) % 12;
          if (pcCounts[leadingTone] > 0 && pcCounts[natMinor7] > 0) leadingToneBonus = pcCounts[leadingTone] * 0.6; // evidence of mixture/harmonic minor
          else if (pcCounts[leadingTone] > 1) leadingToneBonus = pcCounts[leadingTone] * 0.4;
        }
        const score = coverage + cadenceBoost + flatBoost + leadingToneBonus - accPenalty * 1.15;
        if (score > best.score) best = { tonic_pc, mode, score };
      }
    }
    return best;
  }

  const rawSegments = [];
  for (let winStart = 0; winStart < lastEnd; winStart += stepSize) {
    const winEnd = Math.min(winStart + windowSize, lastEnd);
    const subset = sorted.filter(n => n.start < winEnd && (n.start + n.dur) > winStart);
    if (subset.length < MIN_NOTES_PER_WINDOW) continue;
    const key = scoreKey(subset);
    rawSegments.push({ start: winStart, end: winEnd, tonic_pc: key.tonic_pc, mode: key.mode });
    if (winEnd === lastEnd) break; // reached tail
  }
  if (rawSegments.length === 0) return [];
  // Merge adjacent identical key segments
  const merged = [];
  for (const seg of rawSegments) {
    const last = merged[merged.length - 1];
    if (last && last.tonic_pc === seg.tonic_pc && last.mode === seg.mode && seg.start <= last.end + stepSize/4) {
      last.end = Math.max(last.end, seg.end);
    } else {
      merged.push({ ...seg });
    }
  }
  // Prune very short segments (< 1 measure) by merging with neighbor having closer tonic distance
  const pruned = [];
  for (let i=0;i<merged.length;i++) {
    const seg = merged[i];
    if (seg.end - seg.start < measureTicks && merged.length > 1) {
      const prev = pruned[pruned.length -1];
      const next = merged[i+1];
      if (!prev) {
        // merge into next
        if (next) { next.start = Math.min(next.start, seg.start); }
      } else if (!next) {
        prev.end = Math.max(prev.end, seg.end);
      } else {
        // choose closer tonic distance
        const distPrev = Math.min((seg.tonic_pc - prev.tonic_pc + 12)%12, (prev.tonic_pc - seg.tonic_pc + 12)%12);
        const distNext = Math.min((seg.tonic_pc - next.tonic_pc + 12)%12, (next.tonic_pc - seg.tonic_pc + 12)%12);
        if (distPrev <= distNext) prev.end = Math.max(prev.end, seg.end); else next.start = Math.min(next.start, seg.start);
      }
    } else {
      pruned.push(seg);
    }
  }
  // Convert pitch classes to names (prefer flats for flat-friendly keys)
  const PC_SHARP = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const PC_FLAT  = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
  const flatFriendly = new Set([10,3,8,1,6]);
  return pruned.map(s => ({
    start: Math.round(s.start),
    end: Math.round(s.end),
    tonic: (flatFriendly.has(s.tonic_pc) ? PC_FLAT : PC_SHARP)[s.tonic_pc],
    mode: s.mode
  }));
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

// New motif mining: longest-first maximal motifs + optional contiguous sub-motif derivation
function findMotifs(encodedVoices, key, opts = {}) {
  const { tonic_pc, mode } = key;
  const MIN_LEN = typeof opts.minLen === 'number' ? opts.minLen : 4;
  const MAX_LEN = typeof opts.maxLen === 'number' ? opts.maxLen : 20;
  // Annotate each note with diatonic info (cache)
  for (const voice of encodedVoices) {
    for (const item of voice) {
      if (item.midi == null) item.midi = tonal.Note.midi(item.pitch);
      if (!item.diatonic) item.diatonic = pitchToDiatonic(item.midi, tonic_pc, mode);
    }
  }

  // Helper to build a structural key for a subsequence
  function encodeSubseq(seq) {
    if (seq.length === 0) return null;
    const base = seq[0].diatonic;
    const deg_rels = [0];
    for (let i=1;i<seq.length;i++) {
      const d = seq[i].diatonic;
      deg_rels.push((d.degree - base.degree) + 7 * (d.oct - base.oct));
    }
    const accs = seq.map(n => n.diatonic.acc);
    const rhythm = [seq[0].dur];
    for (let i=1;i<seq.length;i++) { rhythm.push(seq[i].delta, seq[i].dur); }
    const vels = seq.map(n => n.vel);
    return {
      key: deg_rels.join(',')+'|'+accs.join(',')+'|'+rhythm.join(',')+'|'+vels.join(','),
      deg_rels, accs, rhythm, vels
    };
  }

  // Collect occurrences per length per voice to enable greedy extension.
  // For each start position we attempt to extend until mismatch or MAX_LEN.
  const occurrenceBucket = new Map(); // key -> array of {voice,start}
  for (let v=0; v<encodedVoices.length; v++) {
    const voice = encodedVoices[v];
    for (let i=0;i<voice.length;i++) {
      for (let len=MIN_LEN; len<=MAX_LEN && i+len<=voice.length; len++) {
        const subseq = voice.slice(i,i+len);
        const enc = encodeSubseq(subseq);
        if (!enc) continue;
        if (!occurrenceBucket.has(enc.key)) occurrenceBucket.set(enc.key,{ meta:enc, occs:[] });
        occurrenceBucket.get(enc.key).occs.push({ voice:v, start:i });
      }
    }
  }

  // Filter to repeated patterns only
  const repeated = Array.from(occurrenceBucket.values()).filter(e => e.occs.length >= 2);

  // Sort by (length desc, total coverage savings desc)
  repeated.sort((a,b) => {
    const lenA = a.meta.deg_rels.length, lenB = b.meta.deg_rels.length;
    if (lenB !== lenA) return lenB - lenA; // prefer longer first
    const saveA = lenA * (a.occs.length - 1);
    const saveB = lenB * (b.occs.length - 1);
    return saveB - saveA;
  });

  const motifs = [];
  const motifMap = new Map();
  const coverage = encodedVoices.map(v => new Array(v.length).fill(false));

  function buildMotif(meta, sampleOcc) {
    const { deg_rels, accs, rhythm, vels } = meta;
    const durs = [];
    const deltas = [];
    durs.push(rhythm[0]);
    for (let i=1;i<rhythm.length;i+=2) { deltas.push(rhythm[i]); durs.push(rhythm[i+1]); }
    // Derive midi_rels from first occurrence
    let midi_rels = null;
    let sample_base_midi = null;
    try {
      const seq = encodedVoices[sampleOcc.voice].slice(sampleOcc.start, sampleOcc.start + deg_rels.length);
      if (seq.length === deg_rels.length) {
        const baseMidi = tonal.Note.midi(seq[0].pitch);
        if (baseMidi != null) {
          sample_base_midi = baseMidi;
          midi_rels = seq.map(n => tonal.Note.midi(n.pitch) - baseMidi);
        }
      }
    } catch(_) {}
    return { deg_rels, accs, deltas, durs, vels, midi_rels, sample_base_midi };
  }

  // Accept motifs greedily if they introduce uncovered indices for at least one full occurrence.
  for (const entry of repeated) {
    const len = entry.meta.deg_rels.length;
    // Skip shorter motifs fully contained in already accepted coverage windows (heuristic pruning)
    let anyAcceptableOcc = false;
    for (const occ of entry.occs) {
      let blocked = false;
      for (let j=0;j<len;j++) { if (coverage[occ.voice][occ.start + j]) { blocked = true; break; } }
      if (!blocked) { anyAcceptableOcc = true; break; }
    }
    if (!anyAcceptableOcc) continue;
    const motif = buildMotif(entry.meta, entry.occs[0]);
    const motifId = motifs.length; motifs.push(motif); motifMap.set(entry.meta.key, motifId);
    // Mark coverage for all non-overlapping occurrences
    for (const occ of entry.occs) {
      let blocked = false;
      for (let j=0;j<len;j++) if (coverage[occ.voice][occ.start + j]) { blocked = true; break; }
      if (blocked) continue;
      for (let j=0;j<len;j++) coverage[occ.voice][occ.start + j] = true;
    }
  }

  // Optional: derive contiguous sub-motifs (length >=3) for reuse of interior segments not yet covered
  // Only add if they appear at least twice in uncovered regions and not already represented.
  const enableSub = opts.enableSub !== false;
  const subMin = 3;
  const subAddedKeys = new Set();
  if (enableSub) {
    for (let v=0; v<encodedVoices.length; v++) {
      const voice = encodedVoices[v];
      for (let i=0;i<voice.length;i++) {
        if (!coverage[v][i]) {
          for (let len=subMin; len<=MAX_LEN && i+len<=voice.length; len++) {
            const subseq = voice.slice(i,i+len);
            const enc = encodeSubseq(subseq);
              if (!enc) continue;
            if (enc.deg_rels.length < subMin) continue;
            if (motifMap.has(enc.key) || subAddedKeys.has(enc.key)) continue;
            // Count uncovered occurrences quickly
            let count=0;
            for (let j=0;j<encodedVoices[v].length - len +1;j++) {
              const cand = voice.slice(j,j+len);
              // Quick structural compare by building key (optimization: could reuse map)
              const enc2 = encodeSubseq(cand);
              if (enc2 && enc2.key === enc.key) {
                // ensure segment mostly uncovered
                let uncovered = 0; for (let k=0;k<len;k++) if (!coverage[v][j+k]) uncovered++;
                if (uncovered/len > 0.5) count++;
                if (count>=2) break;
              }
            }
            if (count>=2) {
              const motif = buildMotif(enc, { voice:v, start:i });
              const motifId = motifs.length; motifs.push(motif); motifMap.set(enc.key, motifId); subAddedKeys.add(enc.key);
              // mark coverage for this first occurrence only (others will be used during application)
              for (let k=0;k<len;k++) coverage[v][i+k] = true;
            }
          }
        }
      }
    }
  }
  // For application we also need a mapping of key->occurrences similar to old patternMap (reuse occurrenceBucket)
  const patternMap = new Map();
  for (const entry of repeated) patternMap.set(entry.meta.key, entry.occs);
  // Add sub motifs occurrences (re-scan minimally for those keys)
  for (const keyStr of subAddedKeys) {
    // naive re-scan across voices
    const parts = keyStr.split('|')[0].split(',');
    const len = parts.length;
    const occs = [];
    for (let v=0; v<encodedVoices.length; v++) {
      const voice = encodedVoices[v];
      for (let i=0;i<=voice.length-len;i++) {
        const enc = encodeSubseq(voice.slice(i,i+len));
        if (enc && enc.key === keyStr) occs.push({ voice:v, start:i, base_pitch: voice[i].pitch });
      }
    }
    patternMap.set(keyStr, occs);
  }
  return { motifs, motifMap, patternMap };
}

// Iterative optimizer to minimize regular notes + motifs count by exploring motif mining params.
function optimizeMotifApplication(encodedVoices, key, keyChanges, iterations) {
  iterations = Math.max(1, Math.floor(iterations || 1));
  const deepCopy = (x) => JSON.parse(JSON.stringify(x));
  let best = null;
  // Helper: count motif references in voices
  function countMotifRefs(voices) {
    const counts = new Map();
    for (const v of voices) {
      for (const ev of v) {
        if (ev && ev.motif_id !== undefined) {
          counts.set(ev.motif_id, (counts.get(ev.motif_id) || 0) + 1);
        }
      }
    }
    return counts;
  }
  // Helper: expand motif references conditionally
  function expandMotifsByPredicate(voices, predicate) {
    const out = [];
    for (const v of voices) {
      const nv = [];
      for (const ev of v) {
        if (ev && ev.motif_id !== undefined && predicate(ev)) {
          if (Array.isArray(ev.origSegment) && ev.origSegment.length > 0) {
            for (const n of ev.origSegment) {
              nv.push({ delta: n.delta, pitch: n.pitch, dur: n.dur, vel: n.vel, midi: n.midi });
            }
          } else {
            // If no origSegment, keep as-is (should be rare)
            nv.push(ev);
          }
        } else {
          nv.push(ev);
        }
      }
      out.push(nv);
    }
    return out;
  }
  // Helper: drop unused motifs and remap ids in-place; returns new { motifs, voices }
  function dropAndRemapMotifs(motifs, voices) {
    const used = new Set();
    for (const v of voices) for (const ev of v) if (ev.motif_id !== undefined) used.add(ev.motif_id);
    const idList = Array.from(used).sort((a,b)=>a-b);
    const remap = new Map(); idList.forEach((oldId, idx)=> remap.set(oldId, idx));
    const newMotifs = idList.map(id => motifs[id]);
    const newVoices = voices.map(v => v.map(ev => {
      if (ev.motif_id === undefined) return ev;
      const nid = remap.get(ev.motif_id);
      if (nid === undefined) {
        // Shouldn't happen; expand it defensively
        if (Array.isArray(ev.origSegment)) {
          return ev.origSegment.map(n => ({ delta: n.delta, pitch: n.pitch, dur: n.dur, vel: n.vel, midi: n.midi }));
        }
        const clone = { ...ev }; delete clone.motif_id; return clone;
      }
      return { ...ev, motif_id: nid };
    }));
    // Flatten any arrays that may have resulted from defensive expansion
    for (let i=0;i<newVoices.length;i++) {
      const flat = [];
      for (const ev of newVoices[i]) {
        if (Array.isArray(ev)) flat.push(...ev); else flat.push(ev);
      }
      newVoices[i] = flat;
    }
    return { motifs: newMotifs, voices: newVoices };
  }
  // Helper: try a split-friendly re-mining from motifless expansion
  function reMineWithSplitStrategy(currVoices, baseKey) {
    // Expand all motif refs back to literal notes
    const expanded = expandMotifsByPredicate(currVoices, () => true);
    // Mine with smaller maxLen and enabled sub-motifs
    const minLen = 3;
    const maxLen = 10; // encourage shorter reusable shapes
    const enableSub = true;
    const mined = findMotifs(expanded, baseKey, { minLen, maxLen, enableSub });
    let motifs = mined.motifs;
    let voices = applyMotifs(expanded, motifs, mined.motifMap, mined.patternMap);
    // prune unused motifs
    ({ motifs, voices } = dropAndRemapMotifs(motifs, voices));
    // Backfill midi_rels from embedded segments
    for (const v of voices) {
      for (const ev of v) {
        if (ev.motif_id === undefined) continue;
        const m = motifs[ev.motif_id]; if (!m) continue;
        if (!m.midi_rels || m.midi_rels.length !== m.deg_rels.length) {
          if (ev.origSegment && ev.origSegment.length === m.deg_rels.length) {
            const midis = ev.origSegment.map(n => n.midi != null ? n.midi : (n.pitch ? tonal.Note.midi(n.pitch) : null)).filter(p=>p!=null);
            if (midis.length === m.deg_rels.length) { const base = midis[0]; m.midi_rels = midis.map(p=>p-base); m.sample_base_midi = base; }
          }
        }
      }
    }
    // annotate + safety expand
    try { annotateMotifReferences(voices, motifs, keyChanges, baseKey, { preferOctave: true, debug: false }); } catch(_) {}
    const safety = expandUnsafeMotifReferences(voices, motifs);
    const safeVoices = safety && Array.isArray(safety.voices) ? safety.voices : voices;
    // Prune motifs that end up with <=1 references
    const counts = countMotifRefs(safeVoices);
    const dropIds = new Set();
    for (let id=0; id<motifs.length; id++) { if ((counts.get(id) || 0) <= 1) dropIds.add(id); }
    if (dropIds.size) {
      const filtered = expandMotifsByPredicate(safeVoices, ev => dropIds.has(ev.motif_id));
      // Remove dropped motifs and remap
      const keep = motifs.map((_,i)=> i).filter(i => !dropIds.has(i));
      const remap = new Map(keep.map((oldId, idx)=> [oldId, idx]));
      const newMotifs = keep.map(i => motifs[i]);
      const newVoices = filtered.map(v => v.map(ev => {
        if (ev.motif_id === undefined) return ev;
        const nid = remap.get(ev.motif_id);
        if (nid === undefined) { const clone = { ...ev }; delete clone.motif_id; return clone; }
        return { ...ev, motif_id: nid };
      }));
      return { motifs: newMotifs, voices: newVoices };
    }
    return { motifs, voices: safeVoices };
  }
  for (let it=0; it<iterations; it++) {
    const minLen = 3 + (it % 6);           // 3..8
    const maxLen = 16 + ((it*3) % 9);      // 16..24
    const enableSub = (it % 2) === 0;      // toggle
    let voices = deepCopy(encodedVoices);
    const r = findMotifs(voices, key, { minLen, maxLen, enableSub });
    let motifs = r.motifs;
    voices = applyMotifs(voices, motifs, r.motifMap, r.patternMap);
    // prune unused
    ({ motifs, voices } = dropAndRemapMotifs(motifs, voices));
    // backfill midi_rels from embedded segments
    for (const v of voices) {
      for (const ev of v) {
        if (ev.motif_id === undefined) continue;
        const m = motifs[ev.motif_id]; if (!m) continue;
        if (!m.midi_rels || m.midi_rels.length !== m.deg_rels.length) {
          if (ev.origSegment && ev.origSegment.length === m.deg_rels.length) {
            const midis = ev.origSegment.map(n => n.midi != null ? n.midi : (n.pitch ? tonal.Note.midi(n.pitch) : null)).filter(p=>p!=null);
            if (midis.length === m.deg_rels.length) { const base = midis[0]; m.midi_rels = midis.map(p=>p-base); m.sample_base_midi = base; }
          }
        }
      }
    }
    // annotate + safety expand (silent)
    try { annotateMotifReferences(voices, motifs, keyChanges, key, { preferOctave: true, debug: false }); } catch(_) {}
    const safety = expandUnsafeMotifReferences(voices, motifs);
    let safeVoices = safety && Array.isArray(safety.voices) ? safety.voices : voices;

    // Prune motifs with 0 or 1 total references (drop and expand them)
    const counts = countMotifRefs(safeVoices);
    const dropIds = new Set();
    const longLowUse = []; // track large motifs that are low-use for split strategy
    for (let id=0; id<motifs.length; id++) {
      const refCount = counts.get(id) || 0;
      if (refCount <= 1) {
        dropIds.add(id);
        if ((motifs[id]?.deg_rels?.length || 0) >= 6) longLowUse.push(id);
      }
    }
    if (dropIds.size) {
      // Expand these motif refs back to literals
      safeVoices = expandMotifsByPredicate(safeVoices, ev => dropIds.has(ev.motif_id));
      // Remove dropped motifs and remap remaining ids
      const keep = motifs.map((_,i)=> i).filter(i => !dropIds.has(i));
      const remap = new Map(keep.map((oldId, idx)=> [oldId, idx]));
      motifs = keep.map(i => motifs[i]);
      safeVoices = safeVoices.map(v => v.map(ev => {
        if (ev.motif_id === undefined) return ev;
        const nid = remap.get(ev.motif_id);
        if (nid === undefined) { const clone = { ...ev }; delete clone.motif_id; return clone; }
        return { ...ev, motif_id: nid };
      }));
    }
    // evaluate cost: regular notes + motif count
    let regular = 0; for (const v of safeVoices) for (const ev of v) if (ev.motif_id === undefined) regular++;
    let cost = regular + (motifs ? motifs.length : 0);

    // If we encountered large low-use motifs, try a split-friendly re-mining and keep the better result
    if (longLowUse.length > 0 || (it % 5) === 0) {
      const alt = reMineWithSplitStrategy(safeVoices, key);
      // After alternate path, also perform safety prune for <=1 refs just in case
      const altCounts = countMotifRefs(alt.voices);
      const altDrop = new Set();
      for (let id=0; id<alt.motifs.length; id++) if ((altCounts.get(id) || 0) <= 1) altDrop.add(id);
      let altVoices = alt.voices; let altMotifs = alt.motifs;
      if (altDrop.size) {
        altVoices = expandMotifsByPredicate(altVoices, ev => altDrop.has(ev.motif_id));
        const keep = altMotifs.map((_,i)=> i).filter(i => !altDrop.has(i));
        const remap = new Map(keep.map((oldId, idx)=> [oldId, idx]));
        altMotifs = keep.map(i => altMotifs[i]);
        altVoices = altVoices.map(v => v.map(ev => {
          if (ev.motif_id === undefined) return ev;
          const nid = remap.get(ev.motif_id);
          if (nid === undefined) { const clone = { ...ev }; delete clone.motif_id; return clone; }
          return { ...ev, motif_id: nid };
        }));
      }
      let reg2 = 0; for (const v of altVoices) for (const ev of v) if (ev.motif_id === undefined) reg2++;
      const cost2 = reg2 + (altMotifs ? altMotifs.length : 0);
      if (cost2 < cost) {
        safeVoices = altVoices; motifs = altMotifs; cost = cost2;
      }
    }

    if (!best || cost < best.cost) best = { cost, voices: safeVoices, motifs };
  }
  return best || { cost: Infinity, voices: encodedVoices, motifs: [] };
}

function applyMotifs(encodedVoices, motifs, motifMap, patternMap) {
  // Build candidate list referencing existing occurrences; prefer longer motifs first.
  function motifLenFromKey(k){ return k.split('|')[0].split(',').length; }
  const candidates = Array.from(patternMap.entries()).filter(([k,v])=> v.length>=2).sort((a,b)=> motifLenFromKey(b[0]) - motifLenFromKey(a[0]));
  const covered = encodedVoices.map(()=> new Set());
  const replacements = encodedVoices.map(()=> []);
  for (const [key, occs] of candidates) {
    const motifId = motifMap.get(key);
    if (motifId == null) continue;
    const len = motifLenFromKey(key);
    for (const occ of occs) {
      // ensure base_pitch captured
      const voiceArr = encodedVoices[occ.voice];
      const seq = voiceArr.slice(occ.start, occ.start+len);
      if (seq.length!==len) continue;
      let blocked=false; for (let i=0;i<len;i++) if (covered[occ.voice].has(occ.start+i)) { blocked=true; break; }
      if (blocked) continue;
      for (let i=0;i<len;i++) covered[occ.voice].add(occ.start+i);
      const base_pitch = seq[0].pitch; const base_midi = tonal.Note.midi(base_pitch);
      // Capture the original encoded segment (deep copy minimal fields) before removal for later annotation
      const origSegment = seq.map(n => ({ delta: n.delta, pitch: n.pitch, dur: n.dur, vel: n.vel, midi: n.midi }));
      replacements[occ.voice].push({ start: occ.start, len, motif_id: motifId, base_pitch, base_midi, delta: seq[0].delta, _origSegment: origSegment });
    }
  }
  const newVoices=[];
  for (let v=0; v<encodedVoices.length; v++) {
    const repls = replacements[v].sort((a,b)=> a.start-b.start);
    const newV=[]; let pos=0;
    for (const r of repls) {
      for (let j=pos;j<r.start;j++) newV.push(encodedVoices[v][j]);
      // Embed original segment so annotateMotifReferences can evaluate key spelling quality later
      newV.push({ delta: r.delta, motif_id: r.motif_id, base_pitch: r.base_pitch, base_midi: r.base_midi, origSegment: r._origSegment });
      pos = r.start + r.len;
    }
    for (let j=pos;j<encodedVoices[v].length;j++) newV.push(encodedVoices[v][j]);
    newVoices.push(newV);
  }
  return newVoices;
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
  const disableMotifsExplicit = motiflessFlags.some(f => argv.includes(f));
  const preserveTracksFlag = argv.includes('--preserve-tracks');
  const disableKeyChanges = argv.includes('--no-key-changes');
  // KeyStrict options (no env): prefer octave errors by default; allow CLI to flip if desired for diagnostics
  const preferSemitone = argv.includes('--prefer-semitone');
  const debugKeySelection = argv.includes('--debug-key-selection');
  // Optimization iterations (default 50)
  let iterations = 50; {
    const i = argv.indexOf('--iterations');
    if (i >= 0 && argv[i+1]) { const n = parseInt(argv[i+1],10); if (!isNaN(n) && n>0) iterations = n; }
  }

  const { ppq, tempo, notes, key_sig, perTrackNotes, trackNames, recoveredVoiceSplitMeta, keyOverride } = extractTempoAndPPQAndNotes(midi);
  let key = findBestKey(notes, key_sig);
  if (keyOverride) {
    // Override detected key directly
    const tonalMidi = tonal.Note.midi(keyOverride.tonic + '4');
    if (tonalMidi != null) key.tonic_pc = tonalMidi % 12;
    key.mode = keyOverride.mode;
    key.locked = true;
  }
  // Apply hack only if not locked
  if (!key.locked) {
    const originalDetectedTonicPc = key.tonic_pc;
    key.tonic_pc = (key.tonic_pc + 12 - 5) % 12;
    key.originalDetectedTonicPc = originalDetectedTonicPc;
  }
  const tonic_name = tonal.Note.pitchClass(tonal.Note.fromMidi(key.tonic_pc + 60, true));
  // Key signature handling:
  // - Capture original meta-based key signature (if present)
  // - Compute a final keySignature aligned with the (possibly hacked or overridden) final key
  // - Provide expanded objects for both original and final for transparency
  function computeExpanded(sf) {
    const major_pc = ((sf * 7) % 12 + 12) % 12;
    const rel_minor_pc = (major_pc + 9) % 12; // relative minor
    const pcNamesSharp = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    const pcNamesFlat  = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
    const flatFriendly = new Set([10,3,8,1,6]);
    function nameFor(pc) { return (flatFriendly.has(pc) ? pcNamesFlat : pcNamesSharp)[pc]; }
    return {
      sf,
      major: { tonic: nameFor(major_pc) },
      relativeMinor: { tonic: nameFor(rel_minor_pc) }
    };
  }
  let originalKeySignature = null;
  let originalKeySignatureExpanded = null;
  if (key_sig && typeof key_sig.sf === 'number') {
    originalKeySignature = { sf: key_sig.sf, mode: key_sig.mode };
    originalKeySignatureExpanded = computeExpanded(key_sig.sf);
  }
  // Derive final key signature sf from final tonic/mode (inverse of earlier mapping logic)
  function deriveSf(tonic_pc, mode) {
    // For major: find sf where ((sf*7) mod 12) equals tonic_pc
    // For minor: relative major is (tonic_pc + 3) % 12
    const targetMajorPc = (mode === 'major') ? tonic_pc : (tonic_pc + 3) % 12;
    for (let sf=-7; sf<=7; sf++) {
      const major_pc = ((sf * 7) % 12 + 12) % 12;
      if (major_pc === targetMajorPc) return sf;
    }
    return 0; // fallback
  }
  const finalSf = deriveSf(key.tonic_pc, key.mode);
  const keySignatureExpanded = computeExpanded(finalSf);
  const finalKeySignature = { sf: finalSf, mode: key.mode };
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
  // Keep a snapshot of the motifless encoded voices so we can validate roundtrip pitch-classes
  // by decoding the motif-encoded form and comparing to this snapshot modulo 12.
  const motiflessEncodedSnapshot = JSON.parse(JSON.stringify(encodedVoices));
  const disableMotifs = disableMotifsExplicit; // Honor explicit disabling only
  let motifs = [];
  let keyChangesComputed = disableKeyChanges ? [] : detectKeyChanges(notes, ppq);
  if (!disableMotifs) {
    const opt = optimizeMotifApplication(encodedVoices, key, keyChangesComputed, iterations);
    encodedVoices = opt.voices;
    motifs = opt.motifs;
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
    key: { tonic: tonic_name, mode: key.mode, originalDetectedTonicPc: key.originalDetectedTonicPc, locked: !!key.locked },
    keySignatureExpanded, // aligned with final key
    originalKeySignature,
    originalKeySignatureExpanded,
    motifs: disableMotifs ? [] : motifs,
    voices: encodedVoices,
    voiceMeta,
    motifsDisabled: !!disableMotifs,
    originalTrackCount: perTrackNotes.length,
    trackNames,
    voiceToTrack,
    keySignature: finalKeySignature,
    voiceSplitMeta,
    keyChanges: keyChangesComputed
  };
  if (!disableMotifs && compressed.motifs.length) {
    annotateMotifReferences(compressed.voices, compressed.motifs, compressed.keyChanges, key, { preferOctave: !preferSemitone, debug: !!debugKeySelection });
    // Safety pass: expand any motif references that would cause semitone mismatches when using midi_rels
    const safety = expandUnsafeMotifReferences(compressed.voices, compressed.motifs);
    if (safety && Array.isArray(safety.voices)) {
      compressed.voices = safety.voices;
      if (safety.expandedCount > 0) {
        console.warn(`[KeyStrict][safety] Expanded ${safety.expandedCount} unsafe motif reference(s) to prevent semitone mismatches.`);
      }
    }
  }
  
  // Abort test: ensure no semitone (non-octave) pitch errors were introduced by motif encoding.
  // We decode the motif-encoded voices and compare pitch-classes (mod 12) to the original motifless encoding.
  // Any mismatch indicates a semitone error; crash compression to surface the issue early.
  try {
    const decodedFromMotifs = compressed.voices.map(v => decodeSingleVoice(v, ppq, compressed.motifs, { tonic: tonic_name, mode: key.mode }));
    const decodedFromMotifless = motiflessEncodedSnapshot.map(v => decodeSingleVoice(v, ppq, [], { tonic: tonic_name, mode: key.mode }));
    let mismatches = [];
    const voiceCount = Math.max(decodedFromMotifs.length, decodedFromMotifless.length);
    if (decodedFromMotifs.length !== decodedFromMotifless.length) {
      throw new Error(`[AbortCheck] Voice count mismatch: motifs=${decodedFromMotifs.length} motifless=${decodedFromMotifless.length}`);
    }
    for (let vi = 0; vi < voiceCount; vi++) {
      const a = decodedFromMotifs[vi] || [];
      const b = decodedFromMotifless[vi] || [];
      if (a.length !== b.length) {
        throw new Error(`[AbortCheck] Note count mismatch in voice ${vi}: motifs=${a.length} motifless=${b.length}`);
      }
      for (let i = 0; i < a.length; i++) {
        const pa = a[i].pitch;
        const pb = b[i].pitch;
        if (pa == null || pb == null) continue;
        if (((pa - pb) % 12 + 12) % 12 !== 0) {
          if (mismatches.length < 25) {
            mismatches.push({ voice: vi, index: i, startA: a[i].start, startB: b[i].start, pitchA: pa, pitchB: pb, diff: pa - pb });
          } else {
            mismatches.push('...');
            break;
          }
        }
      }
      if (mismatches.length && mismatches[mismatches.length-1] === '...') break;
    }
    if (mismatches.length > 0) {
      const diag = { message: 'Modulo-12 pitch-class mismatches detected between motif-decoded and motifless encodings', mismatches };
      try { fs.writeFileSync('keystrict-mod12-fail.json', JSON.stringify(diag, null, 2)); } catch(e) { /* ignore */ }
      console.error('[AbortCheck] Non-octave pitch mismatches found. See keystrict-mod12-fail.json for details.');
      throw new Error('[AbortCheck] Compression aborted due to semitone pitch errors (non-octave differences).');
    }
  } catch (e) {
    // Rethrow to ensure CLI exits non-zero; include context in stderr
    console.error('[AbortCheck] Validation error:', e && e.message || e);
    throw e;
  }
  
  // End-of-run summary: aggregate approximate motif references for quick QA
  try {
    const approxRefs = [];
    for (let vIdx = 0; vIdx < compressed.voices.length; vIdx++) {
      const voice = compressed.voices[vIdx];
      for (const ev of voice) {
        if (ev && ev.motif_id !== undefined && ev.refKey && (ev.refKey.approx || ev.refKey.exact === false)) {
          approxRefs.push({
            voice: vIdx,
            motif_id: ev.motif_id,
            tonic: ev.refKey.tonic,
            mode: ev.refKey.mode,
            baseShift: ev.refKey.baseShift ?? 0,
            octaveErrors: ev.refKey.octaveErrors ?? null,
            semitoneErrors: ev.refKey.semitoneErrors ?? null,
            absErrorSum: ev.refKey.absErrorSum ?? null,
            totalErrorCount: ev.refKey.totalErrorCount ?? null
          });
        }
      }
    }
    const motifSet = new Set(approxRefs.map(r => r.motif_id));
    const sumOct = approxRefs.reduce((a,b)=> a + (b.octaveErrors || 0), 0);
    const maxOct = approxRefs.reduce((m,b)=> Math.max(m, b.octaveErrors || 0), 0);
    const semiRefCount = approxRefs.reduce((a,b)=> a + ((b.semitoneErrors || 0) > 0 ? 1 : 0), 0);
    const baseShiftHist = approxRefs.reduce((m,b)=>{ const k = String(b.baseShift||0); m[k]=(m[k]||0)+1; return m; }, {});
    const keyHist = approxRefs.reduce((m,b)=>{ const k = `${b.tonic}/${b.mode}`; m[k]=(m[k]||0)+1; return m; }, {});
    const summary = {
      totalApproxReferences: approxRefs.length,
      uniqueMotifs: motifSet.size,
      octaveErrorSum: sumOct,
      worstOctaveErrors: maxOct,
      semitoneErrorReferenceCount: semiRefCount,
      baseShiftHistogram: baseShiftHist,
      chosenKeyHistogram: keyHist,
      samples: approxRefs.slice(0, 50)
    };
    // Print concise console line
    console.log(`[KeyStrict][summary] approxRefs=${summary.totalApproxReferences} motifs=${summary.uniqueMotifs} octaveErrSum=${summary.octaveErrorSum} worstOct=${summary.worstOctaveErrors} semiRefs=${summary.semitoneErrorReferenceCount}`);
    // Attempt to write a sidecar summary JSON next to the output path
    try {
      const sumPath = outputJson.replace(/\.json$/i, '') + '.summary.json';
      const sumDir = path.dirname(sumPath);
      if (!fs.existsSync(sumDir)) fs.mkdirSync(sumDir, { recursive: true });
      fs.writeFileSync(sumPath, JSON.stringify(summary, null, 2));
    } catch(e) { /* ignore file write errors */ }
  } catch (e) {
    // Non-fatal: summary should not block compression
    console.warn('[KeyStrict][summary] failed to compute/write summary:', e && e.message || e);
  }
  
  // Ensure output directory exists
  const outputDir = path.dirname(outputJson);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  fs.writeFileSync(outputJson, JSON.stringify(compressed, null, 2)); // Pretty print for editability
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
  // Embed key override meta (Text) in first track so future compression can lock tonic
  if (tracks[0]) {
    tracks[0].keyOverride = { tonic: key.tonic, mode: key.mode };
  }
  const midiBuffer = buildMidiFile({ ppq, tempo, tracks, keySignature });
  const outputDir = path.dirname(outputMidi);
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputMidi, midiBuffer);
  console.log('MIDI file written successfully (custom writer)');
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
        const sf = sfClamped < 0 ? 256 + sfClamped : sfClamped;
        const mode = (keySignature.mode === 'minor' || keySignature.mode === 1) ? 1 : 0;
        events.push({ tick:0, data: [0xFF, 0x59, 0x02, sf, mode] });
      }
      if (t.keyOverride) {
        const txt = `KOVERRIDE:${t.keyOverride.tonic}:${t.keyOverride.mode}`;
        const bytes = Buffer.from(txt, 'ascii');
        events.push({ tick:0, data:[0xFF, 0x01, bytes.length, ...bytes] });
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

// Helper: decode a single encoded voice into raw notes (used for multi-track export)
function decodeSingleVoice(encodedVoice, ppq, motifs = [], key = { tonic: 'C', mode: 'major' }) {
  const tonic_pc = tonal.Note.midi(key.tonic + '4') % 12;
  const mode = key.mode;
  const scale_offsets = mode === 'major' ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 11];
  const notes = [];
  let currentTick = 0;
  let warnedFallback = false;
  for (const item of encodedVoice) {
    if (item.motif_id !== undefined) {
      currentTick += item.delta;
      const motif = motifs[item.motif_id];
      if (motif) {
        const base_midi = item.base_midi != null ? item.base_midi : tonal.Note.midi(item.base_pitch);
        let subTick = currentTick;
        const canUseMidiRels = motif.midi_rels && motif.midi_rels.length === motif.deg_rels.length && base_midi != null;
        for (let j = 0; j < motif.deg_rels.length; j++) {
          let pitchMidi;
          if (canUseMidiRels) {
            pitchMidi = base_midi + motif.midi_rels[j];
          } else {
            if (!warnedFallback) { console.warn('[Decoder] Falling back to diatonic reconstruction for at least one motif (missing complete midi_rels).'); warnedFallback = true; }
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

// Safety: expand any motif references that would introduce non-octave (semitone) pitch mismatches
// when decoded using midi_rels. This preserves correctness by falling back to literal notes only for
// unsafe references while keeping safe motif compressions intact.
function expandUnsafeMotifReferences(encodedVoices, motifs) {
  let expandedCount = 0;
  const voicesOut = [];
  for (let vIdx = 0; vIdx < encodedVoices.length; vIdx++) {
    const voice = encodedVoices[vIdx];
    const out = [];
    for (const ev of voice) {
      if (ev.motif_id === undefined) { out.push(ev); continue; }
      const m = motifs[ev.motif_id];
      if (!m) { out.push(ev); continue; }
      const base = ev.base_midi != null ? ev.base_midi : (ev.base_pitch ? tonal.Note.midi(ev.base_pitch) : null);
      const hasMidiRels = Array.isArray(m.midi_rels) && m.midi_rels.length === m.deg_rels.length;
      const origMidis = Array.isArray(ev.origSegment) ? ev.origSegment.map(n => (n && (n.midi != null ? n.midi : (n.pitch ? tonal.Note.midi(n.pitch) : null)))).filter(p => p != null) : [];
      let unsafe = false;
      if (!(hasMidiRels && base != null && origMidis.length === m.deg_rels.length)) {
        unsafe = true; // insufficient data to guarantee safety
      } else {
        for (let i = 0; i < m.midi_rels.length; i++) {
          const recon = base + m.midi_rels[i];
          const diff = ((recon - origMidis[i]) % 12 + 12) % 12;
          if (diff !== 0) { unsafe = true; break; }
        }
      }
      if (unsafe) {
        if (origMidis.length === m.deg_rels.length && Array.isArray(ev.origSegment)) {
          // Expand back to original literal notes
          for (const n of ev.origSegment) {
            // Shallow clone without internal helper midi field
            out.push({ delta: n.delta, pitch: n.pitch, dur: n.dur, vel: n.vel });
          }
          expandedCount++;
        } else {
          // As a last resort, keep the motif reference (cannot safely expand), but it's likely to be caught later
          out.push(ev);
        }
      } else {
        out.push(ev); // safe to keep motif compressed
      }
    }
    voicesOut.push(out);
  }
  return { voices: voicesOut, expandedCount };
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

// Circle of fifths ordering (enharmonic simplifications used intentionally)
const CIRCLE_OF_FIFTHS = ['C','G','D','A','E','B','F#','Db','Ab','Eb','Bb','F'];
function circleIndex(tonic) { return CIRCLE_OF_FIFTHS.indexOf(tonic); }
function circleDistance(a,b) {
  const ia = circleIndex(a); const ib = circleIndex(b);
  if (ia < 0 || ib < 0) return 99;
  const len = CIRCLE_OF_FIFTHS.length;
  const diff = Math.abs(ia - ib);
  return Math.min(diff, len - diff);
}

function annotateMotifReferences(encodedVoices, motifs, keyChanges, globalKey, opts = {}) {
  if (!encodedVoices || !motifs || !motifs.length) return;
  const PC_SHARP = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const PC_FLAT  = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
  const flatFriendly = new Set([10,3,8,1,6]);
  const motifDurations = motifs.map(m => m.durs.reduce((a,b)=>a+b,0) + m.deltas.reduce((a,b)=>a+b,0));
  const debug = !!opts.debug;

  function tonicNameForPc(pc) {
    return (flatFriendly.has(pc) ? PC_FLAT : PC_SHARP)[pc];
  }

  // Attempt to reconstruct exact original pitches for a motif reference under a candidate key
  function reconstructPitches(motif, base_midi, tonic_pc, mode) {
    if (base_midi == null) return null;
    const baseDiat = pitchToDiatonic(base_midi, tonic_pc, mode);
    const scale_offsets = mode === 'major' ? [0,2,4,5,7,9,11] : [0,2,3,5,7,8,11];
    const out = [];
    for (let i=0;i<motif.deg_rels.length;i++) {
      const rel = motif.deg_rels[i];
      const total_deg = baseDiat.degree + rel;
      const deg_mod = ((total_deg % 7)+7)%7;
      const oct_add = Math.floor(total_deg / 7);
      let exp_pc = (tonic_pc + scale_offsets[deg_mod]) % 12;
      let pc = (exp_pc + motif.accs[i]) % 12; if (pc < 0) pc += 12;
      const oct = baseDiat.oct + oct_add;
      out.push(pc + oct*12);
    }
    return out;
  }

  for (let vIndex=0; vIndex<encodedVoices.length; vIndex++) {
    const voice = encodedVoices[vIndex];
    let abs = 0;
    for (const ev of voice) {
      abs += ev.delta || 0;
      if (ev.motif_id === undefined) { if (ev.dur) abs += ev.dur; continue; }
      const motif = motifs[ev.motif_id];
      const span = motifDurations[ev.motif_id] || 0;
      const start = abs; const end = abs + span;
      // Build original pitch list from embedded origSegment
      if (!ev.origSegment || !ev.origSegment.length) {
        throw new Error(`[KeyStrict] Missing origSegment for motif reference (motif_id=${ev.motif_id})`);
      }
      const origPitches = ev.origSegment.map(n => n.midi != null ? n.midi : tonal.Note.midi(n.pitch)).filter(p=>p!=null);
      if (origPitches.length !== motif.deg_rels.length) {
        throw new Error(`[KeyStrict] origSegment length (${origPitches.length}) != motif length (${motif.deg_rels.length}) for motif_id=${ev.motif_id}`);
      }
      const base_midi = ev.base_midi != null ? ev.base_midi : (ev.base_pitch ? tonal.Note.midi(ev.base_pitch) : null);
      if (base_midi == null) {
        throw new Error(`[KeyStrict] Missing base_midi for motif reference motif_id=${ev.motif_id}`);
      }
      // Determine candidate mode: use overlapping keyChanges segment if available else global
      let seedMode = globalKey.mode;
      if (keyChanges && keyChanges.length) {
        let bestOv = -1; let chosen = null;
        for (const seg of keyChanges) {
          const ov = Math.min(end, seg.end) - Math.max(start, seg.start);
          if (ov > bestOv) { bestOv = ov; chosen = seg; }
        }
        if (chosen) seedMode = chosen.mode;
      }
      function tryAllKeys(testBaseMidi) {
        const localMatches = [];
        for (let tonic_pc=0; tonic_pc<12; tonic_pc++) {
          for (const mode of [seedMode, seedMode === 'major' ? 'minor' : 'major']) {
            const recon = reconstructPitches(motif, testBaseMidi, tonic_pc, mode);
            if (!recon) continue;
            let ok = true;
            for (let i=0;i<recon.length;i++) { if (recon[i] !== origPitches[i]) { ok = false; break; } }
            if (ok) {
              let accSum = 0; for (let i=0;i<origPitches.length;i++) { const di = pitchToDiatonic(origPitches[i], tonic_pc, mode); accSum += Math.abs(di.acc); }
              localMatches.push({ tonic_pc, mode, accSum, testBaseMidi });
            }
          }
        }
        return localMatches;
      }
      let matches = tryAllKeys(base_midi);
      let baseShift = 0;
      if (!matches.length) {
        matches = tryAllKeys(base_midi - 1);
        if (matches.length) baseShift = -1;
      }
      if (!matches.length) {
        matches = tryAllKeys(base_midi + 1);
        if (matches.length) baseShift = 1;
      }
      if (!matches.length) {
        // Approximate fallback: evaluate all candidates and score by minimizing octave errors first, then total abs semitone difference.
        const baseCandidates = [base_midi-1, base_midi, base_midi+1];
        let bestApprox = null;
        const attemptSummaries = [];
        for (const candidateBase of baseCandidates) {
          for (let tonic_pc=0; tonic_pc<12; tonic_pc++) {
            for (const mode of ['major','minor']) {
              const recon = reconstructPitches(motif, candidateBase, tonic_pc, mode);
              if (!recon) continue;
              let octaveErrors = 0; // count diffs that are multiples of 12 (non-zero)
              let semitoneErrors = 0; // remaining non-zero diffs
              let absSum = 0; let offsets=[];
              for (let i=0;i<origPitches.length;i++) {
                const diff = recon[i]-origPitches[i];
                if (diff !== 0) {
                  if (diff % 12 === 0) octaveErrors++; else semitoneErrors++;
                }
                absSum += Math.abs(diff);
                offsets.push(diff);
              }
              // Scoring preference:
              // Default: prefer octave errors over semitone errors (better musical tolerance).
              // Can be flipped via CLI flag --prefer-semitone (diagnostic only).
              const preferOct = opts.preferOctave !== false;
              const OCT_W = preferOct ? 30 : 1000;   // if prefer octave, make them cheap
              const SEMI_W = preferOct ? 2000 : 50;  // if prefer octave, make semitone errors very expensive
              const score = octaveErrors*OCT_W + semitoneErrors*SEMI_W + absSum;
              const summary = { candidateBase, tonic_pc, mode, octaveErrors, semitoneErrors, absSum, score, offsets }; 
              attemptSummaries.push(summary);
              if (!bestApprox || score < bestApprox.score) bestApprox = summary;
            }
          }
        }
        if (bestApprox) {
          // Accept approximate
            const diffHist = bestApprox.offsets.reduce((m,d)=>{m[d]=(m[d]||0)+1;return m;},{});
            ev.refKey = {
              tonic: tonicNameForPc(bestApprox.tonic_pc),
              mode: bestApprox.mode,
              exact: false,
              accSum: null,
              candidateCount: 0,
              baseShift: bestApprox.candidateBase - base_midi,
              octaveErrors: bestApprox.octaveErrors,
              semitoneErrors: bestApprox.semitoneErrors,
              absErrorSum: bestApprox.absSum,
              totalErrorCount: bestApprox.octaveErrors + bestApprox.semitoneErrors,
              diffHist,
              approx: true
            };
            // Persist diagnostic file for later refinement
            const diag = { motif_id: ev.motif_id, base_midi, origPitches, motif: { deg_rels: motif.deg_rels, accs: motif.accs, midi_rels: motif.midi_rels, sample_base_midi: motif.sample_base_midi }, attempts: attemptSummaries.slice(0,200) };
            try { fs.writeFileSync(`keystrict-approx-motif-${ev.motif_id}.json`, JSON.stringify(diag, null, 2)); } catch(e) { /* ignore */ }
            console.warn(`[KeyStrict][approx] motif_id=${ev.motif_id} no exact key; chose ${ev.refKey.tonic}/${ev.refKey.mode} baseShift=${ev.refKey.baseShift} octaveErr=${bestApprox.octaveErrors} semiErr=${bestApprox.semitoneErrors}`);
        } else {
          console.error(`[KeyStrict] FAILED motif_id=${ev.motif_id} no reconstructable candidates even for approximation.`);
          throw new Error(`[KeyStrict] Could not approximate key for motif_id=${ev.motif_id}`);
        }
        abs += span;
        continue; // proceed to next motif reference
      }
      // Choose match with minimal accidentals; tie-break by circle distance to global key tonic
      function circleDistPc(pcA, pcB) {
        // use global circle list
        const nameA = tonicNameForPc(pcA);
        const nameB = tonicNameForPc(pcB);
        return circleDistance(nameA, nameB);
      }
      const globalPc = globalKey.tonic_pc;
      matches.sort((a,b)=> a.accSum - b.accSum || circleDistPc(a.tonic_pc, globalPc) - circleDistPc(b.tonic_pc, globalPc));
      const chosen = matches[0];
      ev.refKey = {
        tonic: tonicNameForPc(chosen.tonic_pc),
        mode: chosen.mode,
        accSum: chosen.accSum,
        exact: true,
        candidateCount: matches.length,
        baseShift
      };
      if (debug) {
        console.log(`[KeyStrict] motif_id=${ev.motif_id} chosen=${ev.refKey.tonic}/${ev.refKey.mode} accSum=${chosen.accSum} matches=${matches.length} baseShift=${baseShift}`);
      }
      abs += span;
    }
  }
}

// ------------------------------
// Simple CLI dispatcher (restored after revert)
// Usage:
//   node EncodeDecode.js compress input.mid output.json [--preserve-tracks] [--motifless|--no-motifs]
//   node EncodeDecode.js decompress input.json output.mid
// Exits with non-zero code on error to help integration tests fail fast.
if (require.main === module) {
  (function runCLI(){
    try {
      const args = process.argv.slice(2);
      if (args.length < 1 || ['-h','--help'].includes(args[0])) {
        console.log('Usage:');
  console.log('  node EncodeDecode.js compress <input.mid> <output.json> [--preserve-tracks] [--motifless|--no-motifs] [--no-key-changes] [--prefer-semitone] [--debug-key-selection] [--iterations N]');
        console.log('  node EncodeDecode.js decompress <input.json> <output.mid>');
        process.exit(0);
      }
      const cmd = args[0];
      if (cmd === 'compress') {
        if (args.length < 3) { console.error('compress requires <input.mid> <output.json>'); process.exit(2); }
        const inMid = args[1];
        const outJson = args[2];
        console.log(`[CLI] Compressing ${inMid} -> ${outJson}`);
        compressMidiToJson(inMid, outJson);
        console.log('[CLI] Compression complete.');
      } else if (cmd === 'decompress') {
        if (args.length < 3) { console.error('decompress requires <input.json> <output.mid>'); process.exit(2); }
        const inJson = args[1];
        const outMid = args[2];
        console.log(`[CLI] Decompressing ${inJson} -> ${outMid}`);
        decompressJsonToMidi(inJson, outMid);
        console.log('[CLI] Decompression complete.');
      } else {
        console.error('Unknown command:', cmd);
        process.exit(2);
      }
    } catch (e) {
      console.error('[CLI] Error:', e && e.stack || e);
      process.exit(1);
    }
  })();
}

// Export programmatic APIs for batch processing and tests
module.exports = {
  compressMidiToJson,
  decompressJsonToMidi,
  // Optionally expose helpers for advanced/test usage
  parseMidi,
  extractTempoAndPPQAndNotes,
  findBestKey,
  detectKeyChanges,
  decodeSingleVoice
};