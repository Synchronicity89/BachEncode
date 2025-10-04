const midiParser = require('midi-parser-js');
const fs = require('fs');

function compareNotesBasic(originalFile, decompressedFile) {
    const originalData = fs.readFileSync(originalFile);
    const decompressedData = fs.readFileSync(decompressedFile);
    
    const originalMidi = midiParser.parse(originalData);
    const decompressedMidi = midiParser.parse(decompressedData);
    
    // Extract notes from both files
    const originalNotes = [];
    const decompressedNotes = [];
    
    // Process original file
    originalMidi.track.forEach((track, trackIndex) => {
        track.event.forEach(event => {
            if (event.type === 9 && event.data && event.data.length >= 2 && event.data[1] > 0) {
                originalNotes.push({
                    track: trackIndex,
                    tick: event.deltaTime,
                    pitch: event.data[0],
                    velocity: event.data[1]
                });
            }
        });
    });
    
    // Process decompressed file
    decompressedMidi.track.forEach((track, trackIndex) => {
        track.event.forEach(event => {
            if (event.type === 9 && event.data && event.data.length >= 2 && event.data[1] > 0) {
                decompressedNotes.push({
                    track: trackIndex,
                    tick: event.deltaTime,
                    pitch: event.data[0],
                    velocity: event.data[1]
                });
            }
        });
    });
    
    console.log(`Original: ${originalNotes.length} notes, Decompressed: ${decompressedNotes.length} notes`);
    
    // Compare first 10 notes
    for (let i = 0; i < Math.min(10, originalNotes.length, decompressedNotes.length); i++) {
        const orig = originalNotes[i];
        const decomp = decompressedNotes[i];
        const diff = decomp.pitch - orig.pitch;
        
        console.log(`Note ${i+1}: ${orig.pitch} -> ${decomp.pitch} (${diff > 0 ? '+' : ''}${diff})`);
    }
}

console.log('=== Testing reverted version ===');
compareNotesBasic('./midi/06Christus.mid', './test-christus2.mid');

console.log('\n=== Testing previous version with MIDI fix ===');
compareNotesBasic('./midi/06Christus.mid', './test-christus.mid');