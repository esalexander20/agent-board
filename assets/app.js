(function () {
  'use strict';

  const state = { board: { projectName: '', columns: [], cards: [], plans: [] } };

  const columnLabels = {
    backlog: 'Backlog',
    in_progress: 'In Progress',
    pending_review: 'Pending Review',
    done: 'Done',
  };

  const cardTemplate = document.getElementById('card-template');
  const commentTemplate = document.getElementById('comment-template');
  const toastEl = document.getElementById('toast');

  function showToast(message, isError) {
    toastEl.textContent = message;
    toastEl.className = 'toast' + (isError ? ' toast-error' : '');
    toastEl.hidden = false;
    clearTimeout(toastEl._hideTimer);
    toastEl._hideTimer = setTimeout(() => { toastEl.hidden = true; }, 4000);
  }

  async function api(method, path, body) {
    const res = await fetch(path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      let message = `${method} ${path} failed (${res.status})`;
      try {
        const err = await res.json();
        if (err.error) message = err.error;
      } catch (e) { /* ignore */ }
      throw new Error(message);
    }
    return res.status === 204 ? null : res.json();
  }

  function render() {
    document.getElementById('project-name').textContent =
      state.board.projectName ? `Kanban Planner — ${state.board.projectName}` : 'Kanban Planner';

    const byColumn = { backlog: [], in_progress: [], pending_review: [], done: [] };
    for (const card of state.board.cards || []) {
      if (byColumn[card.column]) byColumn[card.column].push(card);
    }

    for (const column of Object.keys(columnLabels)) {
      const container = document.querySelector(`[data-cards="${column}"]`);
      const countEl = document.querySelector(`[data-count="${column}"]`);
      const cards = byColumn[column];
      countEl.textContent = String(cards.length);
      container.innerHTML = '';
      for (const card of cards) {
        container.appendChild(renderCard(card));
      }
    }
  }

  function renderCard(card) {
    const node = cardTemplate.content.firstElementChild.cloneNode(true);
    node.dataset.cardId = card.id;
    node.querySelector('.card-title').textContent = card.title;
    node.querySelector('.card-description').textContent = card.description || '';

    const criteria = Array.isArray(card.acceptanceCriteria) ? card.acceptanceCriteria : [];
    if (criteria.length > 0) {
      const criteriaBlock = node.querySelector('.card-criteria');
      criteriaBlock.hidden = false;
      const done = criteria.filter((c) => c.done).length;
      criteriaBlock.querySelector('.card-criteria-label').textContent =
        `Acceptance criteria (${done}/${criteria.length})`;
      const list = criteriaBlock.querySelector('.card-criteria-list');
      for (const item of criteria) {
        const li = document.createElement('li');
        li.className = 'criterion' + (item.done ? ' criterion-done' : '');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = !!item.done;
        checkbox.disabled = true;
        const label = document.createElement('span');
        label.textContent = item.text || '';
        li.appendChild(checkbox);
        li.appendChild(label);
        list.appendChild(li);
      }
    }

    const select = node.querySelector('.card-column-select');
    select.value = card.column;
    select.addEventListener('change', async () => {
      const newColumn = select.value;
      try {
        await api('PATCH', `/api/cards/${card.id}`, { column: newColumn });
      } catch (e) {
        showToast(e.message, true);
        select.value = card.column; // revert optimistic UI on failure
      }
    });

    const comments = card.comments || [];
    node.querySelector('.comment-count').textContent = String(comments.length);

    const toggleBtn = node.querySelector('.card-comments-toggle');
    const commentsPanel = node.querySelector('.card-comments');
    toggleBtn.addEventListener('click', () => {
      commentsPanel.hidden = !commentsPanel.hidden;
    });

    const list = node.querySelector('.comment-list');
    for (const comment of comments) {
      const c = commentTemplate.content.firstElementChild.cloneNode(true);
      c.querySelector('.comment-author').textContent = comment.author === 'claude' ? 'Claude' : 'You';
      c.querySelector('.comment-status').textContent =
        comment.author === 'user' ? (comment.status === 'processed' ? 'processed' : 'unprocessed') : '';
      c.classList.toggle('comment-claude', comment.author === 'claude');
      c.querySelector('.comment-text').textContent = comment.text;
      list.appendChild(c);
    }

    const input = node.querySelector('.comment-input');
    const submitBtn = node.querySelector('.comment-submit');
    submitBtn.addEventListener('click', async () => {
      const text = input.value.trim();
      if (!text) return;
      submitBtn.disabled = true;
      try {
        await api('POST', `/api/cards/${card.id}/comments`, { text });
        input.value = '';
        showToast('Comment added. Run /kanban-planner:sync to have Claude act on it.');
      } catch (e) {
        showToast(e.message, true);
      } finally {
        submitBtn.disabled = false;
      }
    });

    return node;
  }

  function connectEvents() {
    const es = new EventSource('/api/events');
    es.addEventListener('board', (e) => {
      try {
        state.board = JSON.parse(e.data);
        render();
      } catch (err) {
        console.error('bad board event', err);
      }
    });
    es.onerror = () => {
      // EventSource auto-reconnects per spec; nothing to do here.
    };
  }

  async function fetchBoardOnce() {
    try {
      state.board = await api('GET', '/api/board');
      render();
    } catch (e) {
      showToast('Could not load board: ' + e.message, true);
    }
  }

  // --- Modals ---

  const backdrop = document.getElementById('modal-backdrop');
  const planModal = document.getElementById('plan-modal');
  const cardModal = document.getElementById('card-modal');

  function openModal(modal) {
    backdrop.hidden = false;
    modal.hidden = false;
  }
  function closeModals() {
    backdrop.hidden = true;
    planModal.hidden = true;
    cardModal.hidden = true;
  }

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeModals();
  });
  document.querySelectorAll('[data-cancel]').forEach((btn) => {
    btn.addEventListener('click', closeModals);
  });

  document.getElementById('new-plan-btn').addEventListener('click', () => {
    document.getElementById('plan-goal').value = '';
    openModal(planModal);
  });

  document.getElementById('submit-plan-btn').addEventListener('click', async () => {
    const goal = document.getElementById('plan-goal').value.trim();
    if (!goal) return;
    try {
      await api('POST', '/api/plans', { goal });
      closeModals();
      showToast('Plan saved. Run /kanban-planner:sync (or ask Claude to sync the board) to break this into cards.');
    } catch (e) {
      showToast(e.message, true);
    }
  });

  document.getElementById('new-card-btn').addEventListener('click', () => {
    document.getElementById('card-title').value = '';
    document.getElementById('card-description').value = '';
    document.getElementById('card-column').value = 'backlog';
    openModal(cardModal);
  });

  document.getElementById('submit-card-btn').addEventListener('click', async () => {
    const title = document.getElementById('card-title').value.trim();
    if (!title) return;
    const description = document.getElementById('card-description').value.trim();
    const column = document.getElementById('card-column').value;
    try {
      await api('POST', '/api/cards', { title, description, column });
      closeModals();
    } catch (e) {
      showToast(e.message, true);
    }
  });

  fetchBoardOnce();
  connectEvents();
})();
