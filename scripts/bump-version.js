#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Get today's date in CalVer format
const today = new Date();
const year = today.getFullYear();
const month = String(today.getMonth() + 1).padStart(2, '0');
const day = String(today.getDate()).padStart(2, '0');
const baseVersion = `${year}.${month}.${day}`;

// Get latest tag for today
try {
    const tags = execSync(`git tag -l "v${baseVersion}*"`, { encoding: 'utf8' })
        .trim()
        .split('\n')
        .filter(Boolean);
    
    let newVersion;
    if (tags.length === 0) {
        // First release of the day
        newVersion = baseVersion;
    } else {
        // Find highest build number
        const buildNumbers = tags.map(tag => {
            const match = tag.match(/v\d{4}\.\d{2}\.\d{2}(?:\.(\d+))?/);
            return match && match[1] ? parseInt(match[1]) : 0;
        });
        const maxBuild = Math.max(...buildNumbers);
        newVersion = `${baseVersion}.${maxBuild + 1}`;
    }
    
    // Update package.json
    const packagePath = path.join(__dirname, '..', 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    const oldVersion = packageJson.version;
    packageJson.version = newVersion;
    fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + '\n');
    
    // Update package-lock.json
    const lockPath = path.join(__dirname, '..', 'package-lock.json');
    if (fs.existsSync(lockPath)) {
        const lockJson = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
        lockJson.version = newVersion;
        if (lockJson.packages && lockJson.packages['']) {
            lockJson.packages[''].version = newVersion;
        }
        fs.writeFileSync(lockPath, JSON.stringify(lockJson, null, 2) + '\n');
    }
    
    // Git operations
    console.log(`Bumping version from ${oldVersion} to ${newVersion}`);
    execSync('git add package.json package-lock.json', { stdio: 'inherit' });
    execSync(`git commit -m "chore: bump version to ${newVersion}"`, { stdio: 'inherit' });
    execSync(`git tag v${newVersion}`, { stdio: 'inherit' });
    
    console.log(`\nVersion bumped to ${newVersion}`);
    console.log(`Tag created: v${newVersion}`);
    console.log('\nTo trigger release, run:');
    console.log('  git push origin main --follow-tags');
    
} catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
}