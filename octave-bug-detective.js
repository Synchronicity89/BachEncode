const fs = require('fs');
const path = require('path');
const { compressMidiToJson, decompressJsonToMidi } = require('./EncodeDecode');

function roundTripTest(testName, jsonFile) {
    console.log(`\n=== ${testName} ===`);
    
    try {
        // Step 1: Load original JSON
        const originalJson = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
        console.log('✓ Loaded original JSON');
        console.log('Original JSON structure:');
        console.log(`  PPQ: ${originalJson.ppq}`);
        console.log(`  Key: ${originalJson.key.tonic} ${originalJson.key.mode}`);
        console.log(`  Motifs: ${originalJson.motifs ? originalJson.motifs.length : 0}`);
        console.log(`  Voices: ${originalJson.voices ? originalJson.voices.length : 0}`);
        
        if (originalJson.voices && originalJson.voices.length > 0) {
            console.log(`  First voice notes: ${originalJson.voices[0].length}`);
            if (originalJson.voices[0].length > 0) {
                const firstNote = originalJson.voices[0][0];
                console.log(`  First note: ${JSON.stringify(firstNote)}`);
            }
        }
        
        // Step 2: Decompress JSON to MIDI
        const tempMidiFile = jsonFile.replace('.json', '.mid');
        decompressJsonToMidi(jsonFile, tempMidiFile);
        console.log('✓ Decompressed JSON to MIDI');
        
        // Step 3: Compress MIDI back to JSON
        const tempJsonFile = jsonFile.replace('.json', '-roundtrip.json');
        compressMidiToJson(tempMidiFile, tempJsonFile);
        console.log('✓ Compressed MIDI back to JSON');
        
        // Step 4: Load the round-trip JSON
        const roundTripJson = JSON.parse(fs.readFileSync(tempJsonFile, 'utf8'));
        console.log('✓ Loaded round-trip JSON');
        console.log('Round-trip JSON structure:');
        console.log(`  PPQ: ${roundTripJson.ppq}`);
        console.log(`  Key: ${roundTripJson.key.tonic} ${roundTripJson.key.mode}`);
        console.log(`  Motifs: ${roundTripJson.motifs ? roundTripJson.motifs.length : 0}`);
        console.log(`  Voices: ${roundTripJson.voices ? roundTripJson.voices.length : 0}`);
        
        if (roundTripJson.voices && roundTripJson.voices.length > 0) {
            console.log(`  First voice notes: ${roundTripJson.voices[0].length}`);
            if (roundTripJson.voices[0].length > 0) {
                const firstNote = roundTripJson.voices[0][0];
                console.log(`  First note: ${JSON.stringify(firstNote)}`);
            }
        }
        
        // Step 5: Compare the two JSONs
        console.log('\n--- COMPARISON ---');
        
        // Compare basic properties
        const ppqMatch = originalJson.ppq === roundTripJson.ppq;
        const keyMatch = JSON.stringify(originalJson.key) === JSON.stringify(roundTripJson.key);
        const motifCountMatch = (originalJson.motifs?.length || 0) === (roundTripJson.motifs?.length || 0);
        const voiceCountMatch = (originalJson.voices?.length || 0) === (roundTripJson.voices?.length || 0);
        
        console.log(`PPQ match: ${ppqMatch ? '✓' : '✗'} (${originalJson.ppq} vs ${roundTripJson.ppq})`);
        console.log(`Key match: ${keyMatch ? '✓' : '✗'}`);
        console.log(`Motif count match: ${motifCountMatch ? '✓' : '✗'} (${originalJson.motifs?.length || 0} vs ${roundTripJson.motifs?.length || 0})`);
        console.log(`Voice count match: ${voiceCountMatch ? '✓' : '✗'} (${originalJson.voices?.length || 0} vs ${roundTripJson.voices?.length || 0})`);
        
        // Compare first voice in detail if both exist
        if (originalJson.voices && originalJson.voices[0] && roundTripJson.voices && roundTripJson.voices[0]) {
            const origVoice = originalJson.voices[0];
            const rtVoice = roundTripJson.voices[0];
            const noteCountMatch = origVoice.length === rtVoice.length;
            console.log(`First voice note count match: ${noteCountMatch ? '✓' : '✗'} (${origVoice.length} vs ${rtVoice.length})`);
            
            // Compare first few notes
            const compareCount = Math.min(5, origVoice.length, rtVoice.length);
            for (let i = 0; i < compareCount; i++) {
                const origNote = origVoice[i];
                const rtNote = rtVoice[i];
                
                console.log(`\nNote ${i + 1}:`);
                console.log(`  Original: ${JSON.stringify(origNote)}`);
                console.log(`  Round-trip: ${JSON.stringify(rtNote)}`);
                
                // Check for pitch differences (the main bug we're looking for)
                if (origNote.pitch && rtNote.pitch) {
                    const pitchMatch = origNote.pitch === rtNote.pitch;
                    console.log(`  Pitch match: ${pitchMatch ? '✓' : '✗'} (${origNote.pitch} vs ${rtNote.pitch})`);
                    
                    if (!pitchMatch) {
                        console.log(`  🚨 PITCH MISMATCH DETECTED! This could be the octave bug.`);
                    }
                }
                
                if (origNote.motif_id !== undefined || rtNote.motif_id !== undefined) {
                    console.log(`  🔍 MOTIF DETECTED - this might be where the bug occurs`);
                }
            }
        }
        
        // Save comparison results for further analysis
        const comparisonFile = jsonFile.replace('.json', '-comparison.json');
        fs.writeFileSync(comparisonFile, JSON.stringify({
            original: originalJson,
            roundTrip: roundTripJson,
            matches: {
                ppq: ppqMatch,
                key: keyMatch,
                motifCount: motifCountMatch,
                voiceCount: voiceCountMatch
            }
        }, null, 2));
        
        console.log(`\n💾 Comparison saved to: ${comparisonFile}`);
        
        return {
            success: true,
            matches: { ppq: ppqMatch, key: keyMatch, motifCount: motifCountMatch, voiceCount: voiceCountMatch }
        };
        
    } catch (error) {
        console.error(`❌ Error in round-trip test: ${error.message}`);
        return { success: false, error: error.message };
    }
}

// Run tests with increasing complexity
console.log('🧪 ROUND-TRIP OCTAVE BUG DETECTION TESTS');
console.log('========================================');

// Test 1: Single note, no motifs  
const test1 = roundTripTest('Test 1: Single Note (C4)', './test-minimal-one-note.json');

// Test 2: Multiple notes, same octave, no motifs
const test2 = roundTripTest('Test 2: Multiple Notes Same Octave', './test-multiple-notes-same-octave.json');

// Test 3: Notes across different octaves, no motifs
const test3 = roundTripTest('Test 3: Different Octaves', './test-different-octaves.json');

// Test 4: Single motif - this is where the bug likely appears!
const test4 = roundTripTest('Test 4: Minimal Motif (LIKELY BUG SOURCE)', './test-minimal-motif.json');

// Summary
console.log('\n📊 TEST SUMMARY');
console.log('===============');
console.log(`Test 1 (Single Note): ${test1.success ? '✓ PASSED' : '✗ FAILED'}`);
console.log(`Test 2 (Multiple Notes): ${test2.success ? '✓ PASSED' : '✗ FAILED'}`);
console.log(`Test 3 (Different Octaves): ${test3.success ? '✓ PASSED' : '✗ FAILED'}`);
console.log(`Test 4 (Minimal Motif): ${test4.success ? '✓ PASSED' : '✗ FAILED'}`);

if (!test4.success) {
    console.log('\n🎯 RECOMMENDATION: Set breakpoints in motif processing code!');
    console.log('The bug likely occurs in the motif encoding/decoding logic.');
}