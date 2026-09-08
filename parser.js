/* =========================================================
   parser.js — 學習歷程檔案解析 + Gemini 回應解析/驗證/正規化
   ========================================================= */

// =========================================================
// FileParser — 學習歷程檔案解析
// =========================================================
const FileParser = (() => {

  const MAX_FILE_SIZE = 15 * 1024 * 1024;

  const SUPPORTED_TYPES = {
    'text/plain': 'text',
    'text/markdown': 'text',
    'application/pdf': 'pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/msword': 'docx_legacy',
    'image/png': 'image',
    'image/jpeg': 'image',
    'image/jpg': 'image',
    'image/webp': 'image',
    'image/gif': 'image',
  };

  const EXT_MAP = {
    txt: 'text', md: 'text', markdown: 'text',
    pdf: 'pdf',
    docx: 'docx', doc: 'docx_legacy',
    png: 'image', jpg: 'image', jpeg: 'image', webp: 'image', gif: 'image',
  };

  function getFileType(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    return SUPPORTED_TYPES[file.type] || EXT_MAP[ext] || null;
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function readAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target.result);
      reader.onerror = () => reject(new Error('無法讀取文字檔案'));
      reader.readAsText(file, 'UTF-8');
    });
  }

  function readAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target.result);
      reader.onerror = () => reject(new Error('無法讀取檔案'));
      reader.readAsArrayBuffer(file);
    });
  }

  function readAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target.result);
      reader.onerror = () => reject(new Error('無法讀取圖片'));
      reader.readAsDataURL(file);
    });
  }

  async function parsePDF(file) {
    if (!window.pdfjsLib) {
      throw new Error('PDF.js 尚未載入，請重新整理頁面。');
    }
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
    const arrayBuffer = await readAsArrayBuffer(file);
    let pdf;
    try {
      pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    } catch (e) {
      throw new Error(`PDF 載入失敗：${e.message || '格式可能損壞'}`);
    }
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items.map(item => item.str || '').join(' ');
      fullText += `[第 ${i} 頁]\n${pageText}\n\n`;
    }
    if (!fullText.trim()) {
      throw new Error('此 PDF 可能為掃描圖片，無法自動提取文字。建議轉換為文字版 PDF 或 TXT 格式後再上傳。');
    }
    return fullText;
  }

  async function parseDOCX(file) {
    if (!window.mammoth) {
      throw new Error('mammoth.js 尚未載入，請重新整理頁面');
    }
    const arrayBuffer = await readAsArrayBuffer(file);
    const result = await mammoth.extractRawText({ arrayBuffer });
    if (!result.value.trim()) {
      throw new Error('無法從此 DOCX 檔案提取文字內容');
    }
    return result.value;
  }

  async function parseImage(file) {
    const dataUrl = await readAsDataURL(file);
    return { type: 'image', dataUrl, mimeType: file.type };
  }

  async function parseFile(file) {
    const result = {
      fileName: file.name,
      fileSize: formatBytes(file.size),
      success: false,
    };

    if (file.size > MAX_FILE_SIZE) {
      result.error = `檔案超過大小限制（${formatBytes(file.size)} > 15MB）`;
      return result;
    }

    const fileType = getFileType(file);
    result.detectedType = fileType;

    if (!fileType) {
      result.error = `不支援此檔案格式（${file.type || '未知格式'}）。支援格式：PDF、DOCX、TXT、MD、PNG、JPG`;
      return result;
    }

    try {
      if (fileType === 'text') {
        result.text = await readAsText(file);
        result.success = true;
      } else if (fileType === 'pdf') {
        result.text = await parsePDF(file);
        result.success = true;
      } else if (fileType === 'docx') {
        result.text = await parseDOCX(file);
        result.success = true;
      } else if (fileType === 'docx_legacy') {
        result.error = '舊版 .doc 格式不支援瀏覽器端解析。建議另存為 .docx 或 .txt 格式後再上傳。';
        return result;
      } else if (fileType === 'image') {
        const parsed = await parseImage(file);
        result.imagePart = parsed;
        result.success = true;
        result.warning = '圖片格式將直接以視覺方式提供給 AI 分析';
      }
    } catch (err) {
      result.error = err.message || '解析失敗';
    }

    return result;
  }

  async function parseFiles(files) {
    const results = [];
    for (const file of files) {
      const r = await parseFile(file);
      results.push(r);
    }
    return results;
  }

  function summarizeForPrompt(parsedResults) {
    const textParts = [];
    const imageParts = [];
    const warnings = [];

    for (const r of parsedResults) {
      if (!r.success) {
        warnings.push(`⚠ ${r.fileName}：${r.error}`);
        continue;
      }
      if (r.warning) warnings.push(`ℹ ${r.fileName}：${r.warning}`);
      if (r.text) {
        textParts.push(`\n\n===== 檔案：${r.fileName} =====\n${r.text.trim()}`);
      }
      if (r.imagePart) {
        imageParts.push({ ...r.imagePart, fileName: r.fileName });
      }
    }

    return { textParts, imageParts, warnings };
  }

  return {
    parseFile,
    parseFiles,
    summarizeForPrompt,
    formatBytes,
    getFileType,
    SUPPORTED_TYPES,
    MAX_FILE_SIZE,
  };
})();


// =========================================================
// AssessmentParser — Gemini 回應解析 / 驗證 / 正規化
// =========================================================
const AssessmentParser = (() => {

  /**
   * Step 1: 從原始文字取出 JSON 字串
   * 優先直接使用（responseMimeType 應回傳純 JSON）
   * Fallback: 移除 Markdown code fence
   */
  function extractJsonString(rawText) {
    let s = rawText.trim();

    // Fallback: 移除 ```json ... ``` 或 ``` ... ```
    if (s.startsWith('```')) {
      s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    }

    // 尋找最外層 {} 邊界（防止前後有非 JSON 殘留文字）
    const firstBrace = s.indexOf('{');
    const lastBrace = s.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      s = s.substring(firstBrace, lastBrace + 1);
    }

    return s;
  }

  /**
   * Step 2a: 前瞻式 JSON 修復
   *
   * 修復兩種最常見的 Gemini JSON 問題：
   *   A. 字串內部出現未逸脫的控制字元（\n \r \t）
   *   B. 字串內部出現未逸脫的半形引號 "（例如引用內容時）
   *
   * 核心思路：
   *   遇到 " 時，向後查看下一個非空白字元是否為合法的 JSON 接續符號
   *   （, } ] : 或到達末尾）。若是，則此 " 為合法字串結束符；
   *   否則，視為字串內容並逸脫為 \"
   *
   * 原則：不猜測括號、不補逗號、不修改 JSON 結構，只修逸脫問題。
   */
  function repairJsonStringEscapes(jsonStr) {
    let result = '';
    let inString = false;
    let escaped = false;

    for (let i = 0; i < jsonStr.length; i++) {
      const ch = jsonStr[i];

      // 已處於逸脫狀態（前一個字元是 \）
      if (escaped) {
        result += ch;
        escaped = false;
        continue;
      }

      // 反斜線：開始逸脫序列
      if (ch === '\\') {
        escaped = true;
        result += ch;
        continue;
      }

      // 雙引號：需要判斷是字串開始/結束，還是字串內容
      if (ch === '"') {
        if (!inString) {
          // 目前在字串外 → 這是字串開始符，直接輸出
          inString = true;
          result += ch;
        } else {
          // 目前在字串內 → 判斷這個 " 是結束符還是內容
          // 向前掃描跳過空白，查看下一個有效字元
          let lookahead = i + 1;
          while (lookahead < jsonStr.length &&
                 (jsonStr[lookahead] === ' ' || jsonStr[lookahead] === '\t')) {
            lookahead++;
          }
          const next = lookahead < jsonStr.length ? jsonStr[lookahead] : '';

          // 合法的 JSON 接續符號：逗號、大括號、中括號、冒號、換行、或字串結尾
          const isValidEnd = (next === ',' || next === '}' || next === ']' ||
                              next === ':' || next === '\n' || next === '\r' ||
                              next === '' );

          if (isValidEnd) {
            // 這是合法的字串結束符
            inString = false;
            result += ch;
          } else {
            // 這是字串內部的未逸脫引號，替換為逸脫版本
            result += '\\"';
          }
        }
        continue;
      }

      // 在字串內部修復未逸脫的控制字元
      if (inString) {
        if (ch === '\n') { result += '\\n'; continue; }
        if (ch === '\r') { result += '\\r'; continue; }
        if (ch === '\t') { result += '\\t'; continue; }
        if (ch.charCodeAt(0) < 0x20) { continue; } // 其他控制字元丟棄
      }

      result += ch;
    }

    return result;
  }

  /**
   * Step 2: 解析 JSON（三段式容錯）
   *
   * 流程：
   *   1. 直接 JSON.parse（最快）
   *   2. 前瞻式修復後再 JSON.parse（修 " 和控制字元）
   *   3. 若 window.jsonrepair 存在，用它再試一次（最強 fallback）
   *   4. 全部失敗 → 回傳 error
   */
  function parseJson(jsonStr) {
    // 先移除明確非法的控制字元（保留 \n \r \t 由後續處理）
    const cleaned = jsonStr.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    // === 第一次：直接解析 ===
    try {
      return { ok: true, data: JSON.parse(cleaned) };
    } catch (e1) {
      console.warn('[AssessmentParser] 直接解析失敗，嘗試前瞻式修復：', e1.message);
    }

    // === 第二次：前瞻式字串逸脫修復 ===
    try {
      const repaired = repairJsonStringEscapes(cleaned);
      return { ok: true, data: JSON.parse(repaired) };
    } catch (e2) {
      console.warn('[AssessmentParser] 前瞻式修復後仍失敗，嘗試 jsonrepair：', e2.message);
    }

    // === 第三次：jsonrepair（若已從 CDN 載入）===
    // UMD 格式掛載為 window.JSONRepair.jsonrepair
    const _jr = (typeof window !== 'undefined' && window.JSONRepair && window.JSONRepair.jsonrepair)
      ? window.JSONRepair.jsonrepair
      : null;

    if (_jr) {
      try {
        const deepRepaired = _jr(cleaned);
        return { ok: true, data: JSON.parse(deepRepaired) };
      } catch (e3) {
        console.error('[AssessmentParser] jsonrepair 也失敗：', e3.message);
      }
    }

    // 全部失敗
    const finalErr = new Error('所有修復方法均失敗');
    console.error('[AssessmentParser] JSON.parse failed (all attempts):', finalErr.message);
    return { ok: false, error: finalErr.message };
  }

  /**
   * Step 3: Schema Validation — 確認必要欄位與型別
   */
  function validateAssessmentData(data) {
    const errors = [];

    // overall_score
    if (typeof data.overall_score !== 'number') {
      errors.push('overall_score 不是數字');
    } else if (data.overall_score < 0 || data.overall_score > 100) {
      errors.push(`overall_score 超出範圍（${data.overall_score}）`);
    }

    // summary
    if (typeof data.summary !== 'string' || !data.summary.trim()) {
      errors.push('summary 不是有效字串');
    }

    // skills
    if (!data.skills || typeof data.skills !== 'object') {
      errors.push('skills 欄位缺失或格式錯誤');
    } else {
      const skillKeys = ['academic','professional','practical','creativity','problem_solving','self_learning','communication','reflection','interdisciplinary','fit'];
      for (const k of skillKeys) {
        const skill = data.skills[k];
        if (!skill || typeof skill !== 'object') {
          errors.push(`skills.${k} 缺失`);
        } else if (typeof skill.score !== 'number') {
          errors.push(`skills.${k}.score 不是數字`);
        }
      }
    }

    // Arrays
    const arrayFields = ['strengths', 'weaknesses', 'key_points', 'professor_reviews', 'interview_questions', 'improvement_plan'];
    for (const f of arrayFields) {
      if (!Array.isArray(data[f])) {
        errors.push(`${f} 不是陣列`);
      }
    }

    // fit_analysis
    if (!data.fit_analysis || typeof data.fit_analysis !== 'object') {
      errors.push('fit_analysis 欄位缺失');
    } else {
      if (typeof data.fit_analysis.score !== 'number') {
        errors.push('fit_analysis.score 不是數字');
      }
      if (!Array.isArray(data.fit_analysis.reasons)) {
        errors.push('fit_analysis.reasons 不是陣列');
      }
      if (!Array.isArray(data.fit_analysis.gaps)) {
        errors.push('fit_analysis.gaps 不是陣列');
      }
    }

    return errors;
  }

  /**
   * Step 4: Normalization — 補全缺失欄位，確保型別安全
   * 只補全而非拒絕，讓部分正確的資料也能顯示
   */
  function normalizeAssessmentData(data) {
    const clamp = (v, min = 0, max = 100) => {
      const n = Number(v);
      return isNaN(n) ? 50 : Math.min(Math.max(Math.round(n), min), max);
    };
    const str = v => (v != null && typeof v === 'string') ? v : '';
    const arr = v => Array.isArray(v) ? v : [];

    // overall_score
    data.overall_score = clamp(data.overall_score);

    // summary
    data.summary = str(data.summary) || '（無摘要）';
    data.inference_note = str(data.inference_note);

    // skills
    data.skills = data.skills || {};
    const skillKeys = ['academic','professional','practical','creativity','problem_solving','self_learning','communication','reflection','interdisciplinary','fit'];
    for (const k of skillKeys) {
      if (!data.skills[k] || typeof data.skills[k] !== 'object') {
        data.skills[k] = { score: 50, reason: '（資料不足，無法評估）' };
      } else {
        data.skills[k].score = clamp(data.skills[k].score);
        data.skills[k].reason = str(data.skills[k].reason) || '（無說明）';
      }
    }

    // strengths
    data.strengths = arr(data.strengths).map(s => ({
      title:    str(s?.title)    || '（無標題）',
      evidence: str(s?.evidence) || '（無依據）',
      value:    str(s?.value)    || '（無說明）',
    }));

    // weaknesses
    const validSeverity = ['high', 'medium', 'low'];
    data.weaknesses = arr(data.weaknesses).map(w => ({
      problem:     str(w?.problem)     || '（無描述）',
      severity:    validSeverity.includes(w?.severity) ? w.severity : 'medium',
      reason:      str(w?.reason)      || '（無說明）',
      improvement: str(w?.improvement) || '（無建議）',
    }));

    // key_points
    data.key_points = arr(data.key_points).map(p => str(p) || '（無內容）');

    // fit_analysis
    data.fit_analysis = (data.fit_analysis && typeof data.fit_analysis === 'object') ? data.fit_analysis : {};
    data.fit_analysis.score = clamp(data.fit_analysis.score != null ? data.fit_analysis.score : (data.skills?.fit?.score || data.overall_score || 50));
    data.fit_analysis.level = str(data.fit_analysis.level) || (data.fit_analysis.score >= 80 ? '高度契合' : (data.fit_analysis.score >= 60 ? '中高契合' : '中等契合'));
    data.fit_analysis.reasons = arr(data.fit_analysis.reasons).map(r => str(r));
    if (data.fit_analysis.reasons.length === 0) {
      data.fit_analysis.reasons = ['具備目標校系所需之基礎學術熱忱與探究潛力。'];
    }
    data.fit_analysis.gaps    = arr(data.fit_analysis.gaps).map(g => str(g));
    if (data.fit_analysis.gaps.length === 0) {
      data.fit_analysis.gaps = ['建議加強特定專業領域的深化實作或具體成果展現。'];
    }

    const dims = data.fit_analysis.dimensions || {};
    data.fit_analysis.dimensions = {
      academic_direction:     clamp(dims.academic_direction ?? data.skills?.academic?.score ?? 50),
      professional_direction: clamp(dims.professional_direction ?? data.skills?.professional?.score ?? 50),
      experience_match:       clamp(dims.experience_match ?? data.skills?.practical?.score ?? 50),
      development_potential:  clamp(dims.development_potential ?? data.skills?.self_learning?.score ?? 50),
      personal_traits:        clamp(dims.personal_traits ?? data.skills?.reflection?.score ?? 50),
    };

    // professor_reviews
    data.professor_reviews = arr(data.professor_reviews).map(r => ({
      type:      str(r?.type) || 'academic',
      type_name: str(r?.type_name) || '教授',
      focus:     str(r?.focus) || '',
      score:     clamp(r?.score),
      positive:  arr(r?.positive).map(p => str(p)),
      concerns:  arr(r?.concerns).map(c => str(c)),
      questions: arr(r?.questions).map(q => ({
        question: str(q?.question) || '',
        why:      str(q?.why)      || '',
      })),
      impression: str(r?.impression) || '',
    }));

    // interview_questions
    data.interview_questions = arr(data.interview_questions).map(q => ({
      question: str(q?.question) || str(q),
      why:      str(q?.why) || '',
    }));

    // improvement_plan
    const validPriority = ['P0', 'P1', 'P2', 'P3'];
    data.improvement_plan = arr(data.improvement_plan).map(item => ({
      priority:    validPriority.includes(item?.priority) ? item.priority : 'P2',
      title:       str(item?.title) || '（無標題）',
      description: str(item?.description) || str(item?.desc) || '（無說明）',
    }));

    return data;
  }

  /**
   * 主要入口：解析 Gemini 原始回應
   * 回傳 { data, error } — error 為 null 表示成功
   */
  function parseGeminiResponse(rawText) {
    if (!rawText || typeof rawText !== 'string' || !rawText.trim()) {
      return { data: null, error: 'Gemini 回傳為空' };
    }

    // 1. 提取 JSON 字串
    const jsonStr = extractJsonString(rawText);

    // 2. 解析 JSON
    const parseResult = parseJson(jsonStr);
    if (!parseResult.ok) {
      return {
        data: null,
        error: `JSON 解析失敗：${parseResult.error}`,
      };
    }

    const rawData = parseResult.data;
    if (!rawData || typeof rawData !== 'object') {
      return {
        data: null,
        error: 'JSON 解析後非物件結構',
      };
    }

    // 3. Schema 驗證
    const validationErrors = validateAssessmentData(rawData);
    if (validationErrors.length > 0) {
      console.warn('[AssessmentParser] Schema 驗證警告：', validationErrors);
      // 驗證有警告時，確認是否有基本核心評估資料（overall_score 或 skills）
      const hasCoreData = (typeof rawData.overall_score === 'number') ||
                          (rawData.skills && typeof rawData.skills === 'object');
      if (!hasCoreData) {
        return {
          data: null,
          error: `資料結構驗證失敗：缺少核心評估資料（${validationErrors.join('；')}）`,
        };
      }
    }

    // 4. Normalization — 讓資料安全可用並補齊預設值
    const normalized = normalizeAssessmentData(rawData);

    return { data: normalized, error: null };
  }

  return {
    parseGeminiResponse,
    validateAssessmentData,
    normalizeAssessmentData,
  };
})();
