// MotifDetector.js - Diatonic motif detection and transformation system
// Built on top of KeyAnalyzer for scale-degree based motif analysis

const KeyAnalyzer = require('./KeyAnalyzer');

class MotifDetector {
    constructor() {
        this.keyAnalyzer = new KeyAnalyzer();
        
        // Diatonic scale degrees (1-based)
        this.scaleDegrees = {
            'C': 1, 'D': 2, 'E': 3, 'F': 4, 'G': 5, 'A': 6, 'B': 7
        };
        
        // For handling accidentals in scale degree calculation
        // Note: Enharmonic equivalents must have the same scale degree
        this.chromaticToScaleDegree = {
            'C': 1, 'C#': 1.5, 'Db': 1.5,
            'D': 2, 'D#': 2.5, 'Eb': 2.5,
            'E': 3, 'E#': 4, 'Fb': 3,        // E# = F, Fb = E
            'F': 4, 'F#': 4.5, 'Gb': 4.5,
            'G': 5, 'G#': 5.5, 'Ab': 5.5,
            'A': 6, 'A#': 6.5, 'Bb': 6.5,
            'B': 7, 'B#': 1, 'Cb': 7         // B# = C, Cb = B
        };

        // Minimum motif length and similarity thresholds
        this.minMotifLength = 3;
        this.maxMotifLength = 12;
        this.similarityThreshold = 0.6; // Lowered for better pattern detection
        this.rhythmSimilarityThreshold = 0.5; // Lowered for better rhythm matching
    }

    // Convert a note to scale degree within a given key context
    noteToScaleDegree(noteName, keyContext) {
        const { key, mode } = keyContext;
        
        // Get the base scale degree
        const baseNote = noteName.replace(/[#b]/g, '');
        let scaleDegree = this.scaleDegrees[baseNote];
        
        if (!scaleDegree) return null;
        
        // Adjust for key transposition - the key root should be scale degree 1
        const keyRoot = this.scaleDegrees[key];
        scaleDegree = ((scaleDegree - keyRoot + 7) % 7) + 1;
        
        // Handle accidentals
        if (noteName.includes('#')) {
            scaleDegree += 0.5;
        } else if (noteName.includes('b')) {
            scaleDegree -= 0.5;
        }
        
        // No additional adjustment needed for minor mode since the key parameter 
        // already represents the tonic (A for A minor, C for C major)
        
        return scaleDegree;
    }

    // Convert a voice to scale degree representation
    voiceToScaleDegrees(voice, keyAnalysis) {
        const scaleDegreeVoice = [];
        
        voice.forEach((note, index) => {
            // Skip null notes or notes with invalid pitch values
            if (!note || !note.pitch || typeof note.pitch !== 'string') {
                return;
            }
            
            // Find the key context for this note
            const keyContext = this.getKeyContextForNote(index, keyAnalysis);
            const noteName = note.pitch.slice(0, -1); // Remove octave
            const scaleDegree = this.noteToScaleDegree(noteName, keyContext);
            
            scaleDegreeVoice.push({
                scaleDegree,
                delta: note.delta,
                dur: note.dur,
                vel: note.vel,
                originalPitch: note.pitch,
                keyContext,
                noteIndex: index
            });
        });
        
        return scaleDegreeVoice;
    }

    // Find the key context for a specific note index
    getKeyContextForNote(noteIndex, keyAnalysis) {
        for (const segment of keyAnalysis) {
            if (noteIndex >= segment.startNote && noteIndex <= segment.endNote) {
                return { key: segment.key, mode: segment.mode };
            }
        }
        // Default to first key if not found
        return keyAnalysis.length > 0 ? 
            { key: keyAnalysis[0].key, mode: keyAnalysis[0].mode } : 
            { key: 'C', mode: 'major' };
    }

    // Extract motif patterns from a voice
    extractMotifs(voice, keyAnalysis, options = {}) {
        const minLength = options.minLength || this.minMotifLength;
        const maxLength = options.maxLength || this.maxMotifLength;
        
        const scaleDegreeVoice = this.voiceToScaleDegrees(voice, keyAnalysis);
        const motifs = [];
        
        // Extract all possible motif candidates
        for (let start = 0; start < scaleDegreeVoice.length; start++) {
            for (let length = minLength; length <= maxLength && start + length <= scaleDegreeVoice.length; length++) {
                const candidate = scaleDegreeVoice.slice(start, start + length);
                
                // Skip if contains too many null scale degrees (chromatic notes)
                const validNotes = candidate.filter(n => n.scaleDegree !== null).length;
                if (validNotes / candidate.length < 0.7) continue;
                
                const motif = this.createMotifFromCandidate(candidate, start);
                motifs.push(motif);
            }
        }
        
        return motifs;
    }

    // Create a motif object from a candidate sequence
    createMotifFromCandidate(candidate, startIndex) {
        const pitchPattern = candidate.map(n => n.scaleDegree).filter(d => d !== null);
        const rhythmPattern = candidate.map(n => ({ delta: n.delta, dur: n.dur }));
        
        // Calculate interval pattern (diatonic intervals)
        const intervalPattern = [];
        for (let i = 1; i < pitchPattern.length; i++) {
            intervalPattern.push(pitchPattern[i] - pitchPattern[i - 1]);
        }
        
        return {
            startIndex,
            length: candidate.length,
            pitchPattern,
            intervalPattern,
            rhythmPattern,
            keyContext: candidate[0].keyContext,
            originalNotes: candidate,
            id: this.generateMotifId(pitchPattern, intervalPattern)
        };
    }

    // Generate a unique ID for a motif pattern
    generateMotifId(pitchPattern, intervalPattern) {
        const pitchStr = pitchPattern.map(p => p.toFixed(1)).join(',');
        const intervalStr = intervalPattern.map(i => i.toFixed(1)).join(',');
        return `P[${pitchStr}]I[${intervalStr}]`;
    }

    // Find motif matches with transformations - FIXED for compression
    findMotifMatches(motifs, allVoices, options = {}, keyAnalysis = null) {
        const matches = [];
        const transformations = options.transformations || ['exact', 'retrograde', 'inversion', 'retrograde-inversion'];
        const allowTimeDilation = options.allowTimeDilation !== false;
        
        // Add performance limits to prevent stack overflow on complex pieces like BWV785
        const maxMotifs = Math.min(motifs.length, 50); // Limit motifs processed
        const maxPositionsPerVoice = 100; // Limit positions checked per voice
        
        // For each motif, find all occurrences throughout all voices
        for (let i = 0; i < maxMotifs; i++) {
            const candidateMotif = motifs[i];
            
            // Search through all voices for this motif pattern
            allVoices.forEach((voice, voiceIndex) => {
                // Limit search positions to prevent performance explosion
                const maxPos = Math.min(voice.length - candidateMotif.length, maxPositionsPerVoice);
                
                // Search through limited positions in this voice
                for (let pos = 0; pos <= maxPos; pos++) {
                    // Skip if this is the original motif position or overlaps with it in the same voice
                    if (candidateMotif.voiceIndex !== undefined && voiceIndex === candidateMotif.voiceIndex) {
                        const candidateStart = candidateMotif.startIndex;
                        const candidateEnd = candidateStart + candidateMotif.length - 1;
                        const testStart = pos;
                        const testEnd = pos + candidateMotif.length - 1;
                        
                        // Skip if positions overlap (including exact match)
                        if (testStart <= candidateEnd && testEnd >= candidateStart) {
                            continue;
                        }
                    }
                    
                    // Create a test motif at this position
                    // Extract voice-specific key analysis
                    const voiceKeyAnalysis = keyAnalysis ? 
                        (keyAnalysis.voiceKeys?.find(v => v.voiceIndex === voiceIndex)?.keyAnalysis || []) : [];
                    const testMotif = this.extractMotifAtPosition(voice, pos, candidateMotif.length, voiceIndex, voiceKeyAnalysis);
                    
                    // Test each transformation type
                    for (const transformation of transformations) {
                        const similarity = this.compareMotifs(candidateMotif, testMotif, transformation, allowTimeDilation);
                        
                        if (similarity.pitch >= this.similarityThreshold) {
                            matches.push({
                                motif1: candidateMotif,
                                motif2: testMotif,
                                motifIndex2: pos,
                                voiceIndex: voiceIndex,
                                transformation,
                                pitchSimilarity: similarity.pitch,
                                rhythmSimilarity: similarity.rhythm,
                                timeDilation: similarity.timeDilation,
                                confidence: similarity.overall
                            });
                        }
                    }
                }
            });
        }
        
        return matches;
    }
    
    // Helper method to extract a motif at a specific position
    extractMotifAtPosition(notes, startIndex, length, voiceIndex, keyAnalysis) {
        const motifNotes = notes.slice(startIndex, startIndex + length);
        
        // Convert to scale degrees (consistent with extractMotifs)
        const scaleDegreeNotes = [];
        for (let i = 0; i < motifNotes.length; i++) {
            const note = motifNotes[i];
            if (!note || !note.pitch || typeof note.pitch !== 'string') {
                continue;
            }
            
            const keyContext = this.getKeyContextForNote(startIndex + i, keyAnalysis);
            const noteName = note.pitch.slice(0, -1); // Remove octave
            const scaleDegree = this.noteToScaleDegree(noteName, keyContext);
            
            scaleDegreeNotes.push({
                ...note,
                scaleDegree,
                keyContext
            });
        }
        
        // Calculate patterns using scale degrees (consistent with extractMotifs)
        const pitchPattern = scaleDegreeNotes.map(n => n.scaleDegree).filter(d => d !== null);
        const intervalPattern = [];
        const rhythmPattern = [];
        
        for (let i = 1; i < pitchPattern.length; i++) {
            intervalPattern.push(pitchPattern[i] - pitchPattern[i - 1]);
        }
        
        for (let i = 0; i < scaleDegreeNotes.length; i++) {
            rhythmPattern.push({
                delta: scaleDegreeNotes[i].delta,
                dur: scaleDegreeNotes[i].dur
            });
        }
        
        return {
            startIndex,
            length,
            voiceIndex,
            notes: motifNotes,
            pitchPattern,
            intervalPattern,
            rhythmPattern,
            originalNotes: motifNotes
        };
    }

    // Compare two motifs with a specific transformation
    compareMotifs(motif1, motif2, transformation, allowTimeDilation = true) {
        let transformedPattern2 = [...motif2.intervalPattern];
        
        // Apply transformation to motif2's interval pattern
        switch (transformation) {
            case 'exact':
                // No transformation
                break;
            case 'retrograde':
                transformedPattern2 = transformedPattern2.reverse();
                break;
            case 'inversion':
                transformedPattern2 = transformedPattern2.map(interval => -interval);
                break;
            case 'retrograde-inversion':
                transformedPattern2 = transformedPattern2.map(interval => -interval).reverse();
                break;
        }
        
        // Compare interval patterns
        const pitchSimilarity = this.calculatePatternSimilarity(motif1.intervalPattern, transformedPattern2);
        
        // Compare rhythm patterns
        const rhythmSimilarity = this.calculateRhythmSimilarity(motif1.rhythmPattern, motif2.rhythmPattern, allowTimeDilation);
        
        return {
            pitch: pitchSimilarity.similarity,
            rhythm: rhythmSimilarity.similarity,
            timeDilation: rhythmSimilarity.timeDilation,
            overall: (pitchSimilarity.similarity + rhythmSimilarity.similarity) / 2
        };
    }

    // Calculate similarity between two interval patterns
    calculatePatternSimilarity(pattern1, pattern2) {
        if (pattern1.length !== pattern2.length) {
            return { similarity: 0 };
        }
        
        let matches = 0;
        const tolerance = 0.5; // Allow for small variations in scale degrees
        
        for (let i = 0; i < pattern1.length; i++) {
            if (Math.abs(pattern1[i] - pattern2[i]) <= tolerance) {
                matches++;
            }
        }
        
        return { similarity: matches / pattern1.length };
    }

    // Calculate rhythm similarity with optional time dilation
    calculateRhythmSimilarity(rhythm1, rhythm2, allowTimeDilation = true) {
        if (rhythm1.length !== rhythm2.length) {
            return { similarity: 0, timeDilation: 1 };
        }
        
        let bestSimilarity = 0;
        let bestDilation = 1;
        
        // Test different time dilations if allowed
        const dilationFactors = allowTimeDilation ? [0.5, 0.75, 1, 1.25, 1.5, 2] : [1];
        
        for (const dilation of dilationFactors) {
            const similarity = this.compareRhythmsWithDilation(rhythm1, rhythm2, dilation);
            if (similarity > bestSimilarity) {
                bestSimilarity = similarity;
                bestDilation = dilation;
            }
        }
        
        return { similarity: bestSimilarity, timeDilation: bestDilation };
    }

    // Compare rhythms with a specific time dilation factor
    compareRhythmsWithDilation(rhythm1, rhythm2, dilation) {
        let matches = 0;
        const tolerance = 0.1; // 10% tolerance for timing
        
        for (let i = 0; i < rhythm1.length; i++) {
            const adjustedDelta2 = rhythm2[i].delta * dilation;
            const adjustedDur2 = rhythm2[i].dur * dilation;
            
            const deltaMatch = Math.abs(rhythm1[i].delta - adjustedDelta2) / Math.max(rhythm1[i].delta, adjustedDelta2) <= tolerance;
            const durMatch = Math.abs(rhythm1[i].dur - adjustedDur2) / Math.max(rhythm1[i].dur, adjustedDur2) <= tolerance;
            
            if (deltaMatch && durMatch) {
                matches++;
            }
        }
        
        return matches / rhythm1.length;
    }

    // Main analysis function: detect all motifs and their relationships
    analyzeMotifs(voices, options = {}) {
        console.log('Starting motif analysis...');
        
        // First, analyze keys for all voices
        const keyAnalysis = this.keyAnalyzer.analyzeAllVoices(voices, options.keyOptions);
        
        const results = {
            keyAnalysis,
            voiceMotifs: [],
            motifMatches: [],
            statistics: {
                totalMotifs: 0, 
                totalMatches: 0,
                transformationCounts: {}
            }
        };
        
        // Extract motifs from each voice
        voices.forEach((voice, voiceIndex) => {
            console.log(`Analyzing voice ${voiceIndex}...`);
            const voiceKeyAnalysis = keyAnalysis.voiceKeys.find(v => v.voiceIndex === voiceIndex)?.keyAnalysis || [];
            const motifs = this.extractMotifs(voice, voiceKeyAnalysis, options.motifOptions);
            
            // Add voiceIndex to each motif
            motifs.forEach(motif => {
                motif.voiceIndex = voiceIndex;
            });
            
            results.voiceMotifs.push({
                voiceIndex,
                motifs,
                count: motifs.length
            });
            
            results.statistics.totalMotifs += motifs.length;
        });
        
        // Find matches across all voices for each voice's motifs
        results.voiceMotifs.forEach(voiceData => {
            console.log(`Finding matches in voice ${voiceData.voiceIndex}...`);
            const matches = this.findMotifMatches(voiceData.motifs, voices, options.matchOptions, keyAnalysis);
            
            matches.forEach(match => {
                match.type = 'cross-voice';
            });
            
            results.motifMatches.push(...matches);
        });
        
        // TODO: Cross-voice motif matching (for future enhancement)
        
        // Calculate statistics
        results.statistics.totalMatches = results.motifMatches.length;
        results.motifMatches.forEach(match => {
            results.statistics.transformationCounts[match.transformation] = 
                (results.statistics.transformationCounts[match.transformation] || 0) + 1;
        });
        
        console.log(`Motif analysis complete: ${results.statistics.totalMotifs} motifs, ${results.statistics.totalMatches} matches`);
        return results;
    }

    // Convert pitch name to MIDI number for interval calculations
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
}

module.exports = MotifDetector;