const fs = require('fs');
const MotifDetector = require('./MotifDetector');
const MotifCompressor = require('./MotifCompressor');

// Load the original motif-free data
const original = JSON.parse(fs.readFileSync('bwv785-original-motif-free.json'));

console.log('=== DETAILED MATCH ANALYSIS ===');

// Create a motif compressor with debug
class DebugMotifCompressor extends MotifCompressor {
    selectNonOverlappingMotifs(compressibleMotifs, totalNotes) {
        console.log('\n=== OVERLAP DETECTION DEBUG ===');
        
        const selected = [];
        const occupiedPositions = new Map();
        let compressedNoteCount = 0;
        const maxCompressedNotes = totalNotes * this.maxCompressionRatio;
        
        compressibleMotifs.forEach((item, motifIndex) => {
            console.log(`\nAnalyzing motif ${motifIndex}:`);
            console.log(`- Voice: ${item.motif.voiceIndex}`);
            console.log(`- Position: ${item.motif.startIndex}-${item.motif.startIndex + item.motif.length}`);
            console.log(`- Length: ${item.motif.length}`);
            console.log(`- Total matches: ${item.matches.length}`);
            
            const voiceIndex = item.motif.voiceIndex;
            if (!occupiedPositions.has(voiceIndex)) {
                occupiedPositions.set(voiceIndex, []);
            }
            const occupied = occupiedPositions.get(voiceIndex);
            
            // Check if this motif overlaps with any already selected positions
            const motifStart = item.motif.startIndex;
            const motifEnd = motifStart + item.motif.length;
            
            let hasOverlap = false;
            
            // Check original motif position
            for (const pos of occupied) {
                if (motifStart < pos.end && motifEnd > pos.start) {
                    hasOverlap = true;
                    console.log(`  Original motif overlaps with occupied position ${pos.start}-${pos.end}`);
                    break;
                }
            }
            
            if (hasOverlap) {
                console.log(`  Skipping motif due to original position overlap`);
                return;
            }
            
            // Check match positions
            const validMatches = [];
            console.log(`  Checking ${item.matches.length} matches:`);
            
            for (let i = 0; i < item.matches.length; i++) {
                const match = item.matches[i];
                console.log(`    Match ${i}: voice ${match.voiceIndex}, pos ${match.motifIndex2}, conf ${match.confidence.toFixed(3)}`);
                
                if (match.motifIndex2 !== undefined) {
                    const matchStart = match.motifIndex2;
                    const matchEnd = matchStart + item.motif.length;
                    
                    // Get occupied positions for the match's voice
                    const matchVoiceIndex = match.voiceIndex;
                    if (!occupiedPositions.has(matchVoiceIndex)) {
                        occupiedPositions.set(matchVoiceIndex, []);
                    }
                    const matchOccupied = occupiedPositions.get(matchVoiceIndex);
                    
                    let matchHasOverlap = false;
                    for (const pos of matchOccupied) {
                        if (matchStart < pos.end && matchEnd > pos.start) {
                            matchHasOverlap = true;
                            console.log(`      Match overlaps with occupied position ${pos.start}-${pos.end}`);
                            break;
                        }
                    }
                    
                    if (!matchHasOverlap) {
                        validMatches.push(match);
                        console.log(`      Match VALID`);
                    } else {
                        console.log(`      Match REJECTED (overlap)`);
                    }
                } else {
                    console.log(`      Match REJECTED (no motifIndex2)`);
                }
            }
            
            console.log(`  Valid matches: ${validMatches.length}/${item.matches.length}`);
            
            if (validMatches.length > 0) {
                // Mark positions as occupied
                occupied.push({ start: motifStart, end: motifEnd });
                console.log(`  Marked original position ${motifStart}-${motifEnd} as occupied`);
                
                // Mark match positions as occupied
                validMatches.forEach((match, i) => {
                    if (match.motifIndex2 !== undefined) {
                        const matchStart = match.motifIndex2;
                        const matchEnd = matchStart + item.motif.length;
                        const matchVoiceIndex = match.voiceIndex;
                        
                        if (!occupiedPositions.has(matchVoiceIndex)) {
                            occupiedPositions.set(matchVoiceIndex, []);
                        }
                        const matchOccupied = occupiedPositions.get(matchVoiceIndex);
                        matchOccupied.push({ start: matchStart, end: matchEnd });
                        console.log(`  Marked match ${i} position ${matchStart}-${matchEnd} as occupied in voice ${matchVoiceIndex}`);
                    }
                });
                
                selected.push({
                    ...item,
                    matches: validMatches
                });
                
                console.log(`  Motif SELECTED with ${validMatches.length} matches`);
            } else {
                console.log(`  Motif REJECTED (no valid matches)`);
            }
        });
        
        console.log(`\nFinal selection: ${selected.length} motifs`);
        return selected;
    }
}

const debugCompressor = new DebugMotifCompressor();
const compressed = debugCompressor.compress(original);

console.log('\n=== FINAL RESULTS ===');
console.log(`Original Voice 2: ${original.voices[1].length} notes`);  
console.log(`Compressed Voice 2: ${compressed.voices[1].length} items`);