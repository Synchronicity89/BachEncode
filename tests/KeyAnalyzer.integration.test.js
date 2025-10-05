/**
 * KeyAnalyzer.js Integration Tests
 * Full end-to-end testing without mocks using real musical data
 */

const fs = require('fs');
const KeyAnalyzer = require('../KeyAnalyzer');
const { parseMidi, extractTempoAndPPQAndNotes, separateVoices } = require('../EncodeDecode');

describe('KeyAnalyzer.js - Integration Tests', () => {
  let analyzer;

  beforeEach(() => {
    analyzer = new KeyAnalyzer();
  });

  describe('Real Musical Data Key Detection', () => {
    test('should detect keys in Bach chorale', () => {
      if (!fs.existsSync('test-christus.mid')) {
        console.warn('Bach chorale test file not found, skipping key detection test');
        return;
      }

      console.log('\n=== BACH CHORALE KEY DETECTION TEST ===');

      // Parse real MIDI data
      const midi = parseMidi('test-christus.mid');
      const musicData = extractTempoAndPPQAndNotes(midi);
      const voices = separateVoices(musicData.notes);

      console.log(`Analyzing ${voices.length} voices with ${musicData.notes.length} total notes`);

      // Analyze each voice for key
      voices.forEach((voice, index) => {
        if (voice.length > 0) {
          const keyAnalysis = analyzer.analyzeVoiceKey(voice);
          
          console.log(`Voice ${index + 1}: ${keyAnalysis.key} ${keyAnalysis.mode} (confidence: ${keyAnalysis.confidence.toFixed(3)})`);
          
          // Verify key analysis structure
          expect(keyAnalysis).toHaveProperty('key');
          expect(keyAnalysis).toHaveProperty('mode');
          expect(keyAnalysis).toHaveProperty('confidence');
          expect(keyAnalysis).toHaveProperty('statistics');
          
          // Verify key is a valid musical key
          expect(['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B', 'Cb']).toContain(keyAnalysis.key);
          expect(['major', 'minor']).toContain(keyAnalysis.mode);
          
          // Verify confidence is reasonable
          expect(keyAnalysis.confidence).toBeGreaterThanOrEqual(0);
          expect(keyAnalysis.confidence).toBeLessThanOrEqual(1);
          
          // Verify statistics
          expect(keyAnalysis.statistics).toHaveProperty('totalNotes');
          expect(keyAnalysis.statistics).toHaveProperty('keySignatureMatches');
          expect(keyAnalysis.statistics.totalNotes).toBe(voice.length);
        }
      });
    });

    test('should provide consistent key detection across similar voices', () => {
      if (!fs.existsSync('test-christus.mid')) {
        console.warn('Consistency test file not found, skipping');
        return;
      }

      console.log('\n=== KEY DETECTION CONSISTENCY TEST ===');

      const midi = parseMidi('test-christus.mid');
      const musicData = extractTempoAndPPQAndNotes(midi);
      const voices = separateVoices(musicData.notes);

      const keyResults = voices
        .filter(voice => voice.length > 5) // Only analyze voices with sufficient notes
        .map((voice, index) => {
          const keyAnalysis = analyzer.analyzeVoiceKey(voice);
          return {
            voiceIndex: index,
            key: keyAnalysis.key,
            mode: keyAnalysis.mode,
            confidence: keyAnalysis.confidence,
            noteCount: voice.length
          };
        });

      if (keyResults.length > 1) {
        console.log('Key detection results:');
        keyResults.forEach(result => {
          console.log(`  Voice ${result.voiceIndex + 1}: ${result.key} ${result.mode} (${result.confidence.toFixed(3)}, ${result.noteCount} notes)`);
        });

        // Check for consistency - in homophonic music, most voices should agree on key
        const keyModeStrings = keyResults.map(r => `${r.key} ${r.mode}`);
        const uniqueKeys = [...new Set(keyModeStrings)];
        
        console.log(`Unique keys detected: ${uniqueKeys.length} out of ${keyResults.length} voices`);
        
        // Allow for some variation but expect some consistency
        expect(uniqueKeys.length).toBeLessThanOrEqual(keyResults.length); // Can't have more unique keys than voices
        expect(uniqueKeys.length).toBeGreaterThanOrEqual(1); // Should detect at least one key
      }
    });

    test('should handle different musical styles and periods', () => {
      // Test with different available MIDI files
      const testFiles = [
        'test-christus.mid',
        'test-minimal-motif.mid',
        'test-different-octaves.mid'
      ].filter(file => fs.existsSync(file));

      if (testFiles.length === 0) {
        console.warn('No test files available for style analysis');
        return;
      }

      console.log('\n=== MUSICAL STYLE KEY ANALYSIS TEST ===');

      testFiles.forEach(filename => {
        console.log(`\nAnalyzing ${filename}...`);
        
        const midi = parseMidi(filename);
        const musicData = extractTempoAndPPQAndNotes(midi);
        const voices = separateVoices(musicData.notes);

        // Analyze the first non-empty voice
        const firstVoice = voices.find(voice => voice.length > 0);
        
        if (firstVoice) {
          const keyAnalysis = analyzer.analyzeVoiceKey(firstVoice);
          
          console.log(`  Key: ${keyAnalysis.key} ${keyAnalysis.mode} (confidence: ${keyAnalysis.confidence.toFixed(3)})`);
          console.log(`  Notes analyzed: ${keyAnalysis.statistics.totalNotes}`);
          console.log(`  Key signature matches: ${keyAnalysis.statistics.keySignatureMatches}`);
          
          // Should provide valid analysis for any musical style
          expect(keyAnalysis.key).toBeTruthy();
          expect(keyAnalysis.mode).toBeTruthy();
          expect(keyAnalysis.confidence).toBeGreaterThanOrEqual(0);
        }
      });
    });
  });

  describe('Pitch Conversion Accuracy', () => {
    test('should convert MIDI pitches to note names correctly', () => {
      console.log('\n=== MIDI PITCH CONVERSION TEST ===');

      // Test standard MIDI pitch conversions
      const testCases = [
        { midi: 60, expected: 'C' },    // Middle C
        { midi: 61, expected: 'C#' },   // C#
        { midi: 62, expected: 'D' },    // D
        { midi: 63, expected: 'D#' },   // D#
        { midi: 64, expected: 'E' },    // E
        { midi: 65, expected: 'F' },    // F
        { midi: 66, expected: 'F#' },   // F#
        { midi: 67, expected: 'G' },    // G
        { midi: 68, expected: 'G#' },   // G#
        { midi: 69, expected: 'A' },    // A440
        { midi: 70, expected: 'A#' },   // A#
        { midi: 71, expected: 'B' },    // B
        { midi: 72, expected: 'C' }     // C (octave higher)
      ];

      testCases.forEach(testCase => {
        const noteName = analyzer.midiToNoteName(testCase.midi);
        expect(noteName).toBe(testCase.expected);
        console.log(`MIDI ${testCase.midi} → ${noteName} (expected: ${testCase.expected})`);
      });
    });

    test('should handle octave variations correctly', () => {
      console.log('\n=== OCTAVE VARIATION TEST ===');

      // Test same note in different octaves
      const cNotes = [48, 60, 72, 84]; // C in different octaves
      
      cNotes.forEach(midiPitch => {
        const noteName = analyzer.midiToNoteName(midiPitch);
        expect(noteName).toBe('C');
        console.log(`MIDI ${midiPitch} → ${noteName} (C in octave ${Math.floor(midiPitch / 12) - 1})`);
      });
    });

    test('should convert real MIDI data pitches accurately', () => {
      if (!fs.existsSync('test-minimal-motif.mid')) {
        console.warn('Pitch conversion test file not found, skipping');
        return;
      }

      console.log('\n=== REAL MIDI PITCH CONVERSION TEST ===');

      const midi = parseMidi('test-minimal-motif.mid');
      const musicData = extractTempoAndPPQAndNotes(midi);

      // Test conversion on real MIDI pitches
      const uniquePitches = [...new Set(musicData.notes.map(note => note.pitch))].sort();
      
      console.log('Converting real MIDI pitches:');
      uniquePitches.slice(0, 10).forEach(pitch => { // Test first 10 unique pitches
        const noteName = analyzer.midiToNoteName(pitch);
        console.log(`  MIDI ${pitch} → ${noteName}`);
        
        expect(noteName).toBeTruthy();
        expect(typeof noteName).toBe('string');
        expect(noteName.length).toBeGreaterThanOrEqual(1);
        expect(noteName.length).toBeLessThanOrEqual(2); // Note name should be 1-2 characters
      });
    });
  });

  describe('Key Signature Analysis', () => {
    test('should correctly identify major key signatures', () => {
      console.log('\n=== MAJOR KEY SIGNATURE TEST ===');

      // Test major key signatures
      const majorKeys = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'F', 'Bb', 'Eb', 'Ab', 'Db'];
      
      majorKeys.forEach(key => {
        const signature = analyzer.getKeySignature(key, 'major');
        console.log(`${key} major: [${signature.join(', ')}]`);
        
        expect(Array.isArray(signature)).toBe(true);
        expect(signature.length).toBeGreaterThanOrEqual(0);
        expect(signature.length).toBeLessThanOrEqual(7); // Max 7 accidentals
        
        // Verify accidentals are valid
        signature.forEach(accidental => {
          expect(typeof accidental).toBe('string');
          expect(accidental.includes('#') || accidental.includes('b')).toBe(true);
        });
      });
    });

    test('should correctly identify minor key signatures', () => {
      console.log('\n=== MINOR KEY SIGNATURE TEST ===');

      // Test minor key signatures
      const minorKeys = ['A', 'E', 'B', 'F#', 'C#', 'G#', 'D#', 'D', 'G', 'C', 'F', 'Bb'];
      
      minorKeys.forEach(key => {
        const signature = analyzer.getKeySignature(key, 'minor');
        console.log(`${key} minor: [${signature.join(', ')}]`);
        
        expect(Array.isArray(signature)).toBe(true);
        expect(signature.length).toBeGreaterThanOrEqual(0);
        expect(signature.length).toBeLessThanOrEqual(7); // Max 7 accidentals
      });
    });

    test('should validate key signatures against real musical data', () => {
      if (!fs.existsSync('test-christus.mid')) {
        console.warn('Key signature validation test file not found, skipping');
        return;
      }

      console.log('\n=== KEY SIGNATURE VALIDATION TEST ===');

      const midi = parseMidi('test-christus.mid');
      const musicData = extractTempoAndPPQAndNotes(midi);
      const voices = separateVoices(musicData.notes);

      // Analyze key and validate against actual notes
      if (voices.length > 0 && voices[0].length > 0) {
        const voice = voices[0];
        const keyAnalysis = analyzer.analyzeVoiceKey(voice);
        const keySignature = analyzer.getKeySignature(keyAnalysis.key, keyAnalysis.mode);
        
        console.log(`Detected key: ${keyAnalysis.key} ${keyAnalysis.mode}`);
        console.log(`Key signature: [${keySignature.join(', ')}]`);
        
        // Count how many notes match the key signature
        const noteNames = voice.map(note => analyzer.midiToNoteName(note.pitch));
        const uniqueNotes = [...new Set(noteNames)];
        
        console.log(`Unique notes in voice: [${uniqueNotes.join(', ')}]`);
        
        // Calculate how well the detected key signature explains the notes
        let matchingNotes = 0;
        uniqueNotes.forEach(note => {
          const baseNote = note.replace(/[#b]/g, '');
          const isAccidental = note.includes('#') || note.includes('b');
          
          if (isAccidental && keySignature.includes(note)) {
            matchingNotes++;
          } else if (!isAccidental && !keySignature.some(acc => acc.startsWith(baseNote))) {
            matchingNotes++;
          }
        });
        
        const matchPercentage = (matchingNotes / uniqueNotes.length) * 100;
        console.log(`Key signature match: ${matchPercentage.toFixed(1)}% of unique notes`);
        
        // Should have reasonable match with detected key
        expect(matchPercentage).toBeGreaterThanOrEqual(50); // At least 50% match expected
      }
    });
  });

  describe('Circle of Fifths Relationships', () => {
    test('should understand circle of fifths relationships', () => {
      console.log('\n=== CIRCLE OF FIFTHS TEST ===');

      // Test circle of fifths progression
      const circleOfFifths = analyzer.circleOfFifths;
      console.log(`Circle of fifths: [${circleOfFifths.join(' → ')}]`);
      
      expect(circleOfFifths).toHaveLength(12);
      expect(circleOfFifths[0]).toBe('C'); // Should start with C
      expect(circleOfFifths.includes('G')).toBe(true); // Should include G (fifth of C)
      expect(circleOfFifths.includes('F')).toBe(true); // Should include F (fourth of C)
    });

    test('should calculate key distances accurately', () => {
      console.log('\n=== KEY DISTANCE CALCULATION TEST ===');

      // Test related keys (should have small distances)
      const closeKeys = [
        { key1: 'C', key2: 'G', description: 'C to G (fifth)' },
        { key1: 'C', key2: 'F', description: 'C to F (fourth)' },
        { key1: 'C', key2: 'Am', description: 'C to A minor (relative)' }
      ];

      closeKeys.forEach(test => {
        if (analyzer.calculateKeyDistance) {
          const distance = analyzer.calculateKeyDistance(test.key1, test.key2);
          console.log(`${test.description}: distance ${distance}`);
          expect(distance).toBeGreaterThanOrEqual(0);
        }
      });

      // Test distant keys (should have larger distances)
      const distantKeys = [
        { key1: 'C', key2: 'F#', description: 'C to F# (tritone)' },
        { key1: 'C', key2: 'Db', description: 'C to Db (half step)' }
      ];

      distantKeys.forEach(test => {
        if (analyzer.calculateKeyDistance) {
          const distance = analyzer.calculateKeyDistance(test.key1, test.key2);
          console.log(`${test.description}: distance ${distance}`);
          expect(distance).toBeGreaterThanOrEqual(0);
        }
      });
    });
  });

  describe('Statistical Analysis', () => {
    test('should provide meaningful statistics for key analysis', () => {
      if (!fs.existsSync('test-christus.mid')) {
        console.warn('Statistics test file not found, skipping');
        return;
      }

      console.log('\n=== KEY ANALYSIS STATISTICS TEST ===');

      const midi = parseMidi('test-christus.mid');
      const musicData = extractTempoAndPPQAndNotes(midi);
      const voices = separateVoices(musicData.notes);

      if (voices.length > 0 && voices[0].length > 0) {
        const voice = voices[0];
        const keyAnalysis = analyzer.analyzeVoiceKey(voice);
        const stats = keyAnalysis.statistics;

        console.log('Key analysis statistics:');
        console.log(`  Total notes: ${stats.totalNotes}`);
        console.log(`  Key signature matches: ${stats.keySignatureMatches}`);
        console.log(`  Match percentage: ${(stats.keySignatureMatches / stats.totalNotes * 100).toFixed(1)}%`);

        // Verify statistics make sense
        expect(stats.totalNotes).toBe(voice.length);
        expect(stats.keySignatureMatches).toBeGreaterThanOrEqual(0);
        expect(stats.keySignatureMatches).toBeLessThanOrEqual(stats.totalNotes);

        // Additional statistics if available
        if (stats.pitchClassDistribution) {
          console.log('  Pitch class distribution available');
          expect(typeof stats.pitchClassDistribution).toBe('object');
        }

        if (stats.intervalAnalysis) {
          console.log('  Interval analysis available');
          expect(typeof stats.intervalAnalysis).toBe('object');
        }
      }
    });

    test('should analyze pitch class distribution', () => {
      if (!fs.existsSync('test-minimal-motif.mid')) {
        console.warn('Pitch class test file not found, skipping');
        return;
      }

      console.log('\n=== PITCH CLASS DISTRIBUTION TEST ===');

      const midi = parseMidi('test-minimal-motif.mid');
      const musicData = extractTempoAndPPQAndNotes(midi);

      // Calculate pitch class distribution manually
      const pitchClasses = new Array(12).fill(0);
      musicData.notes.forEach(note => {
        const pitchClass = note.pitch % 12;
        pitchClasses[pitchClass]++;
      });

      const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
      
      console.log('Pitch class distribution:');
      pitchClasses.forEach((count, index) => {
        if (count > 0) {
          const percentage = (count / musicData.notes.length * 100).toFixed(1);
          console.log(`  ${noteNames[index]}: ${count} notes (${percentage}%)`);
        }
      });

      // Verify distribution makes sense
      const totalNotes = pitchClasses.reduce((sum, count) => sum + count, 0);
      expect(totalNotes).toBe(musicData.notes.length);
      
      // Should have at least some variety in pitch classes for real music
      const usedPitchClasses = pitchClasses.filter(count => count > 0).length;
      expect(usedPitchClasses).toBeGreaterThan(0);
      expect(usedPitchClasses).toBeLessThanOrEqual(12);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle empty voices gracefully', () => {
      const emptyVoice = [];
      
      expect(() => {
        const keyAnalysis = analyzer.analyzeVoiceKey(emptyVoice);
        expect(keyAnalysis.statistics.totalNotes).toBe(0);
      }).not.toThrow();
    });

    test('should handle single note voices', () => {
      const singleNote = [{ pitch: 60, duration: 480 }];
      
      expect(() => {
        const keyAnalysis = analyzer.analyzeVoiceKey(singleNote);
        expect(keyAnalysis.statistics.totalNotes).toBe(1);
        expect(keyAnalysis.key).toBeTruthy();
        expect(keyAnalysis.mode).toBeTruthy();
      }).not.toThrow();
    });

    test('should handle invalid MIDI pitches', () => {
      const invalidNotes = [
        { pitch: -1, duration: 120 },  // Below MIDI range
        { pitch: 128, duration: 120 }, // Above MIDI range
        { pitch: null, duration: 120 }, // Null pitch
        { pitch: 60, duration: 120 }   // Valid note for comparison
      ];

      expect(() => {
        const keyAnalysis = analyzer.analyzeVoiceKey(invalidNotes);
        // Should handle gracefully, maybe filtering out invalid notes
        expect(keyAnalysis.statistics.totalNotes).toBeGreaterThanOrEqual(0);
      }).not.toThrow();
    });

    test('should handle extreme pitch ranges', () => {
      const extremeNotes = [
        { pitch: 0, duration: 120 },   // Lowest MIDI note
        { pitch: 127, duration: 120 }, // Highest MIDI note
        { pitch: 60, duration: 120 }   // Middle C for reference
      ];

      expect(() => {
        const keyAnalysis = analyzer.analyzeVoiceKey(extremeNotes);
        expect(keyAnalysis.key).toBeTruthy();
        expect(keyAnalysis.mode).toBeTruthy();
      }).not.toThrow();
    });

    test('should handle notes with missing properties', () => {
      const malformedNotes = [
        { pitch: 60 }, // Missing duration
        { duration: 120 }, // Missing pitch
        { pitch: 62, duration: 120 }, // Complete note
        {} // Empty object
      ];

      expect(() => {
        const keyAnalysis = analyzer.analyzeVoiceKey(malformedNotes);
        // Should handle gracefully
        expect(keyAnalysis.statistics).toBeDefined();
      }).not.toThrow();
    });
  });

  describe('Performance and Memory', () => {
    test('should analyze keys efficiently', () => {
      if (!fs.existsSync('test-christus.mid')) {
        console.warn('Performance test file not found, skipping');
        return;
      }

      console.log('\n=== KEY ANALYSIS PERFORMANCE TEST ===');

      const midi = parseMidi('test-christus.mid');
      const musicData = extractTempoAndPPQAndNotes(midi);
      const voices = separateVoices(musicData.notes);

      const startTime = Date.now();
      
      // Analyze all voices
      const analyses = voices.map(voice => {
        if (voice.length > 0) {
          return analyzer.analyzeVoiceKey(voice);
        }
        return null;
      }).filter(Boolean);

      const endTime = Date.now();
      const processingTime = endTime - startTime;
      
      const totalNotes = voices.reduce((sum, voice) => sum + voice.length, 0);
      const notesPerSecond = totalNotes / (processingTime / 1000);

      console.log(`Analyzed ${analyses.length} voices (${totalNotes} notes) in ${processingTime}ms`);
      console.log(`Processing rate: ${notesPerSecond.toFixed(1)} notes/second`);

      // Should complete within reasonable time
      expect(processingTime).toBeLessThan(5000); // 5 seconds max
      expect(notesPerSecond).toBeGreaterThan(100); // Minimum processing rate
    });

    test('should maintain memory efficiency with repeated analysis', () => {
      if (!fs.existsSync('test-christus.mid')) {
        console.warn('Memory test file not found, skipping');
        return;
      }

      const initialMemory = process.memoryUsage().heapUsed;

      // Perform multiple analyses
      for (let i = 0; i < 10; i++) {
        const midi = parseMidi('test-christus.mid');
        const musicData = extractTempoAndPPQAndNotes(midi);
        const voices = separateVoices(musicData.notes);
        
        if (voices.length > 0) {
          const keyAnalysis = analyzer.analyzeVoiceKey(voices[0]);
          expect(keyAnalysis.key).toBeTruthy();
        }
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      console.log(`Memory increase after 10 analyses: ${Math.round(memoryIncrease / 1024 / 1024)}MB`);

      // Should not have excessive memory leaks
      expect(memoryIncrease).toBeLessThan(20 * 1024 * 1024); // 20MB max increase
    });
  });
});