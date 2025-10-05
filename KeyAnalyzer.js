// KeyAnalyzer.js - Diatonic key detection for individual voices
// Non-invasive analysis layer for motif foundation

class KeyAnalyzer {
    constructor() {
        // Define major and minor key signatures with their accidentals
        this.majorKeys = {
            'C': [],
            'G': ['F#'],
            'D': ['F#', 'C#'],
            'A': ['F#', 'C#', 'G#'],
            'E': ['F#', 'C#', 'G#', 'D#'],
            'B': ['F#', 'C#', 'G#', 'D#', 'A#'],
            'F#': ['F#', 'C#', 'G#', 'D#', 'A#', 'E#'],
            'C#': ['F#', 'C#', 'G#', 'D#', 'A#', 'E#', 'B#'],
            'F': ['Bb'],
            'Bb': ['Bb', 'Eb'],
            'Eb': ['Bb', 'Eb', 'Ab'],
            'Ab': ['Bb', 'Eb', 'Ab', 'Db'],
            'Db': ['Bb', 'Eb', 'Ab', 'Db', 'Gb'],
            'Gb': ['Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb'],
            'Cb': ['Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb', 'Fb']
        };

        this.minorKeys = {
            'A': [],
            'E': ['F#'],
            'B': ['F#', 'C#'],
            'F#': ['F#', 'C#', 'G#'],
            'C#': ['F#', 'C#', 'G#', 'D#'],
            'G#': ['F#', 'C#', 'G#', 'D#', 'A#'],
            'D#': ['F#', 'C#', 'G#', 'D#', 'A#', 'E#'],
            'A#': ['F#', 'C#', 'G#', 'D#', 'A#', 'E#', 'B#'],
            'D': ['Bb'],
            'G': ['Bb', 'Eb'],
            'C': ['Bb', 'Eb', 'Ab'],
            'F': ['Bb', 'Eb', 'Ab', 'Db'],
            'Bb': ['Bb', 'Eb', 'Ab', 'Db', 'Gb'],
            'Eb': ['Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb'],
            'Ab': ['Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb', 'Fb']
        };

        // Circle of fifths for key relationships (clockwise: sharps increase, flats decrease)  
        this.circleOfFifths = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'Db', 'Ab', 'Eb', 'Bb', 'F'];
    }

    // Convert pitch notation to note name (e.g., "C4" -> "C", "F#5" -> "F#")
    pitchToNoteName(pitch) {
        if (!pitch || typeof pitch !== 'string') {
            return null; // Handle null or invalid pitch values
        }
        return pitch.slice(0, -1); // Remove octave number
    }

    // Analyze a single voice for key signature
    analyzeVoiceKey(voice, options = {}) {
        const windowSize = options.windowSize || 8; // Notes to analyze per window
        const minConfidence = options.minConfidence || 0.6;
        
        const keyChanges = [];
        
        // Analyze in sliding windows to detect key changes
        for (let i = 0; i < voice.length; i += windowSize) {
            const window = voice.slice(i, i + windowSize);
            const windowAnalysis = this.analyzeWindow(window);
            
            if (windowAnalysis.confidence >= minConfidence) {
                keyChanges.push({
                    startNote: i,
                    endNote: Math.min(i + windowSize - 1, voice.length - 1),
                    key: windowAnalysis.key,
                    mode: windowAnalysis.mode,
                    confidence: windowAnalysis.confidence,
                    accidentals: windowAnalysis.accidentals
                });
            }
        }

        // Merge adjacent windows with same key
        return this.mergeAdjacentKeys(keyChanges);
    }

    // Analyze a window of notes for key signature
    analyzeWindow(notes) {
        if (notes.length === 0) return null;

        const noteNames = notes.map(note => this.pitchToNoteName(note.pitch)).filter(name => name !== null);
        const noteSet = new Set(noteNames);
        
        // Calculate scores for each possible key
        let bestScore = -1;
        let bestKey = null;
        let bestMode = null;
        let detectedAccidentals = [];

        // Test major keys
        for (const key of Object.keys(this.majorKeys)) {
            const result = this.scoreKeyFit(noteSet, key, 'major');
            if (result.score > bestScore) {
                bestScore = result.score;
                bestKey = key;
                bestMode = 'major';
                detectedAccidentals = result.accidentals;
            }
        }

        // Test minor keys
        for (const key of Object.keys(this.minorKeys)) {
            const result = this.scoreKeyFit(noteSet, key, 'minor');
            if (result.score > bestScore) {
                bestScore = result.score;
                bestKey = key;
                bestMode = 'minor';
                detectedAccidentals = result.accidentals;
            }
        }

        return {
            key: bestKey,
            mode: bestMode,
            confidence: bestScore,
            accidentals: detectedAccidentals
        };
    }

    // Score how well a set of notes fits a key signature
    scoreKeyFit(noteSet, key, mode) {
        const keySignature = mode === 'major' ? this.majorKeys[key] : this.minorKeys[key];
        const diatonicNotes = this.getDiatonicScale(key, mode);
        
        let score = 0;
        let totalNotes = noteSet.size;
        let accidentalsFound = [];

        for (const note of noteSet) {
            if (diatonicNotes.includes(note)) {
                score += 1; // Perfect fit
            } else {
                // Check if it's an accidental that makes sense in this key
                const accidentalScore = this.scoreAccidental(note, key, mode);
                score += accidentalScore;
                if (accidentalScore > 0) {
                    accidentalsFound.push(note);
                }
            }
        }

        return {
            score: totalNotes > 0 ? score / totalNotes : 0,
            accidentals: accidentalsFound
        };
    }

    // Get the diatonic scale for a given key and mode
    getDiatonicScale(key, mode) {
        const majorScale = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
        const keySignature = mode === 'major' ? this.majorKeys[key] : this.minorKeys[key];
        
        // Apply key signature to the scale
        return majorScale.map(note => {
            for (const accidental of keySignature) {
                if (accidental.startsWith(note)) {
                    return accidental;
                }
            }
            return note;
        });
    }

    // Score how likely an accidental is in a given key
    scoreAccidental(note, key, mode) {
        // Common chromatic alterations get partial credit
        const commonChromaticAlterations = {
            // Leading tones, secondary dominants, etc.
            'F#': ['C', 'G', 'D', 'F'], // Common in many keys
            'C#': ['D', 'A', 'G'], 
            'G#': ['A', 'E'],
            'Bb': ['F', 'C', 'Eb'],
            'Eb': ['Bb', 'Ab', 'F'],
            'Ab': ['Eb', 'Db']
        };

        if (commonChromaticAlterations[note] && commonChromaticAlterations[note].includes(key)) {
            return 0.5; // Partial credit for common chromatic notes
        }

        return 0.1; // Small credit for any other accidental
    }

    // Merge adjacent key analysis windows with the same key
    mergeAdjacentKeys(keyChanges) {
        if (keyChanges.length <= 1) return keyChanges;

        const merged = [keyChanges[0]];
        
        for (let i = 1; i < keyChanges.length; i++) {
            const current = keyChanges[i];
            const last = merged[merged.length - 1];
            
            if (current.key === last.key && current.mode === last.mode) {
                // Merge with previous
                last.endNote = current.endNote;
                last.confidence = (last.confidence + current.confidence) / 2;
            } else {
                merged.push(current);
            }
        }

        return merged;
    }

    // Analyze all voices in a musical piece
    analyzeAllVoices(voices, options = {}) {
        const analysis = {
            globalKey: null,
            voiceKeys: [],
            keyChanges: []
        };

        // Analyze each voice separately
        voices.forEach((voice, index) => {
            const voiceKeyAnalysis = this.analyzeVoiceKey(voice, options);
            analysis.voiceKeys.push({
                voiceIndex: index,
                keyAnalysis: voiceKeyAnalysis
            });
        });

        // Determine overall key from voice analyses
        analysis.globalKey = this.determineGlobalKey(analysis.voiceKeys);

        return analysis;
    }

    // Determine the most likely global key from voice analyses
    determineGlobalKey(voiceAnalyses) {
        const keyVotes = {};
        
        voiceAnalyses.forEach(voice => {
            voice.keyAnalysis.forEach(segment => {
                const keyName = `${segment.key} ${segment.mode}`;
                keyVotes[keyName] = (keyVotes[keyName] || 0) + segment.confidence;
            });
        });

        // Find the key with the highest total confidence
        let bestKey = null;
        let bestScore = 0;
        
        for (const [keyName, score] of Object.entries(keyVotes)) {
            if (score > bestScore) {
                bestScore = score;
                bestKey = keyName;
            }
        }

        return bestKey ? {
            key: bestKey.split(' ')[0],
            mode: bestKey.split(' ')[1],
            confidence: bestScore
        } : null;
    }
}

module.exports = KeyAnalyzer;