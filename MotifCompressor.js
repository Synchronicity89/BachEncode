/**
 * MotifCompressor.js - Motif-based compression layer for musical data
 * Extends standard note-level compression with motif pattern references
 */

const KeyAnalyzer = require('./KeyAnalyzer');
const MotifDetector = require('./MotifDetector');

// Load configuration with exact matches only as the new default
function loadDefaultConfig() {
    try {
        const { loadMotifConfig } = require('./motif-config');
        return loadMotifConfig();
    } catch (error) {
        // Fallback to safe defaults if config module not available
        return {
            exactMatchesOnly: true,  // Changed default to true based on user feedback
            conservativeMode: true,
            compressionThreshold: 0.8,
            minMotifMatches: 1,
            maxCompressionRatio: 1.0
        };
    }
}

class MotifCompressor {
    constructor(options = {}) {
        // Load defaults from configuration, then override with provided options
        const defaults = loadDefaultConfig();
        const config = { ...defaults, ...options };
        
        this.keyAnalyzer = new KeyAnalyzer();
        this.motifDetector = new MotifDetector();
        this.compressionThreshold = config.compressionThreshold;
        this.minMotifMatches = config.minMotifMatches;
        this.maxCompressionRatio = config.maxCompressionRatio;
        this.conservativeMode = config.conservativeMode;
        this.exactMatchesOnly = config.exactMatchesOnly;
        
        if (this.exactMatchesOnly) {
            console.log('🎯 MotifCompressor: Using exact matches only (no transformations)');
        } else {
            console.log('🔄 MotifCompressor: Allowing transformations (retrograde, inversion, etc.)');
        }
    }

    /**
     * Compress musical data using motif pattern recognition
     * @param {Object} musicData - Standard compressed format with voices
     * @returns {Object} - Enhanced format with motif references
     */
    compress(musicData) {
        console.log('=== MOTIF COMPRESSION STARTING ===');
        
        // Start with the original data structure
        const compressed = JSON.parse(JSON.stringify(musicData));
        
        // Add motif compression metadata
        compressed.motifCompression = {
            enabled: true,
            version: "1.0",
            motifLibrary: [],
            compressionStats: {
                originalNotes: 0,
                compressedReferences: 0,
                compressionRatio: 1.0
            }
        };

        // Analyze keys and motifs for all voices
        const allNotes = this.extractAllNotes(musicData);
        console.log(`Analyzing ${allNotes.length} notes across ${musicData.voices.length} voices`);
        
        const motifAnalysis = this.motifDetector.analyzeMotifs(musicData.voices);
        
        console.log(`Found ${motifAnalysis.statistics.totalMotifs} motifs with ${motifAnalysis.statistics.totalMatches} matches`);
        
        // Identify compressible motifs
        const compressibleMotifs = this.identifyCompressibleMotifs(motifAnalysis, allNotes.length);
        console.log(`${compressibleMotifs.length} motifs qualify for compression`);
        
        if (compressibleMotifs.length === 0) {
            console.log('No motifs qualify for compression, returning original format');
            return musicData; // Fall back to original format
        }
        
        // Build motif library
        compressed.motifCompression.motifLibrary = this.buildMotifLibrary(compressibleMotifs);
        
        // Replace note sequences with motif references
        this.replaceWithMotifReferences(compressed, compressibleMotifs, motifAnalysis);
        
        // Calculate compression statistics
        this.calculateCompressionStats(compressed, allNotes.length);
        
        console.log(`Compression ratio: ${compressed.motifCompression.compressionStats.compressionRatio.toFixed(3)}x`);
        console.log('=== MOTIF COMPRESSION COMPLETE ===');
        
        return compressed;
    }

    /**
     * Decompress motif-compressed data back to standard format
     * @param {Object} compressedData - Motif-compressed format
     * @returns {Object} - Standard note-level format
     */
    decompress(compressedData) {
        if (!compressedData.motifCompression || !compressedData.motifCompression.enabled) {
            return compressedData; // Already in standard format
        }
        
        console.log('=== MOTIF DECOMPRESSION STARTING ===');
        
        // Create decompressed copy
        const decompressed = JSON.parse(JSON.stringify(compressedData));
        
        // Remove motif compression metadata
        delete decompressed.motifCompression;
        
        // Expand motif references back to notes
        this.expandMotifReferences(decompressed, compressedData.motifCompression.motifLibrary);
        
        console.log('=== MOTIF DECOMPRESSION COMPLETE ===');
        
        return decompressed;
    }

    /**
     * Extract all notes from voice data for analysis
     */
    extractAllNotes(musicData) {
        const allNotes = [];
        musicData.voices.forEach((voice, voiceIndex) => {
            voice.forEach((note, noteIndex) => {
                allNotes.push({
                    ...note,
                    voiceIndex,
                    noteIndex
                });
            });
        });
        return allNotes;
    }

    /**
     * Identify motifs that are worth compressing
     */
    identifyCompressibleMotifs(motifAnalysis, totalNotes) {
        const motifMatchCounts = new Map();
        
        // Count matches per motif using voice, startIndex, and length as unique identifier
        // Only count motif1 to avoid double-counting (each match represents motif1 found at motif2's position)
        motifAnalysis.motifMatches.forEach(match => {
            const motif1Key = `${match.motif1.voiceIndex}_${match.motif1.startIndex}_${match.motif1.length}`;
            motifMatchCounts.set(motif1Key, (motifMatchCounts.get(motif1Key) || 0) + 1);
        });
        
        console.log(`Total motif matches: ${motifAnalysis.motifMatches.length}`);
        console.log(`Match counts: ${Array.from(motifMatchCounts.entries()).slice(0, 5).map(([k, v]) => `${k}:${v}`).join(', ')}`);
        
        // Filter motifs that meet compression criteria
        const compressible = [];
        
        // Iterate through all voice motifs
        motifAnalysis.voiceMotifs.forEach(voiceData => {
            voiceData.motifs.forEach((motif, motifIndex) => {
                const motifKey = `${voiceData.voiceIndex}_${motif.startIndex}_${motif.length}`;
                const matchCount = motifMatchCounts.get(motifKey) || 0;
                
                if (matchCount >= this.minMotifMatches) {
                    // Find all matches for this motif (for debugging)
                    const allMatches = motifAnalysis.motifMatches.filter(match => 
                        (match.motif1.startIndex === motif.startIndex || match.motif2.startIndex === motif.startIndex) && 
                        match.voiceIndex === voiceData.voiceIndex
                    );
                    
                    // Find high-confidence matches for this motif
                    let highConfidenceMatches = allMatches.filter(match => 
                        match.confidence >= this.compressionThreshold
                    );
                    
                    // Remove duplicate matches at the same position (keep highest confidence)
                    const uniqueMatches = new Map();
                    highConfidenceMatches.forEach(match => {
                        const key = `${match.voiceIndex}_${match.motifIndex2}`;
                        if (!uniqueMatches.has(key) || uniqueMatches.get(key).confidence < match.confidence) {
                            uniqueMatches.set(key, match);
                        }
                    });
                    highConfidenceMatches = Array.from(uniqueMatches.values());
                    
                    // In conservative mode, prefer exact matches (no transformations)
                    if (this.conservativeMode || this.exactMatchesOnly) {
                        const exactMatches = highConfidenceMatches.filter(match => 
                            match.transformation === 'exact'
                        );
                        // In exactMatchesOnly mode, ONLY use exact matches
                        if (this.exactMatchesOnly) {
                            highConfidenceMatches = exactMatches;
                            // Additional safety: ensure we have truly exact matches
                            console.log(`ExactMatchesOnly: Found ${exactMatches.length} exact matches out of ${highConfidenceMatches.length} total matches for motif ${voiceData.voiceIndex}_${motif.startIndex}`);
                            // Debug: log any non-exact transformations being filtered out
                            const filteredOut = allMatches.filter(match => match.transformation !== 'exact');
                            if (filteredOut.length > 0) {
                                console.log(`  Filtered out ${filteredOut.length} non-exact transformations: ${filteredOut.map(m => m.transformation).join(', ')}`);
                            }
                        } else if (exactMatches.length >= this.minMotifMatches) {
                            // In conservative mode, prefer exact matches but fall back if needed
                            highConfidenceMatches = exactMatches;
                        }
                    }
                    
                    // Debug: show confidence scores for first few motifs
                    if (compressible.length < 3 && allMatches.length > 0) {
                        console.log(`Motif ${voiceData.voiceIndex}_${motif.startIndex}: ${allMatches.length} matches, confidences: [${allMatches.map(m => m.confidence.toFixed(2)).join(', ')}]`);
                    }
                    
                    if (highConfidenceMatches.length >= this.minMotifMatches) {
                        compressible.push({
                            motif: { ...motif, voiceIndex: voiceData.voiceIndex },
                            motifIndex,
                            matches: highConfidenceMatches,
                            savings: this.calculatePotentialSavings(motif, highConfidenceMatches)
                        });
                    }
                }
            });
        });
        
        // Sort by potential compression savings
        // Sort compressible motifs - in conservative mode, prefer shorter motifs for better integrity
        const sortedCompressible = compressible.sort((a, b) => {
            if (this.conservativeMode) {
                // Prefer shorter motifs first, then by savings
                if (a.motif.length !== b.motif.length) {
                    return a.motif.length - b.motif.length;
                }
            }
            return b.savings - a.savings;
        });
        
        // Apply non-overlapping selection to prevent over-compression
        return this.selectNonOverlappingMotifs(sortedCompressible, totalNotes);
    }

    /**
     * Select non-overlapping motifs to prevent over-compression
     */
    selectNonOverlappingMotifs(compressibleMotifs, totalNotes) {
        const selected = [];
        const occupiedPositions = new Map(); // Track occupied positions per voice
        let compressedNoteCount = 0; // Track how many notes will be compressed
        const maxCompressedNotes = totalNotes * this.maxCompressionRatio;
        
        compressibleMotifs.forEach(item => {
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
                    break;
                }
            }
            
            if (!hasOverlap) {
                // Check match positions with intra-motif overlap detection
                const validMatches = [];
                const selectedMatchPositions = []; // Track positions selected within this motif
                
                // Sort matches by confidence (highest first) to prefer better matches when overlapping
                const sortedMatches = [...item.matches].sort((a, b) => b.confidence - a.confidence);
                
                for (const match of sortedMatches) {
                    if (match.motifIndex2 !== undefined) {
                        const matchStart = match.motifIndex2;
                        const matchEnd = matchStart + item.motif.length;
                        
                        // Get occupied positions for the match's voice
                        const matchVoiceIndex = match.voiceIndex;
                        if (!occupiedPositions.has(matchVoiceIndex)) {
                            occupiedPositions.set(matchVoiceIndex, []);
                        }
                        const matchOccupied = occupiedPositions.get(matchVoiceIndex);
                        
                        // Check overlap with previously occupied positions (from other motifs)
                        let matchHasOverlap = false;
                        for (const pos of matchOccupied) {
                            if (matchStart < pos.end && matchEnd > pos.start) {
                                matchHasOverlap = true;
                                break;
                            }
                        }
                        
                        // Check overlap with other matches selected for this same motif
                        if (!matchHasOverlap) {
                            for (const selectedPos of selectedMatchPositions) {
                                if (selectedPos.voice === matchVoiceIndex && 
                                    matchStart < selectedPos.end && matchEnd > selectedPos.start) {
                                    matchHasOverlap = true;
                                    // Debug: log intra-motif overlap detection
                                    console.log(`      Match REJECTED (intra-motif overlap with ${selectedPos.start}-${selectedPos.end})`);
                                    break;
                                }
                            }
                        }
                        
                        if (!matchHasOverlap) {
                            validMatches.push(match);
                            selectedMatchPositions.push({
                                voice: matchVoiceIndex,
                                start: matchStart,
                                end: matchEnd
                            });
                        }
                    }
                }
                
                if (validMatches.length > 0) {
                    // Calculate space saved by this motif compression
                    // We replace motif.length notes with 1 reference for each match
                    // So we save (motif.length - 1) notes per match
                    const notesSaved = (item.motif.length - 1) * validMatches.length;
                    
                    // Check if this compression would provide meaningful savings
                    // Skip motifs that don't provide significant compression benefit
                    if (notesSaved <= 0) {
                        console.log(`Skipping motif with no compression benefit (saves ${notesSaved} notes)`);
                        return;
                    }
                    
                    // Add this motif and mark positions as occupied
                    occupied.push({ start: motifStart, end: motifEnd });
                    
                    // Mark match positions as occupied in their respective voices
                    validMatches.forEach(match => {
                        if (match.motifIndex2 !== undefined) {
                            const matchStart = match.motifIndex2;
                            const matchEnd = matchStart + item.motif.length;
                            const matchVoiceIndex = match.voiceIndex;
                            
                            // Get the occupied positions for this match's voice
                            if (!occupiedPositions.has(matchVoiceIndex)) {
                                occupiedPositions.set(matchVoiceIndex, []);
                            }
                            const matchOccupied = occupiedPositions.get(matchVoiceIndex);
                            matchOccupied.push({ start: matchStart, end: matchEnd });
                        }
                    });
                    
                    // Check if adding this motif would exceed compression ratio limit
                    if (compressedNoteCount + notesSaved <= maxCompressedNotes) {
                        // Update compressed note count  
                        compressedNoteCount += notesSaved;
                        
                        selected.push({
                            ...item,
                            matches: validMatches
                        });
                    } else {
                        // In Bach pieces, capture all valid motifs regardless of ratio
                        // Only skip if it would cause serious over-compression issues
                        if (this.maxCompressionRatio < 1.0) {
                            console.log(`Skipping motif to respect maxCompressionRatio limit (${this.maxCompressionRatio})`);
                        } else {
                            // Allow compression beyond the arbitrary limit for complete motif capture
                            compressedNoteCount += notesSaved;
                            selected.push({
                                ...item,
                                matches: validMatches
                            });
                        }
                    }
                }
            }
        });
        
        return selected;
    }

    /**
     * Calculate potential compression savings for a motif
     */
    calculatePotentialSavings(motif, matches) {
        const motifSize = motif.length;
        const referenceSize = 1; // One motif reference replaces multiple notes
        const totalMatches = matches.length + 1; // Include original
        
        return (motifSize * totalMatches) - (motifSize + (referenceSize * matches.length));
    }

    /**
     * Build the motif library for compression metadata
     */
    buildMotifLibrary(compressibleMotifs) {
        return compressibleMotifs.map((item, libraryIndex) => ({
            id: `motif_${libraryIndex}`,
            originalVoice: item.motif.voiceIndex,
            originalPosition: item.motif.startIndex,
            length: item.motif.length,
            pitchPattern: item.motif.pitchPattern,
            intervalPattern: item.motif.intervalPattern,
            keyContext: item.motif.keyContext,
            originalNotes: item.motif.originalNotes,
            matches: item.matches.length,
            confidence: item.matches.reduce((sum, m) => sum + m.confidence, 0) / item.matches.length
        }));
    }

    /**
     * Replace note sequences with motif references
     */
    replaceWithMotifReferences(compressed, compressibleMotifs, motifAnalysis) {
        // First, mark all existing notes as regular notes
        compressed.voices.forEach(voice => {
            voice.forEach(note => {
                if (!note.type) {
                    note.type = 'regular_note';
                }
            });
        });
        
        // Track positions to replace (in reverse order to avoid index shifting)
        const replacements = [];
        
        compressibleMotifs.forEach((item, libraryIndex) => {
            const motifId = `motif_${libraryIndex}`;
            
            // Replace the original motif location
            replacements.push({
                voiceIndex: item.motif.voiceIndex,
                startIndex: item.motif.startIndex,
                length: item.motif.length,
                replacement: {
                    type: 'motif_original',
                    motifId: motifId,
                    notes: item.motif.originalNotes // Keep original notes for reference
                }
            });
            
            // Replace each match location
            item.matches.forEach(match => {
                // Additional safety check: in exactMatchesOnly mode, skip any non-exact matches
                if (this.exactMatchesOnly && match.transformation !== 'exact') {
                    console.log(`SAFETY CHECK: Skipping non-exact transformation '${match.transformation}' in exactMatchesOnly mode`);
                    return;
                }
                
                replacements.push({
                    voiceIndex: match.voiceIndex,
                    startIndex: match.motifIndex2, // The matched motif position
                    length: item.motif.length,
                    replacement: {
                        type: 'motif_reference',
                        motifId: motifId,
                        transformation: match.transformation,
                        confidence: match.confidence,
                        timeDilation: match.timeDilation || 1.0
                    }
                });
            });
        });
        
        // Sort replacements by position (reverse order)
        replacements.sort((a, b) => {
            if (a.voiceIndex !== b.voiceIndex) return b.voiceIndex - a.voiceIndex;
            return b.startIndex - a.startIndex;
        });
        
        // Apply replacements
        replacements.forEach(replacement => {
            const voice = compressed.voices[replacement.voiceIndex];
            // Preserve all timing properties from the first note being replaced
            const firstNote = voice[replacement.startIndex];
            if (firstNote) {
                // Preserve all timing-related properties
                if (firstNote.delta !== undefined) replacement.replacement.delta = firstNote.delta;
                if (firstNote.start !== undefined) replacement.replacement.start = firstNote.start;
                if (firstNote.tick !== undefined) replacement.replacement.tick = firstNote.tick;
                if (firstNote.instanceId !== undefined) replacement.replacement.instanceId = firstNote.instanceId;
            }
            voice.splice(replacement.startIndex, replacement.length, replacement.replacement);
        });
        
        compressed.motifCompression.compressionStats.compressedReferences = replacements.length;
    }

    /**
     * Expand motif references back to note sequences
     */
    expandMotifReferences(decompressed, motifLibrary) {
        const motifMap = new Map();
        motifLibrary.forEach(motif => {
            motifMap.set(motif.id, motif);
        });
        
        decompressed.voices.forEach((voice, voiceIndex) => {
            for (let i = voice.length - 1; i >= 0; i--) {
                const item = voice[i];
                
                if (item.type === 'motif_original') {
                    // Replace with original notes - preserve all original properties with consistent ordering
                    const originalNotes = item.notes.map(note => {
                        // Ensure consistent property order: delta, pitch, dur, vel
                        return {
                            delta: note.delta,
                            pitch: note.pitch || note.originalPitch,
                            dur: note.dur,
                            vel: note.vel
                        };
                    });
                    voice.splice(i, 1, ...originalNotes);
                } else if (item.type === 'motif_reference') {
                    // Expand motif reference with transformation
                    const motifDef = motifMap.get(item.motifId);
                    if (motifDef) {
                        const expandedNotes = this.applyMotifTransformation(
                            motifDef.originalNotes,
                            item.transformation,
                            item.timeDilation
                        );
                        // Clean up expanded notes and preserve timing from reference with consistent ordering
                        const cleanedNotes = expandedNotes.map((note, index) => {
                            // Ensure consistent property order: delta, pitch, dur, vel
                            const cleanedNote = {
                                delta: note.delta,
                                pitch: note.pitch || note.originalPitch,
                                dur: note.dur,
                                vel: note.vel
                            };
                            
                            // For the first note, preserve timing properties from the motif reference
                            if (index === 0) {
                                if (item.delta !== undefined) cleanedNote.delta = item.delta;
                                if (item.start !== undefined) cleanedNote.start = item.start;
                                if (item.tick !== undefined) cleanedNote.tick = item.tick;
                                if (item.instanceId !== undefined) cleanedNote.instanceId = item.instanceId;
                            }
                            return cleanedNote;
                        });
                        
                        // Adjust deltas for voice synchronization - convert to start-time relative deltas
                        if (cleanedNotes.length > 1) {
                            // For subsequent notes after the first, calculate deltas relative to previous note start times
                            // This matches the fixed timing model in EncodeDecode.js
                            for (let noteIndex = 1; noteIndex < cleanedNotes.length; noteIndex++) {
                                const prevNote = cleanedNotes[noteIndex - 1];
                                const currentNote = cleanedNotes[noteIndex];
                                
                                // Preserve the original relative timing structure but ensure deltas are start-to-start
                                if (currentNote.delta !== undefined && prevNote.delta !== undefined) {
                                    // Keep the original delta as it represents start-to-start timing
                                    // No adjustment needed - the fixed EncodeDecode will handle this correctly
                                }
                            }
                        }
                        voice.splice(i, 1, ...cleanedNotes);
                    }
                } else if (item.type === 'regular_note') {
                    // Regular note - remove the type property and keep as-is
                    delete item.type;
                }
                // If no type, assume it's already a regular note and leave as-is
            }
        });
    }

    /**
     * Apply transformation to motif notes
     */
    applyMotifTransformation(originalNotes, transformation, timeDilation = 1.0) {
        // SIMPLIFIED: Only support exact matches to prevent timing and synchronization issues
        // All transformation logic has been disabled for now
        
        let transformedNotes = originalNotes.map(note => ({ ...note }));
        
        // COMMENTED OUT: Pitch transformations disabled for exact matches only
        /*
        if (transformation === 'retrograde') {
            transformedNotes = transformedNotes.reverse();
        } else if (transformation === 'inversion') {
            // Apply pitch inversion (flip intervals around center)
            const centerPitch = this.calculateCenterPitch(transformedNotes);
            transformedNotes = transformedNotes.map(note => {
                const pitch = note.pitch || note.originalPitch;
                return {
                    ...note,
                    pitch: this.invertPitch(pitch, centerPitch),
                    originalPitch: this.invertPitch(pitch, centerPitch)
                };
            });
        } else if (transformation === 'retrograde-inversion') {
            // Apply both transformations
            transformedNotes = transformedNotes.reverse();
            const centerPitch = this.calculateCenterPitch(transformedNotes);
            transformedNotes = transformedNotes.map(note => {
                const pitch = note.pitch || note.originalPitch;
                return {
                    ...note,
                    pitch: this.invertPitch(pitch, centerPitch),
                    originalPitch: this.invertPitch(pitch, centerPitch)
                };
            });
        }
        */
        
        // COMMENTED OUT: Time dilation disabled for exact matches only
        /*
        if (timeDilation !== 1.0) {
            transformedNotes = transformedNotes.map(note => ({
                ...note,
                dur: Math.round(note.dur * timeDilation)
            }));
        }
        */
        
        // Only return exact copies - no transformations applied
        return transformedNotes;
    }

    /**
     * Calculate center pitch for inversion
     */
    calculateCenterPitch(notes) {
        const pitches = notes.map(note => this.pitchToMidi(note.pitch || note.originalPitch));
        const minPitch = Math.min(...pitches);
        const maxPitch = Math.max(...pitches);
        return (minPitch + maxPitch) / 2;
    }

    /**
     * Convert pitch name to MIDI number
     */
    pitchToMidi(pitch) {
        // If it's already a number, return it
        if (typeof pitch === 'number') {
            return pitch;
        }
        
        // If it's undefined or null, return default
        if (!pitch) {
            return 60; // Default to C4
        }
        
        // Handle string pitch names
        const noteMap = { 'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11 };
        const match = pitch.match(/^([A-G])([#b]?)(\d+)$/);
        if (!match) return 60; // Default to C4
        
        const [, note, accidental, octave] = match;
        let midi = noteMap[note] + (parseInt(octave) + 1) * 12;
        
        if (accidental === '#') midi += 1;
        else if (accidental === 'b') midi -= 1;
        
        return midi;
    }

    /**
     * Convert MIDI number to pitch name
     */
    midiToPitch(midiNumber) {
        const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const octave = Math.floor(midiNumber / 12) - 1;
        const note = noteNames[midiNumber % 12];
        return `${note}${octave}`;
    }

    /**
     * Invert pitch around center point
     */
    invertPitch(pitchName, centerMidi) {
        const originalMidi = this.pitchToMidi(pitchName);
        const invertedMidi = Math.round(2 * centerMidi - originalMidi);
        return this.midiToPitch(invertedMidi);
    }

    /**
     * Calculate final compression statistics
     */
    calculateCompressionStats(compressed, originalNoteCount) {
        compressed.motifCompression.compressionStats.originalNotes = originalNoteCount;
        
        // Count remaining notes
        let remainingNotes = 0;
        compressed.voices.forEach(voice => {
            voice.forEach(item => {
                if (item.type === 'motif_original') {
                    remainingNotes += item.notes.length;
                } else if (item.type === 'motif_reference') {
                    remainingNotes += 1; // Reference counts as 1 unit
                } else {
                    remainingNotes += 1; // Regular note
                }
            });
        });
        
        compressed.motifCompression.compressionStats.compressionRatio = 
            originalNoteCount / remainingNotes;
    }
}

module.exports = MotifCompressor;