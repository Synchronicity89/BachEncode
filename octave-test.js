const fs = require('fs');
const MidiPlayer = require('midi-parser-js');

console.log('=== OCTAVE SHIFT DETECTION ===');

// Compare original vs decompressed MIDI files to find octave shifts
function comparePitches(originalFile, decompressedFile) {
  console.log(`\nComparing ${originalFile} vs ${decompressedFile}`);
  
  try {
    const originalMidi = fs.readFileSync(originalFile);
    const originalParsed = MidiPlayer.parse(originalMidi);
    
    const decompMidi = fs.readFileSync(decompressedFile);
    const decompParsed = MidiPlayer.parse(decompMidi);
    
    // Extract note events from original
    const originalNotes = [];
    for (let trackIndex = 0; trackIndex < originalParsed.track.length; trackIndex++) {
      const track = originalParsed.track[trackIndex];
      let currentTick = 0;
      
      for (const event of track.event) {
        currentTick += event.deltaTime;
        if (event.type === 9 && event.data[1] > 0) { // Note On with velocity > 0
          originalNotes.push({
            tick: currentTick,
            pitch: event.data[0],
            velocity: event.data[1],
            track: trackIndex
          });
        }
      }
    }
    
    // Extract note events from decompressed
    const decompNotes = [];
    for (let trackIndex = 0; trackIndex < decompParsed.track.length; trackIndex++) {
      const track = decompParsed.track[trackIndex];
      let currentTick = 0;
      
      for (const event of track.event) {
        currentTick += event.deltaTime;
        if (event.type === 9 && event.data[1] > 0) { // Note On with velocity > 0
          decompNotes.push({
            tick: currentTick,
            pitch: event.data[0],
            velocity: event.data[1],
            track: trackIndex
          });
        }
      }
    }
    
    console.log(`Original notes: ${originalNotes.length}, Decompressed notes: ${decompNotes.length}`);
    
    // Sort by tick for comparison
    originalNotes.sort((a, b) => a.tick - b.tick);
    decompNotes.sort((a, b) => a.tick - b.tick);
    
    // Compare first 20 notes to check for patterns
    console.log('\nFirst 20 note comparisons:');
    console.log('Orig | Decomp | Diff | Octave?');
    console.log('-----|--------|------|--------');
    
    const octaveShifts = [];
    for (let i = 0; i < Math.min(20, originalNotes.length, decompNotes.length); i++) {
      const orig = originalNotes[i];
      const decomp = decompNotes[i];
      const diff = decomp.pitch - orig.pitch;
      const isOctave = Math.abs(diff) === 12;
      
      console.log(`${orig.pitch.toString().padStart(4)} | ${decomp.pitch.toString().padStart(6)} | ${diff.toString().padStart(4)} | ${isOctave ? 'YES' : 'no'}`);
      
      if (isOctave) {
        octaveShifts.push({ index: i, original: orig.pitch, decompressed: decomp.pitch, diff: diff });
      }
    }
    
    if (octaveShifts.length > 0) {
      console.log(`\n⚠️  Found ${octaveShifts.length} octave shifts in first 20 notes!`);
      octaveShifts.forEach(shift => {
        console.log(`  Note ${shift.index}: ${shift.original} → ${shift.decompressed} (${shift.diff > 0 ? '+' : ''}${shift.diff})`);
      });
    } else {
      console.log('\n✅ No obvious octave shifts detected in first 20 notes');
    }
    
    return { originalNotes, decompNotes, octaveShifts };
    
  } catch (error) {
    console.log(`Error comparing files: ${error.message}`);
    return null;
  }
}

// Test with a few different files
const testFiles = [
  { orig: 'midi/BWV785.MID', decomp: 'output/BWV785.mid' },
  { orig: 'midi/bach-invention-13.mid', decomp: 'output/bach-invention-13.mid' },
  { orig: 'midi/06Christus.mid', decomp: 'output/06Christus.mid' }
];

for (const test of testFiles) {
  if (fs.existsSync(test.orig) && fs.existsSync(test.decomp)) {
    comparePitches(test.orig, test.decomp);
  } else {
    console.log(`\nSkipping ${test.orig} - files not found`);
  }
}