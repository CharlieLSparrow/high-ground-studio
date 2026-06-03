const { AutoCropper } = require('./src/AutoCropper');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

async function run() {
  console.log('Starting vertical slice test...');
  
  // Create a 16:9 test video
  const testFile = path.join(__dirname, 'test_16_9.mp4');
  console.log(`Generating test 16:9 video: ${testFile}`);
  try {
     execSync(`ffmpeg -y -f lavfi -i testsrc=duration=2:size=1920x1080:rate=30 -c:v libx264 -preset fast -crf 23 "${testFile}"`, { stdio: 'ignore' });
  } catch (e) {
     console.error('Failed to generate test video', e.message);
     return;
  }
  
  const cropper = new AutoCropper();
  
  try {
    const outPath = await cropper.sliceToVertical(testFile, (prog) => {
      console.log(`CROP PROGRESS: ${prog}%`);
    });
    
    console.log(`✅ Success! Vertical video saved to: ${outPath}`);
    
    // Verify the output dimensions
    const probe = execSync(`ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "${outPath}"`).toString().trim();
    console.log(`Output Dimensions: ${probe}`);
    if (probe === '1080x1080' || probe === '607x1080') {
      console.log('✅ Cropped successfully!');
    }
    
  } catch (err) {
    console.error('❌ Failed:', err);
  }
}

run();
