const tonal = require('@tonaljs/tonal');

console.log('=== MIDI OCTAVE CALCULATION TEST ===');

// Test MIDI to octave conversion
const testNotes = [
  { midi: 60, expectedNote: 'C4', description: 'Middle C' },
  { midi: 72, expectedNote: 'C5', description: 'C above middle C' },
  { midi: 48, expectedNote: 'C3', description: 'C below middle C' },
  { midi: 69, expectedNote: 'A4', description: 'A440' },
  { midi: 57, expectedNote: 'A3', description: 'A below A440' }
];

console.log('\nTesting current Math.floor(midi / 12) approach:');
for (const test of testNotes) {
  const currentOct = Math.floor(test.midi / 12);
  const pc = test.midi % 12;
  const actualNote = tonal.Note.fromMidi(test.midi);
  console.log(`MIDI ${test.midi} (${test.description}):`);
  console.log(`  Current calc: oct=${currentOct}, pc=${pc}`);
  console.log(`  Actual note: ${actualNote}`);
  console.log(`  Expected: ${test.expectedNote}`);
  console.log(`  Match: ${actualNote === test.expectedNote ? 'YES ✓' : 'NO ✗'}`);
  console.log('');
}

console.log('\nTesting corrected Math.floor(midi / 12) - 1 approach:');
for (const test of testNotes) {
  const correctedOct = Math.floor(test.midi / 12) - 1;
  const pc = test.midi % 12;
  const actualNote = tonal.Note.fromMidi(test.midi);
  console.log(`MIDI ${test.midi} (${test.description}):`);
  console.log(`  Corrected calc: oct=${correctedOct}, pc=${pc}`);
  console.log(`  Actual note: ${actualNote}`);
  console.log(`  Expected: ${test.expectedNote}`);
  console.log(`  Would match: ${correctedOct === parseInt(test.expectedNote.slice(-1)) ? 'YES ✓' : 'NO ✗'}`);
  console.log('');
}

// Test the pitchToDiatonic function directly
function testPitchToDiatonic(midi, tonic_pc, mode) {
  const scale_offsets = mode === 'major' ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 11];
  const pc = midi % 12;
  const oct = Math.floor(midi / 12); // Current (wrong) version
  const octCorrected = Math.floor(midi / 12) - 1; // Potential fix
  
  console.log(`\npitchToDiatonic test for MIDI ${midi}:`);
  console.log(`  pc=${pc}, current oct=${oct}, corrected oct=${octCorrected}`);
  console.log(`  Actual note: ${tonal.Note.fromMidi(midi)}`);
  
  return { degree: 0, acc: 0, oct: oct, octCorrected: octCorrected };
}

testPitchToDiatonic(60, 0, 'major'); // Middle C in C major
testPitchToDiatonic(72, 0, 'major'); // C5 in C major