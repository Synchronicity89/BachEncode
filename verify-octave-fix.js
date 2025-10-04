const fs = require('fs');
const MidiPlayer = require('midi-parser-js');

console.log('=== OCTAVE FIX VERIFICATION ===');

// Compare original vs fixed decompressed MIDI files
function comparePitches(originalFile, decompressedFile, testName) {
  console.log(`\n${testName}: ${originalFile} vs ${decompressedFile}`);
  
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
    
    // Compare first 15 notes to check for patterns
    console.log('First 15 note comparisons:');
    console.log('Orig | Decomp | Diff | Match?');
    console.log('-----|--------|------|-------');
    
    let perfectMatches = 0;
    let octaveShifts = 0;
    let otherDiffs = 0;
    
    const maxCheck = Math.min(15, originalNotes.length, decompNotes.length);
    for (let i = 0; i < maxCheck; i++) {
      const orig = originalNotes[i];
      const decomp = decompNotes[i];
      const diff = decomp.pitch - orig.pitch;
      
      let status = '';
      if (diff === 0) {
        status = '✓';
        perfectMatches++;
      } else if (Math.abs(diff) === 12) {
        status = 'OCT';
        octaveShifts++;
      } else {
        status = 'DIFF';
        otherDiffs++;
      }
      
      console.log(`${orig.pitch.toString().padStart(4)} | ${decomp.pitch.toString().padStart(6)} | ${diff.toString().padStart(4)} | ${status}`);
    }
    
    console.log(`\nSummary for first ${maxCheck} notes:`);
    console.log(`✓ Perfect matches: ${perfectMatches}`);
    console.log(`OCT Octave shifts: ${octaveShifts}`);
    console.log(`DIFF Other diffs: ${otherDiffs}`);
    
    if (perfectMatches === maxCheck) {
      console.log('🎉 OCTAVE FIX SUCCESSFUL! All notes match perfectly.');
    } else if (octaveShifts > 0) {
      console.log('⚠️  Still have octave shifts - fix not complete.');
    } else {
      console.log('🤔 Different issue - not simple octave shifts.');
    }
    
    return { perfectMatches, octaveShifts, otherDiffs, totalChecked: maxCheck };
    
  } catch (error) {
    console.log(`Error comparing files: ${error.message}`);
    return null;
  }
}

// Test the fix
const testResults = [];

// Test 1: Christus with fix
testResults.push(comparePitches('midi/06Christus.mid', 'output/06Christus-octave-test.mid', 'TEST 1 - Christus (Fixed)'));

// Test 2: Compare with old version if it exists
if (fs.existsSync('output/06Christus.mid')) {
  testResults.push(comparePitches('midi/06Christus.mid', 'output/06Christus.mid', 'TEST 2 - Christus (Old)'));
}

// Summary
console.log('\n=== OVERALL RESULTS ===');
testResults.forEach((result, index) => {
  if (result) {
    const testNum = index + 1;
    const successRate = (result.perfectMatches / result.totalChecked * 100).toFixed(1);
    console.log(`Test ${testNum}: ${result.perfectMatches}/${result.totalChecked} perfect matches (${successRate}%)`);
  }
});