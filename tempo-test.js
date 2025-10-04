const fs = require('fs');
const MidiPlayer = require('midi-parser-js');
const MidiWriter = require('midi-writer-js');

// Test reading and writing tempo
console.log('=== TEMPO TEST ===');

// Read original BWV785 MIDI to see what tempo data looks like
const originalMidi = fs.readFileSync('midi/BWV785.MID');
const parsed = MidiPlayer.parse(originalMidi);
console.log('Original MIDI format:', parsed.formatType);
console.log('Original MIDI PPQ:', parsed.timeDivision);

// Find tempo events in original
for (let trackIndex = 0; trackIndex < parsed.track.length; trackIndex++) {
  const track = parsed.track[trackIndex];
  console.log(`\nTrack ${trackIndex} events:`);
  
  for (let eventIndex = 0; eventIndex < track.event.length; eventIndex++) {
    const event = track.event[eventIndex];
    
    // Look for tempo events
    if (event.type === 255 && event.metaType === 81) {
      console.log(`  Tempo event: data=${event.data}, calculated BPM=${60000000 / event.data}`);
    }
  }
}

// Now test creating a tempo event with MidiWriter
console.log('\n=== TESTING MidiWriter.TempoEvent ===');

const track = new MidiWriter.Track();
track.addTrackName('Tempo Test');

// Test with BPM 120
track.addEvent(new MidiWriter.TempoEvent({ bpm: 120 }));

// Create a simple note to make it a valid MIDI
track.addEvent(new MidiWriter.NoteEvent({
  pitch: ['C4'],
  duration: '4',
  velocity: 64
}));

const write = new MidiWriter.Writer(track);
const midiData = write.buildFile();

// Write test file
fs.writeFileSync('tempo-test.mid', midiData, 'binary');
console.log('Created tempo-test.mid with BPM 120');

// Now read it back to see what data value it created
const testMidi = fs.readFileSync('tempo-test.mid');
const testParsed = MidiPlayer.parse(testMidi);

for (let trackIndex = 0; trackIndex < testParsed.track.length; trackIndex++) {
  const track = testParsed.track[trackIndex];
  console.log(`\nTest MIDI Track ${trackIndex}:`);
  
  for (let eventIndex = 0; eventIndex < track.event.length; eventIndex++) {
    const event = track.event[eventIndex];
    
    if (event.type === 255 && event.metaType === 81) {
      console.log(`  Generated tempo event: data=${event.data}, calculated BPM=${60000000 / event.data}`);
    }
  }
}