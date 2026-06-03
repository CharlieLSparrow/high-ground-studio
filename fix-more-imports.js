const fs = require('fs');

function replaceFile(path, search, replace) {
  let content = fs.readFileSync(path, 'utf8');
  if (content.includes(search)) {
    fs.writeFileSync(path, content.replace(search, replace));
    console.log(`Fixed ${path}`);
  }
}

replaceFile('apps/quipsly/src/app/(app)/asset-manager/page.tsx', '../../lib/comfy/comfyClient', '@/lib/comfy/comfyClient');
replaceFile('apps/quipsly/src/app/(app)/layout.tsx', './components/SidebarLayout', '@/components/SidebarLayout');
replaceFile('apps/quipsly/src/app/(app)/manuscript/live/[slug]/studio-manuscript-live-reader.tsx', '@/app/studio-ui', '@/app/(app)/studio-ui');
replaceFile('apps/quipsly/src/app/(app)/render-queue/actions.ts', '../../remotion/render', '../../../remotion/render');
replaceFile('apps/quipsly/src/app/(app)/romance-lab/manuscript/manuscript-client.tsx', '../../../components/Editor', '@/components/Editor');
replaceFile('apps/quipsly/src/app/(app)/storyboard/storyboard-desk-client.tsx', '../../components/Editor', '@/components/Editor');
replaceFile('apps/quipsly/src/app/(app)/studio-workbench-client.tsx', '../components/Editor', '@/components/Editor');
replaceFile('apps/quipsly/src/components/Editor.tsx', '../app/studio-ui', '@/app/(app)/studio-ui');
replaceFile('apps/quipsly/src/components/SidebarLayout.tsx', '../app/studio-ui', '@/app/(app)/studio-ui');

