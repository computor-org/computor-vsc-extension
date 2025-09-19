(function () {
  const vscode = window.vscodeApi || acquireVsCodeApi();

  const state = {
    ...(window.__INITIAL_STATE__ || {})
  };

  function escapeHtml(value) {
    if (value === undefined || value === null) {
      return '';
    }
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatPercent(value) {
    if (value === undefined || value === null || Number.isNaN(value)) {
      return '–';
    }
    return `${Math.round(value)}%`;
  }

  function formatCount(current, max) {
    if (current === undefined || current === null) {
      return '–';
    }
    if (max === undefined || max === null) {
      return `${current}`;
    }
    return `${current} / ${max}`;
  }

  function formatDate(value) {
    if (!value) {
      return undefined;
    }
    try {
      return new Date(value).toLocaleString();
    } catch {
      return value;
    }
  }

  function formatStatus(value) {
    if (!value) {
      return 'Unknown';
    }
    return String(value)
      .toLowerCase()
      .split(/[_\s]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  function sendMessage(command, data) {
    vscode.postMessage({ command, data });
  }

  function renderActions(actionsContainer, actions) {
    actionsContainer.innerHTML = '';
    if (!actions) {
      return;
    }

    if (actions.localPath) {
      const openFolderBtn = document.createElement('button');
      openFolderBtn.className = 'vscode-button vscode-button--secondary';
      openFolderBtn.textContent = 'Reveal in Explorer';
      openFolderBtn.addEventListener('click', () => sendMessage('openFolder', { path: actions.localPath }));
      actionsContainer.appendChild(openFolderBtn);
    }

    if (actions.webUrl) {
      const openRepoBtn = document.createElement('button');
      openRepoBtn.className = 'vscode-button vscode-button--secondary';
      openRepoBtn.textContent = 'Open Repository';
      openRepoBtn.addEventListener('click', () => sendMessage('openGitlab', { url: actions.webUrl }));
      actionsContainer.appendChild(openRepoBtn);
    }

    if (actions.cloneUrl) {
      const copyBtn = document.createElement('button');
      copyBtn.className = 'vscode-button vscode-button--tertiary';
      copyBtn.textContent = 'Copy Clone URL';
      copyBtn.addEventListener('click', () => sendMessage('copyCloneUrl', { url: actions.cloneUrl }));
      actionsContainer.appendChild(copyBtn);
    }
  }

  function renderGradingHistory(history) {
    if (!Array.isArray(history) || history.length === 0) {
      return `
        <section class="card grading-history">
          <h2>Grading History</h2>
          <div class="empty-state">No grading history yet.</div>
        </section>
      `;
    }

    const items = history.map((entry) => {
      const gradeText = formatPercent(entry.gradePercent);
      const statusText = formatStatus(entry.status);
      const gradedAt = formatDate(entry.gradedAt) || '–';
      const grader = entry.graderName || 'Unknown';
      const feedback = entry.feedback ? `<div class="history-feedback">${escapeHtml(entry.feedback)}</div>` : '';

      return `
        <article class="history-item">
          <div class="history-header">
            <span class="history-grade">${escapeHtml(gradeText)}</span>
            <span class="history-status chip">${escapeHtml(statusText)}</span>
            <span class="history-date">${escapeHtml(gradedAt)}</span>
          </div>
          <div class="history-meta">Graded by ${escapeHtml(grader)}</div>
          ${feedback}
        </article>
      `;
    }).join('');

    return `
      <section class="card grading-history">
        <h2>Grading History</h2>
        <div class="history-list">${items}</div>
      </section>
    `;
  }

  function render() {
    const root = document.getElementById('app');
    if (!root) {
      return;
    }

    const data = state;
    const content = data.content || {};
    const contentType = data.contentType || {};
    const metrics = data.metrics || {};
    const repository = data.repository || {};
    const submissionGroup = data.submissionGroup || {};
    const team = data.team || {};
    const gradingHistory = Array.isArray(data.gradingHistory) ? data.gradingHistory : [];

    const headerSubtitleParts = [];
    if (data.course?.title) {
      headerSubtitleParts.push(data.course.title);
    }
    if (content.path) {
      headerSubtitleParts.push(content.path);
    }

    const statusChips = [];
    function addStatusChip(value) {
      if (!value) return;
      const formatted = formatStatus(value);
      if (!statusChips.includes(formatted)) {
        statusChips.push(formatted);
      }
    }
    if (contentType && (contentType.title || contentType.slug)) {
      addStatusChip(contentType.title || contentType.slug);
    }
    if (metrics.submitted) {
      addStatusChip('Submitted');
    }
    addStatusChip(metrics.gradeStatus || submissionGroup.status);

    const repoInfoItems = [];
    if (repository.fullPath) {
      repoInfoItems.push(`<div class="info-item"><span class="info-item-label">Remote Path</span><span class="info-item-value monospace">${escapeHtml(repository.fullPath)}</span></div>`);
    }
    if (repository.cloneUrl) {
      repoInfoItems.push(`<div class="info-item"><span class="info-item-label">Clone URL</span><span class="info-item-value monospace">${escapeHtml(repository.cloneUrl)}</span></div>`);
    }
    if (repository.localPath) {
      repoInfoItems.push(`<div class="info-item"><span class="info-item-label">Local Path</span><span class="info-item-value monospace">${escapeHtml(repository.localPath)}</span></div>`);
    }
    repoInfoItems.push(`<div class="info-item"><span class="info-item-label">Cloned</span><span class="info-item-value">${repository.isCloned ? 'Yes' : 'No'}</span></div>`);

    const teamItems = (team.members || []).map(member => {
      const name = member.name || member.full_name || member.username || 'Unknown member';
      const username = member.username && member.username !== name ? ` (${member.username})` : '';
      return `<div class="team-member">${escapeHtml(name)}${escapeHtml(username)}</div>`;
    });

    const headerSubtitle = headerSubtitleParts.length > 0
      ? `<div class="subtitle">${headerSubtitleParts.map(escapeHtml).join(' • ')}</div>`
      : '';

    const chips = statusChips.length > 0
      ? `<div class="chip-row">${statusChips.map(text => `<span class="chip">${text}</span>`).join('')}</div>`
      : '';

    const gradedAt = formatDate(metrics.gradedAt);

    root.innerHTML = `
      <div class="view-header">
        <h1>${escapeHtml(content.title || content.path || 'Course Content')}</h1>
        ${headerSubtitle}
        ${chips}
      </div>

      <section class="card">
        <h2>Overview</h2>
        <div class="info-grid">
          <div class="info-item">
            <span class="info-item-label">Content Path</span>
            <span class="info-item-value">${escapeHtml(content.path || '–')}</span>
          </div>
          <div class="info-item">
            <span class="info-item-label">Type</span>
            <span class="info-item-value">${escapeHtml(contentType.title || contentType.slug || 'Unknown')}</span>
          </div>
          <div class="info-item">
            <span class="info-item-label">Course</span>
            <span class="info-item-value">${escapeHtml(data.course?.title || 'Current course')}</span>
          </div>
          <div class="info-item">
            <span class="info-item-label">Group Size</span>
            <span class="info-item-value">${formatCount(team.currentSize, team.maxSize)}</span>
          </div>
        </div>
      </section>

      <section class="card">
        <h2>Progress &amp; Results</h2>
        <div class="stat-grid">
          <div class="stat-card">
            <strong>${formatCount(metrics.testsRun, metrics.maxTests)}</strong>
            <span>Test Runs</span>
          </div>
          <div class="stat-card">
            <strong>${formatCount(metrics.submissions, metrics.maxSubmissions)}</strong>
            <span>Submissions</span>
          </div>
          <div class="stat-card">
            <strong>${formatPercent(metrics.resultPercent)}</strong>
            <span>Latest Test Result</span>
          </div>
          <div class="stat-card">
            <strong>${formatPercent(metrics.gradePercent)}</strong>
            <span>Grading</span>
          </div>
        </div>
        <div class="info-grid">
          <div class="info-item">
            <span class="info-item-label">Status</span>
            <span class="info-item-value">${escapeHtml(formatStatus(metrics.gradeStatus || submissionGroup.status || '–'))}</span>
          </div>
          <div class="info-item">
            <span class="info-item-label">Feedback</span>
            <span class="info-item-value">${escapeHtml(metrics.feedback || '–')}</span>
          </div>
          <div class="info-item">
            <span class="info-item-label">Graded by</span>
            <span class="info-item-value">${escapeHtml(metrics.gradedBy || 'Pending')}</span>
          </div>
          <div class="info-item">
            <span class="info-item-label">Graded at</span>
            <span class="info-item-value">${escapeHtml(gradedAt || 'Not graded')}</span>
          </div>
        </div>
      </section>

      ${renderGradingHistory(gradingHistory)}

      <section class="card">
        <h2>Repository</h2>
        <div class="info-grid">${repoInfoItems.join('')}</div>
        <div class="actions" data-actions></div>
      </section>

      <section class="card">
        <h2>Team</h2>
        ${teamItems.length > 0 ? `<div class="team-list">${teamItems.join('')}</div>` : '<div class="empty-state">No additional team members.</div>'}
      </section>
    `;

    const actionsContainer = root.querySelector('[data-actions]');
    renderActions(actionsContainer, data.actions);
  }

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (!message) {
      return;
    }

    if (message.command === 'updateState' || message.command === 'update') {
      Object.assign(state, message.data || {});
      render();
    }
  });

  document.addEventListener('DOMContentLoaded', () => {
    render();
  });
})();
