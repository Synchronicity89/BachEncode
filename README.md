# BachEncode

A Node.js tool for compressing and decompressing MIDI files using intelligent voice separation and JSON encoding.

## Features

- **MIDI Compression**: Convert MIDI files to compact JSON format
- **Voice Separation**: Automatically separates polyphonic music into individual voices
- **Lossless Conversion**: Preserves timing, pitch, velocity, and tempo information
- **Human-Readable Output**: JSON format allows for easy editing and inspection
- **Command-Line Interface**: Simple CLI for single file processing
- **Batch Processing**: Process entire directories of MIDI files at once
- **Flexible Directory Structure**: No hardcoded folder requirements

## Installation

1. Clone this repository:
```bash
git clone https://github.com/yourusername/bach-encode.git
cd bach-encode
```

2. Install dependencies:
```bash
npm install
```

## Usage

### Single File Processing

#### Compress MIDI to JSON
```bash
node EncodeDecode.js compress input.midi output.json
```

#### Decompress JSON to MIDI
```bash
node EncodeDecode.js decompress input.json output.midi
```

#### Using npm scripts
```bash
# Compress
npm run compress input.midi output.json

# Decompress
npm run decompress input.json output.midi
```

### Batch Processing

The `BatchProcess.js` utility allows you to process entire directories of files at once.

#### Batch Compress (MIDI → JSON)
```bash
# Compress all .MID files from source directory to destination directory
node BatchProcess.js compress /path/to/midi/files /path/to/output/directory

# Example: Compress files from 'midi' folder to 'compressed' folder
node BatchProcess.js compress midi compressed
```

#### Batch Decompress (JSON → MIDI)
```bash
# Decompress all .json files from source directory to destination directory
node BatchProcess.js decompress /path/to/json/files /path/to/output/directory

# Example: Decompress files from 'json_files' folder to 'restored_midi' folder
node BatchProcess.js decompress json_files restored_midi
```

#### Overwrite Protection
By default, BatchProcess will overwrite existing files. Use the `--no-overwrite` flag to skip existing files:

```bash
# Skip files that already exist in the output directory
node BatchProcess.js compress midi_files output --no-overwrite
node BatchProcess.js decompress json_files midi_output --no-overwrite
```

#### Batch Processing Features
- **Flexible Directories**: Use any folder names - no "midi" folder requirement
- **Progress Tracking**: See real-time progress and completion statistics
- **Error Handling**: Continue processing even if individual files fail
- **Overwrite Control**: Choose whether to overwrite existing files
- **Summary Reports**: Get detailed statistics when processing completes

For detailed batch processing documentation, see [BATCH_PROCESSING.md](BATCH_PROCESSING.md).

## How It Works

1. **MIDI Parsing**: Reads MIDI files and extracts note events, timing, and tempo information
2. **Voice Separation**: Groups notes into separate voices based on timing and pitch proximity
3. **Delta Encoding**: Stores timing as deltas between events to reduce file size
4. **JSON Output**: Creates a structured, editable JSON representation

## JSON Format

The compressed format includes:
```json
{
  "ppq": 480,
  "tempo": 120,
  "voices": [
    [
      {
        "delta": 0,
        "pitch": "C4",
        "dur": 480,
        "vel": 80
      }
    ]
  ]
}
```

- `ppq`: Pulses per quarter note (timing resolution)
- `tempo`: Beats per minute
- `voices`: Array of voice tracks
- `delta`: Time offset from previous event
- `pitch`: Note name (e.g., "C4", "F#5")
- `dur`: Note duration in ticks
- `vel`: MIDI velocity (0-127)

## Examples

### Single File Examples
See the `examples/` directory for sample MIDI files and their compressed JSON counterparts.

### Batch Processing Examples

```bash
# Process Bach inventions from midi folder
node BatchProcess.js compress midi output

# Restore all compressed files with overwrite protection
node BatchProcess.js decompress compressed_files restored_midi --no-overwrite

# Process files from any directory structure
node BatchProcess.js compress /Users/musician/compositions /Users/musician/compressed
```

Example output:
```
🎵 Starting batch compression...
📁 Source: test_input (2 files found)
📁 Destination: test_output

Processing BWV772.MID... ✅ Success
Processing BWV773.MID... ✅ Success

=== COMPRESSION SUMMARY ===
Total files found: 2
Successful: 2
Failed: 0
Skipped: 0
```

## Development

### Running Tests
```bash
npm test
```

### Linting
```bash
npm run lint
```

### Formatting
```bash
npm run format
```

## Dependencies

- **midi-parser-js**: MIDI file parsing
- **midi-writer-js**: MIDI file generation
- **@tonaljs/tonal**: Music theory utilities for note conversion

## License

MIT License - see LICENSE file for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## Files

- **`EncodeDecode.js`**: Core compression/decompression engine for single files
- **`BatchProcess.js`**: Batch processing utility for directories
- **`motif-analysis.js`**: Motif detection and analysis tools
- **`reverse-motifs.js`**: Motif inversion and transformation utilities
- **`BATCH_PROCESSING.md`**: Detailed batch processing documentation
- **`MOTIF_TESTING.md`**: Motif analysis feature documentation

## Roadmap

- [ ] Support for multiple tracks
- [ ] Chord detection and encoding
- [ ] Time signature preservation
- [ ] Key signature analysis
- [ ] Advanced voice separation algorithms
- [ ] Web interface for batch processing
- [ ] Real-time MIDI compression streaming