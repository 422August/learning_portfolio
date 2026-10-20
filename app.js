/* =========================================================
   app.js — 主應用程式邏輯
   ========================================================= */

'use strict';

// ---- 全域狀態 ----
const AppState = {
  uploadedFiles: [],
  parsedResults: [],
  schools: [],
  schoolRaw: [{ univ: '', dept: '' }],
  analysisResult: null,
  resultMode: null,
  mode: 'apply',
  criteria: '',
  multiRun: false,
  currentRecord: null,
  isAnalyzing: false,
};

const MODES = {
  apply: {
    label: '個人申請',
    desc: '適用一般個人申請的備審資料（學習歷程、自傳、讀書計畫等），會對照目標校系評估契合度並模擬教授與面試。',
    upload: '備審資料 / 學習歷程',
    needSchool: true,
  },
  special: {
    label: '特殊選才',
    desc: '適用特殊選才，重視特殊專長、突出成就與非典型背景，會對照目標校系評估專長深度與契合度。',
    upload: '特殊專長與成果資料',
    needSchool: true,
  },
  single: {
    label: '單一學習歷程',
    desc: '只分析「一份」學習歷程（如一份探究實作、課程成果或專題），不是備審資料，也不需要填寫目標校系。',
    upload: '單一學習歷程（一份作品或成果）',
    needSchool: false,
  },
};

// =========================================================
// 持久化：重新整理後保留資料
// 文字與設定存 localStorage；檔案本體存 IndexedDB
// =========================================================

const Store = (() => {
  const LS_KEY = 'lp_state_v1';
  const DB_NAME = 'lp_files_db';
  const DB_VERSION = 3;
  const FILES = 'files';
  const HISTORY = 'history';
  const SOURCES = 'sources';

  // ---- 設定（輕量）：localStorage ----
  function load() {
    try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; }
    catch (_) { return {}; }
  }

  function save(patch) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(Object.assign(load(), patch)));
    } catch (e) {
      console.warn('[Store] localStorage 寫入失敗', e);
    }
  }

  // ---- 檔案與歷史紀錄（大型資料）：IndexedDB ----
  function openDB() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) return reject(new Error('IndexedDB 不可用'));
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(FILES)) db.createObjectStore(FILES, { autoIncrement: true });
        if (!db.objectStoreNames.contains(HISTORY)) db.createObjectStore(HISTORY, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(SOURCES)) db.createObjectStore(SOURCES);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  /** 對指定 store 執行一次交易，回傳 fn 的請求結果 */
  async function run(storeName, mode, fn) {
    const db = await openDB();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        let result;
        const req = fn(tx.objectStore(storeName));
        if (req) req.onsuccess = () => { result = req.result; };
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  }

  async function saveFiles(files) {
    try {
      await run(FILES, 'readwrite', st => {
        st.clear();
        files.forEach(f => st.add({ name: f.name, type: f.type, lastModified: f.lastModified, blob: f }));
      });
    } catch (e) { console.warn('[Store] 檔案儲存失敗', e); }
  }

  async function loadFiles() {
    try {
      const rows = await run(FILES, 'readonly', st => st.getAll());
      return (rows || []).map(r => new File([r.blob], r.name, { type: r.type, lastModified: r.lastModified }));
    } catch (e) {
      console.warn('[Store] 檔案讀取失敗', e);
      return [];
    }
  }

  async function addRecord(record) {
    await run(HISTORY, 'readwrite', st => st.put(record));
    return record;
  }

  async function getRecord(id) {
    try { return (await run(HISTORY, 'readonly', st => st.get(id))) || null; }
    catch (e) { console.warn('[Store] 讀取紀錄失敗', e); return null; }
  }

  async function listRecords() {
    try {
      const rows = (await run(HISTORY, 'readonly', st => st.getAll())) || [];
      return rows.sort((a, b) => b.createdAt - a.createdAt);
    } catch (e) { console.warn('[Store] 讀取歷史失敗', e); return []; }
  }

  /** 更新紀錄的部分欄位（備註、標籤、練習紀錄等） */
  async function updateRecord(id, patch) {
    const rec = await getRecord(id);
    if (!rec) return null;
    const next = Object.assign(rec, patch);
    await run(HISTORY, 'readwrite', st => st.put(next));
    return next;
  }

  // 原始資料（解析後的文字與圖片）獨立存放，避免拖慢歷史列表
  async function putSource(id, source) {
    try { await run(SOURCES, 'readwrite', st => st.put(source, id)); }
    catch (e) { console.warn('[Store] 原始資料儲存失敗', e); }
  }

  async function getSource(id) {
    if (!id) return null;
    try { return (await run(SOURCES, 'readonly', st => st.get(id))) || null; }
    catch (_) { return null; }
  }

  async function deleteRecord(id) {
    const rec = await getRecord(id);
    await run(HISTORY, 'readwrite', st => st.delete(id));
    // 沒有其他紀錄使用時，一併刪除原始資料
    if (rec?.sourceId) {
      const rest = await listRecords();
      if (!rest.some(r => r.sourceId === rec.sourceId)) {
        try { await run(SOURCES, 'readwrite', st => st.delete(rec.sourceId)); } catch (_) {}
      }
    }
  }

  async function clearHistory() {
    await run(HISTORY, 'readwrite', st => st.clear());
    try { await run(SOURCES, 'readwrite', st => st.clear()); } catch (_) {}
  }

  async function clearAll() {
    try { await run(HISTORY, 'readwrite', st => st.clear()); } catch (_) {}
    try { await run(SOURCES, 'readwrite', st => st.clear()); } catch (_) {}
    try { await run(FILES, 'readwrite', st => st.clear()); } catch (_) {}
    try { localStorage.removeItem(LS_KEY); } catch (_) {}
  }

  // 舊版曾把結果存在 localStorage，改用 IndexedDB 後清除
  (function migrate() {
    const st = load();
    if ('apiKey' in st || 'result' in st || 'page' in st || 'resultSchools' in st || 'resultMode' in st) {
      // 移除舊版殘留：API Key 不再儲存
      delete st.apiKey; delete st.result; delete st.page; delete st.resultSchools; delete st.resultMode;
      try { localStorage.setItem(LS_KEY, JSON.stringify(st)); } catch (_) {}
    }
  })();

  return { load, save, saveFiles, loadFiles, addRecord, getRecord, listRecords, updateRecord, putSource, getSource, deleteRecord, clearHistory, clearAll };
})();

// =========================================================
// 工具函式
// =========================================================

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function clamp(val, min = 0, max = 100) {
  const n = Number(val);
  return isNaN(n) ? min : Math.min(Math.max(Math.round(n), min), max);
}

function showPage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById(pageId);
  if (target) target.classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// =========================================================
// Toast 通知
// =========================================================

function showToast(title, message, type = 'error', duration = 6000) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <div class="toast-body">
      <div class="toast-title">${escapeHtml(title)}</div>
      ${message ? `<div class="toast-msg">${escapeHtml(message)}</div>` : ''}
    </div>
    <button class="toast-close" onclick="this.parentElement.remove()" aria-label="關閉">✕</button>
  `;
  container.appendChild(toast);
  if (duration > 0) setTimeout(() => toast.remove(), duration);
}

// =========================================================
// API Key
// =========================================================

function initApiKey() {
  const providerSelect = document.getElementById('providerSelect');
  const baseUrlGroup = document.getElementById('baseUrlGroup');
  const baseUrlInput = document.getElementById('baseUrlInput');
  const modelPresetSelect = document.getElementById('modelPresetSelect');
  const modelCustomInput = document.getElementById('modelCustomInput');
  const input = document.getElementById('apiKeyInput');
  const toggleBtn = document.getElementById('apiKeyToggle');
  const statusEl = document.getElementById('apiKeyStatus');
  const validateBtn = document.getElementById('apiKeyValidate');
  const providerHint = document.getElementById('providerHint');

  const saved = Store.load();
  const initialProvider = saved.provider || 'gemini';
  const initialModel = saved.model || '';
  const initialBaseUrl = saved.baseUrl || '';

  const providers = GeminiAPI.getProviders();
  if (providerSelect) {
    providerSelect.innerHTML = Object.values(providers).map(p =>
      `<option value="${p.id}">${escapeHtml(p.name)}</option>`
    ).join('');
  }

  function syncProviderUI(provId, keepModel = false) {
    GeminiAPI.setProvider(provId);
    const prov = GeminiAPI.getProviderInfo();

    if (baseUrlGroup) {
      if (prov.needBaseUrl) {
        baseUrlGroup.style.display = '';
        baseUrlInput.value = initialBaseUrl || prov.defaultBaseUrl;
        GeminiAPI.setBaseUrl(baseUrlInput.value);
      } else {
        baseUrlGroup.style.display = 'none';
        GeminiAPI.setBaseUrl(prov.defaultBaseUrl);
      }
    }

    if (modelPresetSelect) {
      const models = prov.models || [];
      modelPresetSelect.innerHTML = models.map(m =>
        `<option value="${m.id}">${escapeHtml(m.name)}</option>`
      ).join('') + '<option value="__custom__">自訂模型 ID…</option>';

      const targetModel = keepModel && initialModel ? initialModel : prov.defaultModel;
      const isPreset = models.some(m => m.id === targetModel);
      if (isPreset) {
        modelPresetSelect.value = targetModel;
        if (modelCustomInput) modelCustomInput.style.display = 'none';
        GeminiAPI.setModel(targetModel);
      } else {
        modelPresetSelect.value = '__custom__';
        if (modelCustomInput) {
          modelCustomInput.style.display = '';
          modelCustomInput.value = targetModel;
        }
        GeminiAPI.setModel(targetModel);
      }
    }

    if (providerHint) providerHint.innerHTML = prov.hintHtml || '';
    if (input) {
      input.placeholder = prov.placeholder || 'API Key…';
      input.value = GeminiAPI.getApiKey();
    }
    if (statusEl) {
      statusEl.className = 'field-hint';
      statusEl.textContent = '';
    }
    updateSummary();
  }

  if (providerSelect) {
    providerSelect.value = providers[initialProvider] ? initialProvider : 'gemini';
    syncProviderUI(providerSelect.value, true);

    providerSelect.addEventListener('change', () => {
      const pId = providerSelect.value;
      syncProviderUI(pId, false);
      Store.save({ provider: pId, model: GeminiAPI.getModel(), baseUrl: GeminiAPI.getBaseUrl() });
    });
  }

  if (baseUrlInput) {
    baseUrlInput.addEventListener('input', () => {
      GeminiAPI.setBaseUrl(baseUrlInput.value);
      Store.save({ baseUrl: baseUrlInput.value.trim() });
    });
  }

  if (modelPresetSelect) {
    modelPresetSelect.addEventListener('change', () => {
      const val = modelPresetSelect.value;
      if (val === '__custom__') {
        if (modelCustomInput) {
          modelCustomInput.style.display = '';
          modelCustomInput.focus();
          GeminiAPI.setModel(modelCustomInput.value);
        }
      } else {
        if (modelCustomInput) modelCustomInput.style.display = 'none';
        GeminiAPI.setModel(val);
        Store.save({ model: val });
      }
    });
  }

  if (modelCustomInput) {
    modelCustomInput.addEventListener('input', () => {
      GeminiAPI.setModel(modelCustomInput.value);
      Store.save({ model: modelCustomInput.value.trim() });
    });
  }

  toggleBtn.addEventListener('click', () => {
    const isHidden = input.type === 'password';
    input.type = isHidden ? 'text' : 'password';
    toggleBtn.textContent = isHidden ? '隱藏' : '顯示';
  });

  input.addEventListener('input', () => {
    GeminiAPI.setApiKey(input.value);
    updateSummary();
    statusEl.className = 'field-hint';
    statusEl.textContent = '';
  });

  validateBtn.addEventListener('click', async () => {
    const key = input.value.trim();
    if (!key) {
      showToast('請輸入 API Key', '', 'warning');
      return;
    }

    validateBtn.disabled = true;
    validateBtn.textContent = '驗證中…';
    statusEl.className = 'field-hint';
    statusEl.textContent = '正在驗證…';

    try {
      const result = await GeminiAPI.validateApiKey(key);
      GeminiAPI.setApiKey(key);
      const isWarning = typeof result === 'object' && result?.warning;
      const msg = typeof result === 'object' ? result.message : (typeof result === 'string' ? result : `✓ ${GeminiAPI.getProviderInfo().name} API Key 有效`);
      statusEl.className = isWarning ? 'field-hint warning' : 'field-hint valid';
      statusEl.textContent = msg;
      showToast(isWarning ? 'API Key 驗證注意' : 'API Key 有效', msg, isWarning ? 'warning' : 'success', isWarning ? 6000 : 3000);
      updateSummary();
    } catch (err) {
      statusEl.className = 'field-hint invalid';
      statusEl.textContent = '✗ ' + err.message;
      showToast('API Key 驗證失敗', err.message, 'error');
    } finally {
      validateBtn.disabled = false;
      validateBtn.textContent = '驗證';
    }
  });
}

// =========================================================
// 檔案上傳
// =========================================================

function initFileUpload() {
  const zone = document.getElementById('uploadZone');
  const input = document.getElementById('fileInput');

  zone.addEventListener('dragover', e => {
    e.preventDefault();
    zone.classList.add('dragover');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('dragover');
    addFiles(Array.from(e.dataTransfer.files));
  });

  input.addEventListener('change', e => {
    addFiles(Array.from(e.target.files));
    input.value = '';
  });

  function addFiles(files) {
    for (const file of files) {
      if (AppState.uploadedFiles.find(f => f.name === file.name && f.size === file.size)) {
        showToast('檔案已存在', file.name, 'warning', 3000);
        continue;
      }
      AppState.uploadedFiles.push(file);
    }
    renderFileList();
    Store.saveFiles(AppState.uploadedFiles);
  }
}

function renderFileList() {
  const listEl = document.getElementById('fileList');
  listEl.innerHTML = '';
  if (typeof updateSummary === 'function') updateSummary();
  AppState.uploadedFiles.forEach((file, i) => {
    const item = document.createElement('div');
    item.className = 'file-item';
    item.innerHTML = `
      <span class="file-item-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>
      <span class="file-item-size">${FileParser.formatBytes(file.size)}</span>
      <button class="file-item-remove" data-idx="${i}" aria-label="移除 ${escapeHtml(file.name)}">×</button>
    `;
    item.querySelector('.file-item-remove').addEventListener('click', () => {
      AppState.uploadedFiles.splice(i, 1);
      renderFileList();
      Store.saveFiles(AppState.uploadedFiles);
    });
    listEl.appendChild(item);
  });
}

// =========================================================
// 目標校系
// =========================================================

function initSchoolEntries() {
  const container = document.getElementById('schoolEntries');
  const addBtn = document.getElementById('addSchoolBtn');

  function createEntry(univ = '', dept = '') {
    const div = document.createElement('div');
    div.className = 'school-entry';
    div.innerHTML = `
      <input class="school-input school-univ" type="text" placeholder="大學" autocomplete="off">
      <input class="school-input school-dept" type="text" placeholder="科系" autocomplete="off">
      <button class="school-remove" type="button" aria-label="移除">×</button>
    `;
    div.querySelector('.school-univ').value = univ;
    div.querySelector('.school-dept').value = dept;
    div.querySelector('.school-remove').addEventListener('click', () => {
      div.remove();
      updateSchoolState();
    });
    div.querySelectorAll('.school-input').forEach(el => {
      el.addEventListener('input', updateSchoolState);
    });
    return div;
  }

  const savedRaw = Store.load().schoolRaw;
  if (Array.isArray(savedRaw) && savedRaw.length) {
    savedRaw.forEach(r => container.appendChild(createEntry(r.univ || '', r.dept || '')));
  } else {
    container.appendChild(createEntry());
  }

  addBtn.addEventListener('click', () => {
    container.appendChild(createEntry());
  });

  function updateSchoolState() {
    AppState.schools = [];
    AppState.schoolRaw = [];
    container.querySelectorAll('.school-entry').forEach(entry => {
      const univ = entry.querySelector('.school-univ').value.trim();
      const dept = entry.querySelector('.school-dept').value.trim();
      AppState.schoolRaw.push({ univ, dept });
      if (univ || dept) {
        AppState.schools.push({
          university: univ || '（未指定）',
          department: dept || '（未指定）',
        });
      }
    });
    Store.save({ schoolRaw: AppState.schoolRaw });
    if (typeof updateSummary === 'function') updateSummary();
  }

  updateSchoolState();
  container.addEventListener('input', updateSchoolState);
}

// =========================================================
// 模式切換
// =========================================================

function setMode(mode, persist = true) {
  if (!MODES[mode]) mode = 'apply';
  AppState.mode = mode;
  document.querySelectorAll('.mode-tab').forEach(t => {
    const on = t.dataset.mode === mode;
    t.classList.toggle('active', on);
    t.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  document.getElementById('modeDesc').textContent = MODES[mode].desc;
  if (typeof updateSummary === 'function') updateSummary();
  document.getElementById('uploadLabel').textContent = MODES[mode].upload;
  document.getElementById('schoolGroup').classList.toggle('mode-hidden', !MODES[mode].needSchool);
  if (persist) Store.save({ mode });
}

function initModes() {
  document.querySelectorAll('.mode-tab').forEach(tab => {
    tab.addEventListener('click', () => setMode(tab.dataset.mode));
  });
  setMode(Store.load().mode || 'apply', false);
}

// =========================================================
// 載入狀態（僅顯示真實狀態與實際經過秒數，不做假進度）
// =========================================================

let _elapsedTimer = null;

function startElapsedTimer() {
  const el = document.getElementById('loadingElapsed');
  const t0 = Date.now();
  if (el) el.textContent = '0';
  stopElapsedTimer();
  _elapsedTimer = setInterval(() => {
    if (el) el.textContent = Math.floor((Date.now() - t0) / 1000);
  }, 500);
}

function stopElapsedTimer() {
  if (_elapsedTimer) { clearInterval(_elapsedTimer); _elapsedTimer = null; }
}

function setLoadingStatus(msg) {
  const el = document.getElementById('loadingStatus');
  if (el) el.textContent = msg;
}

// =========================================================
// 主分析流程
// =========================================================

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function progressHandler(prefix = '') {
  return (phase, detail) => {
    if (phase === 'sending') {
      setLoadingStatus(prefix + '正在發送分析請求…');
    } else if (phase === 'server_retry') {
      const sec = detail?.waitSec || 3;
      const attempt = detail?.attempt || 1;
      const max = detail?.maxAttempts || 3;
      const status = detail?.status || 503;
      setLoadingStatus(`${prefix}Gemini 伺服器忙碌中（${status}），${sec} 秒後自動重試（第 ${attempt}/${max} 次）…`);
    } else if (phase === 'retry') {
      setLoadingStatus(prefix + '正在重新整理分析結果…');
    }
  };
}

/**
 * 以給定的原始資料（source）跑一次分析並存成紀錄
 */
async function analyzeOnce({ mode, schools, criteria, source, fileNames, sourceId, parentId = null, groupId = null, prefix = '' }) {
  const result = await GeminiAPI.analyzePortfolio({
    portfolioText: source.text,
    imageParts: source.imageParts || [],
    schools,
    parseWarnings: source.warnings || [],
    mode,
    criteria,
    fileNames,
    onProgress: progressHandler(prefix),
  });
  setLoadingStatus(prefix + '正在儲存分析紀錄…');
  const record = {
    id: newId(),
    createdAt: Date.now(),
    mode,
    schools,
    criteria: criteria || '',
    fileNames,
    sourceId,
    parentId,
    groupId,
    note: '',
    tags: [],
    result,
  };
  await Store.addRecord(record);
  return record;
}

/**
 * 分析流程的共用外殼：載入畫面、錯誤處理、完成後導向結果或比較頁
 * job() 需回傳紀錄陣列
 */
async function withAnalysisUI(job) {
  if (AppState.isAnalyzing) return;
  AppState.isAnalyzing = true;
  const analyzeBtn = document.getElementById('analyzeBtn');
  analyzeBtn.disabled = true;
  analyzeBtn.textContent = '分析中…';
  showPage('loadingPage');
  startElapsedTimer();

  try {
    const records = await job();
    refreshHistoryCount();
    stopElapsedTimer();
    AppState.isAnalyzing = false; // 讓路由可切換頁面
    const target = records.length === 1
      ? '#result/' + records[0].id
      : '#compare/' + records.map(r => r.id).join(',');
    if (location.hash === target) route(); else location.hash = target;
  } catch (err) {
    stopElapsedTimer();
    AppState.isAnalyzing = false;
    route();
    showToast('分析未完成', sanitizeErrorMessage(err.message), 'error', 0);
    console.error('[Analysis Error]', err);
  } finally {
    AppState.isAnalyzing = false;
    analyzeBtn.disabled = false;
    analyzeBtn.textContent = '開始分析';
  }
}

function requireApiKey() {
  const apiKey = document.getElementById('apiKeyInput').value.trim() || GeminiAPI.getApiKey();
  if (!apiKey) {
    showToast('請先設定 API Key', `請在設定頁面輸入 ${GeminiAPI.getProviderInfo().name} API Key`, 'error');
    location.hash = '#settings';
    return false;
  }
  GeminiAPI.setApiKey(apiKey);
  return true;
}

async function startAnalysis() {
  if (AppState.isAnalyzing) return;
  if (!requireApiKey()) return;

  if (AppState.uploadedFiles.length === 0) {
    showToast('請上傳學習歷程', '至少上傳一個檔案才能開始分析', 'warning');
    return;
  }

  const mode = AppState.mode;
  const schools = MODES[mode].needSchool
    ? AppState.schools.filter(s => s.university !== '（未指定）' || s.department !== '（未指定）')
    : [];
  if (MODES[mode].needSchool && schools.length === 0) {
    showToast('請輸入目標校系', '至少填寫一組大學與科系', 'warning');
    return;
  }

  const criteria = MODES[mode].needSchool ? (AppState.criteria || '').trim() : '';
  const multi = MODES[mode].needSchool && schools.length > 1 && AppState.multiRun;
  if (multi && !confirm(`將為 ${schools.length} 個志願各分析一次（共呼叫 API ${schools.length} 次），確定嗎？`)) return;

  await withAnalysisUI(async () => {
    setLoadingStatus('正在解析上傳的檔案…');
    AppState.parsedResults = await FileParser.parseFiles(AppState.uploadedFiles);
    const { textParts, imageParts, warnings } = FileParser.summarizeForPrompt(AppState.parsedResults);

    if (textParts.length === 0 && imageParts.length === 0) {
      const details = AppState.parsedResults
        .filter(r => !r.success)
        .map(r => `${r.fileName}：${r.error}`)
        .join('\n');
      throw new Error('所有上傳的檔案都無法解析，請確認格式是否正確。\n\n' + details);
    }

    const fileNames = AppState.uploadedFiles.map(f => f.name);
    const source = { text: textParts.join('\n'), imageParts, warnings };
    const sourceId = newId();
    await Store.putSource(sourceId, source); // 供「換校系重評」重複使用，不必重新上傳

    const targets = multi ? schools.map(s => [s]) : [schools];
    const groupId = targets.length > 1 ? newId() : null;
    const records = [];
    const errors = [];
    for (let i = 0; i < targets.length; i++) {
      const prefix = targets.length > 1 ? `（${i + 1}/${targets.length}）` : '';
      try {
        records.push(await analyzeOnce({ mode, schools: targets[i], criteria, source, fileNames, sourceId, groupId, prefix }));
      } catch (err) {
        errors.push(err);
        if (targets.length === 1) throw err;
      }
    }
    if (!records.length) throw errors[0];
    if (errors.length) showToast('部分志願分析失敗', `${errors.length} 個志願未完成，已顯示成功的結果。`, 'warning', 8000);
    return records;
  });
}

/**
 * 將技術性錯誤訊息轉換為使用者友善版本
 */
function sanitizeErrorMessage(msg) {
  if (!msg) return '分析失敗，請稍後重試。';
  if (msg.includes('503') || msg.includes('服務暫時不可用') || msg.includes('伺服器目前忙碌')) {
    return 'Gemini 伺服器目前忙碌或無可用容量（HTTP 503），請稍候片刻後再次點擊「開始分析」。';
  }
  if (msg.includes('429') || msg.includes('使用量') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED')) {
    return '目前 API 使用量或請求頻率已達限制（HTTP 429），請稍候 30 秒再試，或更換 API Key。';
  }
  if (msg.includes('截斷') || msg.includes('長度上限') || msg.includes('MAX_TOKENS')) {
    return '學習歷程內容過長導致回應被截斷，請嘗試精簡內容或分批上傳。';
  }
  if (msg.includes('JSON') || msg.includes('position') || msg.includes('column') || msg.includes('parse')) {
    return 'AI 分析暫時無法完成，請稍後重新嘗試。';
  }
  if (msg.includes('fetch') || msg.includes('network') || msg.includes('Failed to fetch') || msg.includes('網路連線錯誤')) {
    return '網路連線錯誤，請確認網路連線正常後重試。';
  }
  return msg;
}

// =========================================================
// 結果頁渲染
// =========================================================

const ALL_SKILL_LABELS = {
  academic:         '學術能力',
  professional:     '專業能力',
  practical:        '實作能力',
  creativity:       '創造力',
  problem_solving:  '問題解決',
  self_learning:    '自主學習',
  communication:    '表達溝通',
  reflection:       '反思能力',
  interdisciplinary:'跨域能力',
  fit:              '校系契合',
};

let SKILL_LABELS = ALL_SKILL_LABELS;

function renderResult(data, schools, mode = 'apply', record = null) {
  const primary = schools[0] || { university: '—', department: '—' };
  const isSingle = mode === 'single';

  // 依模式顯示／隱藏區塊與能力維度
  SKILL_LABELS = Object.fromEntries(
    Object.entries(ALL_SKILL_LABELS).filter(([k]) => !(isSingle && k === 'fit'))
  );
  document.querySelectorAll('[data-modes]').forEach(el => {
    el.classList.toggle('mode-hidden', !el.dataset.modes.split(' ').includes(mode));
  });
  document.getElementById('resultModeLabel').textContent = '分析模式：' + (MODES[mode]?.label || '');

  // 1. 標題：校系模式顯示目標校系；單一歷程模式顯示檔案名稱
  const fileNames = record?.fileNames || [];
  document.getElementById('resultSchoolName').textContent = isSingle ? '單一學習歷程分析' : primary.university;
  document.getElementById('resultDeptName').textContent = isSingle
    ? (fileNames.join('、') || '—')
    : primary.department;
  document.getElementById('resultMeta').textContent = record
    ? new Date(record.createdAt).toLocaleString('zh-TW', { hour12: false })
      + (isSingle || !fileNames.length ? '' : ` · ${fileNames.length} 個檔案`)
    : '';

  // 切回「總覽」分頁
  activateResultTab('overview');

  // 2. 總分
  document.getElementById('resultScore').textContent = clamp(data.overall_score);
  document.getElementById('resultFitLevel').textContent = data.fit_analysis?.level || '—';

  // 3. 總結
  document.getElementById('resultSummary').textContent = data.summary || '';

  // AI 推論備注
  const noteEl = document.getElementById('inferenceNote');
  if (data.inference_note && data.inference_note.trim()) {
    noteEl.textContent = data.inference_note;
    noteEl.style.display = 'block';
  } else {
    noteEl.style.display = 'none';
  }

  // 4. 能力雷達
  renderRadarChart(data.skills);
  renderSkillList(data.skills);

  // 5. 優勢
  renderStrengths(data.strengths || []);

  // 6. 弱點
  renderWeaknesses(data.weaknesses || []);

  // 7. 關鍵要點
  renderKeyPoints(data.key_points || []);

  if (!isSingle) {
    // 8. 契合度
    renderFitAnalysis(data.fit_analysis);

    // 9. 教授觀點
    renderProfessorReviews(data.professor_reviews || []);

    // 10. 面試問題
    renderInterviewQuestions(data.interview_questions || []);
  }

  // 11. 改善建議
  renderImprovementPlan(data.improvement_plan || []);

  // 12. 檔案分析、備註標籤、模擬面試、重評按鈕
  renderResultExtras(data, mode, record);

  // 啟動條形動畫
  setTimeout(() => {
    document.querySelectorAll('.skill-bar-fill').forEach(el => {
      el.style.width = el.dataset.width || '0%';
    });
  }, 100);
}

// ---- 雷達圖 ----
let radarChartInstance = null;
let lastRadarSkills = null;

/** 依目前主題取得圖表配色 */
function chartPalette() {
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  return {
    dark,
    line: dark ? 'rgba(236,236,236,.85)' : 'rgba(17,17,17,.6)',
    fill: dark ? 'rgba(236,236,236,.10)' : 'rgba(17,17,17,.06)',
    label: dark ? '#b5b9c0' : '#555',
    tick: dark ? '#6b7079' : '#ccc',
    grid: dark ? 'rgba(255,255,255,.12)' : 'rgba(0,0,0,.07)',
  };
}

function renderRadarChart(skills) {
  if (!skills) return;
  lastRadarSkills = skills;
  const pal = chartPalette();
  const ctx = document.getElementById('radarChart').getContext('2d');
  const labels = Object.values(SKILL_LABELS);
  const values = Object.keys(SKILL_LABELS).map(k => clamp(skills[k]?.score));

  if (radarChartInstance) radarChartInstance.destroy();

  radarChartInstance = new Chart(ctx, {
    type: 'radar',
    data: {
      labels,
      datasets: [{
        label: '能力分析',
        data: values,
        backgroundColor: pal.fill,
        borderColor: pal.line,
        borderWidth: 1.5,
        pointBackgroundColor: pal.line,
        pointRadius: 3,
        pointHoverRadius: 5,
      }],
    },
    options: {
      responsive: true,
      animation: false,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: ctx => `${ctx.label}：${ctx.raw}` },
        },
      },
      scales: {
        r: {
          beginAtZero: true,
          min: 0,
          max: 100,
          ticks: {
            stepSize: 25,
            font: { size: 9 },
            color: pal.tick,
            backdropColor: 'transparent',
          },
          pointLabels: {
            font: { size: 10, family: 'inherit' },
            color: pal.label,
          },
          grid: { color: pal.grid },
          angleLines: { color: pal.grid },
        },
      },
    },
  });
}

// ---- 能力清單 ----
function renderSkillList(skills) {
  const container = document.getElementById('skillList');
  container.innerHTML = '';
  if (!skills) return;

  Object.entries(SKILL_LABELS).forEach(([key, label]) => {
    const item = skills[key];
    if (!item) return;
    const score = clamp(item.score);
    const div = document.createElement('div');
    div.className = 'skill-row';
    div.innerHTML = `
      <div class="skill-row-top">
        <span class="skill-name">${escapeHtml(label)}</span>
        <span class="skill-score">${score}</span>
      </div>
      <div class="skill-bar-bg">
        <div class="skill-bar-fill" data-width="${score}%" style="width:0%"></div>
      </div>
    `;
    container.appendChild(div);
  });
}

// ---- 優勢 ----
function renderStrengths(strengths) {
  const container = document.getElementById('strengthsList');
  container.innerHTML = '';
  if (!strengths.length) {
    container.innerHTML = '<p style="color:var(--text-3);font-size:.85rem">無優勢資料</p>';
    return;
  }
  strengths.forEach((s, i) => {
    const div = document.createElement('div');
    div.className = 'strength-item';
    div.innerHTML = `
      <div class="strength-num">${String(i + 1).padStart(2, '0')}</div>
      <div class="strength-title">${escapeHtml(s.title)}</div>
      ${s.evidence ? `<div class="strength-evidence">${escapeHtml(s.evidence)}</div>` : ''}
      ${s.value    ? `<div class="strength-value">${escapeHtml(s.value)}</div>` : ''}
    `;
    container.appendChild(div);
  });
}

// ---- 弱點 ----
const SEV_CLASS = { high: 'sev-high', medium: 'sev-medium', low: 'sev-low' };
const SEV_LABEL = { high: '嚴重程度高', medium: '嚴重程度中', low: '嚴重程度低' };

function renderWeaknesses(weaknesses) {
  const container = document.getElementById('weaknessesList');
  container.innerHTML = '';
  if (!weaknesses.length) {
    container.innerHTML = '<p style="color:var(--text-3);font-size:.85rem">無弱點資料</p>';
    return;
  }
  weaknesses.forEach((w, i) => {
    const sev = w.severity || 'medium';
    const div = document.createElement('div');
    div.className = 'weakness-item';
    div.innerHTML = `
      <div class="weakness-top">
        <span class="weakness-num">${String(i + 1).padStart(2, '0')}</span>
        <span class="weakness-title">${escapeHtml(w.problem)}</span>
        <span class="weakness-severity ${SEV_CLASS[sev] || 'sev-medium'}">${SEV_LABEL[sev] || ''}</span>
      </div>
      ${w.reason      ? `<div class="weakness-reason">${escapeHtml(w.reason)}</div>` : ''}
      ${w.improvement ? `<div class="weakness-fix">改善方向：${escapeHtml(w.improvement)}</div>` : ''}
    `;
    container.appendChild(div);
  });
}

// ---- 關鍵要點 ----
function renderKeyPoints(points) {
  const container = document.getElementById('keyPointsList');
  container.innerHTML = '';
  if (!points.length) return;
  const list = document.createElement('div');
  list.className = 'key-points';
  points.forEach((p, i) => {
    const div = document.createElement('div');
    div.className = 'key-point-item';
    div.innerHTML = `
      <span class="kp-index">${String(i + 1).padStart(2, '0')}</span>
      <span>${escapeHtml(p)}</span>
    `;
    list.appendChild(div);
  });
  container.appendChild(list);
}

// ---- 契合度 ----
function renderFitAnalysis(fit) {
  if (!fit) return;

  document.getElementById('fitScore').textContent = clamp(fit.score);
  document.getElementById('fitLevelBadge').textContent = fit.level || '—';

  // Reasons
  const reasonsEl = document.getElementById('fitReasonsList');
  reasonsEl.innerHTML = '';
  if (fit.reasons && fit.reasons.length) {
    const label = document.createElement('div');
    label.className = 'fit-label';
    label.textContent = '為什麼適合';
    reasonsEl.appendChild(label);
    const list = document.createElement('div');
    list.className = 'fit-list';
    (fit.reasons || []).forEach(r => {
      const item = document.createElement('div');
      item.className = 'fit-list-item';
      item.textContent = r;
      list.appendChild(item);
    });
    reasonsEl.appendChild(list);
  }

  // Gaps
  const gapsEl = document.getElementById('fitGapsList');
  gapsEl.innerHTML = '';
  if (fit.gaps && fit.gaps.length) {
    const label = document.createElement('div');
    label.className = 'fit-label';
    label.textContent = '仍有不足';
    gapsEl.appendChild(label);
    const list = document.createElement('div');
    list.className = 'fit-list';
    (fit.gaps || []).forEach(g => {
      const item = document.createElement('div');
      item.className = 'fit-list-item';
      item.textContent = g;
      list.appendChild(item);
    });
    gapsEl.appendChild(list);
  }
}

// ---- 教授觀點 ----
function renderProfessorReviews(reviews) {
  const tabsEl = document.getElementById('profTabs');
  const panelsEl = document.getElementById('profPanels');
  tabsEl.innerHTML = '';
  panelsEl.innerHTML = '';

  reviews.forEach((rev, i) => {
    // Tab
    const tab = document.createElement('button');
    tab.className = `prof-tab${i === 0 ? ' active' : ''}`;
    tab.setAttribute('role', 'tab');
    tab.textContent = rev.type_name || rev.type || `教授 ${i + 1}`;
    tab.addEventListener('click', () => {
      tabsEl.querySelectorAll('.prof-tab').forEach(t => t.classList.remove('active'));
      panelsEl.querySelectorAll('.prof-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      panelsEl.children[i]?.classList.add('active');
    });
    tabsEl.appendChild(tab);

    // Panel
    const panel = document.createElement('div');
    panel.className = `prof-panel${i === 0 ? ' active' : ''}`;
    const score = clamp(rev.score);

    const positiveHtml = (rev.positive || []).map(p =>
      `<div class="prof-block-item">${escapeHtml(p)}</div>`
    ).join('');
    const concernsHtml = (rev.concerns || []).map(c =>
      `<div class="prof-block-item">${escapeHtml(c)}</div>`
    ).join('');
    const questionsHtml = (rev.questions || []).map(q => `
      <div class="prof-q-item">
        <div class="prof-q-text">${escapeHtml(q.question || '')}</div>
        ${q.why ? `<div class="prof-q-why">${escapeHtml(q.why)}</div>` : ''}
      </div>
    `).join('');

    panel.innerHTML = `
      <div class="prof-panel-header">
        <div class="prof-panel-name">${escapeHtml(rev.type_name || rev.type)}</div>
        <div class="prof-score">${score} / 100</div>
      </div>
      ${rev.focus ? `<div class="prof-panel-focus">${escapeHtml(rev.focus)}</div>` : ''}
      <div class="prof-grid">
        <div>
          <div class="prof-block-title">教授可能欣賞</div>
          <div class="prof-block-list">${positiveHtml || '<div class="prof-block-item">（無資料）</div>'}</div>
        </div>
        <div>
          <div class="prof-block-title">教授可能疑慮</div>
          <div class="prof-block-list">${concernsHtml || '<div class="prof-block-item">（無資料）</div>'}</div>
        </div>
      </div>
      ${rev.impression ? `<div class="prof-impression">「${escapeHtml(rev.impression)}」</div>` : ''}
      ${questionsHtml ? `
        <div class="prof-q-section">
          <div class="prof-q-title">可能追問</div>
          <div class="prof-q-list">${questionsHtml}</div>
        </div>
      ` : ''}
    `;
    panelsEl.appendChild(panel);
  });
}

// ---- 面試問題 ----
function renderInterviewQuestions(questions) {
  const container = document.getElementById('interviewList');
  container.innerHTML = '';
  const list = document.createElement('div');
  list.className = 'interview-list';

  questions.forEach((q, i) => {
    const question = typeof q === 'string' ? q : (q.question || '');
    const why = typeof q === 'object' ? (q.why || '') : '';

    const item = document.createElement('div');
    item.className = 'interview-item';
    item.innerHTML = `
      <div class="interview-q">
        <span class="interview-num">${String(i + 1).padStart(2, '0')}</span>
        <span class="interview-text">${escapeHtml(question)}</span>
        ${why ? '<span class="interview-chevron">▾</span>' : ''}
      </div>
      ${why ? `<div class="interview-reason">${escapeHtml(why)}</div>` : ''}
    `;
    if (why) {
      item.querySelector('.interview-q').addEventListener('click', () => {
        item.classList.toggle('open');
      });
    }
    list.appendChild(item);
  });
  container.appendChild(list);
}

// ---- 改善建議 ----
const PRIORITY_CLASS = { P0: 'p0', P1: 'p1', P2: 'p2', P3: '' };
const PRIORITY_LABEL = { P0: '最優先', P1: '第二優先', P2: '第三優先', P3: '長期' };

function renderImprovementPlan(plan) {
  const container = document.getElementById('improvementList');
  container.innerHTML = '';
  const list = document.createElement('div');
  list.className = 'improvement-list';

  // 最多顯示 5 項
  const limited = plan.slice(0, 5);

  limited.forEach(item => {
    const p = item.priority || 'P2';
    const div = document.createElement('div');
    div.className = 'improvement-item';
    div.innerHTML = `
      <span class="improvement-priority ${PRIORITY_CLASS[p] || ''}">${PRIORITY_LABEL[p] || p}</span>
      <div class="improvement-content">
        <div class="improvement-title">${escapeHtml(item.title)}</div>
        ${item.description ? `<div class="improvement-desc">${escapeHtml(item.description)}</div>` : ''}
      </div>
    `;
    list.appendChild(div);
  });
  container.appendChild(list);
}

// =========================================================
// 結果分頁
// =========================================================

function activateResultTab(panel) {
  document.querySelectorAll('.result-tab').forEach(t => t.classList.toggle('active', t.dataset.panel === panel));
  document.querySelectorAll('.result-panel').forEach(p => p.classList.toggle('active', p.dataset.panel === panel));
  // 雷達圖在隱藏狀態下尺寸為 0，切換顯示後需重新計算
  if (panel === 'skills' && radarChartInstance) radarChartInstance.resize();
}

function initResultTabs() {
  document.querySelectorAll('.result-tab').forEach(tab => {
    tab.addEventListener('click', () => activateResultTab(tab.dataset.panel));
  });
}

// =========================================================
// 側欄摘要
// =========================================================

function updateSummary() {
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  const m = MODES[AppState.mode];
  set('sumMode', m.label);
  set('sumFiles', AppState.uploadedFiles.length + ' 個');
  const first = AppState.schools[0];
  set('sumSchool', m.needSchool ? (first ? `${first.university} ${first.department}` : '尚未填寫') : '不需要');
  const provName = GeminiAPI.getProviderInfo().name;
  set('sumKey', GeminiAPI.hasApiKey() ? `已設定 (${provName})` : '未設定');
  if (typeof updateMultiRunVisibility === 'function') updateMultiRunVisibility();
}

// =========================================================
// 歷史紀錄
// =========================================================

async function refreshHistoryCount() {
  const list = await Store.listRecords();
  const el = document.getElementById('historyCount');
  if (el) el.textContent = list.length ? list.length : '';
  return list;
}

function recordTitle(rec) {
  if (rec.mode === 'single') return rec.fileNames?.[0] ? `單一學習歷程：${rec.fileNames[0]}` : '單一學習歷程分析';
  const s = rec.schools?.[0];
  return s ? `${s.university}　${s.department}` : '未指定校系';
}

// =========================================================
// 路由（以 URL hash 區分頁面，重新整理後仍停留原頁）
// =========================================================

const VIEW_PAGE = { analyze: 'homePage', history: 'historyPage', settings: 'settingsPage' };

async function route() {
  if (AppState.isAnalyzing) return; // 分析中維持載入畫面
  const hash = location.hash.replace(/^#/, '') || 'analyze';
  const [view, arg] = hash.split('/');

  let navView = view;
  if (view === 'result') {
    navView = 'history';
    const rec = arg ? await Store.getRecord(arg) : null;
    if (!rec) {
      showToast('找不到這筆紀錄', '可能已被刪除', 'warning', 3000);
      location.hash = '#history';
      return;
    }
    // 向下相容：舊紀錄可能缺少 mode / schools / fileNames 欄位
    const mode = MODES[rec.mode] ? rec.mode : 'apply';
    AppState.analysisResult = rec.result;
    AppState.resultMode = mode;
    AppState.currentRecord = rec;
    renderResult(rec.result || {}, Array.isArray(rec.schools) ? rec.schools : [], mode, rec);
    showPage('resultPage');
    if (AppState.pendingExport === rec.id) {
      AppState.pendingExport = null;
      setTimeout(openExportDialog, 600);
    }
  } else if (view === 'compare') {
    navView = 'history';
    const ok = await renderComparePage((arg || '').split(',').filter(Boolean));
    if (!ok) {
      showToast('無法比較', '需要至少兩筆存在的紀錄', 'warning', 3000);
      location.hash = '#history';
      return;
    }
    showPage('comparePage');
    refreshCompareChart();
  } else if (VIEW_PAGE[view]) {
    if (view === 'history') await renderHistory();
    if (view === 'analyze') updateSummary();
    showPage(VIEW_PAGE[view]);
  } else {
    location.hash = '#analyze';
    return;
  }

  document.querySelectorAll('.nav-link').forEach(l => {
    l.classList.toggle('active', l.dataset.view === navView);
  });
}

// =========================================================
// PDF 匯出（使用瀏覽器列印→另存為 PDF；列印樣式會展開所有分頁）
// =========================================================

function printReport() {
  const rec = AppState.currentRecord;
  const prevTitle = document.title;
  if (rec) {
    const d = new Date(rec.createdAt);
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    document.title = `學習歷程評估_${recordTitle(rec).replace(/[\\/:*?"<>|\s]+/g, '_')}_${stamp}`;
  }
  printWithLightTheme();
  document.title = prevTitle;
}

/** 列印一律使用淺色主題（暫時切換後還原） */
function printWithLightTheme() {
  const wasDark = document.documentElement.getAttribute('data-theme') === 'dark';
  if (wasDark) setTheme('light', false);
  document.querySelectorAll('.skill-bar-fill').forEach(el => { el.style.width = el.dataset.width || '0%'; });
  if (radarChartInstance) radarChartInstance.resize();
  window.print();
  if (wasDark) setTheme('dark', false);
}

// =========================================================
// 主題（深色／淺色）
// =========================================================

function setTheme(theme, persist = true) {
  document.documentElement.setAttribute('data-theme', theme);
  if (persist) Store.save({ theme });
  const btn = document.getElementById('themeToggle');
  if (btn) btn.textContent = theme === 'dark' ? '☀' : '◐';
  if (radarChartInstance && lastRadarSkills) renderRadarChart(lastRadarSkills);
  if (typeof refreshCompareChart === 'function') refreshCompareChart();
}

function initTheme() {
  const btn = document.getElementById('themeToggle');
  const cur = document.documentElement.getAttribute('data-theme') || 'light';
  setTheme(cur, false);
  btn.addEventListener('click', () => {
    setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  });
}

// =========================================================
// 設定頁與資料管理
// =========================================================

function initDataControls() {
  document.getElementById('clearHistoryBtn').addEventListener('click', async () => {
    if (!confirm('確定清除全部歷史紀錄？此操作無法復原。')) return;
    await Store.clearHistory();
    renderHistory();
  });

  document.getElementById('clearAllBtn').addEventListener('click', async () => {
    if (!confirm('這會刪除所有歷史紀錄、已上傳檔案與 API Key，確定嗎？')) return;
    await Store.clearAll();
    AppState.uploadedFiles = [];
    document.getElementById('apiKeyInput').value = '';
    GeminiAPI.setApiKey('');
    renderFileList();
    refreshHistoryCount();
    updateSummary();
    showToast('已清除所有本機資料', '', 'success', 3000);
  });
}

async function restoreFiles() {
  const files = await Store.loadFiles();
  if (files.length) {
    AppState.uploadedFiles = files;
    renderFileList();
  }
}

// =========================================================
// 初始化
// =========================================================
document.addEventListener('DOMContentLoaded', () => {
  initApiKey();
  initFileUpload();
  initSchoolEntries();
  initModes();
  initResultTabs();
  initDataControls();
  initTheme();
  initFeatures();

  document.getElementById('analyzeBtn').addEventListener('click', startAnalysis);
  document.getElementById('exportPdfBtn').addEventListener('click', openExportDialog);
  document.getElementById('backBtn').addEventListener('click', () => { location.hash = '#analyze'; });
  window.addEventListener('hashchange', route);

  updateSummary();
  route();
  restoreFiles();
  refreshHistoryCount();
});
