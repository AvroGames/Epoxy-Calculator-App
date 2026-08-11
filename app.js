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

function getMaterialSaveViewElements() {
  return {
    view: document.getElementById('save-material-view'),
    nameInput: document.getElementById('save-material-name'),
    systemInput: document.getElementById('save-material-system'),
    categorySelect: document.getElementById('save-material-category'),
    eqWeightInput: document.getElementById('save-material-eq-weight'),
    chemistryInput: document.getElementById('save-material-chemistry'),
    confirmButton: document.getElementById('save-material-confirm'),
    cancelButton: document.getElementById('save-material-cancel'),
  };
}

const systemCatalog = {
  epoxy: {
    label: 'Resin',
    description: 'Build resin and curative formulations for protective coating systems.',
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

function getDefaultGitHubRepository() {
  if (typeof window === 'undefined') {
    return 'your-github-username/your-repo-name';
  }

  const hostname = window.location.hostname || '';
  const path = window.location.pathname || '/';
  const segments = path.split('/').filter(Boolean);

  if (hostname.endsWith('.github.io') && segments[0]) {
    const owner = hostname.replace('.github.io', '');
    return `${owner}/${segments[0]}`;
  }

  return 'your-github-username/your-repo-name';
}

const GITHUB_REPOSITORY = getDefaultGitHubRepository();

let supabaseClient = null;
let materialsState = readMaterials();
let templatesState = [];
let previousSystemBeforeSave = 'epoxy';
let dbConnected = false;
let currentSystem = 'epoxy';
let uiState = {};
let remoteRefreshTimer = null;
let materialsSubscription = null;
let sharedMaterialsRows = [];

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

function syncLocalMaterialsFromRemote(remoteMaterials) {
  const stored = readMaterials();
  Object.entries(remoteMaterials).forEach(([systemKey, systemMaterials]) => {
    stored[systemKey] = {
      epoxy: [...(systemMaterials?.epoxy || [])],
      amine: [...(systemMaterials?.amine || [])],
    };
  });
  writeMaterials(stored);
}

function syncLocalTemplatesFromRemote(remoteTemplates) {
  const localTemplates = readTemplates();
  const mergedTemplates = [...localTemplates, ...remoteTemplates];
  const deduped = [];
  const seen = new Set();

  mergedTemplates.forEach((template) => {
    const key = `${template.name}-${template.system}-${template.totalWeight}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(template);
    }
  });

  writeTemplates(deduped);
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
  if (!connected) {
    stopRemoteRefreshTimer();
    teardownMaterialsSubscription();
  }
}

function stopRemoteRefreshTimer() {
  if (remoteRefreshTimer) {
    clearInterval(remoteRefreshTimer);
    remoteRefreshTimer = null;
  }
}

function teardownMaterialsSubscription() {
  if (materialsSubscription && supabaseClient) {
    supabaseClient.removeChannel(materialsSubscription);
  }
  materialsSubscription = null;
}

function scheduleRemoteRefresh() {
  stopRemoteRefreshTimer();
  if (!supabaseClient || !dbConnected) {
    return;
  }

  remoteRefreshTimer = window.setInterval(() => {
    loadRemoteData();
  }, 5000);
}

function subscribeToMaterialsChanges() {
  teardownMaterialsSubscription();
  if (!supabaseClient || !dbConnected) {
    return;
  }

  materialsSubscription = supabaseClient.channel('materials-live-updates')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'materials' }, () => {
      loadRemoteData();
    })
    .subscribe();
}

function getMergedMaterialOptions(type) {
  const collected = [];
  const seen = new Set();

  const addItems = (items) => {
    (items || []).forEach((item) => {
      const key = `${item.name}-${item.eqWeight}`;
      if (!seen.has(key)) {
        seen.add(key);
        collected.push(item);
      }
    });
  };

  addItems((sharedMaterialsRows || []).filter((item) => item.type === type));

  Object.values(materialsState || {}).forEach((systemMaterials) => {
    if (!systemMaterials || typeof systemMaterials !== 'object') {
      return;
    }

    const items = Array.isArray(systemMaterials[type]) ? systemMaterials[type] : [];
    addItems(items);
  });

  const fallbackItems = [];
  Object.values(materialsState || {}).forEach((systemMaterials) => {
    if (!systemMaterials || typeof systemMaterials !== 'object') {
      return;
    }

    const alternateType = type === 'amine' ? 'epoxy' : 'amine';
    const alternateItems = Array.isArray(systemMaterials[alternateType]) ? systemMaterials[alternateType] : [];
    fallbackItems.push(...alternateItems);
  });

  if (!collected.length && fallbackItems.length) {
    addItems(fallbackItems);
  }

  return collected;
}

function createMaterialOptions(type) {
  const remoteMaterials = getMergedMaterialOptions(type);
  return `
    <option value="">custom</option>
    ${remoteMaterials.map((item) => `<option value="${escapeHtml(item.name)}" data-eq="${escapeHtml(item.eqWeight)}" data-name="${escapeHtml(item.name)}">${escapeHtml(item.name)} • eq ${escapeHtml(item.eqWeight)}</option>`).join('')}
  `;
}

function populateMaterialsFilters() {
  const systemSelect = document.getElementById('materials-system-filter');
  if (!systemSelect) {
    return;
  }

  const systems = Array.from(new Set(getMaterialLibraryRows().map((item) => (item.systemLabel || item.system || 'epoxy').toString()))).sort((a, b) => a.localeCompare(b));
  const currentValue = systemSelect.value || 'all';
  const previousValue = currentValue === 'all' ? '' : currentValue;
  systemSelect.innerHTML = '<option value="all">All systems</option>' + systems.map((system) => `<option value="${system}">${system}</option>`).join('');
  if (previousValue) {
    systemSelect.value = previousValue;
  } else {
    systemSelect.value = 'all';
  }
}

function getMaterialLibraryRows() {
  const rowMap = new Map();

  const addRow = (item) => {
    const system = (item.systemLabel || item.system || 'epoxy').toString().trim();
    const normalizedSystem = system || 'epoxy';
    const category = item.type === 'amine' ? 'curative' : 'resin';
    const key = `${normalizedSystem}:${category}:${item.name}:${item.eqWeight}`;
    if (!rowMap.has(key)) {
      rowMap.set(key, {
        ...item,
        systemLabel: normalizedSystem,
        categoryLabel: category === 'curative' ? 'Curative' : 'Resin',
        system: normalizedSystem.toLowerCase(),
      });
    }
  };

  (sharedMaterialsRows || []).forEach(addRow);

  Object.entries(materialsState || {}).forEach(([systemKey, systemMaterials]) => {
    if (!systemMaterials || typeof systemMaterials !== 'object') {
      return;
    }

    const systemLabel = (systemKey || 'epoxy').toString();
    const normalizedSystem = systemLabel.toLowerCase();
    const addSystemItems = (type) => {
      (Array.isArray(systemMaterials[type]) ? systemMaterials[type] : []).forEach((item) => {
        addRow({
          name: item.name,
          type,
          eqWeight: item.eqWeight,
          system: normalizedSystem,
          systemLabel,
        });
      });
    };

    addSystemItems('epoxy');
    addSystemItems('amine');
  });

  return Array.from(rowMap.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function renderMaterialsLibrary() {
  const library = document.getElementById('materials-library');
  const filter = document.querySelector('.material-type-filter.active')?.dataset.materialFilter || 'all';
  const systemFilter = document.getElementById('materials-system-filter')?.value || 'all';
  const categoryFilter = document.getElementById('materials-category-filter')?.value || 'all';
  const nameFilter = (document.getElementById('materials-name-filter')?.value || '').trim().toLowerCase();

  const filteredRows = getMaterialLibraryRows().filter((item) => {
    const categoryMatch = filter === 'all'
      ? true
      : filter === 'curative' ? item.type === 'amine' : item.type === 'epoxy';

    const systemMatch = systemFilter === 'all' || (item.systemLabel || item.system || 'epoxy').toLowerCase() === systemFilter.toLowerCase();
    const categoryValue = item.type === 'amine' ? 'curative' : 'resin';
    const categoryMatchField = categoryFilter === 'all' || categoryValue === categoryFilter;
    const nameMatch = !nameFilter || item.name.toLowerCase().includes(nameFilter);

    return categoryMatch && systemMatch && categoryMatchField && nameMatch;
  });

  populateMaterialsFilters();

  const rows = filteredRows.length
    ? filteredRows.map((item) => `
        <tr>
          <td>${escapeHtml(item.name)}</td>
          <td>${escapeHtml(item.categoryLabel || (item.type === 'amine' ? 'Curative' : 'Resin'))}</td>
          <td>${escapeHtml(item.systemLabel || item.system || 'epoxy')}</td>
          <td>${escapeHtml(item.eqWeight)}</td>
        </tr>
      `).join('')
    : '<tr><td colspan="4">No materials match the selected filter.</td></tr>';

  library.innerHTML = `
    <div class="shared-materials-table-shell">
      <table class="shared-materials-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Category</th>
            <th>System</th>
            <th>Eq. weight</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function setActiveSystemUI() {
  const config = getSystemConfig(currentSystem === 'save-material' ? 'epoxy' : currentSystem);
  document.getElementById('app-title').textContent = currentSystem === 'materials'
    ? 'Browse saved materials and equivalent weights'
    : currentSystem === 'save-material'
      ? 'Save and manage polymer materials'
      : currentSystem === 'epoxy'
        ? 'Build and balance polymer formulations'
      : `Build and balance ${config.label.toLowerCase()} formulations`;
  document.getElementById('app-description').textContent = currentSystem === 'materials'
    ? 'Review all saved materials across polymer systems and compare their equivalent weights.'
    : currentSystem === 'save-material'
      ? 'Create material entries for any polymer system, category, and equivalent weight.'
      : currentSystem === 'epoxy'
        ? 'Use one workspace for equivalent-weight polymer chemistry: define resin and curative blends, add additives, and calculate gram-based formulations.'
      : config.description;
  document.getElementById('resin-heading').textContent = config.resinLabel;
  document.getElementById('curative-heading').textContent = config.curativeLabel;
  document.querySelectorAll('.tab-button').forEach((button) => {
    button.classList.toggle('active', button.dataset.system === currentSystem);
  });

  const formulationView = document.getElementById('formulation-view');
  const materialsView = document.getElementById('materials-view');
  const saveMaterialView = document.getElementById('save-material-view');
  const isFormulationView = currentSystem !== 'materials' && currentSystem !== 'save-material';
  formulationView.classList.toggle('hidden', !isFormulationView);
  materialsView.classList.toggle('visible', currentSystem === 'materials');
  saveMaterialView.classList.toggle('visible', currentSystem === 'save-material');

  const activeLabel = document.createElement('div');
  activeLabel.className = 'system-pill';
  activeLabel.textContent = currentSystem === 'save-material'
    ? 'Material entry workflow active'
    : currentSystem === 'epoxy'
      ? 'Polymer workspace active'
    : `${config.label} workflow active`;

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
  syncBlendPercentageInputs(epoxyContainer);
  syncBlendPercentageInputs(amineContainer);

  if (!state.epoxy?.length && !state.amine?.length && !state.additives?.length) {
    summary.innerHTML = '';
    resultsList.innerHTML = '';
    formulaGrams.innerHTML = '<div class="formula-gram-row"><span>Enter values to see the grams breakdown.</span></div>';
    return;
  }

  calculateFormulation();
}

function switchSystem(systemKey) {
  if (!systemCatalog[systemKey] && systemKey !== 'materials' && systemKey !== 'save-material') {
    return;
  }

  uiState[currentSystem] = serializeFormState();
  currentSystem = systemKey;
  setActiveSystemUI();
  if (systemKey !== 'materials' && systemKey !== 'save-material') {
    restoreFormState(systemKey);
    populateTemplateSelect();
    refreshMaterialSelects();
  } else if (systemKey === 'materials') {
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
          <input class="name-input" type="text" placeholder="Additive or filler name" value="${escapeHtml(data.name || '')}" />
          <input class="percentage-input" type="number" min="0" max="100" step="0.01" placeholder="% of total" value="${data.percentage || ''}" />
        </div>
        <button class="icon-button remove-row" type="button">Remove</button>
      </div>
    `;
  }

  const container = type === 'epoxy' ? epoxyContainer : amineContainer;
  const isFirstRow = container.querySelectorAll('.row').length === 0;
  const placeholder = type === 'epoxy' ? '% of resin A' : '% of curative A';

  return `
    <div class="row">
      <div class="row-fields">
        <select class="material-select">${createMaterialOptions(type)}</select>
        <input class="name-input" type="text" placeholder="Component name" value="${escapeHtml(data.name || '')}" />
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
  if (type === 'epoxy' || type === 'amine') {
    syncBlendPercentageInputs(type === 'epoxy' ? epoxyContainer : amineContainer);
    refreshMaterialSelects();
  }
}

function syncBlendPercentageInputs(container) {
  if (!container) {
    return;
  }

  const labelGroup = document.querySelector(container.id === 'epoxy-rows' ? '.column-labels.epoxy-labels' : '.column-labels.amine-labels');
  const isResinContainer = container.id === 'epoxy-rows';
  const placeholder = isResinContainer ? '% of resin A' : '% of curative A';
  const rows = Array.from(container.querySelectorAll('.row'));
  const showBlendPercentageColumn = rows.length > 1;

  if (labelGroup) {
    const percentageLabel = labelGroup.querySelector('span:last-child');
    if (percentageLabel) {
      percentageLabel.style.display = showBlendPercentageColumn ? '' : 'none';
    }
    labelGroup.classList.toggle('compact-blend-labels', !showBlendPercentageColumn);
  }

  rows.forEach((row, index) => {
    const rowFields = row.querySelector('.row-fields');
    if (!rowFields) {
      return;
    }

    const percentageInput = row.querySelector('.percentage-input');
    if (index === 0) {
      percentageInput?.remove();
      return;
    }

    if (percentageInput) {
      percentageInput.placeholder = placeholder;
      return;
    }

    rowFields.insertAdjacentHTML(
      'beforeend',
      `<input class="percentage-input" type="number" min="0" max="100" step="0.01" placeholder="${placeholder}" />`,
    );
  });
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

// Blend-total enforcement is intentionally deferred; validation happens in calculateFormulation.
function enforceBlendTotal(container) {
  return;
}

function formatNumber(value) {
  if (!Number.isFinite(value)) {
    return '0.00';
  }
  return value.toFixed(2);
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getBalanceState(epoxyBlendEq, amineBlendEq) {
  return {
    className: 'good',
    message: 'Stoichiometric balance is calculated automatically from equivalent weights, blend ratios, and total formulation weight.',
  };
}

function buildSummary(epoxyBlendEq, amineBlendEq, epoxyBlendMass, amineBlendMass, totalWeight, additiveMass, warnings, balance) {
  return `
    <div class="summary-grid">
      <div class="summary-row"><span>Target formulation weight</span><strong>${formatNumber(totalWeight)} g</strong></div>
      <div class="summary-row"><span>Reactive mass (resin + curative)</span><strong>${formatNumber(epoxyBlendMass + amineBlendMass)} g</strong></div>
      <div class="summary-row"><span>Resin blend eq. weight</span><strong>${formatNumber(epoxyBlendEq)}</strong></div>
      <div class="summary-row"><span>Curative blend eq. weight</span><strong>${formatNumber(amineBlendEq)}</strong></div>
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
    return `<li>${escapeHtml(row.name)}: ${formatNumber(row.mass)} g (${formatNumber(displayPercentage)}% of blend)</li>`;
  }).join('');

  const amineCards = amineRows.map((row) => {
    const displayPercentage = Number.isFinite(row.displayPercentage) ? row.displayPercentage : row.percentage * 100;
    return `<li>${escapeHtml(row.name)}: ${formatNumber(row.mass)} g (${formatNumber(displayPercentage)}% of blend)</li>`;
  }).join('');

  const additiveCards = additives.map((row) => `<li>${escapeHtml(row.type)}: ${escapeHtml(row.name)} — ${formatNumber(row.mass)} g (${formatNumber(row.percentage)}% of total formulation)</li>`).join('');

  return `
    <div class="result-card">
      <h3>Resin blend (${formatNumber(epoxyBlendMass)} g)</h3>
      <ul>${epoxyCards || '<li>No resin rows entered.</li>'}</ul>
    </div>
    <div class="result-card">
      <h3>Curative blend (${formatNumber(amineBlendMass)} g)</h3>
      <ul>${amineCards || '<li>No curative rows entered.</li>'}</ul>
    </div>
    <div class="result-card">
      <h3>Additives & fillers</h3>
      <ul>${additiveCards || '<li>No additives entered.</li>'}</ul>
    </div>
  `;
}

function renderFormulaGrams(epoxyRows, amineRows, additiveRows) {
  const rows = [
    ...epoxyRows.map((row) => ({ label: `${escapeHtml(row.name)} (resin)`, grams: row.mass })),
    ...amineRows.map((row) => ({ label: `${escapeHtml(row.name)} (curative)`, grams: row.mass })),
    ...additiveRows.map((row) => ({ label: `${escapeHtml(row.type)}: ${escapeHtml(row.name)}`, grams: row.mass })),
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
    summary.innerHTML = '<div class="warning">Add at least one resin and one curative component before calculating.</div>';
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

function normalizeSupabaseUrl(rawUrl) {
  const value = (rawUrl || '').trim();
  if (!value) {
    return '';
  }

  if (/^https?:\/\//i.test(value)) {
    return value.replace(/\/$/, '');
  }

  if (value.includes('supabase.co')) {
    return `https://${value.replace(/^\/+/, '').replace(/\/$/, '')}`;
  }

  if (value.includes('.')) {
    return `https://${value.replace(/^\/+/, '').replace(/\/$/, '')}`;
  }

  return `https://${value.replace(/^\/+/, '').replace(/\/$/, '')}.supabase.co`;
}

async function loadBuildVersion() {
  const badge = document.getElementById('build-badge');
  if (!badge) {
    return;
  }

  if (!GITHUB_REPOSITORY || GITHUB_REPOSITORY.includes('your-github-username')) {
    badge.textContent = 'Build: set repo';
    return;
  }

  try {
    const [releaseResponse, commitResponse] = await Promise.all([
      fetch(`https://api.github.com/repos/${GITHUB_REPOSITORY}/releases?per_page=1`, {
        headers: { Accept: 'application/vnd.github+json' },
      }),
      fetch(`https://api.github.com/repos/${GITHUB_REPOSITORY}/commits?per_page=1`, {
        headers: { Accept: 'application/vnd.github+json' },
      }),
    ]);

    if (!releaseResponse.ok || !commitResponse.ok) {
      throw new Error('GitHub API request failed');
    }

    const releases = await releaseResponse.json();
    const commits = await commitResponse.json();
    const releaseTag = releases?.[0]?.tag_name || '';
    const sha = commits?.[0]?.sha?.slice(0, 7) || 'unknown';

    badge.textContent = releaseTag ? `Version: ${releaseTag}` : `Build: ${sha}`;
  } catch (error) {
    badge.textContent = 'Build: unavailable';
  }
}

function initSupabaseClient() {
  const config = getDbConfig();
  const rawUrl = config.url || supabaseUrlInput.value.trim();
  const key = config.key || supabaseKeyInput.value.trim();
  const url = normalizeSupabaseUrl(rawUrl);

  if (!url || !key) {
    return null;
  }

  if (!url.includes('supabase.co') && !url.includes('supabase.in')) {
    return null;
  }

  if (!window.supabase) {
    return null;
  }

  return window.supabase.createClient(url, key);
}

function showRefreshFeedback(message) {
  const feedback = document.getElementById('refresh-feedback');
  if (!feedback) {
    return;
  }

  feedback.textContent = message;
  feedback.classList.add('visible');
  window.clearTimeout(showRefreshFeedback.timer);
  showRefreshFeedback.timer = window.setTimeout(() => {
    feedback.classList.remove('visible');
  }, 2500);
}

function refreshLocalUi(message) {
  const storedMaterials = readMaterials();
  materialsState = storedMaterials;
  if (!materialsState[currentSystem]) {
    materialsState[currentSystem] = { epoxy: [], amine: [] };
  }
  rebuildAllMaterialSelects();
  renderMaterialsLibrary();
  populateTemplateSelect();
  showRefreshFeedback(message);
}

async function loadRemoteData() {
  if (!supabaseClient) {
    setDbStatus('Shared database: not connected. You can still use the app locally.', false);
    refreshLocalUi('Refresh complete locally: add Supabase credentials to sync shared materials.');
    return;
  }

  try {
    const { data: materialsData, error: materialsError } = await supabaseClient.from('materials').select('*').order('name', { ascending: true });
    if (materialsError) {
      throw materialsError;
    }

    const remoteMaterials = {};
    const seenMaterials = new Set();
    sharedMaterialsRows = (materialsData || []).map((item) => {
      const type = item.type === 'amine' ? 'amine' : 'epoxy';
      const system = (item.system || 'epoxy').toString().trim().toLowerCase() || 'epoxy';
      const systemLabel = (item.systemLabel || item.system || system || 'epoxy').toString();
      const eqWeight = Number(item.eq_weight ?? item.eqWeight ?? 0);
      const normalizedItem = { id: item.id, name: item.name, type, eqWeight, system, systemLabel };
      const key = `${system}:${type}:${normalizedItem.name}:${normalizedItem.eqWeight}`;
      if (!seenMaterials.has(key)) {
        seenMaterials.add(key);
        if (!remoteMaterials[system]) {
          remoteMaterials[system] = { epoxy: [], amine: [] };
        }
        remoteMaterials[system][type].push({ name: normalizedItem.name, eqWeight: normalizedItem.eqWeight });
      }
      return normalizedItem;
    });

    materialsState = remoteMaterials;
    syncLocalMaterialsFromRemote(remoteMaterials);

    const { data: templatesData, error: templatesError } = await supabaseClient.from('templates').select('*').order('name', { ascending: true });
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
      syncLocalTemplatesFromRemote(templatesState);
    }

    populateTemplateSelect();
    rebuildAllMaterialSelects();
    renderMaterialsLibrary();
    subscribeToMaterialsChanges();
    scheduleRemoteRefresh();
    setDbStatus('Connected to Supabase. Shared materials and templates are ready.', true);
    showRefreshFeedback(`Refresh complete: ${sharedMaterialsRows.length} shared material${sharedMaterialsRows.length === 1 ? '' : 's'} loaded.`);
    window.dispatchEvent(new CustomEvent('supabase-data-refreshed'));
  } catch (error) {
    const message = error?.message || 'Unknown Supabase error';
    const details = error?.details || '';
    const hint = error?.hint || '';
    const status = error?.status || '';
    console.error('Supabase load failed', error);
    const reason = message.includes('Failed to fetch')
      ? 'The browser could not reach the Supabase API. Check that the URL is the full Project URL from Supabase Settings > API, use the anon key, and that the project is online.'
      : message;
    const fullReason = [reason, status ? `Status: ${status}` : '', details ? `Details: ${details}` : '', hint ? `Hint: ${hint}` : ''].filter(Boolean).join(' | ');
    setDbStatus(`Supabase connection failed: ${fullReason}`, false);
    showRefreshFeedback('Refresh failed. Check the Supabase URL, key, table names, and permissions.');
  }
}

function getRowMaterialType(select) {
  const row = select.closest('.row');
  if (!row) {
    return 'epoxy';
  }

  const container = row.parentElement;
  if (container?.id === 'amine-rows') {
    return 'amine';
  }
  if (container?.id === 'epoxy-rows') {
    return 'epoxy';
  }

  const nameInput = row.querySelector('.name-input');
  return (nameInput?.value || '').toLowerCase().includes('amine') ? 'amine' : 'epoxy';
}

function refreshMaterialSelects() {
  document.querySelectorAll('.material-select').forEach((select) => {
    const type = getRowMaterialType(select);
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

function rebuildAllMaterialSelects() {
  const selects = document.querySelectorAll('.material-select');
  selects.forEach((select) => {
    const row = select.closest('.row');
    if (!row) {
      return;
    }

    const type = getRowMaterialType(select);
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

async function saveMaterialToSupabase({ name, normalizedType, eqWeight, systemKey }) {
  if (!supabaseClient) {
    throw new Error('Supabase client is not connected.');
  }

  const payloadVariants = [
    { name, type: normalizedType, eq_weight: eqWeight, system: systemKey },
    { name, type: normalizedType, eqWeight, system: systemKey },
  ];

  let lastError = null;
  for (const payload of payloadVariants) {
    const { data, error } = await supabaseClient.from('materials').insert(payload).select('*');
    if (!error) {
      return data;
    }
    lastError = error;
  }

  throw lastError || new Error('Unknown Supabase insert error.');
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
  syncBlendPercentageInputs(epoxyContainer);
  syncBlendPercentageInputs(amineContainer);
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
  const allOptions = Array.from(templateSelect.options);
  const newOptionIndex = allOptions.findIndex((opt) => opt.textContent === name);
  if (newOptionIndex >= 0) {
    templateSelect.selectedIndex = newOptionIndex;
  }
}

function openMaterialSaveModal() {
  const elements = getMaterialSaveViewElements();
  if (!elements.view) {
    return;
  }

  previousSystemBeforeSave = currentSystem;
  elements.nameInput.value = '';
  elements.systemInput.value = '';
  elements.categorySelect.value = 'resin';
  elements.eqWeightInput.value = '';
  elements.chemistryInput.value = '';
  switchSystem('save-material');
  window.setTimeout(() => elements.nameInput.focus(), 0);
}

function closeMaterialSaveModal() {
  switchSystem(previousSystemBeforeSave);
}

async function saveCurrentMaterial() {
  const elements = getMaterialSaveViewElements();
  const name = (elements.nameInput?.value || '').trim();
  if (!name) {
    window.alert('Please enter a material name.');
    return;
  }

  const system = (elements.systemInput?.value || '').trim();
  if (!system) {
    window.alert('Please enter a system name.');
    return;
  }

  const normalizedSystem = system.toLowerCase();
  const normalizedCategory = (elements.categorySelect?.value || 'resin').trim().toLowerCase();
  const allowedCategories = ['resin', 'curative'];
  if (!allowedCategories.includes(normalizedCategory)) {
    window.alert('Please select resin or curative.');
    return;
  }

  const eqWeight = parseFloat(elements.eqWeightInput?.value);
  if (!Number.isFinite(eqWeight) || eqWeight <= 0) {
    window.alert('Equivalent weight must be a positive number.');
    return;
  }

  const normalizedChemistry = (elements.chemistryInput?.value || '').trim();
  const chemistrySuffix = normalizedChemistry ? ` — ${normalizedChemistry}` : '';
  const displayName = `${name}${chemistrySuffix}`;

  const systemMaterials = getSystemMaterials(normalizedSystem);
  const storageType = normalizedCategory === 'curative' ? 'amine' : 'epoxy';
  const existing = systemMaterials[storageType] || [];
  existing.push({ name: displayName, eqWeight });
  systemMaterials[storageType] = existing;
  saveSystemMaterials(normalizedSystem, systemMaterials);

  const storedRow = {
    id: `${normalizedSystem}-${Date.now()}`,
    name: displayName,
    type: storageType,
    eqWeight,
    system: normalizedSystem,
    systemLabel: normalizedSystem,
  };
  sharedMaterialsRows = [storedRow, ...sharedMaterialsRows];

  if (supabaseClient) {
    try {
      await saveMaterialToSupabase({
        name: displayName,
        normalizedType: storageType,
        eqWeight,
        systemKey: normalizedSystem,
      });
      await loadRemoteData();
    } catch (error) {
      console.error('Material save to Supabase failed', error);
      const message = error?.message || 'Unknown error';
      const guidance = message.includes('relation') || message.includes('does not exist')
        ? 'Create the public.materials table in Supabase and allow anonymous inserts/reads.'
        : message.includes('policy') || message.includes('permission') || message.includes('RLS')
          ? 'Enable Row Level Security policies that permit anonymous SELECT/INSERT on the materials table.'
          : 'Check the Supabase URL, anon key, and the materials table columns.';
      setDbStatus(`Supabase write failed: ${message}`, false);
      window.alert(`The material was saved locally, but the database insert failed.\n\n${guidance}`);
    }
  }

  materialsState[normalizedSystem] = systemMaterials;
  syncLocalMaterialsFromRemote(materialsState);
  rebuildAllMaterialSelects();
  renderMaterialsLibrary();
  switchSystem(previousSystemBeforeSave);
  window.alert(`Saved ${displayName} to the shared ${normalizedCategory} list under ${normalizedSystem}.`);
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
    ...epoxyRows.map((row) => ['resin', row.name, '', row.percentage, row.eqWeight]),
    ...amineRows.map((row) => ['curative', row.name, '', row.percentage, row.eqWeight]),
    ...additiveRows.map((row) => ['additive', row.name, row.type, row.percentage, '']),
  ];

  const csv = rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'polymer-formulation.csv';
  anchor.click();
  URL.revokeObjectURL(url);
}

function parseDisplayedNumber(value) {
  const match = String(value || '').match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : NaN;
}

function readSummaryValue(label) {
  const rows = Array.from(summary.querySelectorAll('.summary-row'));
  const match = rows.find((row) => row.querySelector('span')?.textContent?.trim() === label);
  const rawValue = match?.querySelector('strong')?.textContent || '';
  return parseDisplayedNumber(rawValue);
}

function readBlendMassesFromResults(cardIndex) {
  const rows = Array.from(document.querySelectorAll(`#results-list .result-card:nth-child(${cardIndex}) li`));
  return rows.map((row) => {
    const text = row.textContent || '';
    const match = text.match(/:\s*([0-9]*\.?[0-9]+)\s*g/i);
    return match ? Number(match[1]) : NaN;
  }).filter((value) => Number.isFinite(value));
}

function valuesAreClose(actual, expected, tolerance = 0.03) {
  return Number.isFinite(actual) && Number.isFinite(expected) && Math.abs(actual - expected) <= tolerance;
}

function runSelfTestSuite() {
  const activeSystem = currentSystem;
  const previousState = serializeFormState();
  const tolerance = 0.03;
  const cases = [
    {
      name: 'Simple 2:1 stoichiometric split',
      input: {
        totalWeight: 100,
        resin: [{ name: 'R1', eqWeight: 190 }],
        curative: [{ name: 'C1', eqWeight: 95 }],
        additives: [],
      },
      expected: {
        targetWeight: 100,
        reactiveMass: 100,
        resinBlendEq: 190,
        curativeBlendEq: 95,
        additiveMass: 0,
        resinMasses: [66.67],
        curativeMasses: [33.33],
      },
    },
    {
      name: 'Reactive mass reduced by additives',
      input: {
        totalWeight: 100,
        resin: [{ name: 'R1', eqWeight: 190 }],
        curative: [{ name: 'C1', eqWeight: 95 }],
        additives: [{ type: 'Filler', name: 'F1', percentage: 10 }],
      },
      expected: {
        targetWeight: 100,
        reactiveMass: 90,
        resinBlendEq: 190,
        curativeBlendEq: 95,
        additiveMass: 10,
        resinMasses: [60.0],
        curativeMasses: [30.0],
      },
    },
    {
      name: 'Complex multi-row blend with additives',
      input: {
        totalWeight: 250,
        resin: [
          { name: 'R1', eqWeight: 200 },
          { name: 'R2', eqWeight: 100, percentage: 50 },
          { name: 'R3', eqWeight: 250, percentage: 25 },
        ],
        curative: [
          { name: 'C1', eqWeight: 120 },
          { name: 'C2', eqWeight: 240, percentage: 40 },
          { name: 'C3', eqWeight: 90, percentage: 20 },
        ],
        additives: [{ type: 'Filler', name: 'F2', percentage: 15 }],
      },
      expected: {
        targetWeight: 250,
        reactiveMass: 212.5,
        resinBlendEq: 159.09,
        curativeBlendEq: 130.91,
        additiveMass: 37.5,
        resinMasses: [66.61, 33.31, 16.65],
        curativeMasses: [59.95, 23.98, 11.99],
      },
    },
    {
      name: 'Equal blended equivalent weights',
      input: {
        totalWeight: 180,
        resin: [
          { name: 'R1', eqWeight: 200 },
          { name: 'R2', eqWeight: 100, percentage: 50 },
        ],
        curative: [
          { name: 'C1', eqWeight: 300 },
          { name: 'C2', eqWeight: 100, percentage: 100 },
        ],
        additives: [{ type: 'Other additive', name: 'A1', percentage: 20 }],
      },
      expected: {
        targetWeight: 180,
        reactiveMass: 144,
        resinBlendEq: 150,
        curativeBlendEq: 150,
        additiveMass: 36,
        resinMasses: [48.0, 24.0],
        curativeMasses: [36.0, 36.0],
      },
    },
  ];

  const failures = [];

  cases.forEach((testCase) => {
    clearRows(epoxyContainer);
    clearRows(amineContainer);
    clearRows(additiveContainer);
    document.getElementById('total-weight').value = String(testCase.input.totalWeight);

    (testCase.input.resin || []).forEach((row) => addRow('epoxy', row));
    (testCase.input.curative || []).forEach((row) => addRow('amine', row));
    (testCase.input.additives || []).forEach((row) => addRow('additive', row));
    calculateFormulation();

    const observed = {
      targetWeight: readSummaryValue('Target formulation weight'),
      reactiveMass: readSummaryValue('Reactive mass (resin + curative)'),
      resinBlendEq: readSummaryValue('Resin blend eq. weight'),
      curativeBlendEq: readSummaryValue('Curative blend eq. weight'),
      additiveMass: readSummaryValue('Additives and fillers'),
      resinMasses: readBlendMassesFromResults(1),
      curativeMasses: readBlendMassesFromResults(2),
    };

    const checks = [
      ['targetWeight', observed.targetWeight, testCase.expected.targetWeight],
      ['reactiveMass', observed.reactiveMass, testCase.expected.reactiveMass],
      ['resinBlendEq', observed.resinBlendEq, testCase.expected.resinBlendEq],
      ['curativeBlendEq', observed.curativeBlendEq, testCase.expected.curativeBlendEq],
      ['additiveMass', observed.additiveMass, testCase.expected.additiveMass],
    ];

    testCase.expected.resinMasses.forEach((value, index) => {
      checks.push([`resinMasses[${index}]`, observed.resinMasses[index], value]);
    });
    testCase.expected.curativeMasses.forEach((value, index) => {
      checks.push([`curativeMasses[${index}]`, observed.curativeMasses[index], value]);
    });

    checks.forEach(([label, actual, expected]) => {
      if (!valuesAreClose(actual, expected, tolerance)) {
        failures.push(`${testCase.name} :: ${label} expected ${expected.toFixed(2)} got ${Number.isFinite(actual) ? actual.toFixed(2) : 'NaN'}`);
      }
    });
  });

  uiState[activeSystem] = previousState;
  restoreFormState(activeSystem);

  const balanceText = document.querySelector('.balance-pill')?.textContent?.trim() || '';
  if (balanceText && !balanceText.toLowerCase().includes('stoichiometric balance is calculated automatically')) {
    failures.push('Balance message check failed: stoichiometric status text is not the expected automatic-balance message.');
  }

  if (!failures.length) {
    const successMessage = `Self test passed: ${cases.length}/${cases.length} known formulations matched expected stoichiometric results (±${tolerance.toFixed(2)} tolerance).`;
    showRefreshFeedback(successMessage);
    window.alert(successMessage);
    return;
  }

  const headline = `Self test found ${failures.length} issue${failures.length === 1 ? '' : 's'}.`;
  const detailLines = failures.slice(0, 8).join('\n');
  const suffix = failures.length > 8 ? `\n...and ${failures.length - 8} more.` : '';
  const failureMessage = `${headline}\n\n${detailLines}${suffix}`;
  showRefreshFeedback(headline);
  window.alert(failureMessage);
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
  document.getElementById('save-material').addEventListener('click', () => {
    openMaterialSaveModal();
  });
  document.getElementById('self-test').addEventListener('click', runSelfTestSuite);
  document.getElementById('export-csv').addEventListener('click', exportCsv);
  document.getElementById('export-pdf').addEventListener('click', () => window.print());
  document.querySelectorAll('.material-type-filter').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.material-type-filter').forEach((filterButton) => filterButton.classList.remove('active'));
      button.classList.add('active');
      renderMaterialsLibrary();
    });
  });

  document.getElementById('materials-system-filter')?.addEventListener('change', renderMaterialsLibrary);
  document.getElementById('materials-category-filter')?.addEventListener('change', renderMaterialsLibrary);
  document.getElementById('materials-name-filter')?.addEventListener('input', renderMaterialsLibrary);
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
      refreshLocalUi('Refresh complete locally: add Supabase credentials to sync shared materials.');
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
      const row = event.target.closest('.row');
      const container = row?.parentElement;
      row?.remove();
      if (container?.id === 'epoxy-rows' || container?.id === 'amine-rows') {
        syncBlendPercentageInputs(container);
      }
      calculateFormulation();
    }
  });

  const saveViewElements = getMaterialSaveViewElements();
  saveViewElements.confirmButton?.addEventListener('click', saveCurrentMaterial);
  saveViewElements.cancelButton?.addEventListener('click', closeMaterialSaveModal);

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
        const optionName = selectedOption.dataset.name || selectedOption.value;
        const optionEq = selectedOption.dataset.eq
          || (selectedOption.textContent.match(/eq\s+([0-9]*\.?[0-9]+)/i)?.[1] || '');
        row.querySelector('.name-input').value = optionName;
        row.querySelector('.eq-weight-input').value = optionEq;
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
syncBlendPercentageInputs(epoxyContainer);
syncBlendPercentageInputs(amineContainer);
loadBuildVersion();
window.addEventListener('supabase-data-refreshed', () => {
  rebuildAllMaterialSelects();
  showRefreshFeedback('Shared materials refreshed.');
});
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
rebuildAllMaterialSelects();
