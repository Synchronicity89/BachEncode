# Debug Scripts

This folder contains debug scripts used during development and testing of the BachEncode motif compression system.

## Scripts Overview

- **debug-failing-test.js** - Debug script for investigating failing test cases
- **debug-min-length.js** - Test script for minimum motif length requirements
- **debug-min-matches.js** - Test script for minimum match requirements  
- **debug-motif-detection.js** - Debug the motif detection algorithm step by step
- **debug-motif-roundtrip.js** - Test compression/decompression round-trip integrity
- **debug-motif.js** - General motif investigation script
- **debug-motif2.js** - Test extractMotifAtPosition functionality

## Usage

Run any debug script from the project root directory:

```bash
node DebugScripts/debug-script-name.js
```

## Adding New Debug Scripts

When adding new debug scripts:

1. Place them in this `DebugScripts` folder
2. Use relative imports to reference modules in the parent directory:
   ```javascript
   const MotifCompressor = require('../MotifCompressor');
   const KeyAnalyzer = require('../KeyAnalyzer');
   const MotifDetector = require('../MotifDetector');
   ```
3. Name them with the `debug-` prefix for consistency
4. Update this README if adding scripts with new functionality

## Notes

These scripts are for development and debugging purposes only. They are not part of the main application or test suite.