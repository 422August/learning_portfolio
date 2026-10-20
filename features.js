/* =========================================================
   features.js — 進階功能
   歷史搜尋／備註標籤、紀錄比較、換校系重評、審查重點、
   檔案層級分析、模擬面試、PDF 章節選擇
   依賴 app.js 的全域物件（AppState、Store、MODES…）
   ========================================================= */

'use strict';

// =========================================================
// Modal
// =========================================================

let _modalOnOk = null;

function openModal({ title, body, okText = '確定', cancelText = '取消', hideCancel = false, onOk }) {
  const modal = document.getElementById('modal');
  document.getElementById('modalTitle').textContent = title;
  const bodyEl = document.getElementById('modalBody');
  bodyEl.innerHTML = '';
  if (typeof body === 'string') bodyEl.innerHTML = body; else bodyEl.appendChild(body);
  const ok = document.getElementById('modalOk');
  const cancel = document.getElementById('modalCancel');
  ok.textContent = okText;
  cancel.textContent = cancelText;
  cancel.style.display = hideCancel ? 'none' : '';
  ok.disabled = false;
  _modalOnOk = onOk || null;
  modal.hidden = false;
  document.body.classList.add('modal-open');
  const first = bodyEl.querySelector('input, textarea, select');
  if (first) setTimeout(() => first.focus(), 30);
}

function closeModal() {
  document.getElementById('modal').hidden = true;
  document.body.classList.remove('modal-open');
  _modalOnOk = null;
}

function initModal() {
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('modalCancel').addEventListener('click', closeModal);
  document.getElementById('modal').addEventListener('mousedown', e => {
    if (e.target.id === 'modal') closeModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !document.getElementById('modal').hidden) closeModal();
  });
  document.getElementById('modalOk').addEventListener('click', async () => {
    if (!_modalOnOk) return closeModal();
    const okBtn = document.getElementById('modalOk');
    okBtn.disabled = true;
    try {
      const keepOpen = await _modalOnOk();
      if (keepOpen !== false) closeModal();
    } finally {
      okBtn.disabled = false;
    }
  });
}

// =========================================================
// 分析頁：審查重點、多志願
// =========================================================

function initAnalyzeExtras() {
  const saved = Store.load();
  const criteriaEl = document.getElementById('criteriaInput');
  const multiEl = document.getElementById('multiRunInput');

  AppState.criteria = saved.criteria || '';
  AppState.multiRun = Boolean(saved.multiRun);
  criteriaEl.value = AppState.criteria;
  multiEl.checked = AppState.multiRun;

  criteriaEl.addEventListener('input', () => {
    AppState.criteria = criteriaEl.value;
    Store.save({ criteria: criteriaEl.value });
  });
  multiEl.addEventListener('change', () => {
    AppState.multiRun = multiEl.checked;
    Store.save({ multiRun: multiEl.checked });
  });
  updateMultiRunVisibility();
}

function updateMultiRunVisibility() {
  const row = document.getElementById('multiRunRow');
  if (!row) return;
  const show = MODES[AppState.mode].needSchool && AppState.schools.length > 1;
  row.style.display = show ? '' : 'none';
}

// =========================================================
// 歷史紀錄：搜尋、篩選、排序、備註與標籤、選取比較
// =========================================================

const HistoryUI = { selected: new Set(), search: '', mode: '', sort: 'new' };
const MAX_COMPARE = 6;

function parseTags(str) {
  return Array.from(new Set(
    String(str || '').split(/[,，、\n]/).map(t => t.trim()).filter(Boolean)
  )).slice(0, 10);
}

function recordSearchText(rec) {
  return [
    recordTitle(rec),
    MODES[rec.mode]?.label || '',
    rec.note || '',
    (rec.tags || []).join(' '),
    (rec.fileNames || []).join(' '),
    (rec.schools || []).map(s => `${s.university} ${s.department}`).join(' '),
  ].join(' ').toLowerCase();
}

function updateCompareButton() {
  const btn = document.getElementById('compareBtn');
  if (!btn) return;
  const n = HistoryUI.selected.size;
  btn.disabled = n < 2;
  btn.textContent = n ? `比較所選（${n}）` : '比較所選';
}

async function renderHistory() {
  const container = document.getElementById('historyList');
  const all = await refreshHistoryCount();
  document.getElementById('clearHistoryBtn').style.display = all.length ? '' : 'none';
  document.getElementById('historyToolbar').style.display = all.length ? '' : 'none';

  // 移除已不存在的選取
  const ids = new Set(all.map(r => r.id));
  HistoryUI.selected.forEach(id => { if (!ids.has(id)) HistoryUI.selected.delete(id); });
  updateCompareButton();

  container.innerHTML = '';
  if (!all.length) {
    container.innerHTML = '<div class="history-empty">尚無分析紀錄。完成第一次分析後會顯示在這裡。</div>';
    return;
  }

  const q = HistoryUI.search.trim().toLowerCase();
  let list = all.filter(r =>
    (!HistoryUI.mode || (r.mode || 'apply') === HistoryUI.mode) &&
    (!q || recordSearchText(r).includes(q))
  );
  if (HistoryUI.sort === 'old') list.sort((a, b) => a.createdAt - b.createdAt);
  else if (HistoryUI.sort === 'score') list.sort((a, b) => clamp(b.result?.overall_score) - clamp(a.result?.overall_score));

  if (!list.length) {
    container.innerHTML = '<div class="history-empty">沒有符合條件的紀錄。</div>';
    return;
  }

  list.forEach(rec => {
    const mode = MODES[rec.mode] ? rec.mode : 'apply';
    const item = document.createElement('div');
    item.className = 'history-item' + (HistoryUI.selected.has(rec.id) ? ' selected' : '');
    const date = new Date(rec.createdAt).toLocaleString('zh-TW', { hour12: false });
    const tags = (rec.tags || []).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('');
    item.innerHTML = `
      <label class="history-check" title="選取以比較">
        <input type="checkbox" data-act="select" ${HistoryUI.selected.has(rec.id) ? 'checked' : ''}>
      </label>
      <div class="history-score">
        <div class="history-score-num">${clamp(rec.result?.overall_score)}</div>
        <div class="history-score-unit">/ 100</div>
      </div>
      <div class="history-body">
        <div class="history-title">${escapeHtml(recordTitle(rec))}</div>
        <div class="history-meta"><span class="history-badge">${escapeHtml(MODES[mode].label)}</span>${rec.groupId ? '<span class="history-badge">多志願</span>' : ''}${rec.parentId ? '<span class="history-badge">重評</span>' : ''}${escapeHtml(date)} · ${(rec.fileNames || []).length} 個檔案</div>
        ${rec.note ? `<div class="history-note">${escapeHtml(rec.note)}</div>` : ''}
        ${tags ? `<div class="tag-row">${tags}</div>` : ''}
      </div>
      <div class="history-actions">
        <button class="btn-ghost" data-act="open" type="button">查看</button>
        <button class="btn-ghost" data-act="note" type="button">備註</button>
        <button class="btn-ghost" data-act="pdf" type="button">匯出 PDF</button>
        <button class="btn-ghost danger" data-act="delete" type="button">刪除</button>
      </div>
    `;
    item.addEventListener('click', async e => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'select') {
        e.stopPropagation();
        if (e.target.checked) {
          if (HistoryUI.selected.size >= MAX_COMPARE) {
            e.target.checked = false;
            showToast('最多比較 ' + MAX_COMPARE + ' 筆', '', 'warning', 2500);
            return;
          }
          HistoryUI.selected.add(rec.id);
        } else {
          HistoryUI.selected.delete(rec.id);
        }
        item.classList.toggle('selected', e.target.checked);
        updateCompareButton();
        return;
      }
      if (e.target.closest('.history-check')) return;
      if (act === 'pdf') {
        AppState.pendingExport = rec.id;
        location.hash = '#result/' + rec.id;
        return;
      }
      if (act === 'note') { openNoteEditor(rec); return; }
      if (act === 'delete') {
        if (confirm('確定刪除這筆紀錄？')) {
          HistoryUI.selected.delete(rec.id);
          await Store.deleteRecord(rec.id);
          renderHistory();
        }
        return;
      }
      location.hash = '#result/' + rec.id;
    });
    container.appendChild(item);
  });
}

function initHistoryControls() {
  const search = document.getElementById('historySearch');
  let timer = null;
  search.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => { HistoryUI.search = search.value; renderHistory(); }, 150);
  });
  document.getElementById('historyMode').addEventListener('change', e => {
    HistoryUI.mode = e.target.value; renderHistory();
  });
  document.getElementById('historySort').addEventListener('change', e => {
    HistoryUI.sort = e.target.value; renderHistory();
  });
  document.getElementById('compareBtn').addEventListener('click', () => {
    if (HistoryUI.selected.size < 2) return;
    location.hash = '#compare/' + Array.from(HistoryUI.selected).join(',');
  });
}

// ---- 備註與標籤 ----
function openNoteEditor(rec) {
  const body = document.createElement('div');
  body.className = 'modal-form';
  body.innerHTML = `
    <label class="subfield-label" for="noteInput">備註</label>
    <textarea id="noteInput" class="field-textarea" rows="3" placeholder="例如：v2，已改寫自傳"></textarea>
    <label class="subfield-label" for="tagsInput">標籤（以逗號分隔）</label>
    <input id="tagsInput" class="field-input" placeholder="例如：第一版, 資工, 修改後">
  `;
  body.querySelector('#noteInput').value = rec.note || '';
  body.querySelector('#tagsInput').value = (rec.tags || []).join(', ');
  openModal({
    title: '備註與標籤',
    body,
    okText: '儲存',
    onOk: async () => {
      const patch = {
        note: body.querySelector('#noteInput').value.trim().slice(0, 500),
        tags: parseTags(body.querySelector('#tagsInput').value),
      };
      const updated = await Store.updateRecord(rec.id, patch);
      if (AppState.currentRecord?.id === rec.id && updated) {
        AppState.currentRecord = updated;
        renderResultMeta(updated);
      }
      if (location.hash.startsWith('#history')) renderHistory();
    },
  });
}

function renderResultMeta(record) {
  const el = document.getElementById('resultTags');
  if (!el) return;
  const tags = (record?.tags || []).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('');
  el.innerHTML = (record?.note ? `<div class="result-note-text">${escapeHtml(record.note)}</div>` : '')
    + (tags ? `<div class="tag-row">${tags}</div>` : '');
}

// =========================================================
// 結果頁附加內容
// =========================================================

function renderResultExtras(data, mode, record) {
  AppState.currentRecord = record || AppState.currentRecord;
  renderResultMeta(record);
  renderFileAnalysis(data.file_analysis || []);
  renderPractice(data, mode, record);

  // 換校系重評：需要保存的原始資料（舊紀錄沒有）
  const btn = document.getElementById('reanalyzeBtn');
  if (btn) {
    btn.disabled = true;
    btn.title = '';
    if (!record?.sourceId) {
      btn.title = '此紀錄建立於舊版本，沒有保存原始資料，無法重評';
    } else {
      Store.getSource(record.sourceId).then(src => {
        if (AppState.currentRecord?.id !== record.id) return;
        btn.disabled = !src;
        btn.title = src ? '' : '原始資料已不存在，無法重評';
      });
    }
  }
}

// ---- 檔案層級分析 ----
function renderFileAnalysis(items) {
  const tab = document.querySelector('.result-tab[data-panel="files"]');
  const panel = document.querySelector('.result-panel[data-panel="files"]');
  const list = document.getElementById('fileAnalysisList');
  const empty = !items.length;
  tab.classList.toggle('mode-hidden', empty);
  panel.classList.toggle('mode-hidden', empty);
  list.innerHTML = '';
  if (empty) return;

  const lowest = items.length > 1 ? Math.min(...items.map(f => f.score)) : null;
  items.forEach(f => {
    const score = clamp(f.score);
    const div = document.createElement('div');
    div.className = 'file-analysis-item';
    div.innerHTML = `
      <div class="fa-head">
        <span class="fa-name">${escapeHtml(f.file_name)}</span>
        ${lowest !== null && f.score === lowest ? '<span class="fa-flag">最需加強</span>' : ''}
        <span class="fa-score">${score}</span>
      </div>
      <div class="skill-bar-bg"><div class="skill-bar-fill" data-width="${score}%" style="width:${score}%"></div></div>
      ${f.role ? `<div class="fa-role">${escapeHtml(f.role)}</div>` : ''}
      <div class="fa-grid">
        ${f.highlights ? `<div><div class="fa-label">亮點</div><div class="fa-text">${escapeHtml(f.highlights)}</div></div>` : ''}
        ${f.issues ? `<div><div class="fa-label">問題</div><div class="fa-text">${escapeHtml(f.issues)}</div></div>` : ''}
      </div>
    `;
    list.appendChild(div);
  });
}

// ---- 模擬面試 ----
const PracticeUI = { index: 0 };

function renderPractice(data, mode, record) {
  const body = document.getElementById('practiceBody');
  body.innerHTML = '';
  if (mode === 'single') return;
  const questions = data.interview_questions || [];
  if (!questions.length || !record) {
    body.innerHTML = '<p class="muted">這筆紀錄沒有面試問題可供練習。</p>';
    return;
  }
  if (PracticeUI.index >= questions.length) PracticeUI.index = 0;
  const practice = record.practice || {};

  const layout = document.createElement('div');
  layout.className = 'practice-layout';

  // 問題清單
  const listEl = document.createElement('div');
  listEl.className = 'practice-list';
  questions.forEach((q, i) => {
    const done = practice[i];
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'practice-q' + (i === PracticeUI.index ? ' active' : '');
    btn.innerHTML = `
      <span class="practice-q-num">${String(i + 1).padStart(2, '0')}</span>
      <span class="practice-q-text">${escapeHtml(q.question)}</span>
      ${done ? `<span class="practice-q-done">${clamp(done.feedback?.score)} 分</span>` : ''}
    `;
    btn.addEventListener('click', () => { PracticeUI.index = i; renderPractice(data, mode, AppState.currentRecord); });
    listEl.appendChild(btn);
  });

  // 作答區
  const q = questions[PracticeUI.index];
  const cur = practice[PracticeUI.index];
  const work = document.createElement('div');
  work.className = 'practice-work';
  work.innerHTML = `
    <div class="practice-question">${escapeHtml(q.question)}</div>
    ${q.why ? `<div class="practice-why">提問原因：${escapeHtml(q.why)}</div>` : ''}
    <textarea class="field-textarea" id="practiceAnswer" rows="6" placeholder="像在面試現場一樣，寫下你的回答…"></textarea>
    <div class="practice-actions">
      <button class="btn-outline" id="practiceSubmit" type="button">取得 AI 回饋</button>
      <span class="muted" id="practiceStatus"></span>
    </div>
    <div id="practiceFeedback"></div>
  `;
  work.querySelector('#practiceAnswer').value = cur?.answer || '';
  if (cur?.feedback) renderFeedback(work.querySelector('#practiceFeedback'), cur.feedback);

  work.querySelector('#practiceSubmit').addEventListener('click', async () => {
    const answerEl = work.querySelector('#practiceAnswer');
    const statusEl = work.querySelector('#practiceStatus');
    const submit = work.querySelector('#practiceSubmit');
    const answer = answerEl.value.trim();
    if (answer.length < 10) { showToast('回答太短', '請至少寫 10 個字再送出', 'warning', 3000); return; }
    if (!requireApiKey()) return;

    submit.disabled = true;
    statusEl.textContent = 'AI 正在閱讀你的回答…';
    try {
      const rec = AppState.currentRecord;
      const summary = [
        data.summary,
        ...(data.strengths || []).slice(0, 3).map(s => '優勢：' + s.title),
        ...(data.weaknesses || []).slice(0, 3).map(w => '弱點：' + w.problem),
      ].filter(Boolean).join('\n');
      const feedback = await GeminiAPI.reviewAnswer({
        question: q.question, why: q.why, answer,
        schools: rec.schools, mode, summary, criteria: rec.criteria,
        onProgress: (phase, d) => {
          if (phase === 'server_retry') statusEl.textContent = `伺服器忙碌，${d?.waitSec || 3} 秒後重試…`;
        },
      });
      const next = Object.assign({}, rec.practice || {});
      next[PracticeUI.index] = { question: q.question, answer, feedback, at: Date.now() };
      const updated = await Store.updateRecord(rec.id, { practice: next });
      if (updated) AppState.currentRecord = updated;
      renderPractice(data, mode, AppState.currentRecord);
    } catch (err) {
      showToast('取得回饋失敗', sanitizeErrorMessage(err.message), 'error', 8000);
      statusEl.textContent = '';
      submit.disabled = false;
    }
  });

  layout.appendChild(listEl);
  layout.appendChild(work);
  body.appendChild(layout);
}

function renderFeedback(container, fb) {
  const li = arr => (arr || []).map(x => `<li>${escapeHtml(x)}</li>`).join('');
  container.innerHTML = `
    <div class="feedback">
      <div class="feedback-head">
        <span class="feedback-score">${clamp(fb.score)}</span>
        <span class="feedback-verdict">${escapeHtml(fb.verdict)}</span>
      </div>
      <div class="feedback-grid">
        <div><div class="fa-label">做得好</div><ul>${li(fb.strengths)}</ul></div>
        <div><div class="fa-label">可以改進</div><ul>${li(fb.improvements)}</ul></div>
      </div>
      ${fb.sample_answer ? `<div class="fa-label">示範回答</div><div class="feedback-sample">${escapeHtml(fb.sample_answer)}</div>` : ''}
    </div>
  `;
}

// =========================================================
// 換校系重評
// =========================================================

function openReanalyze() {
  const rec = AppState.currentRecord;
  if (!rec || !rec.sourceId) return;

  const body = document.createElement('div');
  body.className = 'modal-form';
  body.innerHTML = `
    <p class="card-sub">沿用這筆紀錄已解析的資料，不需重新上傳。填寫多個志願時，每個志願會各分析一次並並排比較。</p>
    <label class="subfield-label" for="reMode">模式</label>
    <select id="reMode" class="field-select">
      <option value="apply">個人申請</option>
      <option value="special">特殊選才</option>
    </select>
    <label class="subfield-label">目標校系</label>
    <div id="reSchools" class="school-entries"></div>
    <button class="btn-text-sm" id="reAdd" type="button">＋ 新增志願</button>
    <label class="subfield-label" for="reCriteria">審查重點／招生簡章內容（選填）</label>
    <textarea id="reCriteria" class="field-textarea" rows="4"></textarea>
  `;
  const modeSel = body.querySelector('#reMode');
  modeSel.value = MODES[rec.mode]?.needSchool ? rec.mode : 'apply';
  body.querySelector('#reCriteria').value = rec.criteria || '';

  const schoolsEl = body.querySelector('#reSchools');
  const addRow = (univ = '', dept = '') => {
    const row = document.createElement('div');
    row.className = 'school-entry';
    row.innerHTML = `
      <input class="school-input re-univ" placeholder="大學" autocomplete="off">
      <input class="school-input re-dept" placeholder="科系" autocomplete="off">
      <button class="school-remove" type="button" aria-label="移除">×</button>`;
    row.querySelector('.re-univ').value = univ;
    row.querySelector('.re-dept').value = dept;
    row.querySelector('.school-remove').addEventListener('click', () => {
      if (schoolsEl.children.length > 1) row.remove();
    });
    schoolsEl.appendChild(row);
  };
  addRow();
  body.querySelector('#reAdd').addEventListener('click', () => addRow());

  openModal({
    title: '換校系重新評估',
    body,
    okText: '開始重評',
    onOk: async () => {
      const schools = Array.from(schoolsEl.querySelectorAll('.school-entry'))
        .map(r => ({
          university: r.querySelector('.re-univ').value.trim(),
          department: r.querySelector('.re-dept').value.trim(),
        }))
        .filter(s => s.university || s.department)
        .map(s => ({ university: s.university || '（未指定）', department: s.department || '（未指定）' }));
      if (!schools.length) { showToast('請輸入目標校系', '', 'warning', 3000); return false; }
      if (!requireApiKey()) return;
      if (schools.length > 1 && !confirm(`將為 ${schools.length} 個志願各分析一次（共呼叫 API ${schools.length} 次），確定嗎？`)) return false;

      const mode = modeSel.value;
      const criteria = body.querySelector('#reCriteria').value.trim();
      closeModal();

      await withAnalysisUI(async () => {
        const source = await Store.getSource(rec.sourceId);
        if (!source) throw new Error('原始資料已不存在，無法重評。');
        const groupId = schools.length > 1 ? newId() : null;
        const records = [];
        let firstErr = null;
        for (let i = 0; i < schools.length; i++) {
          const prefix = schools.length > 1 ? `（${i + 1}/${schools.length}）` : '';
          try {
            records.push(await analyzeOnce({
              mode, schools: [schools[i]], criteria, source,
              fileNames: rec.fileNames || [], sourceId: rec.sourceId,
              parentId: rec.id, groupId, prefix,
            }));
          } catch (err) {
            firstErr = firstErr || err;
            if (schools.length === 1) throw err;
          }
        }
        if (!records.length) throw firstErr;
        return records;
      });
      return false; // 已自行關閉
    },
  });
}

// =========================================================
// 紀錄比較（也用於多志願並排總覽）
// =========================================================

const COMPARE_COLORS = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#0891b2'];
let compareChartInstance = null;
let compareData = null;

async function renderComparePage(ids) {
  const recs = (await Promise.all(ids.slice(0, MAX_COMPARE).map(id => Store.getRecord(id)))).filter(Boolean);
  if (recs.length < 2) return false;
  compareData = recs;

  const sameGroup = recs.every(r => r.groupId && r.groupId === recs[0].groupId);
  const sameSource = recs.every(r => r.sourceId && r.sourceId === recs[0].sourceId);
  document.getElementById('compareTitle').textContent = sameGroup ? '多志願並排總覽' : '紀錄比較';
  document.getElementById('compareSub').textContent = sameGroup || sameSource
    ? '同一份學習歷程對不同校系／設定的評估結果。'
    : `並排比較 ${recs.length} 筆紀錄。`;

  const fmtDate = r => new Date(r.createdAt).toLocaleString('zh-TW', { hour12: false });
  const label = (r, i) => `${i + 1}. ${recordTitle(r)}`;

  // 摘要卡
  const cards = recs.map((r, i) => `
    <div class="cmp-card" style="--cmp-color:${COMPARE_COLORS[i]}">
      <div class="cmp-card-title"><span class="cmp-dot"></span>${escapeHtml(label(r, i))}</div>
      <div class="cmp-card-meta">${escapeHtml(MODES[r.mode]?.label || '個人申請')} · ${escapeHtml(fmtDate(r))}</div>
      ${r.note ? `<div class="cmp-card-note">${escapeHtml(r.note)}</div>` : ''}
      <div class="cmp-card-score">${clamp(r.result?.overall_score)}<small>/ 100</small></div>
      <a class="cmp-card-link" href="#result/${escapeHtml(r.id)}">查看完整報告 →</a>
    </div>`).join('');

  // 表格
  const val = (r, getter) => {
    const v = getter(r.result || {});
    return (v === undefined || v === null || Number.isNaN(Number(v))) ? null : clamp(v);
  };
  const rows = [
    { name: '總分', get: d => d.overall_score, strong: true },
    { name: '校系契合度', get: d => d.fit_analysis?.score },
    ...Object.entries(ALL_SKILL_LABELS).map(([k, name]) => ({ name, get: d => d.skills?.[k]?.score })),
  ];
  const showDelta = recs.length === 2;
  const head = `<tr><th></th>${recs.map((r, i) => `<th style="--cmp-color:${COMPARE_COLORS[i]}"><span class="cmp-dot"></span>${i + 1}</th>`).join('')}${showDelta ? '<th>差異</th>' : ''}</tr>`;
  const body = rows.map(row => {
    const vals = recs.map(r => val(r, row.get));
    if (vals.every(v => v === null)) return '';
    const max = Math.max(...vals.filter(v => v !== null));
    const cells = vals.map(v => `<td class="${v !== null && v === max && recs.length > 1 ? 'best' : ''}">${v === null ? '—' : v}</td>`).join('');
    let delta = '';
    if (showDelta) {
      if (vals[0] === null || vals[1] === null) delta = '<td>—</td>';
      else {
        const d = vals[1] - vals[0];
        delta = `<td class="delta ${d > 0 ? 'up' : d < 0 ? 'down' : ''}">${d > 0 ? '+' : ''}${d}</td>`;
      }
    }
    return `<tr class="${row.strong ? 'strong' : ''}"><th>${escapeHtml(row.name)}</th>${cells}${delta}</tr>`;
  }).join('');

  // 文字比較
  const textRow = (title, getter) => `
    <tr><th>${title}</th>${recs.map(r => `<td class="cmp-text">${escapeHtml(getter(r.result || {}) || '—')}</td>`).join('')}${showDelta ? '<td></td>' : ''}</tr>`;
  const textRows = [
    textRow('摘要', d => d.summary),
    textRow('主要優勢', d => d.strengths?.[0]?.title),
    textRow('最大弱點', d => d.weaknesses?.[0]?.problem),
    textRow('最優先改善', d => d.improvement_plan?.[0]?.title),
  ].join('');

  document.getElementById('compareBody').innerHTML = `
    <div class="cmp-cards" style="--n:${recs.length}">${cards}</div>
    <section class="card">
      <h2 class="section-heading">能力雷達比較</h2>
      <div class="cmp-chart-wrap"><canvas id="compareChart" aria-label="雷達圖比較" role="img"></canvas></div>
    </section>
    <section class="card">
      <h2 class="section-heading">分數比較</h2>
      <div class="table-scroll"><table class="cmp-table">${head}${body}</table></div>
    </section>
    <section class="card">
      <h2 class="section-heading">內容比較</h2>
      <div class="table-scroll"><table class="cmp-table cmp-table-text">${head}${textRows}</table></div>
    </section>`;

  refreshCompareChart();
  return true;
}

function refreshCompareChart() {
  const canvas = document.getElementById('compareChart');
  if (!canvas || !compareData) return;
  const pal = chartPalette();
  if (compareChartInstance) { compareChartInstance.destroy(); compareChartInstance = null; }
  const keys = Object.keys(ALL_SKILL_LABELS);
  compareChartInstance = new Chart(canvas.getContext('2d'), {
    type: 'radar',
    data: {
      labels: Object.values(ALL_SKILL_LABELS),
      datasets: compareData.map((r, i) => ({
        label: `${i + 1}. ${recordTitle(r)}`,
        data: keys.map(k => {
          const v = r.result?.skills?.[k]?.score;
          return v === undefined ? null : clamp(v);
        }),
        borderColor: COMPARE_COLORS[i],
        backgroundColor: COMPARE_COLORS[i] + '22',
        borderWidth: 1.8,
        pointRadius: 2.5,
        pointBackgroundColor: COMPARE_COLORS[i],
      })),
    },
    options: {
      responsive: true,
      animation: false,
      maintainAspectRatio: true,
      plugins: { legend: { position: 'bottom', labels: { color: pal.label, boxWidth: 12 } } },
      scales: {
        r: {
          min: 0, max: 100,
          ticks: { stepSize: 25, font: { size: 9 }, color: pal.tick, backdropColor: 'transparent' },
          pointLabels: { font: { size: 10 }, color: pal.label },
          grid: { color: pal.grid },
          angleLines: { color: pal.grid },
        },
      },
    },
  });
}

// =========================================================
// PDF 匯出：選擇要包含的章節
// =========================================================

function openExportDialog() {
  const tabs = Array.from(document.querySelectorAll('.result-tab:not(.mode-hidden)'));
  if (!tabs.length) { printReport(); return; }

  const saved = Store.load().pdfOff;
  const rec = AppState.currentRecord;
  const hasPractice = rec?.practice && Object.keys(rec.practice).length > 0;
  // 預設不含「模擬面試」（除非已有練習內容）
  const off = new Set(Array.isArray(saved) ? saved : ['practice']);
  if (hasPractice && !Array.isArray(saved)) off.delete('practice');

  const body = document.createElement('div');
  body.className = 'modal-form';
  body.innerHTML = `
    <p class="card-sub">勾選要放進 PDF 的章節（例如給老師看時可取消面試問題）。在列印視窗請選擇「另存為 PDF」，並關閉「頁首和頁尾」。</p>
    <div class="check-list">${tabs.map(t => `
      <label class="check-row"><input type="checkbox" value="${t.dataset.panel}" ${off.has(t.dataset.panel) ? '' : 'checked'}><span>${escapeHtml(t.textContent.trim())}</span></label>`).join('')}
    </div>`;

  openModal({
    title: '匯出 PDF',
    body,
    okText: '匯出',
    onOk: () => {
      const checked = new Set(Array.from(body.querySelectorAll('input:checked')).map(i => i.value));
      if (!checked.size) { showToast('請至少選擇一個章節', '', 'warning', 2500); return false; }
      const unchecked = tabs.map(t => t.dataset.panel).filter(p => !checked.has(p));
      Store.save({ pdfOff: unchecked });
      closeModal();
      // 等 modal 消失後再列印
      setTimeout(() => {
        const panels = document.querySelectorAll('.result-panel');
        panels.forEach(p => { if (!checked.has(p.dataset.panel)) p.setAttribute('data-pdf-off', ''); });
        try { printReport(); }
        finally { panels.forEach(p => p.removeAttribute('data-pdf-off')); }
      }, 150);
      return false;
    },
  });
}

function exportComparePdf() {
  const prev = document.title;
  document.title = '學習歷程評估_紀錄比較';
  printWithLightTheme();
  document.title = prev;
}

// =========================================================
// 初始化
// =========================================================

function initFeatures() {
  initModal();
  initAnalyzeExtras();
  initHistoryControls();
  document.getElementById('reanalyzeBtn').addEventListener('click', openReanalyze);
  document.getElementById('editNoteBtn').addEventListener('click', () => {
    if (AppState.currentRecord) openNoteEditor(AppState.currentRecord);
  });
  document.getElementById('compareExportBtn').addEventListener('click', exportComparePdf);
}
