'use strict';

(() => {
  const CORE_CODES = new Set(['DE', 'EN', 'MATH', 'NAWI', 'GL']);
  const SOL_GRADES = [5, 6];
  const TYPE_OPTIONS = [
    ['REGULAR:', 'REGULAR · verbindlich für alle'],
    ['INDIVIDUAL:WPF', 'WPF · individuell'],
    ['INDIVIDUAL:RELIGION_ETHIK', 'Religion/Ethik · individuell']
  ];

  const byId = id => document.getElementById(id);
  const listFrom = value => Array.isArray(value) ? value : Array.isArray(value?.subjects) ? value.subjects : [];
  const activeGrades = subject => Array.isArray(subject?.activeGrades)
    ? subject.activeGrades.filter(grade => Number.isInteger(grade)).sort((a, b) => a - b)
    : [];
  const subjectKind = subject => {
    if (CORE_CODES.has(subject?.subjectCode)) return 'SOL_CORE';
    if (subject?.mode === 'INDIVIDUAL' && String(subject?.assignmentGroup || '').toUpperCase() === 'WPF') return 'WPF';
    if (String(subject?.assignmentGroup || '').toUpperCase() === 'RELIGION_ETHIK') return 'RELIGION_ETHIK';
    return 'OTHER';
  };
  const kindLabel = kind => ({
    SOL_CORE: 'Reguläres SOL-Fach',
    WPF: 'WPF',
    RELIGION_ETHIK: 'Religion/Ethik',
    OTHER: 'Nicht klassifiziert'
  })[kind] || 'Nicht klassifiziert';
  const canActivate = (subject, grade) => subjectKind(subject) === 'SOL_CORE'
    || (subjectKind(subject) === 'WPF' && grade === 6);
  const kindOrder = {SOL_CORE: 0, WPF: 1, RELIGION_ETHIK: 2, OTHER: 3};
  const typeValue = subject => subject?.mode === 'INDIVIDUAL'
    ? `INDIVIDUAL:${subject.assignmentGroup || 'WPF'}`
    : 'REGULAR:';
  const typeLabel = value => TYPE_OPTIONS.find(([option]) => option === value)?.[1] || 'REGULAR · verbindlich für alle';
  const setStatus = (node, message, state = '') => {
    if (!node) return;
    node.textContent = message;
    node.dataset.state = state;
  };

  async function requestCatalog() {
    const response = await fetch('/subject-management-catalog', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: '{}'
    });
    if (!response.ok) throw new Error('catalog');
    return response.json();
  }

  async function responseJson(response) {
    let payload = null;
    try { payload = await response.json(); } catch { /* use status fallback */ }
    if (!response.ok) {
      const message = payload?.message;
      throw new Error(message || (response.status === 403 ? 'Keine Berechtigung.' : 'request'));
    }
    return payload;
  }

  function appendTypeOptions(select, selected) {
    TYPE_OPTIONS.forEach(([value, label]) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      option.selected = value === selected;
      select.append(option);
    });
  }

  function subjectEditLink(subject) {
    const link = document.createElement('a');
    link.className = 'admin-action-link admin-subject-edit-link';
    link.href = `/subject?subjectId=${encodeURIComponent(subject.id)}`;
    link.textContent = 'Bearbeiten';
    return link;
  }

  async function saveType(subject, select, button, rowStatus) {
    const [mode, assignmentGroup] = select.value.split(':');
    button.disabled = true;
    setStatus(rowStatus, 'Wird gespeichert …');
    try {
      const response = await fetch('/set-curriculum-subject-type', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          subjectId: subject.id,
          mode,
          assignmentGroup: assignmentGroup || null
        })
      });
      await responseJson(response);
      subject.mode = mode;
      subject.assignmentGroup = assignmentGroup || null;
      setStatus(rowStatus, 'Gespeichert', 'success');
    } catch {
      setStatus(rowStatus, 'Fachart konnte nicht gespeichert werden.', 'error');
      select.value = typeValue(subject);
    } finally {
      button.disabled = false;
    }
  }

  function gradeControl(subject, grade) {
    const allowed = canActivate(subject, grade);
    const label = document.createElement('label');
    label.className = 'admin-grade-toggle';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = activeGrades(subject).includes(grade);
    checkbox.disabled = !allowed;
    checkbox.dataset.grade = String(grade);
    checkbox.setAttribute('aria-label', `${subject.name || 'Fach'} Klasse ${grade}`);
    const explanation = subjectKind(subject) === 'WPF'
      ? 'WPF ist im aktuellen SOL-Modell erst ab Klasse 6 vorgesehen.'
      : 'Dieses Fach ist für SOL 5/6 derzeit nicht freigegeben.';
    if (!allowed) {
      checkbox.title = explanation;
      label.title = explanation;
    }
    const text = document.createElement('span');
    text.textContent = allowed ? 'Aktiv' : 'Nicht verfügbar';
    label.append(checkbox, text);
    return {label, checkbox};
  }

  async function saveActivations(subject, controls, button, status) {
    const previous = activeGrades(subject);
    button.disabled = true;
    controls.forEach(control => { control.checkbox.disabled = true; });
    setStatus(status, 'Klassenstufen werden gespeichert …');
    const grades = controls
      .filter(control => control.checkbox.checked && canActivate(subject, Number(control.checkbox.dataset.grade)))
      .map(control => Number(control.checkbox.dataset.grade));
    try {
      const response = await fetch('/set-subject-grade-activations', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({subjectId: subject.id, grades})
      });
      const result = await responseJson(response);
      subject.activeGrades = Array.isArray(result?.activeGrades) ? result.activeGrades : previous;
      controls.forEach(control => {
        control.checkbox.checked = subject.activeGrades.includes(Number(control.checkbox.dataset.grade));
      });
      setStatus(status, 'Klassenstufen gespeichert.', 'success');
    } catch (error) {
      subject.activeGrades = previous;
      controls.forEach(control => {
        control.checkbox.checked = previous.includes(Number(control.checkbox.dataset.grade));
      });
      setStatus(status, error.message === 'Keine Berechtigung.' ? error.message : 'Die Klassenstufen-Zuordnung konnte nicht gespeichert werden.', 'error');
    } finally {
      button.disabled = false;
      controls.forEach(control => { control.checkbox.disabled = !canActivate(subject, Number(control.checkbox.dataset.grade)); });
    }
  }

  function renderSubjects(subjects) {
    const body = byId('subject-list-body');
    if (!body) return;
    body.replaceChildren();
    if (subjects.length === 0) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 5;
      cell.className = 'admin-empty-state';
      cell.textContent = 'Noch keine Fächer angelegt.';
      row.append(cell);
      body.append(row);
      return;
    }
    [...subjects].sort((a, b) => {
      const kindDifference = kindOrder[subjectKind(a)] - kindOrder[subjectKind(b)];
      return kindDifference || String(a.name || '').localeCompare(String(b.name || ''), 'de');
    }).forEach(subject => {
      const row = document.createElement('tr');
      const name = document.createElement('th');
      name.scope = 'row';
      const nameText = document.createElement('span');
      nameText.textContent = subject.name || 'Unbenanntes Fach';
      name.append(nameText);
      if (subject.subjectCode) {
        const code = document.createElement('small');
        code.className = 'admin-subject-code';
        code.textContent = subject.subjectCode;
        name.append(code);
      }
      const typeCell = document.createElement('td');
      const field = document.createElement('div');
      field.className = 'admin-inline-form';
      const select = document.createElement('select');
      select.setAttribute('aria-label', `Fachart für ${subject.name || 'Fach'}`);
      appendTypeOptions(select, typeValue(subject));
      const save = document.createElement('button');
      save.type = 'button';
      save.textContent = 'Speichern';
      const rowStatus = document.createElement('span');
      rowStatus.className = 'admin-inline-status';
      rowStatus.setAttribute('aria-live', 'polite');
      save.addEventListener('click', () => saveType(subject, select, save, rowStatus));
      field.append(select, save);
      typeCell.append(field, rowStatus);
      const typeLabelText = document.createElement('span');
      typeLabelText.className = 'admin-subject-kind';
      typeLabelText.textContent = kindLabel(subjectKind(subject));
      typeCell.prepend(typeLabelText);
      const gradeCells = SOL_GRADES.map(grade => {
        const cell = document.createElement('td');
        cell.dataset.label = `Klasse ${grade}`;
        const control = gradeControl(subject, grade);
        cell.append(control.label);
        return {cell, control};
      });
      const activationControls = gradeCells.map(item => item.control);
      const activationButton = document.createElement('button');
      activationButton.type = 'button';
      activationButton.textContent = 'Klassenstufen speichern';
      const activationStatus = document.createElement('span');
      activationStatus.className = 'admin-inline-status';
      activationStatus.setAttribute('aria-live', 'polite');
      activationButton.addEventListener('click', () => saveActivations(subject, activationControls, activationButton, activationStatus));
      const action = document.createElement('td');
      action.className = 'admin-subject-actions';
      action.append(subjectEditLink(subject), activationButton, activationStatus);
      row.append(name, typeCell, ...gradeCells.map(item => item.cell), action);
      body.append(row);
    });
  }

  async function loadSubjects() {
    const status = byId('subject-list-status');
    setStatus(status, 'Fächer werden geladen …');
    try {
      const catalog = await requestCatalog();
      const subjects = listFrom(catalog);
      renderSubjects(subjects);
      setStatus(status, `${subjects.length} Fächer`, 'success');
    } catch {
      const body = byId('subject-list-body');
      if (body) body.replaceChildren();
      setStatus(status, 'Fächer konnten nicht geladen werden.', 'error');
    }
  }

  async function createSubject(form) {
    const status = byId('subject-management-status');
    const submit = form.querySelector('button[type="submit"]');
    const name = form.querySelector('[name="name"]')?.value.trim();
    const value = form.querySelector('[name="subjectType"]')?.value || 'REGULAR:';
    const [mode, assignmentGroup] = value.split(':');
    if (!name) return;
    submit.disabled = true;
    setStatus(status, 'Fach wird angelegt …');
    try {
      const response = await fetch('/add-subject-with-type', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({name, mode, assignmentGroup: assignmentGroup || null})
      });
      if (!response.ok) throw new Error('create');
      form.reset();
      setStatus(status, 'Fach wurde angelegt.', 'success');
      await loadSubjects();
    } catch {
      setStatus(status, 'Fach konnte nicht angelegt werden.', 'error');
    } finally {
      submit.disabled = false;
    }
  }

  function init() {
    const form = byId('manage-subjects-form');
    if (!form) return;
    form.addEventListener('submit', event => {
      event.preventDefault();
      createSubject(form).catch(() => setStatus(byId('subject-management-status'), 'Fach konnte nicht angelegt werden.', 'error'));
    });
    loadSubjects().catch(() => setStatus(byId('subject-list-status'), 'Fächer konnten nicht geladen werden.', 'error'));
  }

  document.addEventListener('DOMContentLoaded', init);
})();
