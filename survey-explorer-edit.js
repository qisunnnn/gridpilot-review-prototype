const tabs = document.getElementById('survey-tabs');
const panel = document.getElementById('survey-panel');
const themeToggle = document.getElementById('theme-toggle');
const values = new Map();
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const fieldKey = (survey, field) => `${survey.key}:${field.id}`;
const fieldId = (survey, field) => `field-${survey.key}-${field.id.replace(/[^a-z0-9_-]/gi, '-')}`;

function renderControl(survey, field) {
  const key = fieldKey(survey, field);
  const id = fieldId(survey, field);
  const saved = values.get(key);
  const label = escapeHtml(field.label);
  const type = field.type;

  if (field.options.length) {
    const multiple = type === 'multi';
    return `<div class="choices" role="${multiple ? 'group' : 'radiogroup'}" aria-labelledby="${id}-label">${field.options.map((option, index) => {
      const selected = multiple ? Array.isArray(saved) && saved.includes(option) : saved === option;
      return `<label class="choice"><input type="${multiple ? 'checkbox' : 'radio'}" name="${id}${multiple ? `-${index}` : ''}" data-field-value="${escapeHtml(key)}" value="${escapeHtml(option)}" ${selected ? 'checked' : ''}><span>${escapeHtml(option)}</span></label>`;
    }).join('')}</div>`;
  }

  if (type === 'readonly') return '<div class="read-only">Filled from the project record</div>';

  if (type === 'repeat' || type === 'percent_group') {
    const subfields = field.subfields ?? [];
    return `<div class="subfield-grid">${subfields.length ? subfields.map(subfield => `<span>${escapeHtml(subfield.id.replace(/_/g, ' '))}</span>`).join('') : '<span>Repeatable entries</span>'}</div><p class="control-hint">${type === 'repeat' ? 'Add one row for each item in the product.' : 'Enter any known percentages in the product.'}</p>`;
  }

  if (type === 'file' || type === 'file_or_link') {
    const linkKey = `${key}:link`;
    return `<div class="file-control"><input id="${id}" type="file" aria-label="${label}" data-field-value="${escapeHtml(key)}"><p class="control-hint" data-file-status="${escapeHtml(key)}">${saved ? `Selected: ${escapeHtml(saved)}` : 'Choose a local file for this preview. No file is uploaded.'}</p>${type === 'file_or_link' ? `<label class="secondary-label" for="${id}-link">Or paste a link</label><input class="link-input" id="${id}-link" type="url" data-field-value="${escapeHtml(linkKey)}" value="${escapeHtml(values.get(linkKey) ?? '')}" placeholder="https://…">` : ''}</div>`;
  }

  if (type === 'textarea') return `<textarea id="${id}" data-field-value="${escapeHtml(key)}" placeholder="Add details if known">${escapeHtml(saved ?? '')}</textarea>`;

  const inputType = type === 'date' ? 'date' : type === 'number' ? 'number' : type === 'search' || type === 'project_picker' ? 'search' : 'text';
  const placeholder = inputType === 'date' ? '' : type === 'project_picker' ? 'Search existing projects' : type === 'search' ? 'Search or enter a value' : 'Enter if known';
  return `<input id="${id}" type="${inputType}" data-field-value="${escapeHtml(key)}" value="${escapeHtml(saved ?? '')}" ${inputType === 'number' ? 'inputmode="decimal"' : ''} ${placeholder ? `placeholder="${placeholder}"` : ''} ${field.required ? 'required' : ''}>`;
}

function renderField(survey, field) {
  const id = fieldId(survey, field);
  return `<div class="field"><div class="field-info"><div class="field-heading"><h3 id="${id}-label">${field.options.length || field.type === 'readonly' || field.type === 'repeat' || field.type === 'percent_group' ? escapeHtml(field.label) : `<label for="${id}">${escapeHtml(field.label)}</label>`}</h3>${field.required ? '<span class="required">Required</span>' : ''}</div>${field.note ? `<p class="field-description">${escapeHtml(field.note)}</p>` : ''}<div class="field-meta"><span><b>Shows:</b> ${escapeHtml(field.show_when)}</span><span><b>Source:</b> ${escapeHtml(field.source)}</span><span><b>ID:</b> ${escapeHtml(field.id)}</span></div></div><div class="field-control">${renderControl(survey, field)}</div></div>`;
}

function renderSurvey(key, focusTab = false) {
  const survey = SURVEYS.find(item => item.key === key) ?? SURVEYS[0];
  tabs.innerHTML = SURVEYS.map(item => `<button type="button" role="tab" id="tab-${escapeHtml(item.key)}" aria-controls="survey-panel" aria-selected="${item.key === survey.key}" tabindex="${item.key === survey.key ? '0' : '-1'}" data-survey="${escapeHtml(item.key)}">${escapeHtml(item.key[0].toUpperCase() + item.key.slice(1))}</button>`).join('');
  panel.setAttribute('aria-labelledby', `tab-${survey.key}`);
  panel.innerHTML = `<div class="survey-card"><p class="eyebrow">Survey field specification</p><h2>${escapeHtml(survey.title)}</h2><p class="survey-subtitle">${escapeHtml(survey.subtitle)}</p>${survey.key === 'modification' ? '<div class="notice">Modification is planned for a later release. This tab documents the proposed field set.</div>' : ''}</div>${survey.sections.map((section, index) => `<details class="section" ${index === 0 ? 'open' : ''}><summary><span>${escapeHtml(section.title)}</span><span class="section-count">${section.fields.length} fields</span></summary><div class="section-content">${section.fields.map(field => renderField(survey, field)).join('')}</div></details>`).join('')}`;
  if (focusTab) document.getElementById(`tab-${survey.key}`).focus();
  try { sessionStorage.setItem('gridpilot-survey-tab', survey.key); } catch {}
}

function setTheme(theme) {
  const dark = theme === 'dark';
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  themeToggle.setAttribute('aria-checked', String(dark));
  themeToggle.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
  themeToggle.title = dark ? 'Turn off dark mode' : 'Turn on dark mode';
  try { localStorage.setItem('gridpilot-prototype-theme', dark ? 'dark' : 'light'); } catch {}
}

themeToggle.addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
setTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');

tabs.addEventListener('click', event => {
  const tab = event.target.closest('[data-survey]');
  if (tab) renderSurvey(tab.dataset.survey, true);
});
tabs.addEventListener('keydown', event => {
  const tab = event.target.closest('[data-survey]');
  if (!tab || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const current = SURVEYS.findIndex(item => item.key === tab.dataset.survey);
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? SURVEYS.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + SURVEYS.length) % SURVEYS.length;
  renderSurvey(SURVEYS[next].key, true);
});

panel.addEventListener('input', event => {
  const input = event.target;
  if (!input.dataset.fieldValue || input.type === 'file' || input.type === 'checkbox' || input.type === 'radio') return;
  values.set(input.dataset.fieldValue, input.value);
});
panel.addEventListener('change', event => {
  const input = event.target;
  const key = input.dataset.fieldValue;
  if (!key) return;
  if (input.type === 'checkbox') {
    const selected = new Set(values.get(key) ?? []);
    input.checked ? selected.add(input.value) : selected.delete(input.value);
    values.set(key, [...selected]);
  } else if (input.type === 'radio') {
    values.set(key, input.value);
  } else if (input.type === 'file') {
    const name = input.files?.[0]?.name ?? '';
    values.set(key, name);
    const status = [...panel.querySelectorAll('[data-file-status]')].find(item => item.dataset.fileStatus === key);
    if (status) status.textContent = name ? `Selected: ${name}. No file is uploaded.` : 'Choose a local file for this preview. No file is uploaded.';
  }
});

let initialSurvey = SURVEYS[0].key;
try {
  const stored = sessionStorage.getItem('gridpilot-survey-tab');
  if (SURVEYS.some(item => item.key === stored)) initialSurvey = stored;
} catch {}
renderSurvey(initialSurvey);
