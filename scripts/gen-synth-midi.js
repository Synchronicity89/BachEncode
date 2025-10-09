// Simple synthetic MIDI generator for MVP modulo-12 roundtrip validation
// Writes a monophonic track with obvious repeating 4-note motifs.
// Usage: node scripts/gen-synth-midi.js [outputMid]

const fs = require('fs');
const path = require('path');

function main() {
  const outArg = process.argv[2];
  const outPath = outArg || path.join(__dirname, '..', 'output', 'synthetic-mvp.mid');
  const dir = path.dirname(outPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const MidiWriter = require('midi-writer-js');
  const track = new MidiWriter.Track();
  track.addTrackName('Synthetic MVP');
  track.addEvent(new MidiWriter.TempoEvent({ bpm: 120 }));

  // Define a very simple motif: four quarter notes ascending C-D-E-F
  const motif1 = [60, 62, 64, 65];
  // And a second motif: G-A-B-C
  const motif2 = [67, 69, 71, 72];

  // Write: motif1 x4, motif2 x4, motif1 x4 (plenty of repetition)
  const motifs = [motif1, motif1, motif1, motif1, motif2, motif2, motif2, motif2, motif1, motif1, motif1, motif1];
  for (const m of motifs) {
    for (const p of m) {
      track.addEvent(new MidiWriter.NoteEvent({ pitch: [p], duration: '4', velocity: 96 }));
    }
  }

  const writer = new MidiWriter.Writer(track);
  fs.writeFileSync(outPath, Buffer.from(writer.buildFile()));
  console.log(`[gen-synth-midi] Wrote ${outPath}`);
}

main();
