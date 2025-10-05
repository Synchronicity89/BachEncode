const fs = require('fs');
const { parseMidi, extractTempoAndPPQAndNotes } = require('../EncodeDecode');

console.log('=== PROPOSING FIX FOR ZERO-DURATION NOTES ===');

function fixZeroDurationNotes(notes, ppq, minDurationRatio = 0.1) {
    console.log(`Original notes: ${notes.length}`);
    
    // Calculate minimum duration (e.g., 10% of a quarter note)
    const minDuration = Math.max(1, Math.round(ppq * minDurationRatio));
    console.log(`Minimum duration will be: ${minDuration} ticks (${minDurationRatio * 100}% of quarter note)`);
    
    const originalZeroCount = notes.filter(n => n.dur === 0).length;
    
    // Fix zero-duration notes by applying minimum duration
    const fixedNotes = notes.map(note => {
        if (note.dur === 0) {
            return {
                ...note,
                dur: minDuration
            };
        }
        return note;
    });
    
    const fixedZeroCount = fixedNotes.filter(n => n.dur === 0).length;
    
    console.log(`Fixed ${originalZeroCount - fixedZeroCount} zero-duration notes`);
    console.log(`Remaining zero-duration notes: ${fixedZeroCount}`);
    
    return fixedNotes;
}

// Test the fix
console.log('\nTesting with problematic MIDI file...');
const midi = parseMidi('test-minimal-one-note.mid');
const { ppq, tempo, notes } = extractTempoAndPPQAndNotes(midi);

console.log(`\nBefore fix:`);
console.log(`- Total notes: ${notes.length}`);
console.log(`- Zero-duration notes: ${notes.filter(n => n.dur === 0).length}`);

const fixedNotes = fixZeroDurationNotes(notes, ppq, 0.05); // 5% of quarter note minimum

console.log(`\nAfter fix:`);
console.log(`- Total notes: ${fixedNotes.length}`);
console.log(`- Zero-duration notes: ${fixedNotes.filter(n => n.dur === 0).length}`);

// Show the fixed note
if (fixedNotes.length > 0) {
    console.log(`\nFirst note details:`);
    console.log(`- Original: start=${notes[0].start}, dur=${notes[0].dur}, pitch=${notes[0].pitch}`);
    console.log(`- Fixed: start=${fixedNotes[0].start}, dur=${fixedNotes[0].dur}, pitch=${fixedNotes[0].pitch}`);
}

console.log('\n=== RECOMMENDED IMPLEMENTATION ===');
console.log('1. Add zero-duration note detection and fixing in extractTempoAndPPQAndNotes()');
console.log('2. Apply minimum duration of 5-10% of quarter note length');
console.log('3. This will ensure all notes have audible duration');
console.log('4. Add this fix before the note sorting at the end of the function');