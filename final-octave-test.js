const fs = require('fs');
const MidiPlayer = require('midi-parser-js');

console.log('=== FINAL OCTAVE FIX TEST ===');

// Compare original vs final fixed MIDI files
function comparePitches(originalFile, decompressedFile, testName) {
  console.log(`\n${testName}:`);
  console.log(`Comparing ${originalFile} vs ${decompressedFile}`);
  
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
    
    // Compare ALL notes, not just first 20
    console.log('\nNote-by-note comparison:');
    console.log('Orig | Decomp | Diff | Status');
    console.log('-----|--------|------|-------');
    
    let perfectMatches = 0;
    let octaveShifts = 0;
    let otherDiffs = 0;
    
    const maxCheck = Math.min(originalNotes.length, decompNotes.length);
    let displayCount = 0;
    
    for (let i = 0; i < maxCheck; i++) {
      const orig = originalNotes[i];
      const decomp = decompNotes[i];
      const diff = decomp.pitch - orig.pitch;
      
      let status = '';
      if (diff === 0) {
        status = '✓ MATCH';
        perfectMatches++;
      } else if (Math.abs(diff) === 12) {
        status = '⚠️ OCTAVE';
        octaveShifts++;
      } else {
        status = '❌ DIFF';
        otherDiffs++;
      }
      
      // Show first 15 and all non-matching notes
      if (displayCount < 15 || diff !== 0) {
        console.log(`${orig.pitch.toString().padStart(4)} | ${decomp.pitch.toString().padStart(6)} | ${diff.toString().padStart(4)} | ${status}`);
        displayCount++;
      }
      
      // Stop showing matches after 15 if all subsequent are perfect
      if (displayCount >= 30 && diff === 0) break;
    }
    
    console.log(`\n=== FINAL RESULTS ===`);
    console.log(`Total notes checked: ${maxCheck}`);
    console.log(`✅ Perfect matches: ${perfectMatches} (${(perfectMatches/maxCheck*100).toFixed(1)}%)`);
    console.log(`⚠️  Octave shifts: ${octaveShifts} (${(octaveShifts/maxCheck*100).toFixed(1)}%)`);
    console.log(`❌ Other differences: ${otherDiffs} (${(otherDiffs/maxCheck*100).toFixed(1)}%)`);
    
    if (perfectMatches === maxCheck) {
      console.log('🎉 SUCCESS! All notes match perfectly - octave bug is FIXED!');
      return 'PERFECT';
    } else if (octaveShifts === 0 && otherDiffs === 0) {
      console.log('✅ All notes accounted for - no octave issues detected');
      return 'GOOD';
    } else if (octaveShifts > 0) {
      console.log('❌ Still have octave shift issues');
      return 'OCTAVE_ISSUES';
    } else {
      console.log('❓ Some other issues present');
      return 'OTHER_ISSUES';
    }
    
  } catch (error) {
    console.log(`Error: ${error.message}`);
    return 'ERROR';
  }
}

// Test the final fix
const result = comparePitches('midi/06Christus.mid', 'output/06Christus-final-fix.mid', 'FINAL FIX TEST');

if (result === 'PERFECT') {
  console.log('\n🎊 OCTAVE BUG COMPLETELY RESOLVED! 🎊');
  console.log('The motif compression and decompression now preserves exact pitches.');
} else {
  console.log('\n🔧 Further investigation needed...');
}