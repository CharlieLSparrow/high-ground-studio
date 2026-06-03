const fs = require('fs');
const path = require('path');

function processDirectory(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (!fullPath.includes('node_modules') && !fullPath.includes('.next')) {
        processDirectory(fullPath);
      }
    } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      
      // Update absolute imports
      // e.g. @/app/settings -> @/app/(app)/settings
      const directoriesMoved = [
        'settings', 'marketing', 'manuscript', 'content-studio', 
        'storyboards', 'storyboard', 'publishing', 'create'
      ];
      
      let changed = false;
      for (const d of directoriesMoved) {
        const regex = new RegExp(`@/app/${d}`, 'g');
        if (regex.test(content)) {
          content = content.replace(regex, `@/app/(app)/${d}`);
          changed = true;
        }
      }
      
      if (changed) {
        fs.writeFileSync(fullPath, content);
        console.log('Fixed absolute imports in:', fullPath);
      }
    }
  }
}

processDirectory(path.join(process.cwd(), 'apps', 'quipsly', 'src'));
