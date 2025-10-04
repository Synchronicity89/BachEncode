const { execSync } = require('child_process');
const fs = require('fs');

// Function to test a specific commit version
function testCommitVersion(commitHash, commitMessage) {
    console.log(`\n🔍 TESTING COMMIT: ${commitHash}`);
    console.log(`📝 Message: ${commitMessage}`);
    console.log('=' .repeat(80));
    
    try {
        // Checkout the specific version of EncodeDecode.js
        console.log(`📥 Checking out EncodeDecode.js from commit ${commitHash}...`);
        execSync(`git checkout ${commitHash} -- EncodeDecode.js`, { stdio: 'inherit' });
        
        // Run our octave bug detective test
        console.log('🧪 Running octave bug detection tests...');
        const testOutput = execSync('node octave-bug-detective.js', { encoding: 'utf8', stdio: 'pipe' });
        
        // Parse the test output to see if bugs were found
        const hasPitchMismatch = testOutput.includes('🚨 PITCH MISMATCH DETECTED');
        const hasMotifIssues = testOutput.includes('🔍 MOTIF DETECTED - this might be where the bug occurs');
        
        console.log(`\n📊 RESULTS FOR COMMIT ${commitHash}:`);
        if (hasPitchMismatch) {
            console.log('❌ PITCH MISMATCHES FOUND - Bug is present in this version');
        } else {
            console.log('✅ NO PITCH MISMATCHES - This version might be good!');
        }
        
        if (hasMotifIssues) {
            console.log('⚠️  Motif processing detected (expected)');
        }
        
        // Save test results to a file for review
        const resultsFile = `test-results-${commitHash}.txt`;
        fs.writeFileSync(resultsFile, testOutput);
        console.log(`💾 Full test output saved to: ${resultsFile}`);
        
        return !hasPitchMismatch; // Return true if no bugs found
        
    } catch (error) {
        console.error(`❌ ERROR testing commit ${commitHash}: ${error.message}`);
        return false;
    }
}

// List of commits to test (most recent first)
const commitsToTest = [
    { hash: '64a30b2', message: 'Implement detailed motif debugging and octave fix verification' },
    { hash: 'c8a0f17', message: 'Enhance motif detection by making minLength and minOccurrences configurable' },
    { hash: '305fee0', message: 'Enhance MIDI Compression System with Batch Processing and Motif Transformations' },
    { hash: 'e4838fe', message: 'Ensure output directories exist before writing MIDI and JSON files' },
    { hash: '50544ae', message: 'Add key signature detection' },
    { hash: 'b1449c5', message: 'Implement key detection and diatonic pitch conversion in MIDI processing' },
    { hash: '18ca0b6', message: 'Add quantization to note timings and implement motif processing in MIDI encoding' },
    { hash: '1f06cc5', message: 'first commit' }
];

console.log('🕵️  OCTAVE BUG BISECTION ANALYSIS');
console.log('=====================================');
console.log('Testing different versions of EncodeDecode.js to find when the octave bug was introduced...\n');

let firstGoodCommit = null;
let firstBadCommit = null;

// Test each commit
for (const commit of commitsToTest) {
    const isGood = testCommitVersion(commit.hash, commit.message);
    
    if (isGood && !firstGoodCommit) {
        firstGoodCommit = commit;
        console.log(`\n🎉 FOUND FIRST GOOD COMMIT: ${commit.hash}`);
        console.log(`    Message: ${commit.message}`);
    } else if (!isGood && !firstBadCommit) {
        firstBadCommit = commit;
        console.log(`\n💥 FOUND FIRST BAD COMMIT: ${commit.hash}`);
        console.log(`    Message: ${commit.message}`);
        
        // Continue testing to see the pattern across all commits
        // break;
    }
    
    // Add a separator between tests
    console.log('\n' + '~'.repeat(80));
}

// Final summary
console.log('\n🏁 BISECTION SUMMARY');
console.log('===================');

if (firstGoodCommit && firstBadCommit) {
    console.log(`✅ Last good commit: ${firstGoodCommit.hash} - ${firstGoodCommit.message}`);
    console.log(`❌ First bad commit: ${firstBadCommit.hash} - ${firstBadCommit.message}`);
    console.log('\n🔍 NEXT STEPS:');
    console.log(`1. Compare the changes between ${firstGoodCommit.hash} and ${firstBadCommit.hash}`);
    console.log(`   Command: git diff ${firstGoodCommit.hash} ${firstBadCommit.hash} -- EncodeDecode.js`);
    console.log('2. Focus on the differences to identify the exact bug');
} else if (!firstBadCommit) {
    console.log('😮 Interesting! No bad commits found - the bug might be in the test setup or very recent');
} else if (!firstGoodCommit) {
    console.log('😱 All commits have the bug! The issue might have been present from the beginning');
}

// Restore the current version
console.log('\n🔄 Restoring current version of EncodeDecode.js...');
try {
    execSync('git checkout HEAD -- EncodeDecode.js', { stdio: 'inherit' });
    console.log('✅ Current version restored');
} catch (error) {
    console.error('❌ Error restoring current version:', error.message);
}