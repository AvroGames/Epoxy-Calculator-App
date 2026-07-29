const epoxyContainer = document.getElementById('epoxy-rows');
const amineContainer = document.getElementById('amine-rows');
const additiveContainer = document.getElementById('additive-rows');
const summary = document.getElementById('summary');
const resultsList = document.getElementById('results-list');
const formulaGrams = document.getElementById('formula-grams');
const templateSelect = document.getElementById('template-select');
const dbStatus = document.getElementById('db-status');
const supabaseUrlInput = document.getElementById('supabase-url');
const supabaseKeyInput = document.getElementById('supabase-key');

const systemCatalog = {
  epoxy: {
    label: 'Epoxy',
    description: 'Build epoxy and amine formulations for protective coating systems.',
    resinLabel: 'Resin blend',
    curativeLabel: 'Curative blend',
    materials: {
      epoxy: [
        { name: 'Bisphenol A epoxy', eqWeight: 190 },
        { name: 'Cycloaliphatic epoxy', eqWeight: 230 },
        { name: 'Flexible epoxy', eqWeight: 260 },
        { name: 'Novolac epoxy', eqWeight: 180 },
      ],
      amine: [
        { name: 'Polyether amine D230', eqWeight: 95 },
        { name: 'Polyether amine D400', eqWeight: 135 },
        { name: 'Aromatic amine hardener', eqWeight: 110 },
        { name: 'Cycloaliphatic amine', eqWeight: 80 },
      ],
    },
  },
  polyurethane: {
    label: 'Polyurethane',
    description: 'Formulate polyurethane resin and polyol or isocyanate systems.',
    resinLabel: 'Polyol blend',
    curativeLabel: 'Isocyanate blend',
    materials: {
      epoxy: [
        { name: 'Polyester polyol', eqWeight: 105 },
        { name: 'Polyether polyol', eqWeight: 110 },
        { name: 'Acrylic polyol', eqWeight: 125 },
      ],
      amine: [
        { name: 'MDI hardener', eqWeight: 130 },
        { name: 'TDI hardener', eqWeight: 110 },
        { name: 'Aliphatic isocyanate', eqWeight: 140 },
      ],
    },
  },
  polyaspartic: {
    label: 'Polyaspartic',
    description: 'Design fast-curing polyaspartic systems with a reactive amine blend.',
    resinLabel: 'Polyaspartic resin blend',
    curativeLabel: 'Amine curative blend',
    materials: {
      epoxy: [
        { name: 'Polyaspartic resin A', eqWeight: 175 },
        { name: 'Polyaspartic resin B', eqWeight: 190 },
        { name: 'Flexible polyaspartic resin', eqWeight: 210 },
      ],
      amine: [
        { name: 'Polyaspartic hardener', eqWeight: 90 },
        { name: 'Cycloaliphatic amine', eqWeight: 100 },
        { name: 'Aromatic amine', eqWeight: 110 },
      ],
    },
  },
  acrylic: {
    label: 'Acrylic',
    description: 'Balance acrylic binder systems with reactive crosslinkers and modifiers.',
    resinLabel: 'Acrylic resin blend',
    curativeLabel: 'Crosslinker blend',
    materials: {
      epoxy: [
        { name: 'Acrylic binder', eqWeight: 220 },
        { name: 'Hydroxyl acrylic resin', eqWeight: 240 },
        { name: 'Styrene acrylic resin', eqWeight: 260 },
      ],
      amine: [
        { name: 'Isocyanate crosslinker', eqWeight: 135 },
        { name: 'Melamine crosslinker', eqWeight: 150 },
        { name: 'Amino crosslinker', eqWeight: 165 },
      ],
    },
  },
};

const STORAGE_KEY = 'epoxy-formulator-templates';
const MATERIALS_KEY = 'epoxy-formulator-materials';
const DB_CONFIG_KEY = 'epoxy-formulator-db-config';

let supabaseClient = null;
let materialsState = {};
let templatesState = [];
let dbConnected = false;
let currentSystem = 'epoxy';
let uiState = {};

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

function getSystemConfig(systemKey = currentSystem) {
  return systemCatalog[systemKey] || systemCatalog.epoxy;
}

function getSystemMaterials(systemKey = currentSystem) {
  const stored = readMaterials();
  if (!stored[systemKey]) {
    stored[systemKey] = { epoxy: [], amine: [] };
    writeMaterials(stored);
  }
  return stored[systemKey];
}

function saveSystemMaterials(systemKey, value) {
  const stored = readMaterials();
  stored[systemKey] = value;
  writeMaterials(stored);
}

function readTemplates() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch (error) {
    return [];
  }
}

function getDbConfig() {
  try {
    return JSON.parse(localStorage.getItem(DB_CONFIG_KEY) || '{}');
  } catch (error) {
    return {};
  }
}

function saveDbConfig(config) {
  localStorage.setItem(DB_CONFIG_KEY, JSON.stringify(config));
}

function setDbStatus(message, connected = false) {
  dbConnected = connected;
  dbStatus.textContent = message;
  dbStatus.style.color = connected ? '#9be3ae' : '#9eb7ce';
}

function createMaterialOptions(type) {
  const config = getSystemConfig();
  const database = config.materials[type] || [];
  const customMaterials = getSystemMaterials(currentSystem)[type] || [];
  const remoteMaterials = materialsState[currentSystem]?.[type] || [];
  const seen = new Set();
  const items = [];

  [...database, ...customMaterials, ...remoteMaterials].forEach((item) => {
    const key = `${item.name}-${item.eqWeight}`;
    if (!seen.has(key)) {
      seen.add(key);
      items.push(item);
    }
  });

  return `
    <option value="">Custom</option>
    ${items.map((item) => `<option value="${item.name}" data-eq="${item.eqWeight}" data-name="${item.name}">${item.name} • eq ${item.eqWeight}</option>`).join('')}
  `;
}

function renderMaterialsLibrary() {
  const materials = readMaterials();
  const library = document.getElementById('materials-library');
  const familyOrder = ['epoxy', 'polyurethane', 'polyaspartic', 'acrylic'];

  const groups = familyOrder.map((family) => {
    const familyMaterials = materials[family] || { epoxy: [], amine: [] };
    const entries = [
      { title: 'Epoxies / resins', list: familyMaterials.epoxy || [] },
      { title: 'Curatives / hardeners', list: familyMaterials.amine || [] },
    ];

    return {
      family,
      entries,
    };
  });

  library.innerHTML = groups.map((group) => `
    <div class="material-group">
      <h3>${systemCatalog[group.family].label}</h3>
      <div class="material-list">
        ${group.entries.map((entry) => `
          <div>
            <strong>${entry.title}</strong>
            ${entry.list.length ? entry.list.map((item) => `
              <div class="material-item">
                <span>${item.name}</span>
                <strong>eq ${item.eqWeight}</strong>
              </div>
            `).join('') : '<div class="material-item"><span>No saved materials yet</span></div>'}
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
}

function setActiveSystemUI() {
  const config = getSystemConfig();
  document.getElementById('app-title').textContent = currentSystem === 'materials'
    ? 'Browse saved materials and equivalent weights'
    : `Build and balance ${config.label.toLowerCase()} formulations`;
  document.getElementById('app-description').textContent = currentSystem === 'materials'
    ? 'Review all saved materials across your coating systems and their equivalent weights.'
    : config.description;
  document.getElementById('resin-heading').textContent = config.resinLabel;
  document.getElementById('curative-heading').textContent = config.curativeLabel;
  document.querySelectorAll('.tab-button').forEach((button) => {
    button.classList.toggle('active', button.dataset.system === currentSystem);
  });

  const formulationView = document.getElementById('formulation-view');
  const materialsView = document.getElementById('materials-view');
  if (currentSystem === 'materials') {
    formulationView.classList.add('hidden');
    materialsView.classList.add('visible');
  } else {
    formulationView.classList.remove('hidden');
    materialsView.classList.remove('visible');
  }

  const activeLabel = document.createElement('div');
  activeLabel.className = 'system-pill';
  activeLabel.textContent = `${config.label} workflow active`;

  const existingPill = document.querySelector('.system-pill');
  if (existingPill) {
    existingPill.remove();
  }

  document.querySelector('.hero > div').appendChild(activeLabel);
}

function serializeFormState() {
  return {
    totalWeight: parseFloat(document.getElementById('total-weight').value) || 100,
    epoxy: collectRows(epoxyContainer, 'epoxy'),
    amine: collectRows(amineContainer, 'amine'),
    additives: collectRows(additiveContainer, 'additive'),
  };
}

function restoreFormState(systemKey) {
  const state = uiState[systemKey] || {};
  clearRows(epoxyContainer);
  clearRows(amineContainer);
  clearRows(additiveContainer);
  document.getElementById('total-weight').value = state.totalWeight || 100;
  (state.epoxy || []).forEach((row) => addRow('epoxy', row));
  (state.amine || []).forEach((row) => addRow('amine', row));
  (state.additives || []).forEach((row) => addRow('additive', row));

  if (!state.epoxy?.length && !state.amine?.length && !state.additives?.length) {
    summary.innerHTML = '';
    resultsList.innerHTML = '';
    formulaGrams.innerHTML = '<div class="formula-gram-row"><span>Enter values to see the grams breakdown.</span></div>';
    return;
  }

  calculateFormulation();
}

function switchSystem(systemKey) {
  if (!systemCatalog[systemKey] && systemKey !== 'materials') {
    return;
  }

  uiState[currentSystem] = serializeFormState();
  currentSystem = systemKey;
  setActiveSystemUI();
  if (systemKey !== 'materials') {
    restoreFormState(systemKey);
    populateTemplateSelect();
    refreshMaterialSelects();
  } else {
    renderMaterialsLibrary();
  }
}

function resetForm() {
  uiState[currentSystem] = { totalWeight: 100, epoxy: [], amine: [], additives: [] };
  restoreFormState(currentSystem);
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
          <input class="percentage-input" type="number" min="0" max="100" step="0.01" placeholder="% of total" value="${data.percentage || ''}" />
        </div>
        <button class="icon-button remove-row" type="button">Remove</button>
      </div>
    `;
  }

  const container = type === 'epoxy' ? epoxyContainer : amineContainer;
  const isFirstRow = container.querySelectorAll('.row').length === 0;
  const placeholder = type === 'epoxy' ? '% of epoxy A' : '% of curative A';

  return `
    <div class="row">
      <div class="row-fields">
        <select class="material-select">${createMaterialOptions(type)}</select>
        <input class="name-input" type="text" placeholder="Component name" value="${data.name || ''}" />
        <input class="eq-weight-input" type="number" min="0" step="0.01" placeholder="Eq. weight" value="${data.eqWeight || ''}" />
        ${isFirstRow ? '' : `<input class="percentage-input" type="number" min="0" max="100" step="0.01" placeholder="${placeholder}" value="${data.percentage || ''}" />`}
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
  return Array.from(container.querySelectorAll('.row')).map((row, index) => {
    const name = row.querySelector('.name-input').value.trim();
    const percentageInput = row.querySelector('.percentage-input');
    const percentage = parseFloat(percentageInput ? percentageInput.value : index === 0 ? 100 : 0);

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

  return rows.map((row) => {
    const percentage = Number.isFinite(parseFloat(row.percentage)) ? parseFloat(row.percentage) : 0;
    return {
      ...row,
      percentage: percentage / 100,
      displayPercentage: percentage,
    };
  });
}

function calculateBlendEquivalentWeight(rows) {
  if (!rows.length) {
    return 0;
  }

  const normalizedRows = normalizeBlendRatios(rows);
  const primaryRow = normalizedRows[0];
  const primaryEq = Number.isFinite(primaryRow?.eqWeight) ? primaryRow.eqWeight : 0;

  if (primaryEq <= 0) {
    return 0;
  }

  const dilutionSum = normalizedRows.slice(1).reduce((sum, row) => {
    const percent = Number.isFinite(row.displayPercentage) ? row.displayPercentage : 0;
    return sum + percent / 100;
  }, 0);

  const denominator = normalizedRows.reduce((sum, row, index) => {
    const rowEq = Number.isFinite(row.eqWeight) ? row.eqWeight : 0;
    if (rowEq <= 0) {
      return sum;
    }

    if (index === 0) {
      return sum + (1 / rowEq);
    }

    const percent = Number.isFinite(row.displayPercentage) ? row.displayPercentage : 0;
    const share = percent / 100;
    return sum + (share / rowEq);
  }, 0);

  const totalMassFactor = 1 + dilutionSum;
  return totalMassFactor / denominator;
}

function enforceBlendTotal(container) {
  return;
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
  return { className: 'good', message: 'Stoichiometric balance is maintained automatically from the selected ratios.' };
}

function buildSummary(epoxyBlendEq, amineBlendEq, epoxyBlendMass, amineBlendMass, totalWeight, additiveMass, warnings, balance) {
  return `
    <div class="summary-grid">
      <div class="summary-row"><span>Target formulation weight</span><strong>${formatNumber(totalWeight)} g</strong></div>
      <div class="summary-row"><span>Reactive mass (epoxy + amine)</span><strong>${formatNumber(epoxyBlendMass + amineBlendMass)} g</strong></div>
      <div class="summary-row"><span>Epoxy blend eq. weight</span><strong>${formatNumber(epoxyBlendEq)}</strong></div>
      <div class="summary-row"><span>Amine blend eq. weight</span><strong>${formatNumber(amineBlendEq)}</strong></div>
      <div class="summary-row"><span>Additives and fillers</span><strong>${formatNumber(additiveMass)} g</strong></div>
    </div>
    <div class="balance-pill ${balance.className}">${balance.message}</div>
    ${warnings.length ? `<div class="warning">${warnings.join(' ')}</div>` : ''}
  `;
}

function buildBlendRows(rows, blendMass) {
  if (!rows.length) {
    return [];
  }

  const normalizedRows = rows.map((row, index) => ({
    ...row,
    percentageValue: Number.isFinite(row.displayPercentage)
      ? row.displayPercentage
      : Number.isFinite(row.percentage)
        ? row.percentage * 100
        : 0,
    isPrimary: index === 0,
  }));

  if (normalizedRows.length === 1) {
    return normalizedRows.map((row) => ({
      ...row,
      mass: blendMass,
      displayPercentage: row.percentageValue,
    }));
  }

  const dilutionSum = normalizedRows.slice(1).reduce((sum, row) => sum + (row.percentageValue / 100), 0);
  const primaryMass = dilutionSum > 0 ? blendMass / (1 + dilutionSum) : blendMass;

  return normalizedRows.map((row) => ({
    ...row,
    mass: row.isPrimary ? primaryMass : primaryMass * (row.percentageValue / 100),
    displayPercentage: row.percentageValue,
  }));
}

function buildResults(epoxyRows, amineRows, additives, epoxyBlendMass, amineBlendMass) {
  const epoxyCards = epoxyRows.map((row) => {
    const displayPercentage = Number.isFinite(row.displayPercentage) ? row.displayPercentage : row.percentage * 100;
    return `<li>${row.name}: ${formatNumber(row.mass)} g (${formatNumber(displayPercentage)}% of blend)</li>`;
  }).join('');

  const amineCards = amineRows.map((row) => {
    const displayPercentage = Number.isFinite(row.displayPercentage) ? row.displayPercentage : row.percentage * 100;
    return `<li>${row.name}: ${formatNumber(row.mass)} g (${formatNumber(displayPercentage)}% of blend)</li>`;
  }).join('');

  const additiveCards = additives.map((row) => `<li>${row.type}: ${row.name} — ${formatNumber(row.mass)} g (${formatNumber(row.percentage)}% of total formulation)</li>`).join('');

  return `
    <div class="result-card">
      <h3>Epoxy blend (${formatNumber(epoxyBlendMass)} g)</h3>
      <ul>${epoxyCards || '<li>No epoxy rows entered.</li>'}</ul>
    </div>
    <div class="result-card">
      <h3>Amine blend (${formatNumber(amineBlendMass)} g)</h3>
      <ul>${amineCards || '<li>No amine rows entered.</li>'}</ul>
    </div>
    <div class="result-card">
      <h3>Additives & fillers</h3>
      <ul>${additiveCards || '<li>No additives entered.</li>'}</ul>
    </div>
  `;
}

function renderFormulaGrams(epoxyRows, amineRows, additiveRows) {
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
  enforceBlendTotal(epoxyContainer);
  enforceBlendTotal(amineContainer);
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

  if (warnings.length) {
    summary.innerHTML = `<div class="warning">${warnings.join(' ')}</div>`;
    resultsList.innerHTML = '';
    formulaGrams.innerHTML = '<div class="formula-gram-row"><span>Enter values to see the grams breakdown.</span></div>';
    return;
  }

  const normalizedEpoxy = normalizeBlendRatios(epoxyRows);
  const normalizedAmine = normalizeBlendRatios(amineRows);

  const epoxyBlendEq = calculateBlendEquivalentWeight(epoxyRows);
  const amineBlendEq = calculateBlendEquivalentWeight(amineRows);

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

  const equalEqWeights = Math.abs(epoxyBlendEq - amineBlendEq) <= 0.01;
  let epoxyBlendMass;
  let amineBlendMass;

  if (equalEqWeights) {
    const sharedMass = remainingWeight / 2;
    epoxyBlendMass = sharedMass;
    amineBlendMass = sharedMass;
  } else {
    const amineToEpoxyRatio = amineBlendEq / epoxyBlendEq;
    epoxyBlendMass = remainingWeight / (1 + amineToEpoxyRatio);
    amineBlendMass = epoxyBlendMass * amineToEpoxyRatio;
  }

  const epoxyResultRows = buildBlendRows(normalizedEpoxy, epoxyBlendMass);
  const amineResultRows = buildBlendRows(normalizedAmine, amineBlendMass);
  const additiveResultRows = additiveRows.map((row) => ({ ...row, mass: (totalWeight * row.percentage) / 100 }));

  const balance = getBalanceState(epoxyBlendEq, amineBlendEq);
  summary.innerHTML = buildSummary(epoxyBlendEq, amineBlendEq, epoxyBlendMass, amineBlendMass, totalWeight, additiveMass, warnings, balance);
  resultsList.innerHTML = buildResults(epoxyResultRows, amineResultRows, additiveResultRows, epoxyBlendMass, amineBlendMass);
  renderFormulaGrams(epoxyResultRows, amineResultRows, additiveResultRows);
}

function initSupabaseClient() {
  const config = getDbConfig();
  const url = config.url || supabaseUrlInput.value.trim();
  const key = config.key || supabaseKeyInput.value.trim();

  if (!url || !key) {
    return null;
  }

  if (!window.supabase) {
    return null;
  }

  return window.supabase.createClient(url, key);
}

function getDbConfig() {
  try {
    return JSON.parse(localStorage.getItem(DB_CONFIG_KEY) || '{}');
  } catch (error) {
    return {};
  }
}

function saveDbConfig(config) {
  localStorage.setItem(DB_CONFIG_KEY, JSON.stringify(config));
}

function setDbStatus(message, connected = false) {
  dbConnected = connected;
  dbStatus.textContent = message;
  dbStatus.style.color = connected ? '#9be3ae' : '#9eb7ce';
}

async function loadRemoteData() {
  if (!supabaseClient) {
    return;
  }

  try {
    const { data: materialsData, error: materialsError } = await supabaseClient.from('materials').select('*').order('name');
    if (!materialsError) {
      materialsState[currentSystem] = {
        epoxy: (materialsData || []).filter((item) => item.type === 'epoxy').map((item) => ({ name: item.name, eqWeight: Number(item.eq_weight) })),
        amine: (materialsData || []).filter((item) => item.type === 'amine').map((item) => ({ name: item.name, eqWeight: Number(item.eq_weight) })),
      };
    }

    const { data: templatesData, error: templatesError } = await supabaseClient.from('templates').select('*').order('created_at', { ascending: false });
    if (!templatesError) {
      templatesState = (templatesData || []).map((item) => ({
        id: item.id,
        name: item.name,
        system: item.payload?.system || item.system || 'epoxy',
        totalWeight: item.payload?.totalWeight || 100,
        epoxy: item.payload?.epoxy || [],
        amine: item.payload?.amine || [],
        additives: item.payload?.additives || [],
      }));
    }

    populateTemplateSelect();
    refreshMaterialSelects();
    setDbStatus('Connected to Supabase. Shared materials and templates are ready.', true);
  } catch (error) {
    setDbStatus('Supabase connection failed. Make sure the URL/key are valid and the tables exist.', false);
  }
}

function refreshMaterialSelects() {
  document.querySelectorAll('.material-select').forEach((select) => {
    const row = select.closest('.row');
    const type = row.querySelector('.name-input').value.toLowerCase().includes('amine') ? 'amine' : 'epoxy';
    const currentValue = select.value;
    const base = createMaterialOptions(type);
    select.innerHTML = base;
    if (currentValue) {
      const match = Array.from(select.options).find((option) => option.value === currentValue);
      if (match) {
        select.value = currentValue;
      }
    }
  });
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

function populateTemplateSelect() {
  const localTemplates = readTemplates();
  const allTemplates = [...localTemplates, ...templatesState].filter((template) => (template.system || 'epoxy') === currentSystem);
  const uniqueTemplates = [];
  const seen = new Set();

  allTemplates.forEach((template) => {
    const key = `${template.name}-${template.totalWeight}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueTemplates.push(template);
    }
  });

  templateSelect.innerHTML = '';
  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = 'Load template';
  templateSelect.appendChild(defaultOption);

  uniqueTemplates.forEach((template, index) => {
    const option = document.createElement('option');
    option.value = index;
    option.textContent = template.name;
    templateSelect.appendChild(option);
  });
}

function applyTemplate(template) {
  if (template.system && template.system !== currentSystem) {
    switchSystem(template.system);
  }
  clearRows(epoxyContainer);
  clearRows(amineContainer);
  clearRows(additiveContainer);
  document.getElementById('total-weight').value = template.totalWeight || 100;

  (template.epoxy || []).forEach((row) => addRow('epoxy', row));
  (template.amine || []).forEach((row) => addRow('amine', row));
  (template.additives || []).forEach((row) => addRow('additive', row));
  calculateFormulation();
}

async function saveCurrentTemplate() {
  const name = window.prompt('Name this template', 'My formulation');
  if (!name) {
    return;
  }

  const templatePayload = { ...buildTemplatePayload(), name, system: currentSystem };
  const templates = readTemplates();
  templates.push(templatePayload);
  writeTemplates(templates);

  if (supabaseClient) {
    try {
      await supabaseClient.from('templates').insert({
        name: templatePayload.name,
        system: currentSystem,
        payload: {
          system: currentSystem,
          totalWeight: templatePayload.totalWeight,
          epoxy: templatePayload.epoxy,
          amine: templatePayload.amine,
          additives: templatePayload.additives,
        },
      });
    } catch (error) {
      console.warn('Template save to Supabase failed', error);
    }
  }

  populateTemplateSelect();
  templateSelect.value = templates.length - 1;
}

async function saveCurrentMaterial() {
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

  const systemMaterials = getSystemMaterials(currentSystem);
  const existing = systemMaterials[normalizedType] || [];
  existing.push({ name: name.trim(), eqWeight });
  systemMaterials[normalizedType] = existing;
  saveSystemMaterials(currentSystem, systemMaterials);

  if (supabaseClient) {
    try {
      await supabaseClient.from('materials').insert({
        type: normalizedType,
        name: name.trim(),
        eq_weight: eqWeight,
      });
    } catch (error) {
      console.warn('Material save to Supabase failed', error);
    }
  }

  materialsState[currentSystem] = systemMaterials;
  refreshMaterialSelects();
  window.alert(`Saved ${name.trim()} to your ${normalizedType} list.`);
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
  document.getElementById('reset-btn').addEventListener('click', resetForm);
  document.getElementById('save-template').addEventListener('click', saveCurrentTemplate);
  document.getElementById('save-material').addEventListener('click', saveCurrentMaterial);
  document.getElementById('export-csv').addEventListener('click', exportCsv);
  document.getElementById('export-pdf').addEventListener('click', () => window.print());
  document.getElementById('connect-db').addEventListener('click', async () => {
    const config = {
      url: supabaseUrlInput.value.trim(),
      key: supabaseKeyInput.value.trim(),
    };

    saveDbConfig(config);
    supabaseClient = initSupabaseClient();
    if (!supabaseClient) {
      setDbStatus('Enter a Supabase URL and anon key to connect.', false);
      return;
    }

    await loadRemoteData();
  });
  document.getElementById('refresh-db').addEventListener('click', async () => {
    const config = getDbConfig();
    supabaseUrlInput.value = config.url || '';
    supabaseKeyInput.value = config.key || '';
    supabaseClient = initSupabaseClient();
    if (!supabaseClient) {
      setDbStatus('Enter a Supabase URL and anon key to connect.', false);
      return;
    }
    await loadRemoteData();
  });

  templateSelect.addEventListener('change', (event) => {
    const templates = [...readTemplates(), ...templatesState].filter((template) => (template.system || 'epoxy') === currentSystem);
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
    if (event.target.matches('.percentage-input')) {
      const container = event.target.closest('#epoxy-rows, #amine-rows');
      if (container) {
        enforceBlendTotal(container);
      }
      calculateFormulation();
      return;
    }

    if (event.target.matches('#total-weight, .eq-weight-input, .name-input')) {
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
setActiveSystemUI();
document.querySelectorAll('.tab-button').forEach((button) => {
  button.addEventListener('click', () => switchSystem(button.dataset.system));
});
const savedConfig = getDbConfig();
supabaseUrlInput.value = savedConfig.url || '';
supabaseKeyInput.value = savedConfig.key || '';
supabaseClient = initSupabaseClient();
if (supabaseClient) {
  loadRemoteData();
} else {
  setDbStatus('Shared database: not connected. You can still use the app locally.', false);
}
populateTemplateSelect();
renderMaterialsLibrary();
resetForm();
