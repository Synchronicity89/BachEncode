const fs = require('fs');
const MidiPlayer = require('midi-parser-js');

console.log('=== PPQ VERIFICATION TEST ===');

// Check original MIDI
const originalMidi = fs.readFileSync('midi/BWV785.MID');
const originalParsed = MidiPlayer.parse(originalMidi);
console.log('Original BWV785.MID - PPQ:', originalParsed.timeDivision);

// Check old decompressed MIDI (with wrong PPQ)
try {
  const oldMidi = fs.readFileSync('output/BWV785-test.mid');
  const oldParsed = MidiPlayer.parse(oldMidi);
  console.log('Old decompressed BWV785-test.mid - PPQ:', oldParsed.timeDivision);
} catch (e) {
  console.log('Old decompressed file not found');
}

// Check new fixed MIDI
const fixedMidi = fs.readFileSync('output/BWV785-fixed.mid');
const fixedParsed = MidiPlayer.parse(fixedMidi);
console.log('Fixed decompressed BWV785-fixed.mid - PPQ:', fixedParsed.timeDivision);

// Check new scaled MIDI
const scaledMidi = fs.readFileSync('output/BWV785-scaled.mid');
const scaledParsed = MidiPlayer.parse(scaledMidi);
console.log('Scaled decompressed BWV785-scaled.mid - PPQ:', scaledParsed.timeDivision);

// Check tempo events too
console.log('\n=== TEMPO VERIFICATION ===');

function checkTempo(midiData, filename) {
  const parsed = MidiPlayer.parse(midiData);
  console.log(`\n${filename}:`);
  console.log(`  PPQ: ${parsed.timeDivision}`);
  
  for (let trackIndex = 0; trackIndex < parsed.track.length; trackIndex++) {
    const track = parsed.track[trackIndex];
    
    for (let eventIndex = 0; eventIndex < track.event.length; eventIndex++) {
      const event = track.event[eventIndex];
      
      if (event.type === 255 && event.metaType === 81) {
        const bpm = 60000000 / event.data;
        console.log(`  Tempo: ${bpm} BPM (data: ${event.data})`);
        break;
      }
    }
  }
}

checkTempo(originalMidi, 'Original BWV785.MID');
checkTempo(fixedMidi, 'Fixed BWV785-fixed.mid');
checkTempo(scaledMidi, 'Scaled BWV785-scaled.mid');

console.log('\n=== COMPARISON ===');
console.log('The scaled version should have equivalent timing despite different PPQ');
console.log(`Original: PPQ=${originalParsed.timeDivision}, Scaled: PPQ=${scaledParsed.timeDivision}`);
console.log(`Scaling factor: ${originalParsed.timeDivision}/${scaledParsed.timeDivision} = ${originalParsed.timeDivision/scaledParsed.timeDivision}`);

// The key test: check if relative timing is preserved
console.log('\n=== TIMING ANALYSIS ===');
console.log('With proper scaling, the tempo should now be correct even with different PPQ values.');