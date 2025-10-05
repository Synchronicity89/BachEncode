/**
 * MotifDetector.js Integration Tests
 * Full end-to-end testing without mocks using real musical data
 */

const fs = require('fs');
const MotifDetector = require('../MotifDetector');
const { parseMidi, extractTempoAndPPQAndNotes, separateVoices } = require('../EncodeDecode');

describe('MotifDetector.js - Integration Tests', () => {
  let detector;

  beforeEach(() => {
    detector = new MotifDetector();
  });

  describe('Real Musical Pattern Detection', () => {
    test('should detect motifs in Bach chorale', () => {
      if (!fs.existsSync('test-christus.mid')) {
        console.warn('Bach chorale test file not found, skipping motif detection test');
        return;
      }

      console.log('\n=== BACH CHORALE MOTIF DETECTION TEST ===');

      // Parse real MIDI data
      const midi = parseMidi('test-christus.mid');
      const musicData = extractTempoAndPPQAndNotes(midi);
      const voices = separateVoices(musicData.notes);

      console.log(`Analyzing ${voices.length} voices with ${musicData.notes.length} total notes`);

      // Analyze motifs
      const analysis = detector.analyzeMotifs(voices);

      // Verify analysis structure
      expect(analysis).toHaveProperty('motifs');
      expect(analysis).toHaveProperty('statistics');
      expect(Array.isArray(analysis.motifs)).toBe(true);

      const stats = analysis.statistics;
      expect(stats).toHaveProperty('totalMotifs');
      expect(stats).toHaveProperty('totalMatches');
      expect(stats).toHaveProperty('averageMotifLength');
      expect(stats).toHaveProperty('compressionPotential');

      console.log(`Detection results: ${stats.totalMotifs} motifs, ${stats.totalMatches} matches`);
      console.log(`Average motif length: ${stats.averageMotifLength.toFixed(1)} notes`);
      console.log(`Compression potential: ${(stats.compressionPotential * 100).toFixed(1)}%`);

      // Verify statistics are reasonable
      expect(stats.totalMotifs).toBeGreaterThanOrEqual(0);
      expect(stats.totalMatches).toBeGreaterThanOrEqual(stats.totalMotifs);
      if (stats.totalMotifs > 0) {
        expect(stats.averageMotifLength).toBeGreaterThan(0);
        expect(stats.compressionPotential).toBeGreaterThan(0);
        expect(stats.compressionPotential).toBeLessThanOrEqual(1);
      }
    });

    test('should detect patterns across multiple voices', () => {
      if (!fs.existsSync('test-christus.mid')) {
        console.warn('Multi-voice test file not found, skipping cross-voice detection');
        return;
      }

      console.log('\n=== CROSS-VOICE MOTIF DETECTION TEST ===');

      const midi = parseMidi('test-christus.mid');
      const musicData = extractTempoAndPPQAndNotes(midi);
      const voices = separateVoices(musicData.notes);

      // Analyze each voice individually
      const voiceAnalyses = voices.map((voice, index) => {
        if (voice.length === 0) return null;
        
        const analysis = detector.analyzeMotifs([voice]);
        console.log(`Voice ${index + 1}: ${voice.length} notes, ${analysis.statistics.totalMotifs} motifs`);
        return analysis;
      }).filter(Boolean);

      // Analyze all voices together
      const combinedAnalysis = detector.analyzeMotifs(voices);
      console.log(`Combined analysis: ${combinedAnalysis.statistics.totalMotifs} motifs across all voices`);

      // Combined analysis should potentially find cross-voice patterns
      const totalIndividualMotifs = voiceAnalyses.reduce((sum, analysis) => 
        sum + analysis.statistics.totalMotifs, 0);
      
      expect(combinedAnalysis.statistics.totalMotifs).toBeGreaterThanOrEqual(0);
      
      // Log the comparison for analysis
      console.log(`Individual voice motifs total: ${totalIndividualMotifs}`);
      console.log(`Combined analysis motifs: ${combinedAnalysis.statistics.totalMotifs}`);
    });

    test('should handle different musical textures', () => {
      // Test with different available MIDI files
      const testFiles = [
        'test-christus.mid',
        'test-minimal-motif.mid',
        'test-different-octaves.mid'
      ].filter(file => fs.existsSync(file));

      if (testFiles.length === 0) {
        console.warn('No test files available for texture analysis');
        return;
      }

      console.log('\n=== MUSICAL TEXTURE ANALYSIS TEST ===');

      testFiles.forEach(filename => {
        console.log(`\nAnalyzing ${filename}...`);
        
        const midi = parseMidi(filename);
        const musicData = extractTempoAndPPQAndNotes(midi);
        const voices = separateVoices(musicData.notes);

        const analysis = detector.analyzeMotifs(voices);
        const stats = analysis.statistics;

        console.log(`  ${voices.length} voices, ${musicData.notes.length} notes`);
        console.log(`  ${stats.totalMotifs} motifs, ${(stats.compressionPotential * 100).toFixed(1)}% compression potential`);

        // Should handle any musical texture without throwing
        expect(() => detector.analyzeMotifs(voices)).not.toThrow();
        expect(stats.totalMotifs).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('Scale Degree Analysis', () => {
    test('should convert notes to scale degrees accurately', () => {
      console.log('\n=== SCALE DEGREE CONVERSION TEST ===');

      // Test C major scale
      const cMajorContext = { key: 'C', mode: 'major' };
      
      const testNotes = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
      const expectedDegrees = [1, 2, 3, 4, 5, 6, 7];

      testNotes.forEach((note, index) => {
        const scaleDegree = detector.noteToScaleDegree(note, cMajorContext);
        expect(scaleDegree).toBe(expectedDegrees[index]);
        console.log(`${note} in C major = scale degree ${scaleDegree}`);
      });

      // Test with accidentals
      const accidentalTests = [
        { note: 'F#', expected: 4.5 },
        { note: 'Bb', expected: 6.5 }
      ];

      accidentalTests.forEach(test => {
        const scaleDegree = detector.noteToScaleDegree(test.note, cMajorContext);
        expect(scaleDegree).toBe(test.expected);
        console.log(`${test.note} in C major = scale degree ${scaleDegree}`);
      });
    });

    test('should handle transposition correctly', () => {
      console.log('\n=== TRANSPOSITION TEST ===');

      // Test the same note in different keys
      const testNote = 'D';
      
      const keyTests = [
        { key: 'C', expected: 2 }, // D is 2nd degree in C major
        { key: 'G', expected: 5 }, // D is 5th degree in G major  
        { key: 'D', expected: 1 }  // D is 1st degree in D major
      ];

      keyTests.forEach(test => {
        const context = { key: test.key, mode: 'major' };
        const scaleDegree = detector.noteToScaleDegree(testNote, context);
        expect(scaleDegree).toBe(test.expected);
        console.log(`${testNote} in ${test.key} major = scale degree ${scaleDegree}`);
      });
    });

    test('should work with real MIDI data scale analysis', () => {
      if (!fs.existsSync('test-minimal-motif.mid')) {
        console.warn('Scale analysis test file not found, skipping');
        return;
      }

      console.log('\n=== REAL MIDI SCALE DEGREE TEST ===');

      const midi = parseMidi('test-minimal-motif.mid');
      const musicData = extractTempoAndPPQAndNotes(midi);
      const voices = separateVoices(musicData.notes);

      // Test scale degree conversion on real notes
      if (voices.length > 0 && voices[0].length > 0) {
        const firstVoice = voices[0];
        const keyContext = { key: 'C', mode: 'major' }; // Assume C major for testing

        console.log('Converting first few notes to scale degrees:');
        firstVoice.slice(0, 5).forEach((note, index) => {
          if (note.pitch) {
            // Convert MIDI pitch to note name (simplified)
            const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
            const noteName = noteNames[note.pitch % 12];
            
            const scaleDegree = detector.noteToScaleDegree(noteName, keyContext);
            console.log(`  Note ${index + 1}: MIDI ${note.pitch} (${noteName}) = scale degree ${scaleDegree}`);
            
            if (scaleDegree !== null) {
              expect(scaleDegree).toBeGreaterThan(0);
              expect(scaleDegree).toBeLessThanOrEqual(7.5); // Including chromatic alterations
            }
          }
        });
      }
    });
  });

  describe('Pattern Similarity Analysis', () => {
    test('should calculate pattern similarity accurately', () => {
      console.log('\n=== PATTERN SIMILARITY TEST ===');

      // Create test patterns
      const pattern1 = [
        { pitch: 60, duration: 120 }, // C
        { pitch: 62, duration: 120 }, // D
        { pitch: 64, duration: 120 }  // E
      ];

      const pattern2 = [
        { pitch: 60, duration: 120 }, // C (exact match)
        { pitch: 62, duration: 120 }, // D (exact match)
        { pitch: 64, duration: 120 }  // E (exact match)
      ];

      const pattern3 = [
        { pitch: 67, duration: 120 }, // G (transposed)
        { pitch: 69, duration: 120 }, // A (transposed)
        { pitch: 71, duration: 120 }  // B (transposed)
      ];

      const pattern4 = [
        { pitch: 60, duration: 240 }, // C (different rhythm)
        { pitch: 62, duration: 240 }, // D (different rhythm)
        { pitch: 64, duration: 240 }  // E (different rhythm)
      ];

      // Test exact match
      const similarity1 = detector.calculatePatternSimilarity(pattern1, pattern2);
      console.log(`Exact match similarity: ${similarity1.toFixed(3)}`);
      expect(similarity1).toBeCloseTo(1.0, 2);

      // Test transposed pattern
      const similarity2 = detector.calculatePatternSimilarity(pattern1, pattern3);
      console.log(`Transposed pattern similarity: ${similarity2.toFixed(3)}`);
      expect(similarity2).toBeGreaterThan(0.5); // Should detect transposition

      // Test rhythmic variation
      const similarity3 = detector.calculatePatternSimilarity(pattern1, pattern4);
      console.log(`Different rhythm similarity: ${similarity3.toFixed(3)}`);
      expect(similarity3).toBeGreaterThan(0.3); // Should have some similarity due to pitch
    });

    test('should find similar patterns in real musical data', () => {
      if (!fs.existsSync('test-christus.mid')) {
        console.warn('Pattern similarity test file not found, skipping');
        return;
      }

      console.log('\n=== REAL MUSIC PATTERN SIMILARITY TEST ===');

      const midi = parseMidi('test-christus.mid');
      const musicData = extractTempoAndPPQAndNotes(midi);
      const voices = separateVoices(musicData.notes);

      if (voices.length > 0 && voices[0].length >= 6) {
        const voice = voices[0];
        
        // Extract two short patterns from the same voice
        const pattern1 = voice.slice(0, 3);
        const pattern2 = voice.slice(3, 6);
        
        const similarity = detector.calculatePatternSimilarity(pattern1, pattern2);
        console.log(`Consecutive pattern similarity: ${similarity.toFixed(3)}`);
        
        expect(similarity).toBeGreaterThanOrEqual(0);
        expect(similarity).toBeLessThanOrEqual(1);
        
        // If high similarity, patterns might be related
        if (similarity > 0.7) {
          console.log('High similarity detected - possible sequence or repetition');
        }
      }
    });
  });

  describe('Performance and Scalability', () => {
    test('should handle large musical datasets efficiently', () => {
      if (!fs.existsSync('test-christus.mid')) {
        console.warn('Large dataset test file not found, skipping performance test');
        return;
      }

      console.log('\n=== PERFORMANCE SCALABILITY TEST ===');

      const midi = parseMidi('test-christus.mid');
      const musicData = extractTempoAndPPQAndNotes(midi);
      const voices = separateVoices(musicData.notes);

      const startTime = Date.now();
      const analysis = detector.analyzeMotifs(voices);
      const endTime = Date.now();

      const processingTime = endTime - startTime;
      const notesProcessed = musicData.notes.length;
      const notesPerSecond = notesProcessed / (processingTime / 1000);

      console.log(`Processed ${notesProcessed} notes in ${processingTime}ms`);
      console.log(`Processing rate: ${notesPerSecond.toFixed(1)} notes/second`);

      // Should complete within reasonable time
      expect(processingTime).toBeLessThan(10000); // 10 seconds max
      expect(notesPerSecond).toBeGreaterThan(10); // Minimum processing rate
    });

    test('should maintain memory efficiency', () => {
      if (!fs.existsSync('test-christus.mid')) {
        console.warn('Memory efficiency test file not found, skipping');
        return;
      }

      console.log('\n=== MEMORY EFFICIENCY TEST ===');

      const initialMemory = process.memoryUsage().heapUsed;

      // Process the same data multiple times
      for (let i = 0; i < 5; i++) {
        const midi = parseMidi('test-christus.mid');
        const musicData = extractTempoAndPPQAndNotes(midi);
        const voices = separateVoices(musicData.notes);
        
        const analysis = detector.analyzeMotifs(voices);
        
        // Verify analysis is valid each time
        expect(analysis.statistics.totalMotifs).toBeGreaterThanOrEqual(0);
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      console.log(`Memory increase after 5 cycles: ${Math.round(memoryIncrease / 1024 / 1024)}MB`);

      // Should not have excessive memory leaks
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024); // 50MB max increase
    });
  });

  describe('Musical Theory Validation', () => {
    test('should respect musical theory in pattern detection', () => {
      console.log('\n=== MUSICAL THEORY VALIDATION TEST ===');

      // Create theoretically sound patterns
      const cMajorScale = [
        { pitch: 60, duration: 120 }, // C
        { pitch: 62, duration: 120 }, // D
        { pitch: 64, duration: 120 }, // E
        { pitch: 65, duration: 120 }  // F
      ];

      const fMajorScale = [
        { pitch: 65, duration: 120 }, // F
        { pitch: 67, duration: 120 }, // G
        { pitch: 69, duration: 120 }, // A
        { pitch: 70, duration: 120 }  // Bb
      ];

      const voices = [cMajorScale, fMajorScale];
      const analysis = detector.analyzeMotifs(voices);

      // Should handle diatonic patterns appropriately
      expect(analysis.statistics.totalMotifs).toBeGreaterThanOrEqual(0);
      
      if (analysis.motifs.length > 0) {
        analysis.motifs.forEach((motif, index) => {
          console.log(`Motif ${index + 1}: confidence ${motif.confidence.toFixed(3)}, matches ${motif.matches.length}`);
          
          // Verify motif structure
          expect(motif).toHaveProperty('pattern');
          expect(motif).toHaveProperty('confidence');
          expect(motif).toHaveProperty('matches');
          
          expect(motif.confidence).toBeGreaterThan(0);
          expect(motif.confidence).toBeLessThanOrEqual(1);
          expect(motif.matches.length).toBeGreaterThan(0);
        });
      }
    });

    test('should handle chromatic passages appropriately', () => {
      console.log('\n=== CHROMATIC PASSAGE TEST ===');

      // Create chromatic scale passage
      const chromaticPassage = [];
      for (let i = 0; i < 12; i++) {
        chromaticPassage.push({
          pitch: 60 + i,
          duration: 120
        });
      }

      const voices = [chromaticPassage];
      const analysis = detector.analyzeMotifs(voices);

      // Should handle chromatic music without errors
      expect(() => detector.analyzeMotifs(voices)).not.toThrow();
      expect(analysis.statistics.totalMotifs).toBeGreaterThanOrEqual(0);
      
      console.log(`Chromatic analysis: ${analysis.statistics.totalMotifs} motifs detected`);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle empty voices', () => {
      const emptyVoices = [[], [], []];
      
      expect(() => {
        const analysis = detector.analyzeMotifs(emptyVoices);
        expect(analysis.statistics.totalMotifs).toBe(0);
        expect(analysis.statistics.totalMatches).toBe(0);
      }).not.toThrow();
    });

    test('should handle single note voices', () => {
      const singleNoteVoices = [
        [{ pitch: 60, duration: 480 }],
        [{ pitch: 64, duration: 480 }]
      ];

      expect(() => {
        const analysis = detector.analyzeMotifs(singleNoteVoices);
        // Single notes shouldn't form motifs
        expect(analysis.statistics.totalMotifs).toBe(0);
      }).not.toThrow();
    });

    test('should handle voices with invalid notes', () => {
      const voicesWithInvalidNotes = [
        [
          { pitch: 60, duration: 120 },
          { pitch: null, duration: 120 }, // Invalid pitch
          { pitch: 64, duration: 0 },     // Invalid duration
          { pitch: 67, duration: 120 }
        ]
      ];

      expect(() => {
        const analysis = detector.analyzeMotifs(voicesWithInvalidNotes);
        // Should handle invalid notes gracefully
        expect(analysis.statistics).toBeDefined();
      }).not.toThrow();
    });

    test('should handle extremely short patterns', () => {
      const shortPatterns = [
        [
          { pitch: 60, duration: 1 },
          { pitch: 62, duration: 1 }
        ]
      ];

      expect(() => {
        const analysis = detector.analyzeMotifs(shortPatterns);
        // Very short patterns might not meet minimum requirements
        expect(analysis.statistics.totalMotifs).toBeGreaterThanOrEqual(0);
      }).not.toThrow();
    });

    test('should handle extremely long patterns', () => {
      // Create a very long melodic line
      const longPattern = [];
      for (let i = 0; i < 100; i++) {
        longPattern.push({
          pitch: 60 + (i % 12),
          duration: 120
        });
      }

      const longVoices = [longPattern];

      expect(() => {
        const analysis = detector.analyzeMotifs(longVoices);
        expect(analysis.statistics).toBeDefined();
      }).not.toThrow();
    });
  });
});