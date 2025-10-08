const fs = require('fs');
const path = require('path');
const { parseMidi, extractTempoAndPPQAndNotes, separateVoices } = require('../../EncodeDecode');
const { detectKeySegments, summarizeGlobal } = require('../../KeyDetection');

// Functional test: verify bach_BWV785_TwoTracks.mid starts and ends in Bb major.
// We treat the input as two monophonic voices (tracks). We compress logic minimally:
//  - Parse MIDI
//  - Use perTrackNotes from extraction to preserve track order
//  - Encode each track into voice-like structure of encoded notes (delta/pitch not needed here; we only need pitch names)
//  - Run sliding window key detection
//  - Assert first and last detected stable keys are Bb major.

describe('BWV785 Key Detection (Start/End Bb Major)', () => {
  jest.setTimeout(15000);
  const projectRoot = path.resolve(__dirname, '..', '..');
  const midiPath = path.join(projectRoot, 'midi', 'bach_BWV785_TwoTracks.mid');

  if (!fs.existsSync(midiPath)) {
    test.skip('Two-track MIDI not present', () => {});
    return;
  }

  test('detects starting and ending key as Bb major', () => {
    const midi = parseMidi(midiPath);
    const { perTrackNotes } = extractTempoAndPPQAndNotes(midi);

    // Filter only non-empty tracks; convert to encoded-voice-like objects with pitch names (Note: we reuse tonal conversion style from EncodeVoices logic)
    const voices = perTrackNotes.filter(t => t.length > 0).map(track => {
      // fabricate minimal encoded structure similar enough for KeyDetection (expects pitch names like 'C#4')
      return track.map(n => ({ pitch: require('@tonaljs/tonal').Note.fromMidi(n.pitch, true) }));
    });

    const segmentsPerVoice = detectKeySegments(voices, { windowSize: 24, stride: 12, minDelta: 0.08 });
    const summary = summarizeGlobal(segmentsPerVoice);

    // Basic diagnostic output on failure
    if (!summary.startKey || !summary.endKey) {
      console.log('Segments per voice:', JSON.stringify(segmentsPerVoice, null, 2));
    }

    expect(summary.startKey).toBeTruthy();
    expect(summary.endKey).toBeTruthy();
    expect(summary.startKey.key).toBe('Bb');
    expect(summary.startKey.mode).toBe('major');
    expect(summary.endKey.key).toBe('Bb');
    expect(summary.endKey.mode).toBe('major');
  });
});
