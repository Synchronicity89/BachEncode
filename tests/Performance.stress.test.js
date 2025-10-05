/**
 * Performance and Stress Tests
 * Testing system limits, memory usage, and performance characteristics
 */

const fs = require('fs');
const path = require('path');
const { 
  parseMidi, 
  extractTempoAndPPQAndNotes, 
  separateVoices,
  compressMidiToJson,
  decompressJsonToMidi,
  createCompressionConfig
} = require('../EncodeDecode');

const MotifCompressor = require('../MotifCompressor');
const MotifDetector = require('../MotifDetector');
const KeyAnalyzer = require('../KeyAnalyzer');

describe('BachEncode System - Performance and Stress Tests', () => {
  const tempFiles = [];

  beforeAll(() => {
    // Set longer timeout for performance tests
    jest.setTimeout(60000); // 60 seconds
  });

  afterEach(() => {
    tempFiles.forEach(file => {
      try {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
        }
      } catch (err) {
        // Ignore cleanup errors
      }
    });
    tempFiles.length = 0;
  });

  describe('Large Dataset Performance', () => {
    test('should handle large MIDI files efficiently', () => {
      if (!fs.existsSync('test-christus.mid')) {
        console.warn('Large file test not available, skipping');
        return;
      }

      console.log('\n=== LARGE DATASET PERFORMANCE TEST ===');

      const startTime = process.hrtime.bigint();
      const initialMemory = process.memoryUsage();

      // Process large file
      const midi = parseMidi('test-christus.mid');
      const musicData = extractTempoAndPPQAndNotes(midi);
      const voices = separateVoices(musicData.notes);

      const parseEndTime = process.hrtime.bigint();
      
      console.log(`Parsed ${musicData.notes.length} notes in ${voices.length} voices`);

      // Full analysis pipeline
      const keyAnalyzer = new KeyAnalyzer();
      const motifDetector = new MotifDetector();
      const motifCompressor = new MotifCompressor();

      // Key analysis
      const keyAnalyses = voices.filter(v => v.length > 5).map(voice => 
        keyAnalyzer.analyzeVoiceKey(voice)
      );
      const keyEndTime = process.hrtime.bigint();

      // Motif detection
      const motifAnalysis = motifDetector.analyzeMotifs(voices);
      const motifEndTime = process.hrtime.bigint();

      // Compression
      const inputData = {
        voices: voices,
        tempo: musicData.tempo,
        ppq: musicData.ppq,
        originalNoteCount: musicData.notes.length
      };
      const compressed = motifCompressor.compress(inputData);
      const decompressed = motifCompressor.decompress(compressed);
      const compressionEndTime = process.hrtime.bigint();

      const finalMemory = process.memoryUsage();

      // Calculate timing
      const parseTime = Number(parseEndTime - startTime) / 1000000; // Convert to ms
      const keyTime = Number(keyEndTime - parseEndTime) / 1000000;
      const motifTime = Number(motifEndTime - keyEndTime) / 1000000;
      const compressionTime = Number(compressionEndTime - motifEndTime) / 1000000;
      const totalTime = Number(compressionEndTime - startTime) / 1000000;

      console.log(`Performance breakdown:`);
      console.log(`  Parsing: ${parseTime.toFixed(2)}ms`);
      console.log(`  Key analysis: ${keyTime.toFixed(2)}ms`);
      console.log(`  Motif detection: ${motifTime.toFixed(2)}ms`);
      console.log(`  Compression/decompression: ${compressionTime.toFixed(2)}ms`);
      console.log(`  Total: ${totalTime.toFixed(2)}ms`);

      const notesPerSecond = (musicData.notes.length / totalTime) * 1000;
      console.log(`Processing rate: ${notesPerSecond.toFixed(1)} notes/second`);

      // Memory usage
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      console.log(`Memory increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`);

      // Performance expectations
      expect(totalTime).toBeLessThan(30000); // 30 seconds max
      expect(notesPerSecond).toBeGreaterThan(10); // Minimum 10 notes/second
      expect(memoryIncrease).toBeLessThan(200 * 1024 * 1024); // Max 200MB increase
    });

    test('should maintain performance with repeated processing', () => {
      if (!fs.existsSync('test-christus.mid')) {
        console.warn('Repeated processing test not available, skipping');
        return;
      }

      console.log('\n=== REPEATED PROCESSING PERFORMANCE TEST ===');

      const iterations = 5;
      const timings = [];
      const memoryUsages = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = process.hrtime.bigint();
        const startMemory = process.memoryUsage().heapUsed;

        // Full processing cycle
        const midi = parseMidi('test-christus.mid');
        const musicData = extractTempoAndPPQAndNotes(midi);
        const voices = separateVoices(musicData.notes);

        const motifDetector = new MotifDetector();
        const motifAnalysis = motifDetector.analyzeMotifs(voices);

        const motifCompressor = new MotifCompressor();
        const inputData = {
          voices: voices,
          tempo: musicData.tempo,
          ppq: musicData.ppq,
          originalNoteCount: musicData.notes.length
        };
        const compressed = motifCompressor.compress(inputData);
        const decompressed = motifCompressor.decompress(compressed);

        const endTime = process.hrtime.bigint();
        const endMemory = process.memoryUsage().heapUsed;

        const iterationTime = Number(endTime - startTime) / 1000000;
        const memoryIncrease = endMemory - startMemory;

        timings.push(iterationTime);
        memoryUsages.push(memoryIncrease);

        console.log(`Iteration ${i + 1}: ${iterationTime.toFixed(2)}ms, ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`);

        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
      }

      // Analyze performance consistency
      const avgTime = timings.reduce((sum, time) => sum + time, 0) / timings.length;
      const timeVariance = timings.reduce((sum, time) => sum + Math.pow(time - avgTime, 2), 0) / timings.length;
      const timeStdDev = Math.sqrt(timeVariance);

      console.log(`Average time: ${avgTime.toFixed(2)}ms ± ${timeStdDev.toFixed(2)}ms`);

      // Performance should be consistent (coefficient of variation < 50%)
      const coefficientOfVariation = timeStdDev / avgTime;
      expect(coefficientOfVariation).toBeLessThan(0.5);

      // Memory usage should not grow excessively
      const maxMemoryIncrease = Math.max(...memoryUsages);
      expect(maxMemoryIncrease).toBeLessThan(100 * 1024 * 1024); // Max 100MB per iteration
    });
  });

  describe('Stress Testing', () => {
    test('should handle synthetic large datasets', () => {
      console.log('\n=== SYNTHETIC LARGE DATASET STRESS TEST ===');

      // Create large synthetic dataset
      const largeVoices = [];
      const voiceCount = 8;
      const notesPerVoice = 500;

      for (let v = 0; v < voiceCount; v++) {
        const voice = [];
        for (let n = 0; n < notesPerVoice; n++) {
          voice.push({
            pitch: 60 + (n % 24), // C4 to B5 range
            duration: 120 + (n % 240), // Variable durations
            start: n * 120,
            velocity: 80 + (n % 40) // Variable velocities
          });
        }
        largeVoices.push(voice);
      }

      const totalNotes = voiceCount * notesPerVoice;
      console.log(`Generated synthetic dataset: ${voiceCount} voices, ${totalNotes} notes`);

      const startTime = process.hrtime.bigint();

      // Test all components with large synthetic data
      const keyAnalyzer = new KeyAnalyzer();
      const motifDetector = new MotifDetector();
      const motifCompressor = new MotifCompressor();

      // Key analysis
      const keyAnalyses = largeVoices.map(voice => keyAnalyzer.analyzeVoiceKey(voice));
      expect(keyAnalyses).toHaveLength(voiceCount);

      // Motif detection
      const motifAnalysis = motifDetector.analyzeMotifs(largeVoices);
      expect(motifAnalysis.statistics.totalMotifs).toBeGreaterThanOrEqual(0);

      // Compression
      const inputData = {
        voices: largeVoices,
        tempo: 120,
        ppq: 480,
        originalNoteCount: totalNotes
      };
      const compressed = motifCompressor.compress(inputData);
      const decompressed = motifCompressor.decompress(compressed);

      const endTime = process.hrtime.bigint();
      const processingTime = Number(endTime - startTime) / 1000000;

      console.log(`Processed ${totalNotes} synthetic notes in ${processingTime.toFixed(2)}ms`);
      console.log(`Rate: ${((totalNotes / processingTime) * 1000).toFixed(1)} notes/second`);

      // Verify data integrity
      expect(decompressed.voices).toHaveLength(voiceCount);
      const decompressedNoteCount = decompressed.voices.reduce((sum, voice) => sum + voice.length, 0);
      const preservationRatio = decompressedNoteCount / totalNotes;
      
      console.log(`Data preservation: ${(preservationRatio * 100).toFixed(1)}%`);
      expect(preservationRatio).toBeGreaterThan(0.8); // 80% minimum preservation

      // Performance should be reasonable even for large datasets
      expect(processingTime).toBeLessThan(60000); // 60 seconds max
    });

    test('should handle memory pressure gracefully', () => {
      console.log('\n=== MEMORY PRESSURE STRESS TEST ===');

      const initialMemory = process.memoryUsage();
      const memorySnapshots = [initialMemory.heapUsed];

      // Create progressively larger datasets
      const maxSize = 100; // Start smaller to avoid overwhelming the system
      const motifCompressor = new MotifCompressor();

      for (let size = 10; size <= maxSize; size += 10) {
        // Create dataset of increasing size
        const voices = [];
        for (let v = 0; v < 4; v++) {
          const voice = [];
          for (let n = 0; n < size; n++) {
            voice.push({
              pitch: 60 + (n % 12),
              duration: 120,
              start: n * 120,
              velocity: 100
            });
          }
          voices.push(voice);
        }

        const inputData = {
          voices: voices,
          tempo: 120,
          ppq: 480,
          originalNoteCount: 4 * size
        };

        // Process and measure memory
        const compressed = motifCompressor.compress(inputData);
        const decompressed = motifCompressor.decompress(compressed);

        const currentMemory = process.memoryUsage().heapUsed;
        memorySnapshots.push(currentMemory);

        console.log(`Size ${size}: ${(currentMemory / 1024 / 1024).toFixed(2)}MB heap`);

        // Verify processing still works
        expect(decompressed.voices).toHaveLength(4);
        expect(decompressed.voices.reduce((sum, v) => sum + v.length, 0)).toBeGreaterThan(0);

        // Force garbage collection periodically
        if (size % 30 === 0 && global.gc) {
          global.gc();
        }
      }

      // Analyze memory growth
      const finalMemory = memorySnapshots[memorySnapshots.length - 1];
      const memoryGrowth = finalMemory - initialMemory.heapUsed;
      
      console.log(`Total memory growth: ${(memoryGrowth / 1024 / 1024).toFixed(2)}MB`);

      // Memory growth should be reasonable
      expect(memoryGrowth).toBeLessThan(500 * 1024 * 1024); // Max 500MB growth
    });

    test('should handle extreme musical edge cases', () => {
      console.log('\n=== EXTREME MUSICAL EDGE CASES STRESS TEST ===');

      const extremeCases = [
        {
          name: 'Very short notes',
          voices: [[
            { pitch: 60, duration: 1, start: 0, velocity: 100 },
            { pitch: 62, duration: 1, start: 1, velocity: 100 },
            { pitch: 64, duration: 1, start: 2, velocity: 100 }
          ]]
        },
        {
          name: 'Very long notes',
          voices: [[
            { pitch: 60, duration: 10000, start: 0, velocity: 100 },
            { pitch: 62, duration: 10000, start: 10000, velocity: 100 }
          ]]
        },
        {
          name: 'Extreme pitch range',
          voices: [[
            { pitch: 0, duration: 120, start: 0, velocity: 100 },    // Lowest MIDI
            { pitch: 127, duration: 120, start: 120, velocity: 100 }, // Highest MIDI
            { pitch: 60, duration: 120, start: 240, velocity: 100 }   // Middle C
          ]]
        },
        {
          name: 'Dense polyphony',
          voices: Array(20).fill(null).map((_, i) => [
            { pitch: 60 + i, duration: 480, start: 0, velocity: 100 }
          ])
        },
        {
          name: 'Rapid alternation',
          voices: [[
            ...Array(100).fill(null).map((_, i) => ({
              pitch: 60 + (i % 2),
              duration: 12,
              start: i * 12,
              velocity: 100
            }))
          ]]
        }
      ];

      const motifDetector = new MotifDetector();
      const motifCompressor = new MotifCompressor();

      extremeCases.forEach(testCase => {
        console.log(`Testing: ${testCase.name}`);

        const startTime = process.hrtime.bigint();

        // All components should handle extreme cases gracefully
        expect(() => {
          // Motif detection
          const motifAnalysis = motifDetector.analyzeMotifs(testCase.voices);
          expect(motifAnalysis.statistics.totalMotifs).toBeGreaterThanOrEqual(0);

          // Compression
          const inputData = {
            voices: testCase.voices,
            tempo: 120,
            ppq: 480,
            originalNoteCount: testCase.voices.reduce((sum, voice) => sum + voice.length, 0)
          };
          const compressed = motifCompressor.compress(inputData);
          const decompressed = motifCompressor.decompress(compressed);

          expect(decompressed.voices).toHaveLength(testCase.voices.length);

        }).not.toThrow();

        const endTime = process.hrtime.bigint();
        const processingTime = Number(endTime - startTime) / 1000000;
        
        console.log(`  Processed in ${processingTime.toFixed(2)}ms`);
        
        // Even extreme cases should complete in reasonable time
        expect(processingTime).toBeLessThan(10000); // 10 seconds max
      });
    });
  });

  describe('Concurrent Processing', () => {
    test('should handle multiple simultaneous operations', () => {
      if (!fs.existsSync('test-christus.mid')) {
        console.warn('Concurrent processing test not available, skipping');
        return;
      }

      console.log('\n=== CONCURRENT PROCESSING TEST ===');

      const concurrentOperations = 3;
      const promises = [];

      for (let i = 0; i < concurrentOperations; i++) {
        const promise = new Promise((resolve, reject) => {
          try {
            const startTime = process.hrtime.bigint();
            
            // Each concurrent operation processes the same file
            const midi = parseMidi('test-christus.mid');
            const musicData = extractTempoAndPPQAndNotes(midi);
            const voices = separateVoices(musicData.notes);

            const motifDetector = new MotifDetector();
            const motifAnalysis = motifDetector.analyzeMotifs(voices);

            const motifCompressor = new MotifCompressor();
            const inputData = {
              voices: voices,
              tempo: musicData.tempo,
              ppq: musicData.ppq,
              originalNoteCount: musicData.notes.length
            };
            const compressed = motifCompressor.compress(inputData);
            const decompressed = motifCompressor.decompress(compressed);

            const endTime = process.hrtime.bigint();
            const processingTime = Number(endTime - startTime) / 1000000;

            resolve({
              operationId: i,
              processingTime,
              noteCount: musicData.notes.length,
              motifCount: motifAnalysis.statistics.totalMotifs,
              compressionRatio: compressed.motifCompression.compressionStats.compressionRatio
            });
          } catch (error) {
            reject(error);
          }
        });
        
        promises.push(promise);
      }

      return Promise.all(promises).then(results => {
        console.log('Concurrent operation results:');
        results.forEach(result => {
          console.log(`  Operation ${result.operationId}: ${result.processingTime.toFixed(2)}ms, ${result.noteCount} notes`);
        });

        // All operations should complete successfully
        expect(results).toHaveLength(concurrentOperations);
        
        // Results should be consistent (same input = similar output)
        const noteCount = results[0].noteCount;
        results.forEach(result => {
          expect(result.noteCount).toBe(noteCount);
          expect(result.processingTime).toBeGreaterThan(0);
        });

        // Average processing time
        const avgTime = results.reduce((sum, r) => sum + r.processingTime, 0) / results.length;
        console.log(`Average concurrent processing time: ${avgTime.toFixed(2)}ms`);
      });
    });
  });

  describe('Resource Cleanup', () => {
    test('should properly clean up resources', () => {
      console.log('\n=== RESOURCE CLEANUP TEST ===');

      const initialMemory = process.memoryUsage().heapUsed;
      const iterations = 10;

      // Create and destroy many objects
      for (let i = 0; i < iterations; i++) {
        const motifDetector = new MotifDetector();
        const motifCompressor = new MotifCompressor();
        const keyAnalyzer = new KeyAnalyzer();

        // Create synthetic data
        const voices = [[
          { pitch: 60, duration: 120, start: 0, velocity: 100 },
          { pitch: 62, duration: 120, start: 120, velocity: 100 },
          { pitch: 64, duration: 120, start: 240, velocity: 100 }
        ]];

        // Process data
        const keyAnalysis = keyAnalyzer.analyzeVoiceKey(voices[0]);
        const motifAnalysis = motifDetector.analyzeMotifs(voices);
        
        const inputData = {
          voices: voices,
          tempo: 120,
          ppq: 480,
          originalNoteCount: 3
        };
        const compressed = motifCompressor.compress(inputData);
        const decompressed = motifCompressor.decompress(compressed);

        // Verify objects work
        expect(keyAnalysis.key).toBeTruthy();
        expect(motifAnalysis.statistics.totalMotifs).toBeGreaterThanOrEqual(0);
        expect(decompressed.voices).toHaveLength(1);
      }

      // Force garbage collection
      if (global.gc) {
        global.gc();
        // Give GC time to work
        setTimeout(() => {}, 100);
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      console.log(`Memory after ${iterations} iterations: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB increase`);

      // Should not have significant memory leaks
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024); // Max 50MB increase
    });

    test('should handle file I/O cleanup properly', () => {
      if (!fs.existsSync('test-minimal-one-note.mid')) {
        console.warn('File I/O cleanup test not available, skipping');
        return;
      }

      console.log('\n=== FILE I/O CLEANUP TEST ===');

      const iterations = 5;
      const createdFiles = [];

      for (let i = 0; i < iterations; i++) {
        const jsonPath = `test-cleanup-${i}.json`;
        const midiPath = `test-cleanup-${i}.mid`;
        
        createdFiles.push(jsonPath, midiPath);

        // File operations
        expect(() => {
          compressMidiToJson('test-minimal-one-note.mid', jsonPath);
          expect(fs.existsSync(jsonPath)).toBe(true);
          
          decompressJsonToMidi(jsonPath, midiPath);
          expect(fs.existsSync(midiPath)).toBe(true);
        }).not.toThrow();
      }

      // Clean up created files
      createdFiles.forEach(file => {
        try {
          if (fs.existsSync(file)) {
            fs.unlinkSync(file);
          }
        } catch (err) {
          console.warn(`Failed to clean up ${file}:`, err.message);
        }
      });

      // Verify cleanup
      const remainingFiles = createdFiles.filter(file => fs.existsSync(file));
      expect(remainingFiles).toHaveLength(0);

      console.log(`Successfully created and cleaned up ${createdFiles.length} temporary files`);
    });
  });

  describe('Performance Regression Prevention', () => {
    test('should maintain baseline performance metrics', () => {
      if (!fs.existsSync('test-christus.mid')) {
        console.warn('Performance baseline test not available, skipping');
        return;
      }

      console.log('\n=== PERFORMANCE BASELINE TEST ===');

      // Establish baseline metrics
      const iterations = 3;
      const timings = [];
      const memoryUsages = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = process.hrtime.bigint();
        const startMemory = process.memoryUsage().heapUsed;

        // Standard processing workflow
        const midi = parseMidi('test-christus.mid');
        const musicData = extractTempoAndPPQAndNotes(midi);
        const voices = separateVoices(musicData.notes);

        const motifDetector = new MotifDetector();
        const motifAnalysis = motifDetector.analyzeMotifs(voices);

        const motifCompressor = new MotifCompressor();
        const inputData = {
          voices: voices,
          tempo: musicData.tempo,
          ppq: musicData.ppq,
          originalNoteCount: musicData.notes.length
        };
        const compressed = motifCompressor.compress(inputData);
        const decompressed = motifCompressor.decompress(compressed);

        const endTime = process.hrtime.bigint();
        const endMemory = process.memoryUsage().heapUsed;

        const processingTime = Number(endTime - startTime) / 1000000;
        const memoryUsage = endMemory - startMemory;

        timings.push(processingTime);
        memoryUsages.push(memoryUsage);
      }

      const avgTime = timings.reduce((sum, time) => sum + time, 0) / timings.length;
      const avgMemory = memoryUsages.reduce((sum, mem) => sum + mem, 0) / memoryUsages.length;

      console.log(`Baseline performance:`);
      console.log(`  Average time: ${avgTime.toFixed(2)}ms`);
      console.log(`  Average memory: ${(avgMemory / 1024 / 1024).toFixed(2)}MB`);
      console.log(`  Note count: ${timings.length > 0 ? 'processed successfully' : 'failed'}`);

      // Define performance baselines (adjust these based on your system/requirements)
      const maxExpectedTime = 20000; // 20 seconds
      const maxExpectedMemory = 200 * 1024 * 1024; // 200MB

      expect(avgTime).toBeLessThan(maxExpectedTime);
      expect(avgMemory).toBeLessThan(maxExpectedMemory);

      // Store baseline for future regression testing
      const baseline = {
        timestamp: new Date().toISOString(),
        avgTime,
        avgMemory,
        nodeVersion: process.version
      };

      console.log('Performance baseline established:', JSON.stringify(baseline, null, 2));
    });
  });
});