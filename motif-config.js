/**
 * Configuration helper for MotifCompressor default settings
 * This allows users to easily set whether they want exact matches only by default
 */

const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, 'motif-config.json');

const DEFAULT_CONFIG = {
    exactMatchesOnly: true,  // Changed default to true based on user feedback
    conservativeMode: true,
    compressionThreshold: 0.8,
    minMotifMatches: 1,
    maxCompressionRatio: 1.0
};

/**
 * Load motif compression configuration
 */
function loadMotifConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
            return { ...DEFAULT_CONFIG, ...config };
        }
    } catch (error) {
        console.warn(`Warning: Could not load motif config: ${error.message}`);
    }
    return DEFAULT_CONFIG;
}

/**
 * Save motif compression configuration
 */
function saveMotifConfig(config) {
    try {
        const fullConfig = { ...DEFAULT_CONFIG, ...config };
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(fullConfig, null, 2));
        console.log(`✅ Motif configuration saved to: ${CONFIG_FILE}`);
        return true;
    } catch (error) {
        console.error(`❌ Could not save motif config: ${error.message}`);
        return false;
    }
}

/**
 * CLI interface for configuration
 */
function main() {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log('🎵 MotifCompressor Configuration');
        console.log('================================');
        console.log('');
        console.log('Current configuration:');
        const config = loadMotifConfig();
        console.log(JSON.stringify(config, null, 2));
        console.log('');
        console.log('Usage:');
        console.log('  node motif-config.js set exactMatchesOnly true|false');
        console.log('  node motif-config.js set conservativeMode true|false');
        console.log('  node motif-config.js set compressionThreshold <0.0-1.0>');
        console.log('  node motif-config.js reset');
        console.log('');
        console.log('Examples:');
        console.log('  node motif-config.js set exactMatchesOnly true    # Only exact matches');
        console.log('  node motif-config.js set exactMatchesOnly false   # Allow transformations');
        console.log('  node motif-config.js reset                        # Reset to defaults');
        return;
    }
    
    const command = args[0];
    
    if (command === 'reset') {
        if (saveMotifConfig(DEFAULT_CONFIG)) {
            console.log('🔄 Configuration reset to defaults');
        }
    } else if (command === 'set' && args.length >= 3) {
        const key = args[1];
        const value = args[2];
        
        const config = loadMotifConfig();
        
        // Parse the value
        let parsedValue;
        if (value === 'true') parsedValue = true;
        else if (value === 'false') parsedValue = false;
        else if (!isNaN(value)) parsedValue = parseFloat(value);
        else parsedValue = value;
        
        config[key] = parsedValue;
        
        if (saveMotifConfig(config)) {
            console.log(`✅ Set ${key} = ${parsedValue}`);
        }
    } else {
        console.log('❌ Invalid command. Use "node motif-config.js" for help.');
    }
}

if (require.main === module) {
    main();
}

module.exports = { loadMotifConfig, saveMotifConfig, DEFAULT_CONFIG };