const fs = require('fs');
const { parseMidi, extractTempoAndPPQAndNotes } = require('../EncodeDecode');

console.log('=== INVESTIGATING ZERO-DURATION NOTES ISSUE ===');

// Test with a complex MIDI file
const testFile = 'test-christus.mid';

if (!fs.existsSync(testFile)) {
    console.log('Test file not found:', testFile);
    process.exit(1);
}

console.log('Parsing MIDI file:', testFile);
const midi = parseMidi(testFile);
const { ppq, tempo, notes } = extractTempoAndPPQAndNotes(midi);

console.log(`\nResults:`);
console.log(`- PPQ: ${ppq}`);
console.log(`- Tempo: ${tempo}`);
console.log(`- Total notes: ${notes.length}`);

// Analyze zero-duration notes
const zeroDurationNotes = notes.filter(note => note.dur === 0);
const validNotes = notes.filter(note => note.dur > 0);

console.log(`\nDuration Analysis:`);
console.log(`- Zero-duration notes: ${zeroDurationNotes.length} (${(zeroDurationNotes.length/notes.length*100).toFixed(1)}%)`);
console.log(`- Valid notes: ${validNotes.length} (${(validNotes.length/notes.length*100).toFixed(1)}%)`);

// Show examples of zero-duration notes
if (zeroDurationNotes.length > 0) {
    console.log(`\nFirst 10 zero-duration notes:`);
    zeroDurationNotes.slice(0, 10).forEach((note, i) => {
        console.log(`  ${i+1}. Pitch ${note.pitch} (${require('@tonaljs/tonal').Note.fromMidi(note.pitch)}), start: ${note.start}, dur: ${note.dur}, vel: ${note.vel}`);
    });
}

// Check for timing patterns that cause zero duration
console.log(`\nAnalyzing timing patterns...`);
const simultaneousGroups = {};
notes.forEach(note => {
    const key = note.start;
    if (!simultaneousGroups[key]) simultaneousGroups[key] = [];
    simultaneousGroups[key].push(note);
});

const simultaneousTicks = Object.keys(simultaneousGroups).filter(tick => simultaneousGroups[tick].length > 1);
console.log(`\nSimultaneous note groups found: ${simultaneousTicks.length}`);

// Show the most problematic timing positions
simultaneousTicks.slice(0, 5).forEach(tick => {
    const group = simultaneousGroups[tick];
    const zeroCount = group.filter(n => n.dur === 0).length;
    console.log(`\nTick ${tick}: ${group.length} notes (${zeroCount} zero-duration)`);
    if (zeroCount > 0) {
        group.filter(n => n.dur === 0).slice(0, 3).forEach(note => {
            console.log(`  - Zero: Pitch ${note.pitch}, vel ${note.vel}`);
        });
    }
});

// Look for the root cause: simultaneous note on/off events
console.log(`\n=== EXAMINING RAW MIDI EVENTS ===`);
console.log('Looking for simultaneous note on/off events that could cause zero duration...');

// Re-examine the MIDI parsing logic by looking at raw events
const tracks = midi.track || midi.tracks || [];
let problemEventCount = 0;

tracks.forEach((track, trackIndex) => {
    let currentTick = 0;
    const events = track.event || track.events || [];
    
    for (let i = 0; i < events.length && i < 20; i++) { // Limit to first 20 events per track
        const event = events[i];
        const deltaTime = event.deltaTime || event.delta || event.tick || 0;
        currentTick += deltaTime;
        
        if (event.type === 9 || event.type === 8) {
            const nextEvent = events[i + 1];
            if (nextEvent && 
                (nextEvent.deltaTime || nextEvent.delta || nextEvent.tick || 0) === 0 &&
                (nextEvent.type === 8 || (nextEvent.type === 9 && nextEvent.data && nextEvent.data[1] === 0)) &&
                nextEvent.data && event.data &&
                nextEvent.data[0] === event.data[0]) {
                
                console.log(`FOUND ZERO-DURATION PATTERN at tick ${currentTick}:`);
                console.log(`  Event ${i}: Type ${event.type}, Note ${event.data[0]}, Vel ${event.data[1]}`);
                console.log(`  Event ${i+1}: Type ${nextEvent.type}, Note ${nextEvent.data[0]}, Vel ${nextEvent.data[1]}, Delta ${nextEvent.deltaTime || nextEvent.delta || nextEvent.tick || 0}`);
                problemEventCount++;
            }
        }
    }
});

console.log(`\nFound ${problemEventCount} problematic simultaneous note on/off patterns`);

console.log(`\n=== RECOMMENDATIONS ===`);
console.log('1. The MIDI file contains many simultaneous note on/off events');
console.log('2. This creates zero-duration notes that produce silence during playback');
console.log('3. Need to filter out zero-duration notes or apply minimum duration');
console.log('4. Consider consolidating simultaneous events or adding small duration buffer');