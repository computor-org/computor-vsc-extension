/**
 * Settings Management UI
 * This file provides UI for managing extension settings
 */

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('settings-container');
  if (!container) return;

  // Check if components are loaded
  if (!window.UIComponents) {
    console.error('UIComponents not found! Components.js may not have loaded properly.');
    container.innerHTML = '<p style="color: red;">Error: Components not loaded. Check console for details.</p>';
    return;
  }

  const {
    createButton,
    createInput,
    createSelect,
    createCard,
    createCardActions,
    createProgress
  } = window.UIComponents;

  // Current settings state
  let currentSettings = null;
  let loading = false;

  // Create UI elements
  function createSettingsUI() {
    // Main Settings Card
    const settingsCard = createCard({
      title: 'Extension Settings',
      subtitle: 'Configure authentication and connection settings',
      variant: 'bordered'
    });

    const form = document.createElement('form');
    form.style.display = 'flex';
    form.style.flexDirection = 'column';
    form.style.gap = '20px';

    // Base URL input
    const baseUrlInput = createInput({
      placeholder: 'API Base URL',
      icon: '🌐',
      value: 'http://localhost:8000'
    });

    // Auth Provider select
    const authProviderSelect = createSelect({
      placeholder: 'Select authentication provider...',
      value: 'token',
      options: [
        { value: 'token', label: 'API Token' },
        { value: 'oauth', label: 'OAuth' },
        { value: 'basic', label: 'Basic Auth' }
      ],
      onChange: (value) => {
        vscode.postMessage({ 
          type: 'settingChanged', 
          payload: { field: 'authProvider', value }
        });
      }
    });

    // Token settings section
    const tokenSection = document.createElement('div');
    tokenSection.style.border = '1px solid var(--vscode-widget-border)';
    tokenSection.style.padding = '16px';
    tokenSection.style.borderRadius = '4px';
    
    const tokenTitle = document.createElement('h4');
    tokenTitle.textContent = 'Token Settings';
    tokenTitle.style.marginTop = '0';
    tokenSection.appendChild(tokenTitle);

    const headerNameInput = createInput({
      placeholder: 'Header Name',
      icon: '🔑',
      value: 'X-API-Key'
    });

    const headerPrefixInput = createInput({
      placeholder: 'Header Prefix (optional)',
      icon: '🏷️',
      value: ''
    });

    const tokenGrid = document.createElement('div');
    tokenGrid.style.display = 'grid';
    tokenGrid.style.gridTemplateColumns = '1fr 1fr';
    tokenGrid.style.gap = '12px';
    tokenGrid.appendChild(headerNameInput.render());
    tokenGrid.appendChild(headerPrefixInput.render());
    tokenSection.appendChild(tokenGrid);

    // API Token input (secure)
    const apiTokenInput = createInput({
      type: 'password',
      placeholder: 'API Token (stored securely)',
      icon: '🔐'
    });

    // Add all elements to form
    form.appendChild(baseUrlInput.render());
    form.appendChild(authProviderSelect.render());
    form.appendChild(tokenSection);
    form.appendChild(apiTokenInput.render());

    // Action buttons
    const actions = createCardActions('right');
    
    const loadBtn = createButton({ 
      text: 'Load Settings', 
      variant: 'secondary',
      icon: '📥'
    });
    
    const saveBtn = createButton({ 
      text: 'Save Settings', 
      variant: 'primary',
      icon: '💾'
    });
    
    const resetBtn = createButton({ 
      text: 'Reset', 
      variant: 'tertiary',
      icon: '🔄'
    });

    // Button handlers
    loadBtn.on('click', () => {
      loadBtn.setLoading(true);
      loadBtn.setText('Loading...');
      vscode.postMessage({ type: 'loadSettings' });
    });

    saveBtn.on('click', () => {
      if (loading) return;
      
      const settings = {
        authentication: {
          baseUrl: baseUrlInput.getValue(),
          defaultProvider: authProviderSelect.getValue(),
          tokenSettings: {
            headerName: headerNameInput.getValue(),
            headerPrefix: headerPrefixInput.getValue()
          }
        },
        apiToken: apiTokenInput.getValue() // This will be stored securely
      };

      saveBtn.setLoading(true);
      saveBtn.setText('Saving...');
      vscode.postMessage({ type: 'saveSettings', payload: settings });
    });

    resetBtn.on('click', () => {
      if (currentSettings) {
        updateUIWithSettings(currentSettings);
        vscode.postMessage({ type: 'info', payload: { message: 'Settings reset to last saved values' } });
      } else {
        // Reset to defaults
        baseUrlInput.setValue('http://localhost:8000');
        authProviderSelect.setValue('token');
        headerNameInput.setValue('X-API-Key');
        headerPrefixInput.setValue('');
        apiTokenInput.clear();
        vscode.postMessage({ type: 'info', payload: { message: 'Settings reset to defaults' } });
      }
    });

    actions.addButton(loadBtn.render());
    actions.addButton(resetBtn.render());
    actions.addButton(saveBtn.render());

    settingsCard.setContent(form);
    settingsCard.setFooter(actions.render());

    container.appendChild(settingsCard.render());

    // Status card
    const statusCard = createCard({
      title: 'Settings Status',
      variant: 'bordered'
    });

    const statusContent = document.createElement('div');
    statusContent.id = 'status-content';
    statusContent.innerHTML = '<p>Click "Load Settings" to view current configuration.</p>';
    
    statusCard.setContent(statusContent);
    container.appendChild(statusCard.render());

    // Store references for updates
    window.settingsUI = {
      baseUrlInput,
      authProviderSelect,
      headerNameInput,
      headerPrefixInput,
      apiTokenInput,
      loadBtn,
      saveBtn,
      resetBtn,
      statusContent
    };
  }

  // Update UI with settings data
  function updateUIWithSettings(settings) {
    const { 
      baseUrlInput, 
      authProviderSelect, 
      headerNameInput, 
      headerPrefixInput,
      statusContent 
    } = window.settingsUI;

    if (settings.authentication) {
      baseUrlInput.setValue(settings.authentication.baseUrl || '');
      authProviderSelect.setValue(settings.authentication.defaultProvider || 'token');
      
      if (settings.authentication.tokenSettings) {
        headerNameInput.setValue(settings.authentication.tokenSettings.headerName || '');
        headerPrefixInput.setValue(settings.authentication.tokenSettings.headerPrefix || '');
      }
    }

    // Update status
    const statusHtml = `
      <div style="display: flex; flex-direction: column; gap: 8px;">
        <p><strong>Version:</strong> ${settings.version || 'N/A'}</p>
        <p><strong>Base URL:</strong> ${settings.authentication?.baseUrl || 'Not set'}</p>
        <p><strong>Auth Provider:</strong> ${settings.authentication?.defaultProvider || 'Not set'}</p>
        <p><strong>Token Header:</strong> ${settings.authentication?.tokenSettings?.headerName || 'Not set'}</p>
        <p><strong>Last Updated:</strong> ${new Date().toLocaleString()}</p>
      </div>
    `;
    statusContent.innerHTML = statusHtml;

    currentSettings = settings;
  }

  // Handle messages from extension
  window.addEventListener('message', event => {
    const message = event.data;
    const { loadBtn, saveBtn } = window.settingsUI;

    switch (message.type) {
      case 'settingsLoaded':
        loadBtn.setLoading(false);
        loadBtn.setText('Load Settings');
        updateUIWithSettings(message.payload);
        loading = false;
        break;

      case 'settingsSaved':
        saveBtn.setLoading(false);
        saveBtn.setText('Save Settings');
        currentSettings = message.payload;
        updateUIWithSettings(message.payload);
        loading = false;
        break;

      case 'error':
        loadBtn.setLoading(false);
        loadBtn.setText('Load Settings');
        saveBtn.setLoading(false);
        saveBtn.setText('Save Settings');
        loading = false;
        break;
    }
  });

  // Initialize UI
  createSettingsUI();

  // Auto-load settings on startup
  setTimeout(() => {
    vscode.postMessage({ type: 'loadSettings' });
  }, 100);
});