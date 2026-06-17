const fs = require('fs');
const path = 'apps/quipsly/src/lib/server/studio-writing-desk.ts';
let code = fs.readFileSync(path, 'utf8');

if (!code.includes('syncBlocksToQuipslyNote')) {
  code = 'import { syncBlocksToQuipslyNote } from "@/lib/server/bi-directional-sync";\n' + code;
}

code = code.replace(/return \{\n\s*ok: true,\n\s*blocks/g, 'syncBlocksToQuipslyNote(input.documentId).catch(console.error);\n    return {\n      ok: true,\n      blocks');

fs.writeFileSync(path, code);
