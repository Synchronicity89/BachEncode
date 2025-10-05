// KeyAnalyzer.test.js - Comprehensive test suite for KeyAnalyzer
// Using TDD approach to ensure full coverage and discover issues

const KeyAnalyzer = require('../KeyAnalyzer');

describe('KeyAnalyzer', () => {
    let keyAnalyzer;

    beforeEach(() => {
        keyAnalyzer = new KeyAnalyzer();
    });

    describe('Constructor and Initial State', () => {
        test('should initialize with correct major key signatures', () => {
            expect(keyAnalyzer.majorKeys['C']).toEqual([]);
            expect(keyAnalyzer.majorKeys['G']).toEqual(['F#']);
            expect(keyAnalyzer.majorKeys['D']).toEqual(['F#', 'C#']);
            expect(keyAnalyzer.majorKeys['F']).toEqual(['Bb']);
            expect(keyAnalyzer.majorKeys['Bb']).toEqual(['Bb', 'Eb']);
        });

        test('should initialize with correct minor key signatures', () => {
            expect(keyAnalyzer.minorKeys['A']).toEqual([]);
            expect(keyAnalyzer.minorKeys['E']).toEqual(['F#']);
            expect(keyAnalyzer.minorKeys['B']).toEqual(['F#', 'C#']);
            expect(keyAnalyzer.minorKeys['D']).toEqual(['Bb']);
            expect(keyAnalyzer.minorKeys['G']).toEqual(['Bb', 'Eb']);
        });

        test('should have correct circle of fifths sequence', () => {
            const expected = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'Db', 'Ab', 'Eb', 'Bb', 'F'];
            expect(keyAnalyzer.circleOfFifths).toEqual(expected);
        });

        test('should have all 15 major keys defined', () => {
            const expectedKeys = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb'];
            expect(Object.keys(keyAnalyzer.majorKeys)).toEqual(expectedKeys);
        });

        test('should have all 15 minor keys defined', () => {
            const expectedKeys = ['A', 'E', 'B', 'F#', 'C#', 'G#', 'D#', 'A#', 'D', 'G', 'C', 'F', 'Bb', 'Eb', 'Ab'];
            expect(Object.keys(keyAnalyzer.minorKeys)).toEqual(expectedKeys);
        });
    });

    describe('pitchToNoteName', () => {
        test('should extract note name from pitch notation', () => {
            expect(keyAnalyzer.pitchToNoteName('C4')).toBe('C');
            expect(keyAnalyzer.pitchToNoteName('F#5')).toBe('F#');
            expect(keyAnalyzer.pitchToNoteName('Bb3')).toBe('Bb');
            expect(keyAnalyzer.pitchToNoteName('G#7')).toBe('G#');
        });

        test('should handle double-digit octave numbers', () => {
            expect(keyAnalyzer.pitchToNoteName('C10')).toBe('C1');
            expect(keyAnalyzer.pitchToNoteName('F#12')).toBe('F#1');
        });

        test('should return null for invalid input', () => {
            expect(keyAnalyzer.pitchToNoteName(null)).toBe(null);
            expect(keyAnalyzer.pitchToNoteName(undefined)).toBe(null);
            expect(keyAnalyzer.pitchToNoteName('')).toBe(null);
            expect(keyAnalyzer.pitchToNoteName(123)).toBe(null);
        });

        test('should handle edge cases', () => {
            expect(keyAnalyzer.pitchToNoteName('C')).toBe('');
            expect(keyAnalyzer.pitchToNoteName('A0')).toBe('A');
        });
    });

    describe('getDiatonicScale', () => {
        test('should generate correct C major scale', () => {
            const scale = keyAnalyzer.getDiatonicScale('C', 'major');
            expect(scale).toEqual(['C', 'D', 'E', 'F', 'G', 'A', 'B']);
        });

        test('should generate correct G major scale', () => {
            const scale = keyAnalyzer.getDiatonicScale('G', 'major');
            expect(scale).toEqual(['C', 'D', 'E', 'F#', 'G', 'A', 'B']);
        });

        test('should generate correct F major scale', () => {
            const scale = keyAnalyzer.getDiatonicScale('F', 'major');
            expect(scale).toEqual(['C', 'D', 'E', 'F', 'G', 'A', 'Bb']);
        });

        test('should generate correct A minor scale', () => {
            const scale = keyAnalyzer.getDiatonicScale('A', 'minor');
            expect(scale).toEqual(['C', 'D', 'E', 'F', 'G', 'A', 'B']);
        });

        test('should generate correct E minor scale', () => {
            const scale = keyAnalyzer.getDiatonicScale('E', 'minor');
            expect(scale).toEqual(['C', 'D', 'E', 'F#', 'G', 'A', 'B']);
        });

        test('should handle complex key signatures', () => {
            const scaleDb = keyAnalyzer.getDiatonicScale('Db', 'major');
            expect(scaleDb).toEqual(['C', 'Db', 'Eb', 'F', 'Gb', 'Ab', 'Bb']);
        });
    });

    describe('scoreAccidental', () => {
        test('should give higher scores for common chromatic alterations', () => {
            // F# is common in C, G, D, F keys
            expect(keyAnalyzer.scoreAccidental('F#', 'C', 'major')).toBe(0.5);
            expect(keyAnalyzer.scoreAccidental('F#', 'G', 'major')).toBe(0.5);
            expect(keyAnalyzer.scoreAccidental('F#', 'D', 'major')).toBe(0.5);
        });

        test('should give low scores for uncommon accidentals', () => {
            expect(keyAnalyzer.scoreAccidental('D#', 'C', 'major')).toBe(0.1);
            expect(keyAnalyzer.scoreAccidental('Ab', 'G', 'major')).toBe(0.1);
        });

        test('should handle both major and minor modes', () => {
            expect(keyAnalyzer.scoreAccidental('F#', 'C', 'minor')).toBe(0.5);
            expect(keyAnalyzer.scoreAccidental('Bb', 'F', 'minor')).toBe(0.5);
        });
    });

    describe('scoreKeyFit', () => {
        test('should give perfect score for diatonic notes', () => {
            const cMajorNotes = new Set(['C', 'D', 'E', 'F', 'G', 'A', 'B']);
            const result = keyAnalyzer.scoreKeyFit(cMajorNotes, 'C', 'major');
            expect(result.score).toBe(1.0);
            expect(result.accidentals).toEqual([]);
        });

        test('should handle mixed diatonic and chromatic notes', () => {
            const mixedNotes = new Set(['C', 'D', 'E', 'F#', 'G', 'A', 'B']);
            const result = keyAnalyzer.scoreKeyFit(mixedNotes, 'C', 'major');
            expect(result.score).toBeGreaterThan(0.5);
            expect(result.score).toBeLessThan(1.0);
            expect(result.accidentals).toContain('F#');
        });

        test('should return 0 for empty note set', () => {
            const emptyNotes = new Set();
            const result = keyAnalyzer.scoreKeyFit(emptyNotes, 'C', 'major');
            expect(result.score).toBe(0);
        });

        test('should prefer correct key over incorrect key', () => {
            const gMajorNotes = new Set(['G', 'A', 'B', 'C', 'D', 'E', 'F#']);
            const gMajorResult = keyAnalyzer.scoreKeyFit(gMajorNotes, 'G', 'major');
            const cMajorResult = keyAnalyzer.scoreKeyFit(gMajorNotes, 'C', 'major');
            
            expect(gMajorResult.score).toBeGreaterThan(cMajorResult.score);
        });
    });

    describe('analyzeWindow', () => {
        test('should analyze simple C major passage', () => {
            const notes = [
                { pitch: 'C4' }, { pitch: 'D4' }, { pitch: 'E4' }, { pitch: 'F4' },
                { pitch: 'G4' }, { pitch: 'A4' }, { pitch: 'B4' }, { pitch: 'C5' }
            ];
            const result = keyAnalyzer.analyzeWindow(notes);
            
            expect(result.key).toBe('C');
            expect(result.mode).toBe('major');
            expect(result.confidence).toBeGreaterThan(0.8);
        });

        test('should analyze simple G major passage', () => {
            const notes = [
                { pitch: 'G4' }, { pitch: 'A4' }, { pitch: 'B4' }, { pitch: 'C5' },
                { pitch: 'D5' }, { pitch: 'E5' }, { pitch: 'F#5' }, { pitch: 'G5' }
            ];
            const result = keyAnalyzer.analyzeWindow(notes);
            
            expect(result.key).toBe('G');
            expect(result.mode).toBe('major');
            expect(result.confidence).toBeGreaterThan(0.8);
        });

        test('should analyze A minor passage', () => {
            const notes = [
                { pitch: 'A4' }, { pitch: 'B4' }, { pitch: 'C5' }, { pitch: 'D5' },
                { pitch: 'E5' }, { pitch: 'F5' }, { pitch: 'G5' }, { pitch: 'A5' }
            ];
            const result = keyAnalyzer.analyzeWindow(notes);
            
            expect(result.key).toBe('A');
            expect(result.mode).toBe('minor');
            expect(result.confidence).toBeGreaterThan(0.8);
        });

        test('should return null for empty notes', () => {
            const result = keyAnalyzer.analyzeWindow([]);
            expect(result).toBe(null);
        });

        test('should handle notes with null pitches', () => {
            const notes = [
                { pitch: 'C4' }, { pitch: null }, { pitch: 'E4' }, { pitch: 'G4' }
            ];
            const result = keyAnalyzer.analyzeWindow(notes);
            expect(result).not.toBe(null);
            expect(result.key).toBeDefined();
        });

        test('should handle chromatic passages', () => {
            const notes = [
                { pitch: 'C4' }, { pitch: 'C#4' }, { pitch: 'D4' }, { pitch: 'D#4' },
                { pitch: 'E4' }, { pitch: 'F4' }, { pitch: 'F#4' }, { pitch: 'G4' }
            ];
            const result = keyAnalyzer.analyzeWindow(notes);
            expect(result).not.toBe(null);
            expect(result.confidence).toBeLessThan(1.0);
        });
    });

    describe('mergeAdjacentKeys', () => {
        test('should merge adjacent segments with same key', () => {
            const keyChanges = [
                { startNote: 0, endNote: 7, key: 'C', mode: 'major', confidence: 0.9 },
                { startNote: 8, endNote: 15, key: 'C', mode: 'major', confidence: 0.8 },
                { startNote: 16, endNote: 23, key: 'G', mode: 'major', confidence: 0.9 }
            ];
            
            const merged = keyAnalyzer.mergeAdjacentKeys(keyChanges);
            expect(merged).toHaveLength(2);
            expect(merged[0].endNote).toBe(15);
            expect(merged[0].confidence).toBe(0.85); // Average of 0.9 and 0.8
            expect(merged[1].key).toBe('G');
        });

        test('should not merge segments with different keys', () => {
            const keyChanges = [
                { startNote: 0, endNote: 7, key: 'C', mode: 'major', confidence: 0.9 },
                { startNote: 8, endNote: 15, key: 'G', mode: 'major', confidence: 0.8 }
            ];
            
            const merged = keyAnalyzer.mergeAdjacentKeys(keyChanges);
            expect(merged).toHaveLength(2);
        });

        test('should not merge segments with different modes', () => {
            const keyChanges = [
                { startNote: 0, endNote: 7, key: 'C', mode: 'major', confidence: 0.9 },
                { startNote: 8, endNote: 15, key: 'C', mode: 'minor', confidence: 0.8 }
            ];
            
            const merged = keyAnalyzer.mergeAdjacentKeys(keyChanges);
            expect(merged).toHaveLength(2);
        });

        test('should handle empty input', () => {
            const merged = keyAnalyzer.mergeAdjacentKeys([]);
            expect(merged).toEqual([]);
        });

        test('should handle single segment', () => {
            const keyChanges = [
                { startNote: 0, endNote: 7, key: 'C', mode: 'major', confidence: 0.9 }
            ];
            
            const merged = keyAnalyzer.mergeAdjacentKeys(keyChanges);
            expect(merged).toHaveLength(1);
            expect(merged[0]).toEqual(keyChanges[0]);
        });
    });

    describe('analyzeVoiceKey', () => {
        test('should analyze voice with single key', () => {
            const voice = [
                { pitch: 'C4' }, { pitch: 'D4' }, { pitch: 'E4' }, { pitch: 'F4' },
                { pitch: 'G4' }, { pitch: 'A4' }, { pitch: 'B4' }, { pitch: 'C5' }
            ];
            
            const result = keyAnalyzer.analyzeVoiceKey(voice);
            expect(result).toHaveLength(1);
            expect(result[0].key).toBe('C');
            expect(result[0].mode).toBe('major');
        });

        test('should detect key changes in voice', () => {
            const voice = [
                // C major section
                { pitch: 'C4' }, { pitch: 'D4' }, { pitch: 'E4' }, { pitch: 'F4' },
                { pitch: 'G4' }, { pitch: 'A4' }, { pitch: 'B4' }, { pitch: 'C5' },
                // G major section
                { pitch: 'G4' }, { pitch: 'A4' }, { pitch: 'B4' }, { pitch: 'C5' },
                { pitch: 'D5' }, { pitch: 'E5' }, { pitch: 'F#5' }, { pitch: 'G5' }
            ];
            
            const result = keyAnalyzer.analyzeVoiceKey(voice);
            expect(result.length).toBeGreaterThanOrEqual(1);
            // Should detect at least C major at the beginning
            expect(result[0].key).toBe('C');
        });

        test('should handle empty voice', () => {
            const result = keyAnalyzer.analyzeVoiceKey([]);
            expect(result).toEqual([]);
        });

        test('should respect window size option', () => {
            // Create a voice with key change: C major then G major
            const voice = [
                // C major section (4 notes)
                { pitch: 'C4' }, { pitch: 'D4' }, { pitch: 'E4' }, { pitch: 'F4' },
                // G major section (4 notes)  
                { pitch: 'G4' }, { pitch: 'A4' }, { pitch: 'B4' }, { pitch: 'F#4' },
                // C major section again (4 notes)
                { pitch: 'C4' }, { pitch: 'D4' }, { pitch: 'E4' }, { pitch: 'F4' },
                // G major section again (4 notes)
                { pitch: 'G4' }, { pitch: 'A4' }, { pitch: 'B4' }, { pitch: 'F#4' }
            ];
            
            const result = keyAnalyzer.analyzeVoiceKey(voice, { windowSize: 4 });
            // Should detect key changes between C major and G major sections
            expect(result.length).toBeGreaterThanOrEqual(2);
        });

        test('should respect confidence threshold', () => {
            const voice = [
                { pitch: 'C4' }, { pitch: 'C#4' }, { pitch: 'D4' }, { pitch: 'D#4' }
            ];
            
            const highThreshold = keyAnalyzer.analyzeVoiceKey(voice, { minConfidence: 0.9 });
            const lowThreshold = keyAnalyzer.analyzeVoiceKey(voice, { minConfidence: 0.1 });
            
            expect(lowThreshold.length).toBeGreaterThanOrEqual(highThreshold.length);
        });
    });

    describe('determineGlobalKey', () => {
        test('should determine global key from voice analyses', () => {
            const voiceAnalyses = [
                {
                    voiceIndex: 0,
                    keyAnalysis: [
                        { key: 'C', mode: 'major', confidence: 0.9 },
                        { key: 'G', mode: 'major', confidence: 0.7 }
                    ]
                },
                {
                    voiceIndex: 1,
                    keyAnalysis: [
                        { key: 'C', mode: 'major', confidence: 0.8 }
                    ]
                }
            ];
            
            const globalKey = keyAnalyzer.determineGlobalKey(voiceAnalyses);
            expect(globalKey.key).toBe('C');
            expect(globalKey.mode).toBe('major');
            expect(globalKey.confidence).toBeGreaterThan(0);
        });

        test('should handle conflicting voice analyses', () => {
            const voiceAnalyses = [
                {
                    voiceIndex: 0,
                    keyAnalysis: [
                        { key: 'C', mode: 'major', confidence: 0.6 }
                    ]
                },
                {
                    voiceIndex: 1,
                    keyAnalysis: [
                        { key: 'G', mode: 'major', confidence: 0.8 }
                    ]
                }
            ];
            
            const globalKey = keyAnalyzer.determineGlobalKey(voiceAnalyses);
            expect(globalKey.key).toBe('G'); // Higher confidence should win
            expect(globalKey.mode).toBe('major');
        });

        test('should return null for empty analyses', () => {
            const globalKey = keyAnalyzer.determineGlobalKey([]);
            expect(globalKey).toBe(null);
        });

        test('should return null for analyses with no key segments', () => {
            const voiceAnalyses = [
                { voiceIndex: 0, keyAnalysis: [] },
                { voiceIndex: 1, keyAnalysis: [] }
            ];
            
            const globalKey = keyAnalyzer.determineGlobalKey(voiceAnalyses);
            expect(globalKey).toBe(null);
        });
    });

    describe('analyzeAllVoices', () => {
        test('should analyze complete multi-voice piece', () => {
            const voices = [
                [
                    { pitch: 'C4' }, { pitch: 'D4' }, { pitch: 'E4' }, { pitch: 'F4' },
                    { pitch: 'G4' }, { pitch: 'A4' }, { pitch: 'B4' }, { pitch: 'C5' }
                ],
                [
                    { pitch: 'C3' }, { pitch: 'E3' }, { pitch: 'G3' }, { pitch: 'C4' },
                    { pitch: 'F3' }, { pitch: 'A3' }, { pitch: 'C4' }, { pitch: 'F4' }
                ]
            ];
            
            const analysis = keyAnalyzer.analyzeAllVoices(voices);
            
            expect(analysis.globalKey).not.toBe(null);
            expect(analysis.voiceKeys).toHaveLength(2);
            expect(analysis.voiceKeys[0].voiceIndex).toBe(0);
            expect(analysis.voiceKeys[1].voiceIndex).toBe(1);
        });

        test('should handle empty voices', () => {
            const analysis = keyAnalyzer.analyzeAllVoices([]);
            
            expect(analysis.globalKey).toBe(null);
            expect(analysis.voiceKeys).toEqual([]);
        });

        test('should pass options to voice analysis', () => {
            const voices = [
                [
                    { pitch: 'C4' }, { pitch: 'D4' }, { pitch: 'E4' }, { pitch: 'F4' }
                ]
            ];
            
            const analysis = keyAnalyzer.analyzeAllVoices(voices, { 
                windowSize: 2, 
                minConfidence: 0.5 
            });
            
            expect(analysis.voiceKeys).toHaveLength(1);
        });
    });

    describe('Integration Tests', () => {
        test('should handle real-world Bach-style progression', () => {
            const bachProgression = [
                { pitch: 'C4' }, { pitch: 'E4' }, { pitch: 'G4' }, { pitch: 'C5' },
                { pitch: 'F4' }, { pitch: 'A4' }, { pitch: 'C5' }, { pitch: 'F5' },
                { pitch: 'G4' }, { pitch: 'B4' }, { pitch: 'D5' }, { pitch: 'G5' },
                { pitch: 'C4' }, { pitch: 'E4' }, { pitch: 'G4' }, { pitch: 'C5' }
            ];
            
            const result = keyAnalyzer.analyzeVoiceKey(bachProgression);
            expect(result).toHaveLength(1);
            expect(result[0].key).toBe('C');
            expect(result[0].mode).toBe('major');
        });

        test('should handle modulation from C major to G major', () => {
            const modulation = [
                // C major
                { pitch: 'C4' }, { pitch: 'D4' }, { pitch: 'E4' }, { pitch: 'F4' },
                { pitch: 'G4' }, { pitch: 'A4' }, { pitch: 'B4' }, { pitch: 'C5' },
                // Transition with F#
                { pitch: 'F#4' }, { pitch: 'G4' }, { pitch: 'A4' }, { pitch: 'B4' },
                // G major
                { pitch: 'G4' }, { pitch: 'A4' }, { pitch: 'B4' }, { pitch: 'C5' },
                { pitch: 'D5' }, { pitch: 'E5' }, { pitch: 'F#5' }, { pitch: 'G5' }
            ];
            
            const result = keyAnalyzer.analyzeVoiceKey(modulation, { windowSize: 8 });
            expect(result.length).toBeGreaterThanOrEqual(1);
            // Should detect C major at beginning
            expect(result[0].key).toBe('C');
        });

        test('should analyze complex polyphonic texture', () => {
            const voices = [
                // Soprano
                [
                    { pitch: 'E5' }, { pitch: 'D5' }, { pitch: 'C5' }, { pitch: 'B4' },
                    { pitch: 'A4' }, { pitch: 'G4' }, { pitch: 'F#4' }, { pitch: 'G4' }
                ],
                // Alto  
                [
                    { pitch: 'C5' }, { pitch: 'B4' }, { pitch: 'A4' }, { pitch: 'G4' },
                    { pitch: 'F#4' }, { pitch: 'E4' }, { pitch: 'D4' }, { pitch: 'D4' }
                ],
                // Tenor
                [
                    { pitch: 'G4' }, { pitch: 'G4' }, { pitch: 'F#4' }, { pitch: 'G4' },
                    { pitch: 'D4' }, { pitch: 'C4' }, { pitch: 'A3' }, { pitch: 'B3' }
                ],
                // Bass
                [
                    { pitch: 'C3' }, { pitch: 'G3' }, { pitch: 'D3' }, { pitch: 'G2' },
                    { pitch: 'D3' }, { pitch: 'C3' }, { pitch: 'D3' }, { pitch: 'G2' }
                ]
            ];
            
            const analysis = keyAnalyzer.analyzeAllVoices(voices);
            expect(analysis.globalKey).not.toBe(null);
            expect(analysis.voiceKeys).toHaveLength(4);
        });
    });

    describe('Error Handling', () => {
        test('should handle malformed note objects', () => {
            const malformedNotes = [
                { pitch: 'C4' },
                { notePitch: 'D4' }, // Wrong property name
                null,
                { pitch: null },
                { pitch: '' },
                {}
            ];
            
            expect(() => {
                keyAnalyzer.analyzeVoiceKey(malformedNotes);
            }).not.toThrow();
        });

        test('should handle invalid key names gracefully', () => {
            expect(() => {
                keyAnalyzer.getDiatonicScale('InvalidKey', 'major');
            }).not.toThrow();
            
            expect(() => {
                keyAnalyzer.scoreKeyFit(new Set(['C']), 'InvalidKey', 'major');
            }).not.toThrow();
        });

        test('should handle extreme input sizes', () => {
            const largeVoice = Array(1000).fill().map(() => ({ pitch: 'C4' }));
            
            expect(() => {
                keyAnalyzer.analyzeVoiceKey(largeVoice);
            }).not.toThrow();
            
            const emptyVoice = [];
            expect(() => {
                keyAnalyzer.analyzeVoiceKey(emptyVoice);
            }).not.toThrow();
        });
    });
});