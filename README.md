# BachEncode

A Node.js tool for compressing and decompressing MIDI files using intelligent voice separation and JSON encoding.

## Features

- **MIDI Compression**: Convert MIDI files to compact JSON format
- **Voice Separation**: Automatically separates polyphonic music into individual voices
- **Lossless Conversion**: Preserves timing, pitch, velocity, and tempo information
- **Human-Readable Output**: JSON format allows for easy editing and inspection
- **Command-Line Interface**: Simple CLI for batch processing

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

### Compress MIDI to JSON
```bash
node EncodeDecode.js compress input.midi output.json
```

### Decompress JSON to MIDI
```bash
node EncodeDecode.js decompress input.json output.midi
```

### Using npm scripts
```bash
# Compress
npm run compress input.midi output.json

# Decompress
npm run decompress input.json output.midi
```

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

See the `examples/` directory for sample MIDI files and their compressed JSON counterparts.

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

## Roadmap

- [ ] Support for multiple tracks
- [ ] Chord detection and encoding
- [ ] Time signature preservation
- [ ] Key signature analysis
- [ ] Advanced voice separation algorithms