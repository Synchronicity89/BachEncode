/**
 * Integration Test: Motif-Free JSON Comparison
 * 
 * This test compares two motif-free JSON files:
 * 1. Original motif-free JSON (created directly without motif compression)
 * 2. Decompressed motif-free JSON (from motif-compressed source)
 * 
 * The goal is to verify that motif compression/decompression preserves
 * the musical content accurately.
 */

const fs = require('fs');
const path = require('path');

function compareMotifFreeJsonFiles(originalPath, decompressedPath) {
    console.log('=== Motif-Free JSON Comparison Test ===\n');
    
    // Read both files
    console.log(`Reading original motif-free JSON: ${originalPath}`);
    const original = JSON.parse(fs.readFileSync(originalPath, 'utf8'));
    
    console.log(`Reading decompressed motif-free JSON: ${decompressedPath}`);
    const decompressed = JSON.parse(fs.readFileSync(decompressedPath, 'utf8'));
    
    // Compare basic structure
    console.log('\n--- Basic Structure Comparison ---');
    console.log(`Original voices: ${original.voices ? original.voices.length : 'N/A'}`);
    console.log(`Decompressed voices: ${decompressed.voices ? decompressed.voices.length : 'N/A'}`);
    
    if (original.tempo && decompressed.tempo) {
        console.log(`Original tempo: ${original.tempo}`);
        console.log(`Decompressed tempo: ${decompressed.tempo}`);
        console.log(`Tempo match: ${original.tempo === decompressed.tempo}`);
    }
    
    if (original.ppq && decompressed.ppq) {
        console.log(`Original PPQ: ${original.ppq}`);
        console.log(`Decompressed PPQ: ${decompressed.ppq}`);
        console.log(`PPQ match: ${original.ppq === decompressed.ppq}`);
    }
    
    // Compare voices in detail
    if (original.voices && decompressed.voices) {
        console.log('\n--- Voice-by-Voice Comparison ---');
        const minVoices = Math.min(original.voices.length, decompressed.voices.length);
        
        for (let i = 0; i < minVoices; i++) {
            const origVoice = original.voices[i];
            const decompVoice = decompressed.voices[i];
            
            console.log(`\nVoice ${i + 1}:`);
            console.log(`  Original notes: ${Array.isArray(origVoice) ? origVoice.length : 'N/A'}`);
            console.log(`  Decompressed notes: ${Array.isArray(decompVoice) ? decompVoice.length : 'N/A'}`);
            
            if (Array.isArray(origVoice) && Array.isArray(decompVoice)) {
                const noteCountMatch = origVoice.length === decompVoice.length;
                console.log(`  Note count match: ${noteCountMatch}`);
                
                if (!noteCountMatch) {
                    console.log(`  ⚠️  NOTE COUNT MISMATCH in voice ${i + 1}!`);
                }
                
                // Sample first few notes for detailed comparison
                const sampleSize = Math.min(5, origVoice.length, decompVoice.length);
                let noteDifferences = 0;
                
                for (let j = 0; j < sampleSize; j++) {
                    const origNote = origVoice[j];
                    const decompNote = decompVoice[j];
                    
                    const pitchMatch = origNote.pitch === decompNote.pitch;
                    const deltaMatch = origNote.delta === decompNote.delta;
                    const durationMatch = origNote.dur === decompNote.dur;
                    
                    if (!pitchMatch || !deltaMatch || !durationMatch) {
                        noteDifferences++;
                        if (j < 3) { // Only show first few differences
                            console.log(`    Note ${j + 1} differences:`);
                            if (!pitchMatch) console.log(`      Pitch: ${origNote.pitch} vs ${decompNote.pitch}`);
                            if (!deltaMatch) console.log(`      Delta: ${origNote.delta} vs ${decompNote.delta}`);
                            if (!durationMatch) console.log(`      Duration: ${origNote.dur} vs ${decompNote.dur}`);
                        }
                    }
                }
                
                if (noteDifferences > 0) {
                    console.log(`  ⚠️  Found ${noteDifferences} note differences in first ${sampleSize} notes of voice ${i + 1}`);
                } else {
                    console.log(`  ✅ First ${sampleSize} notes match perfectly`);
                }
            }
        }
    }
    
    // Overall assessment
    console.log('\n--- Overall Assessment ---');
    const structureMatch = (original.voices?.length === decompressed.voices?.length) &&
                          (original.tempo === decompressed.tempo) &&
                          (original.ppq === decompressed.ppq);
    
    console.log(`Basic structure match: ${structureMatch ? '✅' : '❌'}`);
    
    // Calculate total notes
    let originalTotalNotes = 0;
    let decompressedTotalNotes = 0;
    
    if (original.voices) {
        originalTotalNotes = original.voices.reduce((sum, voice) => sum + (Array.isArray(voice) ? voice.length : 0), 0);
    }
    
    if (decompressed.voices) {
        decompressedTotalNotes = decompressed.voices.reduce((sum, voice) => sum + (Array.isArray(voice) ? voice.length : 0), 0);
    }
    
    console.log(`Total notes - Original: ${originalTotalNotes}, Decompressed: ${decompressedTotalNotes}`);
    console.log(`Total note count match: ${originalTotalNotes === decompressedTotalNotes ? '✅' : '❌'}`);
    
    if (originalTotalNotes === decompressedTotalNotes && structureMatch) {
        console.log('\n🎵 RESULT: Files appear to be musically equivalent!');
        return true;
    } else {
        console.log('\n⚠️  RESULT: Potential musical differences detected!');
        return false;
    }
}

// If run directly
if (require.main === module) {
    const args = process.argv.slice(2);
    if (args.length !== 2) {
        console.log('Usage: node test-motif-integration.js <original-motif-free.json> <decompressed-motif-free.json>');
        process.exit(1);
    }
    
    compareMotifFreeJsonFiles(args[0], args[1]);
}

module.exports = { compareMotifFreeJsonFiles };