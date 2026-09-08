/* =========================================================
   app.js — 主應用程式邏輯
   ========================================================= */

'use strict';

// ---- 全域狀態 ----
const AppState = {
  uploadedFiles: [],
  parsedResults: [],
  schools: [],
  analysisResult: null,
  isAnalyzing: false,
};

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
  const input = document.getElementById('apiKeyInput');
  const toggleBtn = document.getElementById('apiKeyToggle');
  const statusEl = document.getElementById('apiKeyStatus');
  const validateBtn = document.getElementById('apiKeyValidate');

  toggleBtn.addEventListener('click', () => {
    const isHidden = input.type === 'password';
    input.type = isHidden ? 'text' : 'password';
    toggleBtn.textContent = isHidden ? '隱藏' : '顯示';
  });

  input.addEventListener('input', () => {
    GeminiAPI.setApiKey(input.value);
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
      await GeminiAPI.validateApiKey(key);
      GeminiAPI.setApiKey(key);
      statusEl.className = 'field-hint valid';
      statusEl.textContent = '✓ API Key 有效';
      showToast('API Key 有效', '可以開始分析', 'success', 3000);
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
  }
}

function renderFileList() {
  const listEl = document.getElementById('fileList');
  listEl.innerHTML = '';
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

  function createEntry() {
    const div = document.createElement('div');
    div.className = 'school-entry';
    div.innerHTML = `
      <input class="school-input school-univ" type="text" placeholder="大學" autocomplete="off">
      <input class="school-input school-dept" type="text" placeholder="科系" autocomplete="off">
      <button class="school-remove" type="button" aria-label="移除">×</button>
    `;
    div.querySelector('.school-remove').addEventListener('click', () => {
      div.remove();
      updateSchoolState();
    });
    div.querySelectorAll('.school-input').forEach(el => {
      el.addEventListener('input', updateSchoolState);
    });
    return div;
  }

  container.appendChild(createEntry());

  addBtn.addEventListener('click', () => {
    container.appendChild(createEntry());
  });

  function updateSchoolState() {
    AppState.schools = [];
    container.querySelectorAll('.school-entry').forEach(entry => {
      const univ = entry.querySelector('.school-univ').value.trim();
      const dept = entry.querySelector('.school-dept').value.trim();
      if (univ || dept) {
        AppState.schools.push({
          university: univ || '（未指定）',
          department: dept || '（未指定）',
        });
      }
    });
  }

  updateSchoolState();
  container.addEventListener('input', updateSchoolState);
}

// =========================================================
// Loading 動畫
// =========================================================

const LOADING_STEPS = [
  { id: 'ls-read',         text: '讀取學習歷程檔案' },
  { id: 'ls-academic',     text: '分析學術與專業能力' },
  { id: 'ls-fit',          text: '比對目標校系特性' },
  { id: 'ls-professor',    text: '模擬教授閱讀觀點' },
  { id: 'ls-report',       text: '整理完整評估報告' },
];

let _loadingTimer = null;

function startLoadingAnimation() {
  const stepsEl = document.getElementById('loadingSteps');
  stepsEl.innerHTML = LOADING_STEPS.map(s =>
    `<div class="loading-step" id="${s.id}">${escapeHtml(s.text)}</div>`
  ).join('');

  let cur = 0;
  const interval = 8000 / LOADING_STEPS.length;

  function tick() {
    if (cur > 0) {
      const prev = document.getElementById(LOADING_STEPS[cur - 1].id);
      if (prev) { prev.classList.remove('active'); prev.classList.add('done'); }
    }
    if (cur < LOADING_STEPS.length) {
      const curr = document.getElementById(LOADING_STEPS[cur].id);
      if (curr) curr.classList.add('active');
      const subEl = document.getElementById('loadingStatus');
      if (subEl) subEl.textContent = LOADING_STEPS[cur].text + '…';
    }
    cur++;
    if (cur <= LOADING_STEPS.length) {
      _loadingTimer = setTimeout(tick, interval);
    }
  }
  tick();
}

function stopLoadingAnimation() {
  if (_loadingTimer) { clearTimeout(_loadingTimer); _loadingTimer = null; }
  LOADING_STEPS.forEach(s => {
    const el = document.getElementById(s.id);
    if (el) { el.classList.remove('active'); el.classList.add('done'); }
  });
}

function setLoadingStatus(msg) {
  const el = document.getElementById('loadingStatus');
  if (el) el.textContent = msg;
}

// =========================================================
// 主分析流程
// =========================================================

async function startAnalysis() {
  if (AppState.isAnalyzing) return;

  // 前置檢查
  const apiKey = document.getElementById('apiKeyInput').value.trim();
  if (!apiKey) {
    showToast('請輸入 API Key', 'Gemini API Key 為必填', 'error');
    document.getElementById('apiKeyInput').focus();
    return;
  }
  GeminiAPI.setApiKey(apiKey);

  if (AppState.uploadedFiles.length === 0) {
    showToast('請上傳學習歷程', '至少上傳一個檔案才能開始分析', 'warning');
    return;
  }

  const schools = AppState.schools.filter(s =>
    s.university !== '（未指定）' || s.department !== '（未指定）'
  );
  if (schools.length === 0) {
    showToast('請輸入目標校系', '至少填寫一組大學與科系', 'warning');
    return;
  }

  // 開始分析
  AppState.isAnalyzing = true;
  const analyzeBtn = document.getElementById('analyzeBtn');
  analyzeBtn.disabled = true;
  analyzeBtn.textContent = '分析中…';

  showPage('loadingPage');
  startLoadingAnimation();

  try {
    // 步驟 1：解析檔案
    setLoadingStatus('讀取學習歷程檔案…');
    AppState.parsedResults = await FileParser.parseFiles(AppState.uploadedFiles);
    const { textParts, imageParts, warnings } = FileParser.summarizeForPrompt(AppState.parsedResults);

    if (textParts.length === 0 && imageParts.length === 0) {
      const details = AppState.parsedResults
        .filter(r => !r.success)
        .map(r => `${r.fileName}：${r.error}`)
        .join('\n');
      throw new Error('所有上傳的檔案都無法解析，請確認格式是否正確。\n\n' + details);
    }

    const portfolioText = textParts.join('\n');

    // 步驟 2：呼叫 Gemini（含自動 Retry 與伺服器退避重試）
    const result = await GeminiAPI.analyzePortfolio({
      portfolioText,
      imageParts,
      schools,
      parseWarnings: warnings,
      onProgress: (phase, detail) => {
        if (phase === 'sending') {
          setLoadingStatus('正在發送分析請求…');
        } else if (phase === 'server_retry') {
          const sec = detail?.waitSec || 3;
          const attempt = detail?.attempt || 1;
          const max = detail?.maxAttempts || 3;
          const status = detail?.status || 503;
          setLoadingStatus(`Gemini 伺服器忙碌中（${status}），${sec} 秒後自動重試（第 ${attempt}/${max} 次）…`);
        } else if (phase === 'retry') {
          setLoadingStatus('正在重新整理分析結果…');
        }
      },
    });

    AppState.analysisResult = result;
    AppState.analysisResult._schools = schools;

    stopLoadingAnimation();
    await new Promise(r => setTimeout(r, 400));

    renderResult(result, schools);
    showPage('resultPage');

    // 顯示「新的評估」按鈕
    const newBtn = document.getElementById('newAnalysisBtn');
    if (newBtn) newBtn.style.display = '';

  } catch (err) {
    stopLoadingAnimation();
    showPage('homePage');
    // 轉換為使用者友善訊息
    const userMsg = sanitizeErrorMessage(err.message);
    showToast('分析未完成', userMsg, 'error', 0);
    console.error('[Analysis Error]', err);
  } finally {
    AppState.isAnalyzing = false;
    analyzeBtn.disabled = false;
    analyzeBtn.textContent = '開始分析';
  }
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

const SKILL_LABELS = {
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

function renderResult(data, schools) {
  const primary = schools[0] || { university: '—', department: '—' };

  // 1. 目標校系
  document.getElementById('resultSchoolName').textContent = primary.university;
  document.getElementById('resultDeptName').textContent = primary.department;

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

  // 8. 契合度
  renderFitAnalysis(data.fit_analysis);

  // 9. 教授觀點
  renderProfessorReviews(data.professor_reviews || []);

  // 10. 面試問題
  renderInterviewQuestions(data.interview_questions || []);

  // 11. 改善建議
  renderImprovementPlan(data.improvement_plan || []);

  // 啟動條形動畫
  setTimeout(() => {
    document.querySelectorAll('.skill-bar-fill').forEach(el => {
      el.style.width = el.dataset.width || '0%';
    });
  }, 100);
}

// ---- 雷達圖 ----
let radarChartInstance = null;

function renderRadarChart(skills) {
  if (!skills) return;
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
        backgroundColor: 'rgba(17,17,17,.06)',
        borderColor: 'rgba(17,17,17,.6)',
        borderWidth: 1.5,
        pointBackgroundColor: 'rgba(17,17,17,.6)',
        pointRadius: 3,
        pointHoverRadius: 5,
      }],
    },
    options: {
      responsive: true,
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
            color: '#ccc',
            backdropColor: 'transparent',
          },
          pointLabels: {
            font: { size: 10, family: 'inherit' },
            color: '#555',
          },
          grid: { color: 'rgba(0,0,0,.07)' },
          angleLines: { color: 'rgba(0,0,0,.07)' },
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
// 重置
// =========================================================

function resetApp() {
  AppState.uploadedFiles = [];
  AppState.parsedResults = [];
  AppState.schools = [];
  AppState.analysisResult = null;
  AppState.isAnalyzing = false;

  document.getElementById('fileList').innerHTML = '';
  document.getElementById('inferenceNote').style.display = 'none';

  if (radarChartInstance) { radarChartInstance.destroy(); radarChartInstance = null; }

  const newBtn = document.getElementById('newAnalysisBtn');
  if (newBtn) newBtn.style.display = 'none';

  showPage('homePage');
}

// =========================================================
// 初始化
// =========================================================
document.addEventListener('DOMContentLoaded', () => {
  initApiKey();
  initFileUpload();
  initSchoolEntries();

  document.getElementById('analyzeBtn').addEventListener('click', startAnalysis);
  document.getElementById('backBtn').addEventListener('click', resetApp);
  document.getElementById('newAnalysisBtn').addEventListener('click', resetApp);
});
