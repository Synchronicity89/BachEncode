/**
 * test-json-consistency.js - Test to ensure consistency between no-motif compression and exported decompression JSON
 */

const EncodeDecode = require('./EncodeDecode');
const fs = require('fs');
const path = require('path');

function deepEqual(obj1, obj2, path = '') {
    if (obj1 === obj2) return true;
    
    if (obj1 == null || obj2 == null) {
        return false;
    }
    
    if (typeof obj1 !== typeof obj2) {
        return false;
    }
    
    if (typeof obj1 === 'object') {
        const keys1 = Object.keys(obj1);
        const keys2 = Object.keys(obj2);
        
        if (keys1.length !== keys2.length) {
            return false;
        }
        
        for (let key of keys1) {
            if (!keys2.includes(key)) {
                return false;
            }
            if (!deepEqual(obj1[key], obj2[key], path + '.' + key)) {
                return false;
            }
        }
        
        return true;
    }
    
    return false;
}

function findDifferences(obj1, obj2, path = '', differences = []) {
    if (obj1 === obj2) return differences;
    
    if (obj1 == null || obj2 == null) {
        differences.push(`${path}: ${obj1} !== ${obj2}`);
        return differences;
    }
    
    if (typeof obj1 !== typeof obj2) {
        differences.push(`${path}: type mismatch ${typeof obj1} !== ${typeof obj2}`);
        return differences;
    }
    
    if (typeof obj1 === 'object') {
        const keys1 = Object.keys(obj1).sort();
        const keys2 = Object.keys(obj2).sort();
        
        // Check for missing keys
        for (let key of keys1) {
            if (!keys2.includes(key)) {
                differences.push(`${path}.${key}: missing in second object`);
            }
        }
        
        for (let key of keys2) {
            if (!keys1.includes(key)) {
                differences.push(`${path}.${key}: missing in first object`);
            }
        }
        
        // Check property order for notes
        if (path.includes('.voices[') && obj1.type === 'regular_note') {
            const expectedOrder = ['type', 'delta', 'pitch', 'dur', 'vel'];
            const actualOrder1 = Object.keys(obj1);
            const actualOrder2 = Object.keys(obj2);
            
            if (JSON.stringify(actualOrder1) !== JSON.stringify(expectedOrder)) {
                differences.push(`${path}: property order in obj1 ${JSON.stringify(actualOrder1)} !== expected ${JSON.stringify(expectedOrder)}`);
            }
            
            if (JSON.stringify(actualOrder2) !== JSON.stringify(expectedOrder)) {
                differences.push(`${path}: property order in obj2 ${JSON.stringify(actualOrder2)} !== expected ${JSON.stringify(expectedOrder)}`);
            }
        }
        
        // Recursively check common keys
        for (let key of keys1) {
            if (keys2.includes(key)) {
                findDifferences(obj1[key], obj2[key], path + '.' + key, differences);
            }
        }
        
        return differences;
    }
    
    if (obj1 !== obj2) {
        differences.push(`${path}: ${obj1} !== ${obj2}`);
    }
    
    return differences;
}

async function testJsonConsistency() {
    console.log('=== TESTING JSON CONSISTENCY ===\n');
    
    const testFile = 'midi/BWV785.MID';
    const tempDir = 'temp_json_test';
    
    // Ensure temp directory exists
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir);
    }
    
    try {
        console.log('1. Creating no-motif compression...');
        const noMotifJsonPath = path.join(tempDir, 'bwv785-no-motif.json');
        const noMotifOptions = { useMotifCompression: false };
        
        const noMotifResults = EncodeDecode.compressMidiToJson(testFile, noMotifJsonPath, noMotifOptions);
        console.log(`   No-motif compression: ${noMotifResults.originalNoteCount} notes`);
        
        console.log('2. Creating motif compression...');
        const motifJsonPath = path.join(tempDir, 'bwv785-with-motifs.json');
        const motifOptions = { useMotifCompression: true };
        
        const motifResults = EncodeDecode.compressMidiToJson(testFile, motifJsonPath, motifOptions);
        console.log(`   Motif compression: ${motifResults.motifCount} motifs, ratio: ${motifResults.compressionRatio.toFixed(3)}x`);
        
        console.log('3. Decompressing and exporting motif-free JSON...');
        const tempMidiPath = path.join(tempDir, 'bwv785-decompressed.mid');
        const exportedJsonPath = path.join(tempDir, 'bwv785-exported-motif-free.json');
        
        const exportOptions = { exportJson: exportedJsonPath };
        EncodeDecode.decompressJsonToMidi(motifJsonPath, tempMidiPath, exportOptions);
        console.log(`   Exported motif-free JSON to: ${exportedJsonPath}`);
        
        console.log('4. Comparing JSONs...');
        const noMotifData = JSON.parse(fs.readFileSync(noMotifJsonPath, 'utf8'));
        const exportedData = JSON.parse(fs.readFileSync(exportedJsonPath, 'utf8'));
        
        // Find differences
        const differences = findDifferences(noMotifData, exportedData, 'root');
        
        if (differences.length === 0) {
            console.log('✅ SUCCESS: JSONs are identical!');
            console.log('   No differences found between no-motif compression and exported decompression JSON');
            return true;
        } else {
            console.log('❌ FAILURE: JSONs have differences!');
            console.log(`   Found ${differences.length} differences:`);
            
            // Show first 10 differences for debugging
            const maxDisplay = 10;
            for (let i = 0; i < Math.min(differences.length, maxDisplay); i++) {
                console.log(`   ${i + 1}. ${differences[i]}`);
            }
            
            if (differences.length > maxDisplay) {
                console.log(`   ... and ${differences.length - maxDisplay} more differences`);
            }
            
            return false;
        }
        
    } catch (error) {
        console.error('❌ ERROR during test:', error.message);
        console.error(error.stack);
        return false;
    } finally {
        // Clean up temp files
        try {
            if (fs.existsSync(tempDir)) {
                const files = fs.readdirSync(tempDir);
                for (const file of files) {
                    fs.unlinkSync(path.join(tempDir, file));
                }
                fs.rmdirSync(tempDir);
            }
        } catch (cleanupError) {
            console.warn('Warning: Could not clean up temp files:', cleanupError.message);
        }
    }
}

// Run test if called directly
if (require.main === module) {
    testJsonConsistency().then(success => {
        process.exit(success ? 0 : 1);
    });
}

module.exports = { testJsonConsistency };