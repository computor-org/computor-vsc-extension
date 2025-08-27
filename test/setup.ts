/**
 * Test setup file to configure the test environment for VS Code extension tests
 * This file is loaded before all tests to set up mocks and global configurations
 */

const Module = require('module');
const path = require('path');

// Get the original require function
const originalRequire = Module.prototype.require;

// Override the require function to provide vscode mock
Module.prototype.require = function(id: string) {
    if (id === 'vscode') {
        // Return our mock vscode module
        return originalRequire.call(this, path.join(__dirname, './mocks/vscode.js'));
    }
    // For all other modules, use the original require
    return originalRequire.apply(this, arguments as any);
};