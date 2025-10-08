# Reimplementation Plan (Post-Baseline)

Date: 2025-10-07

## Current Baseline State
- File `EncodeDecode.js` reverted to snapshot baseline (simple single-track decompression, heuristic voice separation, quantization on import, motif detection naive ordering).
- Baseline motifless roundtrip test produces 200 reported diffs (cap) including voice count mismatch and widespread pitch/delta/dur divergences.
- Previous experimental multi-track + layering export (now backed up in `EncodeDecode-layering-experiment-BACKUP.js`) demonstrated elimination of pitch diffs except a single duration truncation (first sustained note). That experiment became corrupted when layering logic leaked into `findBestKey`.

## Target Outcome
Zero-loss motifless roundtrip: JSON original == JSON recompressed (voices, ordering, deltas, durations, pitches, velocities) for BWV785 fixed decomposition file.

## Strategy Steps
1. Reinstate multi-track export (one MIDI track per logical voice) without layering to remove pitch drift introduced by heuristic separation on re-import.
   - Implementation: During decompression build one `MidiWriter.Track` per encoded voice, preserving absolute timing from sequential delta reconstruction.
   - Ensure tempo event only on first track.
   - Track naming: `Voice <v>`.
2. Add pure motifless export option (already existed but rework may be needed) ensuring internal representation of expanded voices is accessible for track splitting.
3. Validate roundtrip: expect pitch diffs collapse dramatically (historically to zero) but duration truncation of overlapping sustains may persist (notably first note 215→141 style in prior stage; values will reflect quantization differences with ppq=128 baseline).
4. Introduce overlap layering per voice:
   - Build absolute event list per logical voice.
   - Greedy layer assignment: place note in first layer whose lastEnd <= start else create new layer.
   - Track naming: `Voice <v> Layer <ℓ>`.
   - Keep per-layer absolute start ticks (via startTick property) when adding NoteEvents.
5. Import-side merging logic (on compression path):
   - Parse track names; group by primary voice index.
   - Collect all note-on/off events; reconstruct absolute note list including overlapping spans.
   - Derive regular voice with possibly negative deltas (if any start before previous note end) OR introduce parallel layering only for export while storing original absolute starts in a metadata array `_absStarts` not persisted.
   - For compression encode: sort by absolute start then pitch, compute delta = max(0, start - prevEnd); if start < prevEnd (true overlap), handle by either splitting voice earlier (preferred minimal layering) or allow negative delta extension by inserting a rest-carry mechanism (TBD). Prior success used layering instead of negative deltas; we'll mirror that.
6. Roundtrip Checkpoint A: with layering export & import merging ensure first sustain duration preserved.
7. Roundtrip Checkpoint B: iterate until zero diffs (verify pitch, delta, dur equality). If remaining diffs caused by quantization from baseline snapshot, consider removing quantization during extraction or applying consistent quantization both directions.
8. Add robust pitch analysis & first-note duration assertion test to guard against regression.

## Open Questions / Decisions
- Quantization: Baseline code forces quantization to 120 ticks; improved version previously disabled it. Likely must disable quantization to match original micro-timings exactly.
- PPQ fidelity: MidiWriter defaults (internally 128) vs original PPQ (e.g., 480). For pure equality of JSON timing, need consistent PPQ and no rounding; may require custom SMF writer or library supporting original PPQ.
- Negative deltas acceptance: current encoding forbids overlaps (implies sequential); layering sidesteps this—prefer layering approach rather than complicating delta semantics.

## Minimal Incremental Commits Plan
A. Multi-track export restore (no layering).  
B. Disable quantization in extraction for fidelity.  
C. Layering export addition.  
D. Import merging of layering tracks.  
E. Zero-loss verification & safeguard tests.

## Risks
- Track naming collisions if original MIDI already uses similar names. Mitigation: prefix with a reserved token (e.g., `__VE` for voice export) or detect existing names.
- Library limitations for PPQ could still distort durations; may require fallback encoder.
- Motif detection altering ordering: ensure motifless flag path bypasses motif detection during degradation test runs.

## Immediate Next Coding Task
Implement Step A (multi-track export restore) + Step B (remove quantization) then run roundtrip to measure diff reduction baseline before layering.

