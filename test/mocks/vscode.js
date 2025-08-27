/**
 * Mock implementation of vscode module for unit tests
 * This provides the minimum VS Code API surface needed for unit testing
 */

// Event emitter implementation
class EventEmitter {
    constructor() {
        this.listeners = [];
    }

    get event() {
        return (listener) => {
            this.listeners.push(listener);
            return {
                dispose: () => {
                    const index = this.listeners.indexOf(listener);
                    if (index !== -1) {
                        this.listeners.splice(index, 1);
                    }
                }
            };
        };
    }

    fire(data) {
        this.listeners.forEach(listener => listener(data));
    }

    dispose() {
        this.listeners = [];
    }
}

// Export all the mock implementations using CommonJS
module.exports = {
    EventEmitter
};