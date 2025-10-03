# BatchProcess.js - Bulk MIDI Compression/Decompression Utility

A Node.js utility for batch processing MIDI files with the BachEncode compression system. This tool allows you to compress or decompress all MIDI or JSON files in a directory with a single command.

## Features

- **Batch Compression**: Convert all `*.MID` and `*.MIDI` files to compressed JSON format
- **Batch Decompression**: Convert all `*.json` files back to MIDI format  
- **Smart File Detection**: Case-insensitive file extension matching
- **Collision Protection**: Automatically skips files that would overwrite existing files
- **Progress Tracking**: Real-time progress display with success/failure counts
- **Detailed Logging**: Clear status messages and comprehensive summaries
- **Flexible Output**: Specify custom input/output directories

## Usage

### Basic Syntax
```bash
node BatchProcess.js compress [outputDir]
node BatchProcess.js decompress [inputDir]
```

### Compression Examples
```bash
# Compress all MIDI files in midi/ folder to JSON (output to midi/ folder)
node BatchProcess.js compress

# Compress all MIDI files in midi/ folder to a specific output directory
node BatchProcess.js compress compressed_output

# Compress to a different directory structure
node BatchProcess.js compress "../backup/compressed"
```

### Decompression Examples
```bash
# Decompress all JSON files in midi/ folder back to MIDI
node BatchProcess.js decompress

# Decompress JSON files from a specific directory
node BatchProcess.js decompress compressed_output

# Decompress from a custom location
node BatchProcess.js decompress "../backup/compressed"
```

## Command Reference

### `compress [outputDir]`
- **Input**: All `*.MID` and `*.MIDI` files in the `midi/` folder
- **Output**: Compressed JSON files with `.json` extension
- **Default Output**: `midi/` folder (same as input)
- **Custom Output**: Specified `outputDir` parameter

### `decompress [inputDir]`
- **Input**: All `*.json` files in the specified `inputDir` (defaults to `midi/`)
- **Output**: Decompressed MIDI files with `.mid` extension
- **Default Input**: `midi/` folder
- **Default Output**: `midi/` folder

## File Processing Rules

### Compression Process
1. Scans `midi/` folder for files with extensions: `.mid`, `.midi` (case-insensitive)
2. For each MIDI file `example.mid`, creates `example.json`
3. Skips files where the output JSON already exists
4. Uses the BachEncode compression algorithm with motif detection

### Decompression Process  
1. Scans specified directory for `.json` files
2. For each JSON file `example.json`, creates `example.mid`
3. Skips files where the output MIDI already exists
4. Reconstructs MIDI using motif expansion and note generation

## Output Format

### Progress Display
```
=== BATCH COMPRESSION ===
Input directory: C:\path\to\midi
Output directory: C:\path\to\output

Found 31 MIDI files:
  1. 01AusmeinesHerz.mid
  2. BWV772.MID
  ...

[1/31] Processing: 01AusmeinesHerz.mid
  ✅ Successfully compressed to: 01AusmeinesHerz.json

[2/31] Processing: BWV772.MID
  ⚠️  Output file already exists: BWV772.json
  ⏭️  Skipping...
```

### Summary Report
```
=== COMPRESSION SUMMARY ===
Total files processed: 31
Successful: 30
Failed: 1
Skipped: 0
```

## Error Handling

The utility provides comprehensive error handling:

- **Missing Directories**: Automatically creates output directories
- **File Conflicts**: Skips existing files to prevent overwrites
- **Processing Errors**: Continues processing remaining files after individual failures
- **Invalid Commands**: Clear usage instructions for incorrect syntax

## Integration with EncodeDecode.js

BatchProcess.js uses the core compression functions from `EncodeDecode.js`:
- `compressMidiToJson()` - Individual MIDI to JSON compression
- `decompressJsonToMidi()` - Individual JSON to MIDI decompression

All compression features are available:
- ✅ Motif detection and reuse
- ✅ Diatonic music theory encoding  
- ✅ Voice separation
- ✅ Motif inversion support (new `inverted` field)
- ✅ Tempo and timing preservation

## Example Workflows

### Complete Backup Workflow
```bash
# 1. Compress all MIDI files for archival
node BatchProcess.js compress backup/compressed

# 2. Later, restore from backup
node BatchProcess.js decompress backup/compressed
```

### Processing Pipeline
```bash
# 1. Start with original MIDI files in midi/
ls midi/*.mid

# 2. Create compressed versions  
node BatchProcess.js compress processed

# 3. Verify compression worked
ls processed/*.json

# 4. Test decompression to verify integrity
node BatchProcess.js decompress processed
```

## Performance Notes

- **Large Files**: Processing time scales with MIDI complexity and length
- **Motif Detection**: More complex pieces may take longer due to pattern analysis
- **Disk Space**: JSON files are typically smaller than MIDI files due to compression
- **Memory Usage**: Each file is processed independently (no memory accumulation)

## Supported File Extensions

### Input (Compression)
- `.mid` (standard MIDI)
- `.midi` (alternative MIDI extension)  
- `.MID` (uppercase variants)
- `.MIDI` (uppercase variants)

### Input (Decompression)
- `.json` (BachEncode compressed format)

### Output
- `.json` (compression output)
- `.mid` (decompression output)

## Dependencies

- Node.js runtime
- `EncodeDecode.js` module (must be in same directory)
- All dependencies of the main BachEncode system:
  - `midi-parser-js`
  - `midi-writer-js`  
  - `fs`, `path` (Node.js built-ins)

## Troubleshooting

### Common Issues

**Error: "midi folder does not exist"**
- Ensure the `midi/` directory exists in the project root
- Check file permissions for directory access

**Error: "Unknown command"**  
- Use either `compress` or `decompress` as the first argument
- Check command syntax: `node BatchProcess.js <command> [directory]`

**Files being skipped**
- Output files already exist (prevents overwriting)
- Delete existing files if you want to reprocess them
- Use a different output directory to avoid conflicts

**Processing failures**
- Check individual MIDI file integrity
- Verify sufficient disk space for output files
- Review error messages for specific file issues

## Technical Details

### File Discovery Algorithm
1. Read directory contents using `fs.readdirSync()`
2. Filter files by extension using `path.extname()`
3. Case-insensitive matching for cross-platform compatibility

### Processing Flow
1. **Pre-flight**: Validate directories and count eligible files
2. **Processing**: Sequential file processing with error isolation
3. **Post-flight**: Summary statistics and completion status

### Safety Features
- **Non-destructive**: Never overwrites existing files
- **Atomic Processing**: Each file processed independently  
- **Error Isolation**: Single file failures don't stop batch processing
- **Progress Visibility**: Real-time status updates

---

*Part of the BachEncode MIDI compression system. Supports all features including the new motif inversion functionality.*