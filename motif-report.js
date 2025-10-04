const fs = require('fs');
const path = require('path');

/**
 * Analyzes JSON files in a folder and reports motif statistics
 * Usage: node motif-report.js <folder_path>
 */

function analyzeJsonFile(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const data = JSON.parse(content);
        
        if (!data.motifs || !Array.isArray(data.motifs)) {
            return null; // Not a compressed MIDI file or no motifs
        }
        
        const motifSizes = data.motifs.map(motif => {
            // Use deg_rels length to determine number of notes in motif
            return motif.deg_rels ? motif.deg_rels.length : 0;
        });
        
        if (motifSizes.length === 0) {
            return { totalMotifs: 0, maxNotes: 0, minNotes: 0 };
        }
        
        const maxNotes = Math.max(...motifSizes);
        const minNotes = Math.min(...motifSizes);
        
        return {
            totalMotifs: motifSizes.length,
            maxNotes: maxNotes,
            minNotes: minNotes,
            motifSizes: motifSizes
        };
        
    } catch (error) {
        console.warn(`Warning: Could not analyze ${filePath}: ${error.message}`);
        return null;
    }
}

function generateReport(folderPath) {
    if (!fs.existsSync(folderPath)) {
        console.error(`Error: Folder ${folderPath} does not exist`);
        process.exit(1);
    }
    
    const stats = fs.statSync(folderPath);
    if (!stats.isDirectory()) {
        console.error(`Error: ${folderPath} is not a directory`);
        process.exit(1);
    }
    
    console.log(`\n=== MOTIF ANALYSIS REPORT ===`);
    console.log(`Folder: ${folderPath}`);
    console.log(`Generated: ${new Date().toLocaleString()}\n`);
    
    const files = fs.readdirSync(folderPath);
    const jsonFiles = files.filter(file => file.toLowerCase().endsWith('.json'));
    
    if (jsonFiles.length === 0) {
        console.log('No JSON files found in the specified folder.');
        return;
    }
    
    console.log(`Found ${jsonFiles.length} JSON files to analyze.\n`);
    
    const results = [];
    let processedCount = 0;
    
    for (const file of jsonFiles) {
        const filePath = path.join(folderPath, file);
        const analysis = analyzeJsonFile(filePath);
        
        if (analysis !== null) {
            results.push({
                filename: file,
                ...analysis
            });
            processedCount++;
        }
    }
    
    if (results.length === 0) {
        console.log('No valid compressed MIDI JSON files found.');
        return;
    }
    
    // Sort results by filename for consistent output
    results.sort((a, b) => a.filename.localeCompare(b.filename));
    
    // Generate individual file reports
    console.log('--- INDIVIDUAL FILE ANALYSIS ---\n');
    
    for (const result of results) {
        console.log(`File: ${result.filename}`);
        console.log(`  Total motifs: ${result.totalMotifs}`);
        console.log(`  Maximum notes in a motif: ${result.maxNotes}`);
        console.log(`  Minimum notes in a motif: ${result.minNotes}`);
        
        if (result.maxNotes !== result.minNotes) {
            console.log(`  Note range: ${result.minNotes} - ${result.maxNotes} notes per motif`);
        }
        console.log();
    }
    
    // Generate summary statistics
    console.log('--- SUMMARY STATISTICS ---\n');
    
    const overallMaxNotes = Math.max(...results.map(r => r.maxNotes));
    const overallMinNotes = Math.min(...results.map(r => r.minNotes));
    const totalMotifs = results.reduce((sum, r) => sum + r.totalMotifs, 0);
    
    console.log(`Files analyzed: ${processedCount} of ${jsonFiles.length}`);
    console.log(`Total motifs across all files: ${totalMotifs}`);
    console.log(`Overall maximum notes in any motif: ${overallMaxNotes}`);
    console.log(`Overall minimum notes in any motif: ${overallMinNotes}`);
    
    // Find files with maximum and minimum motif sizes
    const filesWithMaxMotifs = results.filter(r => r.maxNotes === overallMaxNotes);
    const filesWithMinMotifs = results.filter(r => r.minNotes === overallMinNotes);
    
    console.log(`\nFiles containing motifs with maximum notes (${overallMaxNotes}):`);
    filesWithMaxMotifs.forEach(r => console.log(`  - ${r.filename}`));
    
    console.log(`\nFiles containing motifs with minimum notes (${overallMinNotes}):`);
    filesWithMinMotifs.forEach(r => console.log(`  - ${r.filename}`));
    
    console.log(`\n=== END REPORT ===\n`);
}

function main() {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log('Motif Analysis Report Generator');
        console.log('');
        console.log('Usage: node motif-report.js <folder_path>');
        console.log('');
        console.log('Analyzes all JSON files in the specified folder and reports:');
        console.log('- Number of notes in motifs with maximum notes');
        console.log('- Number of notes in motifs with minimum notes');
        console.log('- Summary statistics across all files');
        console.log('');
        console.log('Examples:');
        console.log('  node motif-report.js output/');
        console.log('  node motif-report.js midi/');
        console.log('  node motif-report.js C:\\path\\to\\json\\files');
        process.exit(0);
    }
    
    const folderPath = args[0];
    generateReport(folderPath);
}

if (require.main === module) {
    main();
}

module.exports = { analyzeJsonFile, generateReport };