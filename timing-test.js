const fs = require('fs');
const MidiPlayer = require('midi-parser-js');
const MidiWriter = require('midi-writer-js');

console.log('=== TIMING TEST ===');

// Test 1: Simple note with duration only (no startTick)
console.log('\n=== Test 1: Duration only ===');
const track1 = new MidiWriter.Track();
track1.addTrackName('Duration Only');
track1.addEvent(new MidiWriter.TempoEvent({ bpm: 120 }));
track1.addEvent(new MidiWriter.NoteEvent({
  pitch: ['C4'],
  duration: '4',  // Quarter note
  velocity: 64
}));

const write1 = new MidiWriter.Writer(track1);
fs.writeFileSync('test-duration-only.mid', write1.buildFile(), 'binary');

// Test 2: Note with startTick and tick-based duration
console.log('\n=== Test 2: StartTick + Tick Duration ===');
const track2 = new MidiWriter.Track();
track2.addTrackName('StartTick + Ticks');
track2.addEvent(new MidiWriter.TempoEvent({ bpm: 120 }));
track2.addEvent(new MidiWriter.NoteEvent({
  pitch: ['C4'],
  duration: 'T384',  // 384 ticks (assuming 384 PPQ = quarter note)
  velocity: 64,
  startTick: 0
}));

const write2 = new MidiWriter.Writer(track2);
fs.writeFileSync('test-starttick-ticks.mid', write2.buildFile(), 'binary');

// Test 3: Multiple notes with startTick to see timing
console.log('\n=== Test 3: Multiple notes with startTick ===');
const track3 = new MidiWriter.Track();
track3.addTrackName('Multiple StartTick');
track3.addEvent(new MidiWriter.TempoEvent({ bpm: 120 }));

// Add notes at different start times
track3.addEvent(new MidiWriter.NoteEvent({
  pitch: ['C4'],
  duration: 'T384',
  velocity: 64,
  startTick: 0
}));
track3.addEvent(new MidiWriter.NoteEvent({
  pitch: ['D4'],
  duration: 'T384',
  velocity: 64,
  startTick: 384
}));
track3.addEvent(new MidiWriter.NoteEvent({
  pitch: ['E4'],
  duration: 'T384',
  velocity: 64,
  startTick: 768
}));

const write3 = new MidiWriter.Writer(track3);
fs.writeFileSync('test-multiple-starttick.mid', write3.buildFile(), 'binary');

console.log('Created test MIDI files. Check timing in your DAW.');

// Now parse one back to see timing
console.log('\n=== Parsing test-multiple-starttick.mid back ===');
const testMidi = fs.readFileSync('test-multiple-starttick.mid');
const testParsed = MidiPlayer.parse(testMidi);

console.log('PPQ:', testParsed.timeDivision);

for (let trackIndex = 0; trackIndex < testParsed.track.length; trackIndex++) {
  const track = testParsed.track[trackIndex];
  console.log(`\nTrack ${trackIndex}:`);
  
  let currentTick = 0;
  for (let eventIndex = 0; eventIndex < track.event.length; eventIndex++) {
    const event = track.event[eventIndex];
    currentTick += event.deltaTime;
    
    if (event.type === 9) { // Note On
      console.log(`  Note On: tick=${currentTick}, note=${event.data[0]}, vel=${event.data[1]}`);
    } else if (event.type === 8) { // Note Off
      console.log(`  Note Off: tick=${currentTick}, note=${event.data[0]}`);
    } else if (event.type === 255 && event.metaType === 81) {
      console.log(`  Tempo: tick=${currentTick}, data=${event.data}, BPM=${60000000/event.data}`);
    }
  }
}