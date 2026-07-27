const epoxyContainer = document.getElementById('epoxy-rows');
const amineContainer = document.getElementById('amine-rows');
const additiveContainer = document.getElementById('additive-rows');
const summary = document.getElementById('summary');
const resultsList = document.getElementById('results-list');
const formulaGrams = document.getElementById('formula-grams');
const templateSelect = document.getElementById('template-select');

const epoxyDatabase = [
  { name: 'Bisphenol A epoxy', eqWeight: 190, notes: 'Standard epoxy resin' },
  { name: 'Cycloaliphatic epoxy', eqWeight: 230, notes: 'Higher-performance cycloaliphatic resin' },
  { name: 'Flexible epoxy', eqWeight: 260, notes: 'More flexible, lower Tg system' },
  { name: 'Novolac epoxy', eqWeight: 180, notes: 'High functionality epoxy' },
];

const amineDatabase = [
  { name: 'Polyether amine D230', eqWeight: 95, notes: 'Fast-curing polyether amine' },
  { name: 'Polyether amine D400', eqWeight: 135, notes: 'More flexible polyether amine' },
  { name: 'Aromatic amine hardener', eqWeight: 110, notes: 'Higher temperature resistance' },
  { name: 'Cycloaliphatic amine', eqWeight: 80, notes: 'Low viscosity amine hardener' },
];

const STORAGE_KEY = 'epoxy-formulator-templates';
const MATERIALS_KEY = 'epoxy-formulator-materials';

function readMaterials() {
  try {
    return JSON.parse(localStorage.getItem(MATERIALS_KEY) || '{}');
  } catch (error) {
    return {};
  }
}

function writeMaterials(materials) {
  localStorage.setItem(MATERIALS_KEY, JSON.stringify(materials));
}

function createMaterialOptions(type) {
  const database = type === 'epoxy' ? epoxyDatabase : amineDatabase;
  const customMaterials = readMaterials()[type] || [];
  const items = [...database, ...customMaterials];
  return `
    <option value="">Custom</option>
    ${items.map((item) => `<option value="${item.name}" data-eq="${item.eqWeight}" data-name="${item.name}">${item.name} • eq ${item.eqWeight}</option>`).join('')}
  `;
}

function createRowMarkup(type, data = {}) {
  if (type === 'additive') {
    return `
      <div class="row">
        <div class="row-fields additive-grid">
          <select class="additive-type">
            <option value="Wetting aid" ${data.type === 'Wetting aid' ? 'selected' : ''}>Wetting aid</option>
            <option value="Antifoam" ${data.type === 'Antifoam' ? 'selected' : ''}>Antifoam</option>
            <option value="Other additive" ${data.type === 'Other additive' ? 'selected' : ''}>Other additive</option>
            <option value="Filler" ${data.type === 'Filler' ? 'selected' : ''}>Filler</option>
          </select>
          <input class="name-input" type="text" placeholder="Additive or filler name" value="${data.name || ''}" />
          <input class="percentage-input" type="number" min="0" step="0.01" placeholder="% of total" value="${data.percentage || ''}" />
        </div>
        <button class="icon-button remove-row" type="button">Remove</button>
      </div>
    `;
  }

  const selectedPreset = (data.name || '').trim();
  const options = createMaterialOptions(type);
  return `
    <div class="row">
      <div class="row-fields">
        <select class="material-select">${options}</select>
        <input class="name-input" type="text" placeholder="Component name" value="${data.name || ''}" />
        <input class="eq-weight-input" type="number" min="0" step="0.01" placeholder="Eq. weight" value="${data.eqWeight || ''}" />
        <input class="percentage-input" type="number" min="0" step="0.01" placeholder="Relative % vs first" value="${data.percentage || ''}" />
      </div>
      <button class="icon-button remove-row" type="button">Remove</button>
    </div>
  `;
}

function addRow(type, data = {}) {
  const target = type === 'epoxy' ? epoxyContainer : type === 'amine' ? amineContainer : additiveContainer;
  target.insertAdjacentHTML('beforeend', createRowMarkup(type, data));
}

function clearRows(container) {
  container.innerHTML = '';
}

function collectRows(container, type) {
  return Array.from(container.querySelectorAll('.row')).map((row) => {
    const name = row.querySelector('.name-input').value.trim();
    const percentage = parseFloat(row.querySelector('.percentage-input').value);

    if (type === 'additive') {
      const additiveType = row.querySelector('.additive-type').value;
      return {
        name,
        percentage: Number.isFinite(percentage) ? percentage : 0,
        type: additiveType,
      };
    }

    const eqWeight = parseFloat(row.querySelector('.eq-weight-input').value);
    return {
      name,
      eqWeight: Number.isFinite(eqWeight) ? eqWeight : 0,
      percentage: Number.isFinite(percentage) ? percentage : 0,
    };
  }).filter((item) => item.name || item.percentage > 0 || item.eqWeight > 0);
}

function normalizeBlendRatios(rows) {
  if (!rows.length) {
    return [];
  }

  const relativeWeights = rows.map((row, index) => {
    if (index === 0) {
      return 1;
    }

    const value = parseFloat(row.percentage);
    return Number.isFinite(value) && value > 0 ? value / 100 : 0;
  });

  const total = relativeWeights.reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) {
    return rows.map((row, index) => ({
      ...row,
      percentage: index === 0 ? 1 : 0,
    }));
  }

  return rows.map((row, index) => ({
    ...row,
    percentage: relativeWeights[index] / total,
  }));
}

function formatNumber(value) {
  if (!Number.isFinite(value)) {
    return '0.00';
  }
  return value.toFixed(2);
}

function getBalanceState(epoxyBlendEq, amineBlendEq) {
  const difference = Math.abs(epoxyBlendEq - amineBlendEq);
  const average = (epoxyBlendEq + amineBlendEq) / 2;
  const ratio = average === 0 ? 0 : difference / average;

  if (ratio <= 0.08) {
    return { className: 'good', message: 'Stoichiometric balance is maintained automatically from the selected ratios.' };
  }
  if (ratio <= 0.18) {
    return { className: 'warn', message: 'Stoichiometric balance is maintained automatically from the selected ratios.' };
  }
  return { className: 'good', message: 'Stoichiometric balance is maintained automatically from the selected ratios.' };
}

function buildSummary(epoxyBlendEq, amineBlendEq, epoxyBlendMass, amineBlendMass, totalWeight, additiveMass, warnings, balance) {
  return `
    <div class="summary-grid">
      <div class="summary-row"><span>Target formulation weight</span><strong>${formatNumber(totalWeight)} parts</strong></div>
      <div class="summary-row"><span>Reactive mass (epoxy + amine)</span><strong>${formatNumber(epoxyBlendMass + amineBlendMass)} parts</strong></div>
      <div class="summary-row"><span>Epoxy blend eq. weight</span><strong>${formatNumber(epoxyBlendEq)}</strong></div>
      <div class="summary-row"><span>Amine blend eq. weight</span><strong>${formatNumber(amineBlendEq)}</strong></div>
      <div class="summary-row"><span>Additives and fillers</span><strong>${formatNumber(additiveMass)} parts</strong></div>
    </div>
    <div class="balance-pill ${balance.className}">${balance.message}</div>
    ${warnings.length ? `<div class="warning">${warnings.join(' ')}</div>` : ''}
  `;
}

function buildResults(epoxyRows, amineRows, additives) {
  const epoxyCards = epoxyRows.map((row) => `<li>${row.name}: ${formatNumber(row.mass)} parts (relative ratio ${formatNumber(row.percentage * 100)}%)</li>`).join('');
  const amineCards = amineRows.map((row) => `<li>${row.name}: ${formatNumber(row.mass)} parts (relative ratio ${formatNumber(row.percentage * 100)}%)</li>`).join('');
  const additiveCards = additives.map((row) => `<li>${row.type}: ${row.name} — ${formatNumber(row.mass)} parts (${formatNumber(row.percentage)}% of total formulation)</li>`).join('');

  return `
    <div class="result-card">
      <h3>Epoxy blend</h3>
      <ul>${epoxyCards || '<li>No epoxy rows entered.</li>'}</ul>
    </div>
    <div class="result-card">
      <h3>Amine blend</h3>
      <ul>${amineCards || '<li>No amine rows entered.</li>'}</ul>
    </div>
    <div class="result-card">
      <h3>Additives & fillers</h3>
      <ul>${additiveCards || '<li>No additives entered.</li>'}</ul>
    </div>
  `;
}

function renderFormulaGrams(epoxyRows, amineRows, additiveRows, totalWeight) {
  const rows = [
    ...epoxyRows.map((row) => ({ label: `${row.name} (epoxy)`, grams: row.mass })),
    ...amineRows.map((row) => ({ label: `${row.name} (amine)`, grams: row.mass })),
    ...additiveRows.map((row) => ({ label: `${row.type}: ${row.name}`, grams: row.mass })),
  ].filter((row) => row.grams > 0);

  if (rows.length === 0) {
    formulaGrams.innerHTML = '<div class="formula-gram-row"><span>Enter values to see the grams breakdown.</span></div>';
    return;
  }

  formulaGrams.innerHTML = rows.map((row) => `
    <div class="formula-gram-row">
      <span>${row.label}</span>
      <strong>${formatNumber(row.grams)} g</strong>
    </div>
  `).join('');

  const total = rows.reduce((sum, row) => sum + row.grams, 0);
  formulaGrams.insertAdjacentHTML('beforeend', `
    <div class="formula-gram-row">
      <span>Total entered</span>
      <strong>${formatNumber(total)} g</strong>
    </div>
  `);
}

function calculateFormulation() {
  const totalWeight = parseFloat(document.getElementById('total-weight').value);
  const epoxyRows = collectRows(epoxyContainer, 'epoxy');
  const amineRows = collectRows(amineContainer, 'amine');
  const additiveRows = collectRows(additiveContainer, 'additive');
  const warnings = [];

  if (!Number.isFinite(totalWeight) || totalWeight <= 0) {
    summary.innerHTML = '<div class="warning">Please enter a positive total formulation weight.</div>';
    resultsList.innerHTML = '';
    formulaGrams.innerHTML = '<div class="formula-gram-row"><span>Enter values to see the grams breakdown.</span></div>';
    return;
  }

  if (epoxyRows.length === 0 || amineRows.length === 0) {
    summary.innerHTML = '<div class="warning">Add at least one epoxy and one amine component before calculating.</div>';
    resultsList.innerHTML = '';
    formulaGrams.innerHTML = '<div class="formula-gram-row"><span>Enter values to see the grams breakdown.</span></div>';
    return;
  }

  const normalizedEpoxy = normalizeBlendRatios(epoxyRows);
  const normalizedAmine = normalizeBlendRatios(amineRows);

  const epoxyBlendEq = 1 / normalizedEpoxy.reduce((sum, row) => sum + (row.percentage / row.eqWeight), 0);
  const amineBlendEq = 1 / normalizedAmine.reduce((sum, row) => sum + (row.percentage / row.eqWeight), 0);

  if (!Number.isFinite(epoxyBlendEq) || !Number.isFinite(amineBlendEq) || epoxyBlendEq <= 0 || amineBlendEq <= 0) {
    summary.innerHTML = '<div class="warning">Equivalent weights and percentages must be valid for the calculation to work.</div>';
    resultsList.innerHTML = '';
    formulaGrams.innerHTML = '<div class="formula-gram-row"><span>Enter values to see the grams breakdown.</span></div>';
    return;
  }

  const additivePercent = additiveRows.reduce((sum, row) => sum + row.percentage, 0);
  const additiveMass = (totalWeight * additivePercent) / 100;
  const remainingWeight = Math.max(0, totalWeight - additiveMass);

  if (additivePercent > 100) {
    warnings.push('Additive percentages exceed 100% of the total formulation.');
  }

  const amineToEpoxyRatio = amineBlendEq / epoxyBlendEq;
  const epoxyBlendMass = remainingWeight / (1 + amineToEpoxyRatio);
  const amineBlendMass = epoxyBlendMass * amineToEpoxyRatio;

  const epoxyResultRows = normalizedEpoxy.map((row) => ({
    ...row,
    mass: epoxyBlendMass * row.percentage,
  }));

  const amineResultRows = normalizedAmine.map((row) => ({
    ...row,
    mass: amineBlendMass * row.percentage,
  }));

  const additiveResultRows = additiveRows.map((row) => ({
    ...row,
    mass: (totalWeight * row.percentage) / 100,
  }));

  const balance = getBalanceState(epoxyBlendEq, amineBlendEq);
  summary.innerHTML = buildSummary(epoxyBlendEq, amineBlendEq, epoxyBlendMass, amineBlendMass, totalWeight, additiveMass, warnings, balance);
  resultsList.innerHTML = buildResults(epoxyResultRows, amineResultRows, additiveResultRows);
  renderFormulaGrams(epoxyResultRows, amineResultRows, additiveResultRows, totalWeight);
}

function readTemplates() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch (error) {
    return [];
  }
}

function writeTemplates(templates) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
}

function buildTemplatePayload() {
  return {
    name: 'Current formulation',
    totalWeight: parseFloat(document.getElementById('total-weight').value) || 100,
    epoxy: collectRows(epoxyContainer, 'epoxy'),
    amine: collectRows(amineContainer, 'amine'),
    additives: collectRows(additiveContainer, 'additive'),
  };
}

function populateTemplateSelect() {
  const templates = readTemplates();
  templateSelect.innerHTML = '';
  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = 'Load template';
  templateSelect.appendChild(defaultOption);

  templates.forEach((template, index) => {
    const option = document.createElement('option');
    option.value = index;
    option.textContent = template.name;
    templateSelect.appendChild(option);
  });
}

function applyTemplate(template) {
  clearRows(epoxyContainer);
  clearRows(amineContainer);
  clearRows(additiveContainer);
  document.getElementById('total-weight').value = template.totalWeight || 100;

  (template.epoxy || []).forEach((row) => addRow('epoxy', row));
  (template.amine || []).forEach((row) => addRow('amine', row));
  (template.additives || []).forEach((row) => addRow('additive', row));
  calculateFormulation();
}

function saveCurrentTemplate() {
  const name = window.prompt('Name this template', 'My formulation');
  if (!name) {
    return;
  }

  const templates = readTemplates();
  templates.push({ ...buildTemplatePayload(), name });
  writeTemplates(templates);
  populateTemplateSelect();
  templateSelect.value = templates.length - 1;
}

function saveCurrentMaterial() {
  const materialType = window.prompt('Save as epoxy or amine?', 'epoxy');
  const normalizedType = (materialType || '').trim().toLowerCase();
  const allowedTypes = ['epoxy', 'amine'];
  if (!allowedTypes.includes(normalizedType)) {
    window.alert('Please enter epoxy or amine.');
    return;
  }

  const name = window.prompt('Material name', 'My material');
  if (!name) {
    return;
  }

  const eqWeight = parseFloat(window.prompt('Equivalent weight', '190'));
  if (!Number.isFinite(eqWeight) || eqWeight <= 0) {
    window.alert('Equivalent weight must be a positive number.');
    return;
  }

  const materials = readMaterials();
  const existing = materials[normalizedType] || [];
  existing.push({ name: name.trim(), eqWeight });
  materials[normalizedType] = existing;
  writeMaterials(materials);
  window.alert(`Saved ${name.trim()} to your ${normalizedType} list.`);
}

function exportCsv() {
  const epoxyRows = collectRows(epoxyContainer, 'epoxy');
  const amineRows = collectRows(amineContainer, 'amine');
  const additiveRows = collectRows(additiveContainer, 'additive');
  const rows = [
    ['section', 'name', 'type', 'percentage', 'eqWeight'],
    ...epoxyRows.map((row) => ['epoxy', row.name, '', row.percentage, row.eqWeight]),
    ...amineRows.map((row) => ['amine', row.name, '', row.percentage, row.eqWeight]),
    ...additiveRows.map((row) => ['additive', row.name, row.type, row.percentage, '']),
  ];

  const csv = rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'epoxy-formulation.csv';
  anchor.click();
  URL.revokeObjectURL(url);
}

function resetExample() {
  clearRows(epoxyContainer);
  clearRows(amineContainer);
  clearRows(additiveContainer);
  document.getElementById('total-weight').value = '100';

  addRow('epoxy', { name: 'Bisphenol A epoxy', eqWeight: 190, percentage: 100 });
  addRow('epoxy', { name: 'Cycloaliphatic epoxy', eqWeight: 230, percentage: 40 });
  addRow('amine', { name: 'Polyether amine D230', eqWeight: 95, percentage: 100 });
  addRow('amine', { name: 'Cycloaliphatic amine', eqWeight: 80, percentage: 40 });
  addRow('additive', { type: 'Wetting aid', name: 'Leveling aid', percentage: 0.5 });
  calculateFormulation();
}

function attachEvents() {
  document.getElementById('add-epoxy').addEventListener('click', () => addRow('epoxy'));
  document.getElementById('add-amine').addEventListener('click', () => addRow('amine'));
  document.getElementById('add-additive').addEventListener('click', () => addRow('additive'));
  document.getElementById('calculate-btn').addEventListener('click', calculateFormulation);
  document.getElementById('reset-btn').addEventListener('click', resetExample);
  document.getElementById('save-template').addEventListener('click', saveCurrentTemplate);
  document.getElementById('save-material').addEventListener('click', saveCurrentMaterial);
  document.getElementById('export-csv').addEventListener('click', exportCsv);
  document.getElementById('export-pdf').addEventListener('click', () => window.print());
  templateSelect.addEventListener('change', (event) => {
    const templates = readTemplates();
    const selected = templates[event.target.value];
    if (selected) {
      applyTemplate(selected);
    }
  });

  document.addEventListener('click', (event) => {
    if (event.target.classList.contains('remove-row')) {
      event.target.closest('.row').remove();
      calculateFormulation();
    }
  });

  document.addEventListener('input', (event) => {
    if (event.target.matches('#total-weight, .percentage-input, .eq-weight-input, .name-input')) {
      calculateFormulation();
    }
  });

  document.addEventListener('change', (event) => {
    if (event.target.matches('.material-select')) {
      const selectedOption = event.target.selectedOptions[0];
      const row = event.target.closest('.row');
      if (selectedOption && selectedOption.value) {
        row.querySelector('.name-input').value = selectedOption.value;
        row.querySelector('.eq-weight-input').value = selectedOption.dataset.eq || '';
      }
      calculateFormulation();
    }

    if (event.target.matches('.additive-type')) {
      calculateFormulation();
    }
  });
}

attachEvents();
populateTemplateSelect();
resetExample();
