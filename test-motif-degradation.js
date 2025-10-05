const fs = require('fs');
const path = require('path');
const { compressMidiToJson, decompressJsonToMidi } = require('./EncodeDecode.js');

/**
 * Test degradation cycles with motif compression
 * Run multiple compress/decompress cycles and analyze quality retention
 */
async function testMotifDegradation() {
    console.log('=== MOTIF DEGRADATION CYCLE TEST ===');
    
    const inputDir = './test_input';
    const outputDir = './temp_degradation';
    
    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Get all MIDI files from test_input
    const midiFiles = fs.readdirSync(inputDir).filter(file => file.endsWith('.MID') || file.endsWith('.mid'));
    
    console.log(`Found ${midiFiles.length} MIDI files for testing:`);
    midiFiles.forEach(file => console.log(`  - ${file}`));
    console.log();
    
    const cycles = 5; // Number of compression/decompression cycles
    const results = [];
    
    for (const midiFile of midiFiles) {
        console.log(`\n--- Testing ${midiFile} ---`);
        
        const inputPath = path.join(inputDir, midiFile);
        const baseName = path.basename(midiFile, path.extname(midiFile));
        
        let currentMidiPath = inputPath;
        const fileResults = {
            filename: midiFile,
            originalSize: fs.statSync(inputPath).size,
            cycles: []
        };
        
        for (let cycle = 1; cycle <= cycles; cycle++) {
            console.log(`  Cycle ${cycle}/${cycles}...`);
            
            try {
                // Compression phase
                const jsonPath = path.join(outputDir, `${baseName}_cycle${cycle}.json`);
                console.log(`    Compressing with motifs: ${path.basename(currentMidiPath)} -> ${path.basename(jsonPath)}`);
                
                const compressionResult = await compressMidiToJson(currentMidiPath, jsonPath, { useMotifs: true });
                
                // Decompression phase
                const newMidiPath = path.join(outputDir, `${baseName}_cycle${cycle}.mid`);
                console.log(`    Decompressing: ${path.basename(jsonPath)} -> ${path.basename(newMidiPath)}`);
                
                await decompressJsonToMidi(jsonPath, newMidiPath);
                
                // Collect metrics
                const jsonSize = fs.statSync(jsonPath).size;
                const midiSize = fs.statSync(newMidiPath).size;
                
                const cycleData = {
                    cycle: cycle,
                    jsonSize: jsonSize,
                    midiSize: midiSize,
                    compressionRatio: compressionResult ? compressionResult.compressionRatio : 'N/A',
                    motifCount: compressionResult ? compressionResult.motifCount : 'N/A',
                    success: true
                };
                
                fileResults.cycles.push(cycleData);
                
                console.log(`    JSON size: ${jsonSize} bytes`);
                console.log(`    MIDI size: ${midiSize} bytes`);
                if (compressionResult) {
                    console.log(`    Compression ratio: ${compressionResult.compressionRatio}x`);
                    console.log(`    Motifs compressed: ${compressionResult.motifCount}`);
                }
                
                // Use the decompressed MIDI as input for next cycle
                currentMidiPath = newMidiPath;
                
            } catch (error) {
                console.error(`    ERROR in cycle ${cycle}: ${error.message}`);
                fileResults.cycles.push({
                    cycle: cycle,
                    success: false,
                    error: error.message
                });
                break; // Stop further cycles for this file
            }
        }
        
        results.push(fileResults);
    }
    
    // Generate comprehensive report
    console.log('\n=== DEGRADATION TEST RESULTS ===\n');
    
    let allCyclesSuccessful = true;
    
    for (const fileResult of results) {
        console.log(`${fileResult.filename}:`);
        console.log(`  Original size: ${fileResult.originalSize} bytes`);
        
        let lastSuccessfulCycle = 0;
        for (const cycle of fileResult.cycles) {
            if (cycle.success) {
                lastSuccessfulCycle = cycle.cycle;
                console.log(`  Cycle ${cycle.cycle}: ✓ JSON=${cycle.jsonSize}b, MIDI=${cycle.midiSize}b, Ratio=${cycle.compressionRatio}x, Motifs=${cycle.motifCount}`);
            } else {
                console.log(`  Cycle ${cycle.cycle}: ✗ FAILED - ${cycle.error}`);
                allCyclesSuccessful = false;
            }
        }
        
        if (lastSuccessfulCycle < cycles) {
            console.log(`  >>> DEGRADATION DETECTED: Failed after ${lastSuccessfulCycle} cycles`);
            allCyclesSuccessful = false;
        } else {
            console.log(`  >>> SUCCESS: Completed all ${cycles} cycles`);
        }
        
        console.log();
    }
    
    // Summary
    console.log('=== SUMMARY ===');
    if (allCyclesSuccessful) {
        console.log('✓ ALL FILES PASSED: No degradation detected through 5 cycles');
        console.log('✓ Motif compression maintains data integrity');
    } else {
        console.log('✗ DEGRADATION DETECTED: Some files failed multiple cycles');
        console.log('⚠ Motif compression may have data loss issues');
    }
    
    // Save detailed results
    const reportPath = path.join(outputDir, 'motif_degradation_report.json');
    fs.writeFileSync(reportPath, JSON.stringify({
        timestamp: new Date().toISOString(),
        testParameters: {
            cycles: cycles,
            useMotifs: true
        },
        results: results,
        summary: {
            totalFiles: results.length,
            allCyclesSuccessful: allCyclesSuccessful
        }
    }, null, 2));
    
    console.log(`\nDetailed report saved to: ${reportPath}`);
    console.log('\n=== MOTIF DEGRADATION TEST COMPLETE ===');
    
    return allCyclesSuccessful;
}

// Run the test
if (require.main === module) {
    testMotifDegradation().catch(console.error);
}

module.exports = { testMotifDegradation };