const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '../node_modules/monaco-editor/min/vs');
const dest = path.join(__dirname, '../public/monaco-editor/vs');

console.log(`[Copy Monaco] Source: ${src}`);
console.log(`[Copy Monaco] Destination: ${dest}`);

try {
    if (!fs.existsSync(src)) {
        console.error('[Copy Monaco] Error: Source directory does not exist. Make sure monaco-editor is installed.');
        process.exit(1);
    }

    // Create destination directory if it doesn't exist
    fs.mkdirSync(dest, { recursive: true });

    // Use cpSync (Node.js v16.7.0+)
    fs.cpSync(src, dest, { recursive: true, force: true });
    console.log('[Copy Monaco] Success: Monaco assets copied to public folder.');
} catch (err) {
    console.error('[Copy Monaco] Failed to copy Monaco assets:', err);
    process.exit(1);
}
