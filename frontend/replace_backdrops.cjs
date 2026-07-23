const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');

function traverse(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            traverse(fullPath);
        } else if (fullPath.endsWith('.tsx')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            let modified = false;

            // Replace bg-black bg-opacity-50
            if (content.includes('bg-black bg-opacity-50')) {
                content = content.replace(/bg-black bg-opacity-50/g, 'bg-black/30 backdrop-blur-sm');
                modified = true;
            }

            // Replace bg-black/40, bg-black/50, bg-black/60
            // but ONLY if they are part of a modal backdrop (e.g. have fixed inset-0)
            const regex = /fixed\s+inset-0[^>]*bg-black\/(40|50|60)(\s+backdrop-blur-[-a-z]+)?/g;
            if (regex.test(content)) {
                content = content.replace(/fixed\s+inset-0([^>]*?)bg-black\/(40|50|60)(\s+backdrop-blur-[-a-z]+)?([^>]*)/g, (match, p1, p2, p3, p4) => {
                    return `fixed inset-0${p1}bg-black/30 backdrop-blur-sm${p4}`;
                });
                modified = true;
            }

            // Also replace z-index things if needed, but let's just do the bg-black
            
            if (modified) {
                fs.writeFileSync(fullPath, content, 'utf8');
                console.log(`Updated ${fullPath}`);
            }
        }
    }
}

traverse(srcDir);
