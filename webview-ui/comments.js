(function () {
  const vscode = window.vscodeApi || acquireVsCodeApi();
  const { createButton } = window.UIComponents || {};

  const state = {
    courseMemberId: undefined,
    title: 'Comments',
    comments: [],
    loading: false,
    error: undefined,
    editingComment: undefined,
    ...(window.__INITIAL_STATE__ || {})
  };

  const root = () => document.getElementById('app');

  function setState(patch) {
    Object.assign(state, patch);
    render();
  }

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

  function renderMarkdown(text) {
    if (!text) return '';
    if (typeof window.marked !== 'undefined') {
      return window.marked.parse(text);
    }
    return escapeHtml(text).replace(/\n/g, '<br/>');
  }

  function formatDate(dateString) {
    if (!dateString) return '';
    try {
      return new Date(dateString).toLocaleString();
    } catch {
      return dateString;
    }
  }

  function createElement(tag, options = {}) {
    const el = document.createElement(tag);
    if (options.className) el.className = options.className;
    if (options.textContent !== undefined) el.textContent = options.textContent;
    if (options.innerHTML !== undefined) el.innerHTML = options.innerHTML;
    if (options.attributes) {
      Object.entries(options.attributes).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          el.setAttribute(key, value);
        }
      });
    }
    if (options.children) {
      options.children.forEach((child) => {
        if (!child) return;
        if (typeof child === 'string') {
          el.appendChild(document.createTextNode(child));
        } else {
          el.appendChild(child);
        }
      });
    }
    return el;
  }

  function renderComments(container) {
    container.innerHTML = '';

    if (state.loading) {
      container.appendChild(
        createElement('div', {
          className: 'empty-state',
          textContent: 'Loading comments…'
        })
      );
      return;
    }

    if (state.error) {
      container.appendChild(
        createElement('div', {
          className: 'error-state',
          textContent: state.error
        })
      );
      return;
    }

    if (!state.comments || state.comments.length === 0) {
      container.appendChild(
        createElement('div', {
          className: 'empty-state',
          textContent: 'No comments yet.'
        })
      );
      return;
    }

    state.comments
      .slice()
      .sort((a, b) => {
        const aTime = a.updated_at || a.created_at || '';
        const bTime = b.updated_at || b.created_at || '';
        return aTime.localeCompare(bTime);
      })
      .forEach((comment) => {
        const card = createElement('article', {
          className: `comment-card${state.editingComment?.id === comment.id ? ' editing' : ''}`
        });

        const authorName = comment.transmitter?.user
          ? `${comment.transmitter.user.given_name || ''} ${comment.transmitter.user.family_name || ''}`.trim() || comment.transmitter.user.username || comment.transmitter.user.email
          : comment.transmitter_id || 'Unknown';

        card.appendChild(
          createElement('div', {
            className: 'comment-meta',
            children: [
              createElement('span', { textContent: authorName }),
              createElement('span', { textContent: formatDate(comment.updated_at || comment.created_at) })
            ]
          })
        );

        card.appendChild(
          createElement('div', {
            className: 'comment-body markdown-body',
            innerHTML: renderMarkdown(comment.message)
          })
        );

        const actions = createElement('div', { className: 'comment-actions' });

        if (createButton) {
          const editBtn = createButton({
            text: 'Edit',
            size: 'sm',
            variant: 'secondary',
            onClick: () => setState({ editingComment: comment })
          });
          actions.appendChild(editBtn.render());
        }

        const deleteBtn = createElement('button', {
          className: 'vscode-button vscode-button--tertiary vscode-button--sm',
          textContent: 'Delete',
          type: 'button'
        });

        deleteBtn.addEventListener('click', () => {
          vscode.postMessage({
            command: 'requestDeleteComment',
            data: { commentId: comment.id, courseMemberId: state.courseMemberId }
          });
        });

        actions.appendChild(deleteBtn);
        card.appendChild(actions);

        container.appendChild(card);
      });
  }

  function renderForm(wrapper) {
    wrapper.innerHTML = '';

    const textarea = createElement('textarea', {
      className: 'vscode-input',
      attributes: {
        rows: '5',
        placeholder: 'Add a comment…'
      }
    });
    textarea.value = state.editingComment ? state.editingComment.message || '' : '';

    const actions = createElement('div', { className: 'toolbar' });

    if (createButton) {
      const saveBtn = createButton({
        text: state.editingComment ? 'Save Changes' : 'Add Comment',
        variant: 'primary',
        loading: state.loading,
        onClick: () => {
          const message = textarea.value.trim();
          if (!message) {
            vscode.postMessage({ command: 'showWarning', data: 'Comment text is required.' });
            return;
          }
          setState({ loading: true });
          if (state.editingComment) {
            vscode.postMessage({
              command: 'updateComment',
              data: {
                commentId: state.editingComment.id,
                message
              }
            });
          } else {
            vscode.postMessage({
              command: 'createComment',
              data: { message }
            });
          }
        }
      });
      actions.appendChild(saveBtn.render());

      if (state.editingComment) {
        const cancelBtn = createButton({
          text: 'Cancel',
          variant: 'secondary',
          onClick: () => setState({ editingComment: undefined })
        });
        actions.appendChild(cancelBtn.render());
      }
    }

    const bodyRow = createElement('div', { className: 'form-row' });
    bodyRow.appendChild(createElement('label', { textContent: 'Comment', attributes: { for: 'comment-body' } }));
    textarea.id = 'comment-body';
    bodyRow.appendChild(textarea);

    if (state.editingComment) {
      wrapper.appendChild(
        createElement('p', {
          className: 'form-context',
          textContent: 'Editing existing comment'
        })
      );
    }

    wrapper.appendChild(bodyRow);
    wrapper.appendChild(actions);
  }

  function render() {
    const mount = root();
    if (!mount) return;

    mount.innerHTML = '';

    const view = createElement('div', { className: 'view-root' });

    const header = createElement('div', { className: 'view-header' });
    header.appendChild(
      createElement('h1', {
        textContent: state.title || 'Comments'
      })
    );

    const toolbar = createElement('div', { className: 'toolbar' });
    if (createButton) {
      const refreshBtn = createButton({
        text: 'Refresh',
        variant: 'secondary',
        onClick: () => {
          setState({ loading: true });
          vscode.postMessage({ command: 'refreshComments' });
        }
      });
      toolbar.appendChild(refreshBtn.render());
    }

    const commentsContainer = createElement('div', { className: 'comments-container' });
    renderComments(commentsContainer);

    const formCard = createElement('div', { className: 'form-card' });
    formCard.appendChild(
      createElement('h2', {
        textContent: state.editingComment ? 'Edit Comment' : 'New Comment'
      })
    );
    renderForm(formCard);

    view.appendChild(header);
    view.appendChild(toolbar);
    view.appendChild(commentsContainer);
    view.appendChild(formCard);

    mount.appendChild(view);
  }

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (!message) return;

    switch (message.command) {
      case 'updateComments':
        setState({ comments: message.data || [], loading: false, editingComment: undefined });
        break;
      case 'setLoading':
        setState({ loading: Boolean(message.data?.loading) });
        break;
      case 'setError':
        setState({ error: message.data, loading: false });
        break;
      case 'updateState':
        setState(message.data || {});
        break;
      case 'update':
        setState(message.data || {});
        break;
      default:
        break;
    }
  });

  document.addEventListener('DOMContentLoaded', () => {
    render();
  });
})();
