const MidiWriter = require('midi-writer-js');
const fs = require('fs');
const MidiPlayer = require('midi-parser-js');

console.log('=== Testing MidiWriter PPQ Options ===');

// Test different ways to set PPQ
const track = new MidiWriter.Track();
track.addTrackName('PPQ Test');
track.addEvent(new MidiWriter.TempoEvent({ bpm: 120 }));
track.addEvent(new MidiWriter.NoteEvent({
  pitch: ['C4'],
  duration: 'T384',
  velocity: 64,
  startTick: 0
}));

// Method 1: Try with options object
try {
  const write1 = new MidiWriter.Writer(track, { ticksPerBeat: 384 });
  fs.writeFileSync('test-ppq-384-method1.mid', write1.buildFile(), 'binary');
  console.log('Method 1 (options): Created file');
} catch (e) {
  console.log('Method 1 failed:', e.message);
}

// Method 2: Try with direct parameter
try {
  const write2 = new MidiWriter.Writer([track], 384);
  fs.writeFileSync('test-ppq-384-method2.mid', write2.buildFile(), 'binary');
  console.log('Method 2 (direct param): Created file');
} catch (e) {
  console.log('Method 2 failed:', e.message);
}

// Method 3: Check if there's a different constructor
try {
  const write3 = new MidiWriter.Writer(track);
  write3.setTicksPerBeat && write3.setTicksPerBeat(384);
  fs.writeFileSync('test-ppq-384-method3.mid', write3.buildFile(), 'binary');
  console.log('Method 3 (setter): Created file');
} catch (e) {
  console.log('Method 3 failed:', e.message);
}

// Check what each file created
console.log('\n=== Checking Results ===');
const files = ['test-ppq-384-method1.mid', 'test-ppq-384-method2.mid', 'test-ppq-384-method3.mid'];
files.forEach(filename => {
  try {
    const midi = fs.readFileSync(filename);
    const parsed = MidiPlayer.parse(midi);
    console.log(`${filename}: PPQ = ${parsed.timeDivision}`);
  } catch (e) {
    console.log(`${filename}: File not found or error`);
  }
});

// Check the MidiWriter constructor signature by examining it
console.log('\n=== MidiWriter Constructor Info ===');
console.log('MidiWriter.Writer length:', MidiWriter.Writer.length);
console.log('MidiWriter.Writer toString:', MidiWriter.Writer.toString().substring(0, 200));