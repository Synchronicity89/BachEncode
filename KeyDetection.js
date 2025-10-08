// KeyDetection.js - lightweight per-voice sliding window key detector (major keys only for now)
// Goals:
//  - Ignore declared MIDI meta key for analysis
//  - Detect starting key and ending key (current requirement)
//  - Provide simple API: detectKeySegments(voices, { windowSize, stride }) -> segments per voice
//  - Focus on major key Bb validation for BWV785 two-track file
//
// Strategy:
//  - Convert MIDI pitches to pitch classes (0-11) and note names using sharps/flats preference chosen by score
//  - For each window, score all 12 major keys using diatonic membership: score = diatonicCount / totalWindowNotes
//  - Accidental density triggers new segment: when best key changes and improvement >= minDelta
//  - Merge consecutive windows with same key
//  - Provide helper to compute first and last stable key across all voices
//
// Simplifications:
//  - Only major keys for now
//  - No enharmonic tie-breaking beyond maximizing diatonic inclusion
//  - Stride defaults to half window for overlap smoothing

const MAJOR_SCALES = {
  C:  ['C','D','E','F','G','A','B'],
  G:  ['G','A','B','C','D','E','F#'],
  D:  ['D','E','F#','G','A','B','C#'],
  A:  ['A','B','C#','D','E','F#','G#'],
  E:  ['E','F#','G#','A','B','C#','D#'],
  B:  ['B','C#','D#','E','F#','G#','A#'],
  'F#':['F#','G#','A#','B','C#','D#','E#'],
  'C#':['C#','D#','E#','F#','G#','A#','B#'],
  F:  ['F','G','A','Bb','C','D','E'],
  Bb: ['Bb','C','D','Eb','F','G','A'],
  Eb: ['Eb','F','G','Ab','Bb','C','D'],
  Ab: ['Ab','Bb','C','Db','Eb','F','G'],
  Db: ['Db','Eb','F','Gb','Ab','Bb','C'],
  Gb: ['Gb','Ab','Bb','Cb','Db','Eb','F'],
  Cb: ['Cb','Db','Eb','Fb','Gb','Ab','Bb']
};

const KEY_ORDER = Object.keys(MAJOR_SCALES); // deterministic order
const NOTE_NAMES_SHARP = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

function midiToName(midi) {
  const pc = ((midi % 12) + 12) % 12;
  return NOTE_NAMES_SHARP[pc];
}

function normalizeVoiceToNoteNames(encodedVoice) {
  // encodedVoice: array of { delta, pitch, dur, vel } where pitch may be name (e.g. 'C#4') or Tonal name.
  // Our EncodeDecode encodes pitch as name like 'C#4'. Strip octave for key detection.
  return encodedVoice.map(n => {
    if (!n || !n.pitch) return null;
    const p = n.pitch;
    // Remove trailing digit(s) for octave
    const name = p.replace(/[0-9]/g,'');
    return name;
  }).filter(Boolean);
}

function scoreWindow(notes) {
  // notes: array of note name (with accidental if present, no octave)
  if (!notes.length) return null;
  const unique = new Set(notes); // pitch-class set counts only unique membership for scoring simplicity
  // Could weight by frequency later.
  const scores = [];
  for (const key of KEY_ORDER) {
    const scale = MAJOR_SCALES[key];
    let inCount = 0;
    unique.forEach(n => { if (scale.includes(n)) inCount++; });
    const score = inCount / unique.size;
    scores.push({ key, mode: 'major', score });
  }
  scores.sort((a,b)=> b.score - a.score || KEY_ORDER.indexOf(a.key) - KEY_ORDER.indexOf(b.key));
  return scores[0];
}

function segmentVoice(encodedVoice, { windowSize=16, stride=Math.floor(16/2), minDelta=0.05 } = {}) {
  const names = normalizeVoiceToNoteNames(encodedVoice);
  if (!names.length) return [];
  const segments = [];
  let last = null;
  for (let start=0; start < names.length; start += stride) {
    const window = names.slice(start, start + windowSize);
    if (window.length < Math.max(4, windowSize/2)) break; // stop if too small to be stable
    const best = scoreWindow(window);
    if (!best) continue;
    if (!last) {
      last = { startIndex: start, endIndex: start + window.length -1, key: best.key, mode: best.mode, score: best.score };
    } else if (best.key === last.key) {
      last.endIndex = start + window.length -1;
      last.score = (last.score + best.score)/2; // smooth
    } else {
      // key changed candidate
      if (best.score - last.score >= minDelta || best.score > 0.85) {
        segments.push(last);
        last = { startIndex: start, endIndex: start + window.length -1, key: best.key, mode: best.mode, score: best.score };
      } else {
        // treat as noise, extend current
        last.endIndex = start + window.length -1;
        last.score = (last.score*2 + best.score)/3;
      }
    }
  }
  if (last) segments.push(last);
  return segments;
}

function detectKeySegments(voices, options) {
  return voices.map(v => segmentVoice(v, options));
}

function summarizeGlobal(segmentsPerVoice) {
  // Heuristic refinement:
  // 1. Determine endKey as the last segment of the LAST voice that has segments (cadential bias)
  // 2. Prefer as startKey the earliest segment (across voices) whose key matches endKey (stable global tonic)
  // 3. Fallback: first segment of any voice if no match found.
  let endKey = null;
  for (const segs of segmentsPerVoice) {
    if (segs.length) {
      if (segs[segs.length-1]) endKey = { key: segs[segs.length-1].key, mode: segs[segs.length-1].mode };
    }
  }

  let startKey = null;
  if (endKey) {
    let earliestIndex = Infinity;
    for (const segs of segmentsPerVoice) {
      for (let i=0;i<segs.length;i++) {
        const s = segs[i];
        if (s.key === endKey.key && s.mode === endKey.mode) {
          if (s.startIndex < earliestIndex) {
            earliestIndex = s.startIndex;
            startKey = { key: s.key, mode: s.mode };
          }
          break; // earliest in this voice; move to next voice
        }
      }
    }
  }
  if (!startKey) { // fallback original behavior
    for (const segs of segmentsPerVoice) {
      if (segs.length) { startKey = { key: segs[0].key, mode: segs[0].mode }; break; }
    }
  }
  return { startKey, endKey };
}

module.exports = {
  detectKeySegments,
  segmentVoice,
  summarizeGlobal
};
