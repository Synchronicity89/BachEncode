/**
 * Detailed Note Analysis Script
 * 
 * This script performs a deep dive analysis of the missing notes issue
 * by comparing the original motif-free JSON with the decompressed motif-free JSON
 */

const fs = require('fs');

function analyzeNoteDifferences(originalPath, decompressedPath) {
    console.log('=== DETAILED NOTE ANALYSIS ===\n');
    
    // Read both files
    const original = JSON.parse(fs.readFileSync(originalPath, 'utf8'));
    const decompressed = JSON.parse(fs.readFileSync(decompressedPath, 'utf8'));
    
    console.log(`Original file: ${originalPath}`);
    console.log(`Decompressed file: ${decompressedPath}\n`);
    
    // Analyze each voice
    for (let voiceIndex = 0; voiceIndex < Math.max(original.voices.length, decompressed.voices.length); voiceIndex++) {
        console.log(`=== VOICE ${voiceIndex + 1} ANALYSIS ===`);
        
        const origVoice = original.voices[voiceIndex] || [];
        const decompVoice = decompressed.voices[voiceIndex] || [];
        
        console.log(`Original notes: ${origVoice.length}`);
        console.log(`Decompressed notes: ${decompVoice.length}`);
        console.log(`Difference: ${origVoice.length - decompVoice.length} notes`);
        
        if (origVoice.length !== decompVoice.length) {
            console.log('\n--- DETAILED COMPARISON ---');
            
            // Find the first point where they diverge
            let divergencePoint = -1;
            const minLength = Math.min(origVoice.length, decompVoice.length);
            
            for (let i = 0; i < minLength; i++) {
                const origNote = origVoice[i];
                const decompNote = decompVoice[i];
                
                if (origNote.pitch !== decompNote.pitch || 
                    origNote.delta !== decompNote.delta || 
                    origNote.dur !== decompNote.dur) {
                    divergencePoint = i;
                    break;
                }
            }
            
            if (divergencePoint >= 0) {
                console.log(`First divergence at note index: ${divergencePoint}`);
                console.log(`Original note ${divergencePoint}:`);
                console.log(`  Pitch: ${origVoice[divergencePoint].pitch}, Delta: ${origVoice[divergencePoint].delta}, Duration: ${origVoice[divergencePoint].dur}`);
                console.log(`Decompressed note ${divergencePoint}:`);
                console.log(`  Pitch: ${decompVoice[divergencePoint].pitch}, Delta: ${decompVoice[divergencePoint].delta}, Duration: ${decompVoice[divergencePoint].dur}`);
                
                // Show context around divergence
                console.log('\n--- CONTEXT AROUND DIVERGENCE ---');
                const start = Math.max(0, divergencePoint - 2);
                const end = Math.min(origVoice.length, divergencePoint + 5);
                
                for (let i = start; i < end; i++) {
                    const marker = i === divergencePoint ? ' >>> ' : '     ';
                    if (i < origVoice.length) {
                        console.log(`${marker}Orig ${i}: ${origVoice[i].pitch} d=${origVoice[i].delta} dur=${origVoice[i].dur}`);
                    }
                    if (i < decompVoice.length) {
                        console.log(`${marker}Deco ${i}: ${decompVoice[i].pitch} d=${decompVoice[i].delta} dur=${decompVoice[i].dur}`);
                    }
                    if (i < origVoice.length || i < decompVoice.length) {
                        console.log('');
                    }
                }
            } else if (origVoice.length > decompVoice.length) {
                console.log(`All ${minLength} matching notes are identical`);
                console.log(`Missing notes from decompressed (starting at index ${minLength}):`);
                for (let i = minLength; i < Math.min(origVoice.length, minLength + 10); i++) {
                    console.log(`  Missing ${i}: ${origVoice[i].pitch} d=${origVoice[i].delta} dur=${origVoice[i].dur}`);
                }
                if (origVoice.length > minLength + 10) {
                    console.log(`  ... and ${origVoice.length - minLength - 10} more notes`);
                }
            }
        } else {
            console.log('✅ Voice note counts match');
        }
        
        console.log('\n');
    }
    
    // Summary statistics
    console.log('=== SUMMARY ===');
    const originalTotal = original.voices.reduce((sum, voice) => sum + voice.length, 0);
    const decompressedTotal = decompressed.voices.reduce((sum, voice) => sum + voice.length, 0);
    
    console.log(`Total original notes: ${originalTotal}`);
    console.log(`Total decompressed notes: ${decompressedTotal}`);
    console.log(`Total missing notes: ${originalTotal - decompressedTotal}`);
    
    if (originalTotal !== decompressedTotal) {
        console.log('\n🔍 ISSUE DETECTED: Note count mismatch suggests motif compression/decompression bug');
    } else {
        console.log('\n✅ Note counts match - no missing notes detected');
    }
}

// If run directly
if (require.main === module) {
    const args = process.argv.slice(2);
    if (args.length !== 2) {
        console.log('Usage: node analyze-note-differences.js <original-motif-free.json> <decompressed-motif-free.json>');
        process.exit(1);
    }
    
    analyzeNoteDifferences(args[0], args[1]);
}

module.exports = { analyzeNoteDifferences };