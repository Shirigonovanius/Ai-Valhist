const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'GIF');
const destDir = path.join(__dirname, 'public', 'animation');

if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
}

fs.readdir(srcDir, (err, files) => {
    if (err) {
        console.error("Could not list the directory.", err);
        process.exit(1);
    }

    const frameFiles = files.filter(file => file.startsWith('ezgif-frame-') && file.endsWith('.jpg'));

    // Sort logically to ensure 001, 002, ... 010 order
    frameFiles.sort();

    console.log(`Found ${frameFiles.length} frames.`);

    frameFiles.forEach((file, index) => {
        const srcPath = path.join(srcDir, file);
        // Rename to frame_0.jpg, frame_1.jpg, etc. for easy indexing
        const destPath = path.join(destDir, `frame_${index}.jpg`);

        fs.copyFileSync(srcPath, destPath);
        console.log(`Copied ${file} -> frame_${index}.jpg`);
    });

    console.log("Done.");
});
