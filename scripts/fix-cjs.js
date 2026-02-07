import { writeFileSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cjsDir = join(__dirname, '..', 'dist', 'cjs');

// Add package.json to mark as CommonJS
writeFileSync(join(cjsDir, 'package.json'), JSON.stringify({ type: 'commonjs' }, null, 2));

// Fix .js imports in CJS files (remove .js extension for CommonJS resolution)
function fixImports(dir) {
  const files = readdirSync(dir);
  for (const file of files) {
    const fullPath = join(dir, file);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      fixImports(fullPath);
    } else if (file.endsWith('.js')) {
      let content = readFileSync(fullPath, 'utf8');
      // Replace require("./xxx.js") with require("./xxx")
      content = content.replace(/require\("(\.\.?\/[^"]+)\.js"\)/g, 'require("$1")');
      writeFileSync(fullPath, content);
    }
  }
}

fixImports(cjsDir);
console.log('CJS build fixed successfully');
