const fs = require('fs');
const path = 'apps/quipsly/src/lib/server/studio-writing-desk.ts';
let code = fs.readFileSync(path, 'utf8');

code = code.replace(/return \{\n\s*ok: true,\n\s*message: "Draft block saved.",/g, 'syncBlocksToQuipslyNote(document.id).catch(console.error);\n    return {\n      ok: true,\n      message: "Draft block saved.",');
code = code.replace(/return \{\n\s*ok: true,\n\s*message: "Draft block added.",/g, 'syncBlocksToQuipslyNote(document.id).catch(console.error);\n    return {\n      ok: true,\n      message: "Draft block added.",');
code = code.replace(/return \{\n\s*ok: true,\n\s*message: "Draft block order updated.",/g, 'syncBlocksToQuipslyNote(document.id).catch(console.error);\n    return {\n      ok: true,\n      message: "Draft block order updated.",');
code = code.replace(/return \{\n\s*ok: true,\n\s*message: "Draft block archived.",/g, 'syncBlocksToQuipslyNote(document.id).catch(console.error);\n    return {\n      ok: true,\n      message: "Draft block archived.",');

fs.writeFileSync(path, code);
