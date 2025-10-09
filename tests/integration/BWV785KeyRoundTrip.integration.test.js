const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

describe('BWV785 Key Roundtrip Stability', () => {
  const projectRoot = path.resolve(__dirname, '..', '..');
  const midiPath = path.join(projectRoot, 'midi', 'bach_BWV785_TwoTracks.mid');
  const outDir = path.join(projectRoot, 'output');
  const firstJson = path.join(outDir, 'BWV785_key_round_1.json');
  const midRound = path.join(outDir, 'BWV785_key_round.mid');
  const secondJson = path.join(outDir, 'BWV785_key_round_2.json');

  function run(cmd) { return execSync(cmd, { cwd: projectRoot, stdio: 'pipe' }).toString(); }

  beforeAll(() => {
    if (!fs.existsSync(midiPath)) throw new Error('Missing test asset: ' + midiPath);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    run(`node EncodeDecode.js compress "${midiPath}" "${firstJson}" --preserve-tracks`);
    run(`node EncodeDecode.js decompress "${firstJson}" "${midRound}"`);
    run(`node EncodeDecode.js compress "${midRound}" "${secondJson}" --preserve-tracks`);
  });

  function readKey(jsonPath) {
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    return data.key;
  }

  test('tonic does not drift after one roundtrip', () => {
    const k1 = readKey(firstJson);
    const k2 = readKey(secondJson);
    expect(k1.tonic).toBeDefined();
    expect(k2.tonic).toBeDefined();
    // Should be identical with override mechanism in place
    expect(k2.tonic).toBe(k1.tonic);
    expect(k2.mode).toBe(k1.mode);
  });

  afterAll(() => {
    console.log('\nKey roundtrip artifacts:');
    console.log(' First JSON:  ' + firstJson);
    console.log(' MIDI:        ' + midRound);
    console.log(' Second JSON: ' + secondJson);
  });
});
