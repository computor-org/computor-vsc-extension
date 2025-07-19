/**
 * UI Components Showcase
 * This file demonstrates all available UI components
 */

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('showcase-container');
  if (!container) return;

  // Check if components are loaded
  console.log('UIComponents available:', typeof window.UIComponents);
  console.log('window.UIComponents:', window.UIComponents);

  // Get components from the global UIComponents object
  if (!window.UIComponents) {
    console.error('UIComponents not found! Components.js may not have loaded properly.');
    container.innerHTML = '<p style="color: red;">Error: Components not loaded. Check console for details.</p>';
    return;
  }

  const {
    createButton,
    createInput,
    createSelect,
    createCheckbox,
    createProgress,
    createCard,
    createCardActions
  } = window.UIComponents;

  // Create sections
  function createSection(title) {
    const section = document.createElement('div');
    section.className = 'section';
    const heading = document.createElement('h2');
    heading.textContent = title;
    section.appendChild(heading);
    return section;
  }

  function createSubsection(title) {
    const heading = document.createElement('h3');
    heading.textContent = title;
    return heading;
  }

  // Button Section
  const buttonSection = createSection('Buttons');
  
  // Button variants
  buttonSection.appendChild(createSubsection('Variants'));
  const variantRow = document.createElement('div');
  variantRow.className = 'demo-row';
  
  ['primary', 'secondary', 'tertiary', 'danger'].forEach(variant => {
    const btn = createButton({ 
      text: variant.charAt(0).toUpperCase() + variant.slice(1), 
      variant: variant 
    });
    variantRow.appendChild(btn.render());
  });
  buttonSection.appendChild(variantRow);

  // Button sizes
  buttonSection.appendChild(createSubsection('Sizes'));
  const sizeRow = document.createElement('div');
  sizeRow.className = 'demo-row';
  
  ['sm', 'md', 'lg'].forEach(size => {
    const btn = createButton({ 
      text: size === 'sm' ? 'Small' : size === 'md' ? 'Medium' : 'Large', 
      size: size 
    });
    sizeRow.appendChild(btn.render());
  });
  buttonSection.appendChild(sizeRow);

  // Button states
  buttonSection.appendChild(createSubsection('States'));
  const stateRow = document.createElement('div');
  stateRow.className = 'demo-row';
  
  const normalBtn = createButton({ text: 'Normal' });
  const disabledBtn = createButton({ text: 'Disabled', disabled: true });
  const loadingBtn = createButton({ text: 'Click me!' });
  
  loadingBtn.on('click', () => {
    loadingBtn.setLoading(true);
    loadingBtn.setText('Loading...');
    setTimeout(() => {
      loadingBtn.setLoading(false);
      loadingBtn.setText('Click me!');
    }, 2000);
  });
  
  stateRow.appendChild(normalBtn.render());
  stateRow.appendChild(disabledBtn.render());
  stateRow.appendChild(loadingBtn.render());
  buttonSection.appendChild(stateRow);

  // Button with icons
  buttonSection.appendChild(createSubsection('With Icons'));
  const iconRow = document.createElement('div');
  iconRow.className = 'demo-row';
  
  const saveBtn = createButton({ text: 'Save', icon: '💾', variant: 'primary' });
  const nextBtn = createButton({ text: 'Next', icon: '→', iconPosition: 'right' });
  const refreshBtn = createButton({ text: 'Refresh', icon: '🔄', variant: 'secondary' });
  
  iconRow.appendChild(saveBtn.render());
  iconRow.appendChild(nextBtn.render());
  iconRow.appendChild(refreshBtn.render());
  buttonSection.appendChild(iconRow);

  container.appendChild(buttonSection);

  // Input Section
  const inputSection = createSection('Inputs');
  
  inputSection.appendChild(createSubsection('Types'));
  const inputGrid = document.createElement('div');
  inputGrid.className = 'demo-grid';
  
  const inputs = [
    createInput({ placeholder: 'Text input' }),
    createInput({ type: 'password', placeholder: 'Password' }),
    createInput({ type: 'email', placeholder: 'Email address' }),
    createInput({ type: 'number', placeholder: 'Number', min: 0, max: 100 })
  ];
  
  inputs.forEach(input => inputGrid.appendChild(input.render()));
  inputSection.appendChild(inputGrid);

  inputSection.appendChild(createSubsection('With Icons'));
  const iconInputGrid = document.createElement('div');
  iconInputGrid.className = 'demo-grid';
  
  const searchInput = createInput({ placeholder: 'Search...', icon: '🔍' });
  const userInput = createInput({ placeholder: 'Username', icon: '👤' });
  const emailInput = createInput({ placeholder: 'Email', icon: '📧', type: 'email' });
  
  iconInputGrid.appendChild(searchInput.render());
  iconInputGrid.appendChild(userInput.render());
  iconInputGrid.appendChild(emailInput.render());
  inputSection.appendChild(iconInputGrid);

  inputSection.appendChild(createSubsection('States'));
  const stateStack = document.createElement('div');
  stateStack.className = 'demo-stack';
  
  const normalInput = createInput({ placeholder: 'Normal input' });
  const disabledInput = createInput({ placeholder: 'Disabled', disabled: true });
  const errorInput = createInput({ 
    placeholder: 'Error state', 
    error: true, 
    errorMessage: 'This field is required' 
  });
  
  stateStack.appendChild(normalInput.render());
  stateStack.appendChild(disabledInput.render());
  stateStack.appendChild(errorInput.render());
  inputSection.appendChild(stateStack);

  container.appendChild(inputSection);

  // Select Section
  const selectSection = createSection('Select Dropdowns');
  
  const selectGrid = document.createElement('div');
  selectGrid.className = 'demo-grid';
  
  const langSelect = createSelect({
    placeholder: 'Choose language...',
    options: [
      { value: 'js', label: 'JavaScript' },
      { value: 'ts', label: 'TypeScript' },
      { value: 'py', label: 'Python' },
      { value: 'go', label: 'Go' }
    ],
    onChange: (value) => {
      // Handle language selection
    }
  });
  
  const themeSelect = createSelect({
    placeholder: 'Select theme...',
    value: 'dark',
    options: [
      { value: 'light', label: 'Light' },
      { value: 'dark', label: 'Dark' },
      { value: 'auto', label: 'System' }
    ]
  });
  
  const disabledSelect = createSelect({
    placeholder: 'Disabled select',
    disabled: true,
    options: [{ value: '1', label: 'Option 1' }]
  });
  
  selectGrid.appendChild(langSelect.render());
  selectGrid.appendChild(themeSelect.render());
  selectGrid.appendChild(disabledSelect.render());
  selectSection.appendChild(selectGrid);

  container.appendChild(selectSection);

  // Checkbox Section
  const checkboxSection = createSection('Checkboxes');
  
  const checkboxStack = document.createElement('div');
  checkboxStack.className = 'demo-stack';
  
  const check1 = createCheckbox({ label: 'Enable notifications' });
  const check2 = createCheckbox({ label: 'Auto-save', checked: true });
  const check3 = createCheckbox({ label: 'Disabled option', disabled: true });
  
  checkboxStack.appendChild(check1.render());
  checkboxStack.appendChild(check2.render());
  checkboxStack.appendChild(check3.render());
  checkboxSection.appendChild(checkboxStack);

  container.appendChild(checkboxSection);

  // Progress Section
  const progressSection = createSection('Progress Indicators');
  
  const progressStack = document.createElement('div');
  progressStack.className = 'demo-stack';
  
  const progress1 = createProgress({ value: 75, label: 'Processing - 75%' });
  const progress2 = createProgress({ value: 100, variant: 'success', label: 'Complete!' });
  const progress3 = createProgress({ value: 45, variant: 'warning', label: 'Warning - 45%' });
  const progress4 = createProgress({ value: 25, variant: 'error', label: 'Error - 25%' });
  const progress5 = createProgress({ indeterminate: true, label: 'Loading...' });
  
  progressStack.appendChild(progress1.render());
  progressStack.appendChild(progress2.render());
  progressStack.appendChild(progress3.render());
  progressStack.appendChild(progress4.render());
  progressStack.appendChild(progress5.render());
  
  // Interactive progress
  const interactiveDiv = document.createElement('div');
  const progress6 = createProgress({ value: 0, label: 'Interactive Progress' });
  const btnRow = document.createElement('div');
  btnRow.className = 'demo-row';
  btnRow.style.marginTop = '10px';
  
  const decreaseBtn = createButton({ text: '-10', variant: 'secondary', size: 'sm' });
  const increaseBtn = createButton({ text: '+10', variant: 'primary', size: 'sm' });
  
  let progressValue = 0;
  decreaseBtn.on('click', () => {
    progressValue = Math.max(0, progressValue - 10);
    progress6.setValue(progressValue);
  });
  
  increaseBtn.on('click', () => {
    progressValue = Math.min(100, progressValue + 10);
    progress6.setValue(progressValue);
  });
  
  btnRow.appendChild(decreaseBtn.render());
  btnRow.appendChild(increaseBtn.render());
  interactiveDiv.appendChild(progress6.render());
  interactiveDiv.appendChild(btnRow);
  progressStack.appendChild(interactiveDiv);
  
  progressSection.appendChild(progressStack);
  container.appendChild(progressSection);

  // Card Section
  const cardSection = createSection('Cards');
  
  cardSection.appendChild(createSubsection('Variants'));
  const cardGrid = document.createElement('div');
  cardGrid.className = 'demo-grid';
  
  const defaultCard = createCard({
    title: 'Default Card',
    content: 'This is a basic card with default styling.'
  });
  
  const borderedCard = createCard({
    title: 'Bordered Card',
    subtitle: 'With a subtitle',
    content: 'This card has a visible border.',
    variant: 'bordered'
  });
  
  const elevatedCard = createCard({
    title: 'Elevated Card',
    content: 'This card has shadow effects.',
    variant: 'elevated',
    hoverable: true
  });
  
  cardGrid.appendChild(defaultCard.render());
  cardGrid.appendChild(borderedCard.render());
  cardGrid.appendChild(elevatedCard.render());
  cardSection.appendChild(cardGrid);

  cardSection.appendChild(createSubsection('Interactive Cards'));
  const interactiveCardGrid = document.createElement('div');
  interactiveCardGrid.className = 'demo-grid';
  
  const clickableCard = createCard({
    title: 'Clickable Card',
    content: 'Click this card to select it',
    variant: 'bordered',
    clickable: true,
    onClick: () => {
      clickableCard.setSelected(!clickableCard.options.selected);
      if (clickableCard.options.selected) {
        vscode.postMessage({ type: 'info', message: 'Card selected!' });
      }
    }
  });
  
  interactiveCardGrid.appendChild(clickableCard.render());
  cardSection.appendChild(interactiveCardGrid);

  container.appendChild(cardSection);

  // Complete Form Example
  const formSection = createSection('Complete Form Example');
  
  const formCard = createCard({
    title: 'User Registration',
    subtitle: 'Fill out the form below',
    variant: 'bordered'
  });
  
  const form = document.createElement('form');
  form.style.display = 'flex';
  form.style.flexDirection = 'column';
  form.style.gap = '16px';
  
  const nameInput = createInput({ placeholder: 'Full name', icon: '👤', required: true });
  const emailInput2 = createInput({ type: 'email', placeholder: 'Email address', icon: '📧', required: true });
  const roleSelect = createSelect({
    placeholder: 'Select role...',
    options: [
      { value: 'developer', label: 'Developer' },
      { value: 'designer', label: 'Designer' },
      { value: 'manager', label: 'Manager' }
    ]
  });
  const agreeCheck = createCheckbox({ label: 'I agree to the terms and conditions' });
  
  form.appendChild(nameInput.render());
  form.appendChild(emailInput2.render());
  form.appendChild(roleSelect.render());
  form.appendChild(agreeCheck.render());
  
  const actions = createCardActions('right');
  const resetBtn = createButton({ text: 'Reset', variant: 'secondary' });
  const submitBtn = createButton({ text: 'Submit', variant: 'primary' });
  
  resetBtn.on('click', () => {
    nameInput.clear();
    emailInput2.clear();
    roleSelect.setValue('');
    agreeCheck.setChecked(false);
    nameInput.setError(false);
    emailInput2.setError(false);
  });
  
  submitBtn.on('click', () => {
    // Reset errors
    nameInput.setError(false);
    emailInput2.setError(false);
    
    // Validate
    let valid = true;
    if (!nameInput.getValue()) {
      nameInput.setError(true, 'Name is required');
      valid = false;
    }
    if (!emailInput2.getValue()) {
      emailInput2.setError(true, 'Email is required');
      valid = false;
    }
    if (!roleSelect.getValue()) {
      vscode.postMessage({ type: 'error', message: 'Please select a role' });
      valid = false;
    }
    if (!agreeCheck.isChecked()) {
      vscode.postMessage({ type: 'error', message: 'You must agree to the terms' });
      valid = false;
    }
    
    if (valid) {
      const formData = {
        name: nameInput.getValue(),
        email: emailInput2.getValue(),
        role: roleSelect.getValue(),
        agreed: agreeCheck.isChecked()
      };
      vscode.postMessage({ type: 'formSubmit', data: formData });
    }
  });
  
  actions.addButton(resetBtn.render());
  actions.addButton(submitBtn.render());
  
  formCard.setContent(form);
  formCard.setFooter(actions.render());
  
  formSection.appendChild(formCard.render());
  container.appendChild(formSection);
});