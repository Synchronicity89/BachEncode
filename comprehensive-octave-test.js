const midiParser = require('midi-parser-js');
const fs = require('fs');
const path = require('path');

function compareNotesInFiles(originalFile, decompressedFile) {
    console.log(`\n=== Comparing ${path.basename(originalFile)} ===`);
    
    try {
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
        
        console.log(`Original notes: ${originalNotes.length}, Decompressed notes: ${decompressedNotes.length}`);
        
        // Compare first 10 notes in detail
        const compareCount = Math.min(10, originalNotes.length, decompressedNotes.length);
        let perfectMatches = 0;
        let octaveShifts = 0;
        let otherDifferences = 0;
        
        for (let i = 0; i < compareCount; i++) {
            const orig = originalNotes[i];
            const decomp = decompressedNotes[i];
            
            const pitchDiff = decomp.pitch - orig.pitch;
            
            if (pitchDiff === 0) {
                perfectMatches++;
            } else if (pitchDiff % 12 === 0) {
                octaveShifts++;
                console.log(`  Note ${i+1}: Octave shift - Original: ${orig.pitch}, Decompressed: ${decomp.pitch} (${pitchDiff > 0 ? '+' : ''}${pitchDiff/12} octaves)`);
            } else {
                otherDifferences++;
                console.log(`  Note ${i+1}: Other difference - Original: ${orig.pitch}, Decompressed: ${decomp.pitch} (${pitchDiff > 0 ? '+' : ''}${pitchDiff} semitones)`);
            }
        }
        
        return {
            originalCount: originalNotes.length,
            decompressedCount: decompressedNotes.length,
            perfectMatches,
            octaveShifts,
            otherDifferences,
            totalChecked: compareCount
        };
        
    } catch (error) {
        console.error(`Error processing files: ${error.message}`);
        return null;
    }
}

// Test multiple files
const testFiles = [
    '06Christus',
    '01AusmeinesHerz', 
    '11Jesu',
    'bach-invention-13'
];

let totalStats = {
    perfectMatches: 0,
    octaveShifts: 0,
    otherDifferences: 0,
    totalChecked: 0,
    filesProcessed: 0
};

console.log('=== COMPREHENSIVE OCTAVE TEST ===');
console.log('Testing multiple files to identify patterns in octave issues...\n');

testFiles.forEach(filename => {
    const originalFile = path.join('./midi', filename + '.mid');
    const decompressedFile = path.join('./output', filename + '.mid');
    
    if (fs.existsSync(originalFile) && fs.existsSync(decompressedFile)) {
        const stats = compareNotesInFiles(originalFile, decompressedFile);
        if (stats) {
            totalStats.perfectMatches += stats.perfectMatches;
            totalStats.octaveShifts += stats.octaveShifts;
            totalStats.otherDifferences += stats.otherDifferences;
            totalStats.totalChecked += stats.totalChecked;
            totalStats.filesProcessed++;
            
            console.log(`  Perfect matches: ${stats.perfectMatches}/${stats.totalChecked} (${(stats.perfectMatches/stats.totalChecked*100).toFixed(1)}%)`);
            console.log(`  Octave shifts: ${stats.octaveShifts}/${stats.totalChecked} (${(stats.octaveShifts/stats.totalChecked*100).toFixed(1)}%)`);
            console.log(`  Other differences: ${stats.otherDifferences}/${stats.totalChecked} (${(stats.otherDifferences/stats.totalChecked*100).toFixed(1)}%)`);
        }
    } else {
        console.log(`\n=== ${filename} ===`);
        console.log('Files not found - skipping');
    }
});

console.log('\n=== OVERALL SUMMARY ===');
console.log(`Files processed: ${totalStats.filesProcessed}`);
console.log(`Total notes checked: ${totalStats.totalChecked}`);
console.log(`Perfect matches: ${totalStats.perfectMatches} (${(totalStats.perfectMatches/totalStats.totalChecked*100).toFixed(1)}%)`);
console.log(`Octave shifts: ${totalStats.octaveShifts} (${(totalStats.octaveShifts/totalStats.totalChecked*100).toFixed(1)}%)`);
console.log(`Other differences: ${totalStats.otherDifferences} (${(totalStats.otherDifferences/totalStats.totalChecked*100).toFixed(1)}%)`);

if (totalStats.octaveShifts > 0) {
    console.log('\n⚠️  Octave shift issues detected! The motif encoding/decoding system still needs debugging.');
} else if (totalStats.perfectMatches === totalStats.totalChecked) {
    console.log('\n✅ All notes match perfectly! Octave issue appears to be resolved.');
} else {
    console.log('\n⚠️  Some pitch differences detected, but no systematic octave shifts.');
}