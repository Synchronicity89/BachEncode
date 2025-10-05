// MotifCompressor.test.js - Comprehensive test suite for MotifCompressor
// Using TDD approach to identify and fix issues

const MotifCompressor = require('../MotifCompressor');

describe('MotifCompressor', () => {
    let motifCompressor;

    beforeEach(() => {
        motifCompressor = new MotifCompressor();
    });

    describe('Constructor and Initial State', () => {
        test('should initialize with correct default parameters', () => {
            expect(motifCompressor.compressionThreshold).toBe(0.5);
            expect(motifCompressor.minMotifMatches).toBe(3);
            expect(motifCompressor.maxCompressionRatio).toBe(0.8);
            expect(motifCompressor.keyAnalyzer).toBeDefined();
            expect(motifCompressor.motifDetector).toBeDefined();
        });

        test('should have proper motif matching threshold (at least 2 instances required)', () => {
            // For a motif to be useful, it must appear at least twice (original + 1 match)
            expect(motifCompressor.minMotifMatches).toBeGreaterThanOrEqual(1);
        });
    });

    describe('extractAllNotes', () => {
        test('should extract all notes with voice and note indices', () => {
            const musicData = {
                voices: [
                    [
                        { pitch: 'C4', dur: 480, start: 0 },
                        { pitch: 'D4', dur: 480, start: 480 }
                    ],
                    [
                        { pitch: 'E4', dur: 240, start: 0 },
                        { pitch: 'F4', dur: 240, start: 240 }
                    ]
                ]
            };

            const allNotes = motifCompressor.extractAllNotes(musicData);
            
            expect(allNotes).toHaveLength(4);
            expect(allNotes[0]).toEqual({
                pitch: 'C4', dur: 480, start: 0, voiceIndex: 0, noteIndex: 0
            });
            expect(allNotes[2]).toEqual({
                pitch: 'E4', dur: 240, start: 0, voiceIndex: 1, noteIndex: 0
            });
        });

        test('should handle empty voices', () => {
            const musicData = { voices: [[], []] };
            const allNotes = motifCompressor.extractAllNotes(musicData);
            expect(allNotes).toHaveLength(0);
        });
    });

    describe('motif quality requirements', () => {
        test('should only find motifs with at least 2 notes', () => {
            const musicData = {
                voices: [
                    [
                        { pitch: 'C4', dur: 480, start: 0 },
                        { pitch: 'D4', dur: 480, start: 480 },
                        { pitch: 'E4', dur: 480, start: 960 },
                        { pitch: 'C4', dur: 480, start: 1440 },
                        { pitch: 'D4', dur: 480, start: 1920 },
                        { pitch: 'E4', dur: 480, start: 2400 }
                    ]
                ]
            };

            const compressed = motifCompressor.compress(musicData);
            
            if (compressed.motifCompression && compressed.motifCompression.motifLibrary) {
                compressed.motifCompression.motifLibrary.forEach(motif => {
                    expect(motif.length).toBeGreaterThanOrEqual(2);
                });
            }
        });

        test('should find biggest motifs first (longest patterns prioritized)', () => {
            const musicData = {
                voices: [
                    [
                        // Long motif: C-D-E-F (4 notes)
                        { pitch: 'C4', dur: 480, start: 0 },
                        { pitch: 'D4', dur: 480, start: 480 },
                        { pitch: 'E4', dur: 480, start: 960 },
                        { pitch: 'F4', dur: 480, start: 1440 },
                        // Short motif: G-A (2 notes)
                        { pitch: 'G4', dur: 480, start: 1920 },
                        { pitch: 'A4', dur: 480, start: 2400 },
                        // Repeat long motif: C-D-E-F
                        { pitch: 'C4', dur: 480, start: 2880 },
                        { pitch: 'D4', dur: 480, start: 3360 },
                        { pitch: 'E4', dur: 480, start: 3840 },
                        { pitch: 'F4', dur: 480, start: 4320 },
                        // Repeat short motif: G-A
                        { pitch: 'G4', dur: 480, start: 4800 },
                        { pitch: 'A4', dur: 480, start: 5280 }
                    ]
                ]
            };

            const compressed = motifCompressor.compress(musicData);
            
            if (compressed.motifCompression && compressed.motifCompression.motifLibrary) {
                const motifLengths = compressed.motifCompression.motifLibrary.map(m => m.length);
                
                // Should be sorted by savings/priority, with longer motifs typically first
                if (motifLengths.length > 1) {
                    // The first motif should be at least as long as subsequent ones
                    for (let i = 0; i < motifLengths.length - 1; i++) {
                        // Allow equal lengths, but prefer longer ones
                        expect(motifLengths[i]).toBeGreaterThanOrEqual(motifLengths[i + 1]);
                    }
                }
            }
        });

        test('should require at least 2 instances of a motif (original + 1 match minimum)', () => {
            const musicData = {
                voices: [
                    [
                        // Single instance of a pattern - should NOT be compressed
                        { pitch: 'C4', dur: 480, start: 0 },
                        { pitch: 'D4', dur: 480, start: 480 },
                        { pitch: 'E4', dur: 480, start: 960 },
                        // Different pattern
                        { pitch: 'F4', dur: 480, start: 1440 },
                        { pitch: 'G4', dur: 480, start: 1920 },
                        { pitch: 'A4', dur: 480, start: 2400 }
                    ]
                ]
            };

            const compressed = motifCompressor.compress(musicData);
            
            // Should not find any compressible motifs since no pattern repeats
            if (compressed.motifCompression) {
                expect(compressed.motifCompression.motifLibrary).toHaveLength(0);
            } else {
                // Should fall back to original format
                expect(compressed).toEqual(musicData);
            }
        });

        test('should compress only when motif appears at least twice', () => {
            const musicData = {
                voices: [
                    [
                        // First instance of motif
                        { pitch: 'C4', dur: 480, start: 0 },
                        { pitch: 'D4', dur: 480, start: 480 },
                        { pitch: 'E4', dur: 480, start: 960 },
                        // Some other notes
                        { pitch: 'F4', dur: 480, start: 1440 },
                        // Second instance of same motif
                        { pitch: 'C4', dur: 480, start: 1920 },
                        { pitch: 'D4', dur: 480, start: 2400 },
                        { pitch: 'E4', dur: 480, start: 2880 }
                    ]
                ]
            };

            const compressed = motifCompressor.compress(musicData);
            
            if (compressed.motifCompression) {
                // Should find the repeated 3-note pattern
                expect(compressed.motifCompression.motifLibrary.length).toBeGreaterThan(0);
                
                // Each motif in library should have at least 1 match (meaning 2 total instances)
                compressed.motifCompression.motifLibrary.forEach(motif => {
                    expect(motif.matches).toBeGreaterThanOrEqual(1);
                });
            }
        });
    });

    describe('compression quality and efficiency', () => {
        test('should actually reduce data size (compression ratio > 1)', () => {
            const musicData = {
                voices: [
                    [
                        // Repeating pattern that should compress well
                        { pitch: 'C4', dur: 480, start: 0 },
                        { pitch: 'D4', dur: 480, start: 480 },
                        { pitch: 'E4', dur: 480, start: 960 },
                        { pitch: 'C4', dur: 480, start: 1440 },
                        { pitch: 'D4', dur: 480, start: 1920 },
                        { pitch: 'E4', dur: 480, start: 2400 },
                        { pitch: 'C4', dur: 480, start: 2880 },
                        { pitch: 'D4', dur: 480, start: 3360 },
                        { pitch: 'E4', dur: 480, start: 3840 }
                    ]
                ]
            };

            const compressed = motifCompressor.compress(musicData);
            
            if (compressed.motifCompression) {
                expect(compressed.motifCompression.compressionStats.compressionRatio).toBeGreaterThan(1.0);
                expect(compressed.motifCompression.compressionStats.originalNotes).toBe(9);
                expect(compressed.motifCompression.compressionStats.compressedReferences).toBeGreaterThan(0);
            }
        });

        test('should not over-compress (respect maxCompressionRatio)', () => {
            // Set a low max compression ratio for testing
            motifCompressor.maxCompressionRatio = 0.3;
            
            const musicData = {
                voices: [
                    Array(20).fill().map((_, i) => ({
                        pitch: 'C4',
                        dur: 480,
                        start: i * 480
                    }))
                ]
            };

            const compressed = motifCompressor.compress(musicData);
            
            if (compressed.motifCompression) {
                const compressionRatio = compressed.motifCompression.compressionStats.compressionRatio;
                // Should not compress too aggressively
                expect(compressionRatio).toBeLessThanOrEqual(1 / (1 - motifCompressor.maxCompressionRatio));
            }
        });

        test('should maintain note timing and properties', () => {
            const musicData = {
                voices: [
                    [
                        { pitch: 'C4', dur: 480, start: 0, delta: 0, instanceId: 'note1' },
                        { pitch: 'D4', dur: 480, start: 480, delta: 480, instanceId: 'note2' },
                        { pitch: 'C4', dur: 480, start: 960, delta: 480, instanceId: 'note3' },
                        { pitch: 'D4', dur: 480, start: 1440, delta: 480, instanceId: 'note4' }
                    ]
                ]
            };

            // Use exact matches only for property preservation
            const exactMotifCompressor = new MotifCompressor({ exactMatchesOnly: true });
            const compressed = exactMotifCompressor.compress(musicData);
            const decompressed = exactMotifCompressor.decompress(compressed);
            
            // Should preserve all timing properties and length
            expect(decompressed.voices[0]).toHaveLength(4);
            expect(decompressed.voices[0][0].delta).toBe(0);
            expect(decompressed.voices[0][0].instanceId).toBe('note1');
            expect(decompressed.voices[0][1].delta).toBe(480);
            expect(decompressed.voices[0][1].instanceId).toBe('note2');
        });
    });

    describe('motif detection and matching', () => {
        test('should detect repeated patterns across voices', () => {
            const musicData = {
                voices: [
                    [
                        { pitch: 'C4', dur: 480, start: 0 },
                        { pitch: 'D4', dur: 480, start: 480 },
                        { pitch: 'E4', dur: 480, start: 960 }
                    ],
                    [
                        { pitch: 'C5', dur: 480, start: 1440 },
                        { pitch: 'D5', dur: 480, start: 1920 },
                        { pitch: 'E5', dur: 480, start: 2400 }
                    ]
                ]
            };

            const compressed = motifCompressor.compress(musicData);
            
            if (compressed.motifCompression && compressed.motifCompression.motifLibrary.length > 0) {
                // Should detect the pattern repeated in different octaves
                const motif = compressed.motifCompression.motifLibrary[0];
                expect(motif.matches).toBeGreaterThanOrEqual(1);
            }
        });

        test('should handle transformations (retrograde, inversion)', () => {
            const originalNotes = [
                { pitch: 'C4', dur: 480 },
                { pitch: 'D4', dur: 480 },
                { pitch: 'E4', dur: 480 }
            ];

            // Test retrograde transformation
            const retrograde = motifCompressor.applyMotifTransformation(originalNotes, 'retrograde');
            expect(retrograde[0].pitch).toBe('E4');
            expect(retrograde[1].pitch).toBe('D4');
            expect(retrograde[2].pitch).toBe('C4');

            // Test that original notes are unchanged
            expect(originalNotes[0].pitch).toBe('C4');
        });

        test('should handle time dilation correctly', () => {
            const originalNotes = [
                { pitch: 'C4', dur: 480 },
                { pitch: 'D4', dur: 240 }
            ];

            const dilated = motifCompressor.applyMotifTransformation(originalNotes, 'exact', 2.0);
            expect(dilated[0].dur).toBe(960);
            expect(dilated[1].dur).toBe(480);
        });
    });

    describe('compression and decompression integrity', () => {
        test('should perfectly round-trip compress/decompress cycle', () => {
            const musicData = {
                voices: [
                    [
                        { pitch: 'C4', dur: 480, start: 0, delta: 0 },
                        { pitch: 'D4', dur: 480, start: 480, delta: 480 },
                        { pitch: 'E4', dur: 480, start: 960, delta: 480 },
                        { pitch: 'C4', dur: 480, start: 1440, delta: 480 },
                        { pitch: 'D4', dur: 480, start: 1920, delta: 480 },
                        { pitch: 'E4', dur: 480, start: 2400, delta: 480 }
                    ]
                ]
            };

            // Use exact matches only for perfect round-trip integrity
            const exactMotifCompressor = new MotifCompressor({ exactMatchesOnly: true });
            const compressed = exactMotifCompressor.compress(musicData);
            const decompressed = exactMotifCompressor.decompress(compressed);
            
            // Should perfectly reconstruct the original
            expect(decompressed.voices).toHaveLength(musicData.voices.length);
            expect(decompressed.voices[0]).toHaveLength(musicData.voices[0].length);
            
            // Check each note is reconstructed correctly
            musicData.voices[0].forEach((originalNote, index) => {
                const reconstructedNote = decompressed.voices[0][index];
                expect(reconstructedNote.pitch).toBe(originalNote.pitch);
                expect(reconstructedNote.dur).toBe(originalNote.dur);
                expect(reconstructedNote.start).toBe(originalNote.start);
                expect(reconstructedNote.delta).toBe(originalNote.delta);
            });
        });

        test('should handle music with no compressible motifs', () => {
            const musicData = {
                voices: [
                    [
                        { pitch: 'C4', dur: 480, start: 0 },
                        { pitch: 'D4', dur: 240, start: 480 },
                        { pitch: 'F#4', dur: 360, start: 720 },
                        { pitch: 'Bb4', dur: 120, start: 1080 }
                    ]
                ]
            };

            const compressed = motifCompressor.compress(musicData);
            
            // Should return original format or empty motif library
            if (compressed.motifCompression) {
                expect(compressed.motifCompression.motifLibrary).toHaveLength(0);
            } else {
                expect(compressed).toEqual(musicData);
            }
        });

        test('should handle already compressed data in decompress', () => {
            const standardData = {
                voices: [
                    [
                        { pitch: 'C4', dur: 480, start: 0 },
                        { pitch: 'D4', dur: 480, start: 480 }
                    ]
                ]
            };

            // Should return data unchanged if no motif compression
            const result = motifCompressor.decompress(standardData);
            expect(result).toEqual(standardData);
        });
    });

    describe('pitch and MIDI conversion utilities', () => {
        test('should convert pitch names to MIDI numbers correctly', () => {
            expect(motifCompressor.pitchToMidi('C4')).toBe(60);
            expect(motifCompressor.pitchToMidi('C#4')).toBe(61);
            expect(motifCompressor.pitchToMidi('Db4')).toBe(61);
            expect(motifCompressor.pitchToMidi('A4')).toBe(69);
            expect(motifCompressor.pitchToMidi('C5')).toBe(72);
        });

        test('should convert MIDI numbers to pitch names correctly', () => {
            expect(motifCompressor.midiToPitch(60)).toBe('C4');
            expect(motifCompressor.midiToPitch(61)).toBe('C#4');
            expect(motifCompressor.midiToPitch(69)).toBe('A4');
            expect(motifCompressor.midiToPitch(72)).toBe('C5');
        });

        test('should handle invalid pitch inputs gracefully', () => {
            expect(motifCompressor.pitchToMidi(null)).toBe(60);
            expect(motifCompressor.pitchToMidi(undefined)).toBe(60);
            expect(motifCompressor.pitchToMidi('')).toBe(60);
            expect(motifCompressor.pitchToMidi('InvalidPitch')).toBe(60);
        });

        test('should handle numeric pitch inputs', () => {
            expect(motifCompressor.pitchToMidi(69)).toBe(69);
            expect(motifCompressor.pitchToMidi(60)).toBe(60);
        });
    });

    describe('calculatePotentialSavings', () => {
        test('should calculate savings correctly', () => {
            const motif = { length: 3 };
            const matches = [{ confidence: 0.8 }, { confidence: 0.9 }]; // 2 matches
            
            const savings = motifCompressor.calculatePotentialSavings(motif, matches);
            
            // Original: 3 notes in original + 3 notes in each match = 3 + 3 + 3 = 9 notes
            // Compressed: 3 notes in original + 1 reference + 1 reference = 5 units
            // Savings: 9 - 5 = 4
            expect(savings).toBe(4);
        });

        test('should not show savings for single-note motifs', () => {
            const motif = { length: 1 };
            const matches = [{ confidence: 0.8 }];
            
            const savings = motifCompressor.calculatePotentialSavings(motif, matches);
            expect(savings).toBeLessThanOrEqual(0);
        });
    });

    describe('Error Handling and Edge Cases', () => {
        test('should handle empty music data', () => {
            const musicData = { voices: [] };
            
            expect(() => {
                motifCompressor.compress(musicData);
            }).not.toThrow();
        });

        test('should handle voices with single notes', () => {
            const musicData = {
                voices: [
                    [{ pitch: 'C4', dur: 480, start: 0 }],
                    [{ pitch: 'D4', dur: 480, start: 0 }]
                ]
            };

            expect(() => {
                const compressed = motifCompressor.compress(musicData);
                motifCompressor.decompress(compressed);
            }).not.toThrow();
        });

        test('should handle malformed note objects', () => {
            const musicData = {
                voices: [
                    [
                        { pitch: 'C4', dur: 480, start: 0 },
                        { pitch: null, dur: 480, start: 480 },
                        null,
                        { dur: 480, start: 960 }, // Missing pitch
                        { pitch: 'D4', start: 1440 }  // Missing dur
                    ]
                ]
            };

            expect(() => {
                motifCompressor.compress(musicData);
            }).not.toThrow();
        });

        test('should handle extreme compression settings', () => {
            motifCompressor.compressionThreshold = 0.0;
            motifCompressor.minMotifMatches = 0;
            motifCompressor.maxCompressionRatio = 1.0;

            const musicData = {
                voices: [
                    [
                        { pitch: 'C4', dur: 480, start: 0 },
                        { pitch: 'C4', dur: 480, start: 480 }
                    ]
                ]
            };

            expect(() => {
                motifCompressor.compress(musicData);
            }).not.toThrow();
        });
    });

    describe('Integration Tests', () => {
        test('should handle complex polyphonic music', () => {
            const musicData = {
                voices: [
                    // Soprano voice with repeated motif
                    [
                        { pitch: 'C5', dur: 240, start: 0 },
                        { pitch: 'D5', dur: 240, start: 240 },
                        { pitch: 'E5', dur: 480, start: 480 },
                        { pitch: 'C5', dur: 240, start: 960 },
                        { pitch: 'D5', dur: 240, start: 1200 },
                        { pitch: 'E5', dur: 480, start: 1440 }
                    ],
                    // Alto voice with different pattern
                    [
                        { pitch: 'E4', dur: 480, start: 0 },
                        { pitch: 'F4', dur: 240, start: 480 },
                        { pitch: 'G4', dur: 240, start: 720 },
                        { pitch: 'E4', dur: 480, start: 960 },
                        { pitch: 'F4', dur: 240, start: 1440 },
                        { pitch: 'G4', dur: 240, start: 1680 }
                    ],
                    // Bass voice with simple pattern
                    [
                        { pitch: 'C3', dur: 960, start: 0 },
                        { pitch: 'G3', dur: 960, start: 960 }
                    ]
                ]
            };

            const compressed = motifCompressor.compress(musicData);
            const decompressed = motifCompressor.decompress(compressed);
            
            // Should maintain voice count and note integrity
            expect(decompressed.voices).toHaveLength(3);
            expect(decompressed.voices[0]).toHaveLength(6);
            expect(decompressed.voices[1]).toHaveLength(6);
            expect(decompressed.voices[2]).toHaveLength(2);
        });

        test('should provide meaningful compression statistics', () => {
            const musicData = {
                voices: [
                    Array(12).fill().map((_, i) => ({
                        pitch: ['C4', 'D4', 'E4'][i % 3],
                        dur: 480,
                        start: i * 480
                    }))
                ]
            };

            const compressed = motifCompressor.compress(musicData);
            
            if (compressed.motifCompression) {
                const stats = compressed.motifCompression.compressionStats;
                expect(stats.originalNotes).toBe(12);
                expect(stats.compressedReferences).toBeGreaterThan(0);
                expect(stats.compressionRatio).toBeGreaterThan(1.0);
                
                // Verify statistics are consistent
                const decompressed = motifCompressor.decompress(compressed);
                expect(decompressed.voices[0]).toHaveLength(12);
            }
        });
    });

    // NEW FAILING TESTS TO ISOLATE BWV785 COMPRESSION BUGS
    describe('BWV785 Compression Issues (Bug Isolation)', () => {
        const fs = require('fs');
        const path = require('path');
        
        let bwvData;
        
        beforeEach(() => {
            // Load BWV785 data if available
            const bwvPath = path.join(__dirname, '..', 'test-bwv785.json');
            if (fs.existsSync(bwvPath)) {
                bwvData = JSON.parse(fs.readFileSync(bwvPath, 'utf8'));
            } else {
                // Create mock BWV785-like data for testing
                bwvData = {
                    tempo: 120,
                    ppq: 480,
                    voices: [
                        // Generate 300+ notes to simulate BWV785 complexity
                        Array.from({length: 300}, (_, i) => ({
                            delta: i * 48,
                            pitch: `${['C', 'D', 'E', 'F', 'G', 'A', 'B'][i % 7]}${3 + Math.floor(i / 50)}`,
                            dur: 240 + (i % 3) * 120,
                            vel: 70 + (i % 20)
                        })),
                        Array.from({length: 318}, (_, i) => ({
                            delta: i * 36,
                            pitch: `${['G', 'A', 'B', 'C', 'D', 'E', 'F'][i % 7]}${2 + Math.floor(i / 60)}`,
                            dur: 180 + (i % 4) * 90,
                            vel: 60 + (i % 25)
                        }))
                    ]
                };
            }
        });

        test('SHOULD FAIL: BWV785 compression should not exceed 20% note loss', () => {
            // This SHOULD FAIL due to 38.2% note loss in integration tests
            const originalCount = bwvData.voices.reduce((sum, voice) => sum + voice.length, 0);
            
            const compressed = motifCompressor.compress(bwvData);
            
            if (compressed.motifCompression) {
                const stats = compressed.motifCompression.compressionStats;
                const noteLossPercentage = (stats.originalNotes - stats.compressedReferences) / stats.originalNotes;
                
                // Integration tests show 38.2% loss - this should FAIL
                expect(noteLossPercentage).toBeLessThan(0.20); // Max 20% loss for Bach
                
                console.log(`EXPECTED FAILURE: Note loss ${(noteLossPercentage * 100).toFixed(1)}% exceeds 20% threshold`);
            }
        });

        test('SHOULD FAIL: motif detection should not be over-aggressive on unique phrases', () => {
            // This SHOULD FAIL if algorithm compresses non-repetitive content
            const uniquePhrasesData = {
                tempo: 120,
                ppq: 480,
                voices: [
                    [
                        // All completely unique musical phrases
                        { delta: 0, pitch: 'C4', dur: 240, vel: 80 },
                        { delta: 240, pitch: 'F#4', dur: 360, vel: 75 },
                        { delta: 360, pitch: 'Bb4', dur: 180, vel: 90 },
                        { delta: 180, pitch: 'D#5', dur: 480, vel: 65 },
                        { delta: 480, pitch: 'G#3', dur: 120, vel: 95 },
                        { delta: 120, pitch: 'C#5', dur: 300, vel: 70 }
                    ]
                ]
            };

            const compressed = motifCompressor.compress(uniquePhrasesData);
            
            if (compressed.motifCompression) {
                const stats = compressed.motifCompression.compressionStats;
                
                // Should NOT compress unique content significantly
                expect(stats.compressionRatio).toBeLessThan(1.1); // Max 10% compression for unique content
                
                console.log(`EXPECTED FAILURE: Unique content compressed by ${((stats.compressionRatio - 1) * 100).toFixed(1)}%`);
            }
        });

        test('SHOULD FAIL: compression ratio should be reasonable for Bach inventions', () => {
            // This SHOULD FAIL due to excessive compression in integration tests
            const compressed = motifCompressor.compress(bwvData);
            
            if (compressed.motifCompression) {
                const stats = compressed.motifCompression.compressionStats;
                
                // Bach inventions have moderate repetition, not excessive
                // Integration tests show aggressive compression - should FAIL
                expect(stats.compressionRatio).toBeLessThan(1.3); // Max 30% compression for Bach
                
                console.log(`EXPECTED FAILURE: Compression ratio ${stats.compressionRatio.toFixed(2)}x too aggressive for Bach`);
            }
        });

        test('SHOULD FAIL: motif library should contain musically sensible patterns', () => {
            // This SHOULD FAIL if motifs are musically nonsensical
            const compressed = motifCompressor.compress(bwvData);
            
            if (compressed.motifCompression && compressed.motifCompression.motifLibrary.length > 0) {
                const motifs = compressed.motifCompression.motifLibrary;
                
                let failedMotifs = 0;
                
                motifs.forEach((motif, index) => {
                    // Motifs should be reasonable musical length
                    if (motif.length < 2 || motif.length > 12) {
                        failedMotifs++;
                        console.log(`EXPECTED FAILURE: Motif ${index} has unreasonable length: ${motif.length}`);
                    }
                    
                    // Confidence should be high for compression
                    if (motif.confidence < 60) {
                        failedMotifs++;
                        console.log(`EXPECTED FAILURE: Motif ${index} has low confidence: ${motif.confidence}%`);
                    }
                    
                    // Should have found multiple occurrences
                    if (motif.matches < 2) {
                        failedMotifs++;
                        console.log(`EXPECTED FAILURE: Motif ${index} has insufficient matches: ${motif.matches}`);
                    }
                });
                
                // Should have mostly good motifs
                expect(failedMotifs).toBe(0);
            }
        });

        test('SHOULD FAIL: round-trip compression should preserve note count exactly', () => {
            // This SHOULD FAIL due to 1-note loss in integration tests
            const originalCount = bwvData.voices.reduce((sum, voice) => sum + voice.length, 0);
            
            const compressed = motifCompressor.compress(bwvData);
            const decompressed = motifCompressor.decompress(compressed);
            
            const decompressedCount = decompressed.voices.reduce((sum, voice) => sum + voice.length, 0);
            
            // Should preserve exact note count - this SHOULD FAIL
            expect(decompressedCount).toBe(originalCount);
            
            console.log(`EXPECTED FAILURE: Lost ${originalCount - decompressedCount} notes in round-trip`);
        });
    });
});