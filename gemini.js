/* =========================================================
   gemini.js — Google Gemini API 整合模組
   使用 responseMimeType + responseSchema 確保 JSON 結構可靠
   ========================================================= */

const GeminiAPI = (() => {

  const MODEL = 'gemini-2.5-flash';
  const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

  let _apiKey = null;

  function setApiKey(key) {
    _apiKey = key ? key.trim() : null;
  }

  function getApiKey() {
    return _apiKey;
  }

  function hasApiKey() {
    return Boolean(_apiKey && _apiKey.length > 0);
  }

  /**
   * 將 HTTP 錯誤碼轉換為使用者友善訊息
   */
  function friendlyHttpError(status, serverMsg) {
    switch (status) {
      case 400: return 'API 請求格式錯誤，請重試。' + (serverMsg ? `（${serverMsg}）` : '');
      case 401: return 'API Key 無效，請確認你的 Gemini API Key 是否正確。';
      case 403: return 'API Key 無效或未啟用 Gemini API，請前往 Google AI Studio 確認。';
      case 404: return '找不到指定的 Gemini 模型端點，請確認模型名稱或稍後再試。';
      case 429: return '目前 API 使用量或請求頻率已達限制，請稍候 30 秒再試，或更換 API Key。';
      case 500: return 'Gemini 伺服器發生內部錯誤，請稍後重試。';
      case 503: return 'Gemini 伺服器目前忙碌或無可用容量（HTTP 503），系統會自動重試，亦可稍候再次點擊。';
      default:  return serverMsg || `API 回應異常（HTTP ${status}），請重試。`;
    }
  }

  /**
   * 驗證 API Key（發送最小測試請求）
   */
  async function validateApiKey(key) {
    const testKey = key ? key.trim() : _apiKey;
    if (!testKey) throw new Error('請先輸入 API Key');

    const modelsToTry = [MODEL, 'gemini-3.8-flash', 'gemini-3.5-flash'];
    let lastErr = null;

    for (const model of modelsToTry) {
      const url = `${API_BASE}/${model}:generateContent?key=${testKey}`;
      const body = {
        contents: [{ role: 'user', parts: [{ text: 'Hi' }] }],
        generationConfig: {
          maxOutputTokens: 10,
          thinkingConfig: { thinkingBudget: 0 },
        },
      };

      try {
        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (resp.ok) {
          return true;
        }

        const data = await resp.json().catch(() => ({}));
        const msg = data.error?.message || '';

        // 若為認證錯誤（400/401/403），不必嘗試其他模型，直接回報
        if ([400, 401, 403].includes(resp.status)) {
          throw new Error(friendlyHttpError(resp.status, msg));
        }

        lastErr = new Error(friendlyHttpError(resp.status, msg));
      } catch (netErr) {
        if (netErr.message.includes('API Key') || netErr.message.includes('格式錯誤')) {
          throw netErr;
        }
        lastErr = new Error('網路連線錯誤，請確認網路狀態後重試。');
      }
    }

    throw lastErr || new Error('API Key 驗證失敗，請確認後重試。');
  }

  // ----------------------------------------------------------
  // responseSchema：告訴 Gemini API 精確的 JSON 結構
  // ----------------------------------------------------------
  const RESPONSE_SCHEMA = {
    type: 'OBJECT',
    properties: {
      overall_score: { type: 'INTEGER' },
      summary: { type: 'STRING' },
      inference_note: { type: 'STRING' },
      skills: {
        type: 'OBJECT',
        properties: {
          academic:         { type: 'OBJECT', properties: { score: { type: 'INTEGER' }, reason: { type: 'STRING' } }, required: ['score', 'reason'] },
          professional:     { type: 'OBJECT', properties: { score: { type: 'INTEGER' }, reason: { type: 'STRING' } }, required: ['score', 'reason'] },
          practical:        { type: 'OBJECT', properties: { score: { type: 'INTEGER' }, reason: { type: 'STRING' } }, required: ['score', 'reason'] },
          creativity:       { type: 'OBJECT', properties: { score: { type: 'INTEGER' }, reason: { type: 'STRING' } }, required: ['score', 'reason'] },
          problem_solving:  { type: 'OBJECT', properties: { score: { type: 'INTEGER' }, reason: { type: 'STRING' } }, required: ['score', 'reason'] },
          self_learning:    { type: 'OBJECT', properties: { score: { type: 'INTEGER' }, reason: { type: 'STRING' } }, required: ['score', 'reason'] },
          communication:    { type: 'OBJECT', properties: { score: { type: 'INTEGER' }, reason: { type: 'STRING' } }, required: ['score', 'reason'] },
          reflection:       { type: 'OBJECT', properties: { score: { type: 'INTEGER' }, reason: { type: 'STRING' } }, required: ['score', 'reason'] },
          interdisciplinary:{ type: 'OBJECT', properties: { score: { type: 'INTEGER' }, reason: { type: 'STRING' } }, required: ['score', 'reason'] },
          fit:              { type: 'OBJECT', properties: { score: { type: 'INTEGER' }, reason: { type: 'STRING' } }, required: ['score', 'reason'] },
        },
        required: ['academic','professional','practical','creativity','problem_solving','self_learning','communication','reflection','interdisciplinary','fit'],
      },
      strengths: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            title:    { type: 'STRING' },
            evidence: { type: 'STRING' },
            value:    { type: 'STRING' },
          },
          required: ['title', 'evidence', 'value'],
        },
      },
      weaknesses: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            problem:     { type: 'STRING' },
            severity:    { type: 'STRING' },
            reason:      { type: 'STRING' },
            improvement: { type: 'STRING' },
          },
          required: ['problem', 'severity', 'reason', 'improvement'],
        },
      },
      key_points: {
        type: 'ARRAY',
        items: { type: 'STRING' },
      },
      fit_analysis: {
        type: 'OBJECT',
        properties: {
          score: { type: 'INTEGER' },
          level: { type: 'STRING' },
          dimensions: {
            type: 'OBJECT',
            properties: {
              academic_direction:    { type: 'INTEGER' },
              professional_direction:{ type: 'INTEGER' },
              experience_match:      { type: 'INTEGER' },
              development_potential: { type: 'INTEGER' },
              personal_traits:       { type: 'INTEGER' },
            },
            required: ['academic_direction','professional_direction','experience_match','development_potential','personal_traits'],
          },
          reasons: { type: 'ARRAY', items: { type: 'STRING' } },
          gaps:    { type: 'ARRAY', items: { type: 'STRING' } },
        },
        required: ['score', 'level', 'dimensions', 'reasons', 'gaps'],
      },
      professor_reviews: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            type:      { type: 'STRING' },
            type_name: { type: 'STRING' },
            focus:     { type: 'STRING' },
            score:     { type: 'INTEGER' },
            positive:  { type: 'ARRAY', items: { type: 'STRING' } },
            concerns:  { type: 'ARRAY', items: { type: 'STRING' } },
            questions: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: {
                  question: { type: 'STRING' },
                  why:      { type: 'STRING' },
                },
                required: ['question', 'why'],
              },
            },
            impression: { type: 'STRING' },
          },
          required: ['type','type_name','focus','score','positive','concerns','questions','impression'],
        },
      },
      interview_questions: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            question: { type: 'STRING' },
            why:      { type: 'STRING' },
          },
          required: ['question', 'why'],
        },
      },
      improvement_plan: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            priority:    { type: 'STRING' },
            title:       { type: 'STRING' },
            description: { type: 'STRING' },
          },
          required: ['priority', 'title', 'description'],
        },
      },
    },
    required: [
      'overall_score','summary','skills','strengths','weaknesses',
      'key_points','fit_analysis','professor_reviews',
      'interview_questions','improvement_plan',
    ],
  };

  /**
   * 建立完整的評估 Prompt（System Instruction 風格）
   */
  function buildPrompt(portfolioText, schools, parseWarnings) {
    const schoolList = schools
      .map((s, i) => `  ${i + 1}. ${s.university}｜${s.department}`)
      .join('\n');

    const warningBlock = parseWarnings.length > 0
      ? `\n【注意：以下檔案無法完整解析，僅供參考】\n${parseWarnings.join('\n')}\n`
      : '';

    return `你是一位台灣頂尖大學招生顧問與學習歷程評估專家。

【輸出規則 — 嚴格遵守】
- 你只能輸出符合指定 JSON Schema 的純 JSON 資料
- 不要輸出任何 Markdown 格式
- 不要使用 \`\`\`json 或 \`\`\`
- 不要在 JSON 前後加入任何說明文字
- 不要輸出任何 JSON 之外的文字
- 不要輸出 JSON 註解（// 或 /* */）
- 所有文字內容中的雙引號必須正確 escaped（\\\"）
- JSON 必須完整結束，不可截斷
- 不得自行新增 Schema 中不存在的欄位
- 不得刪除必要欄位

【評估規則】
1. 所有評價必須引用學習歷程中的具體內容，不得憑空評分
2. 如果學習歷程資料不足，請直接指出原因，並在 summary 中說明
3. 必須誠實指出弱點，不要只說好話
4. 如果某項推論為 AI 推測，在 inference_note 中標示
5. 不得聲稱預測錄取機率
6. 所有分數必須為 0–100 的整數，不得為 null 或無法判斷
7. 如果資料不足無法評分，應給予較低分並在 reason 中說明
8. 所有 Array 欄位不得為空陣列，至少包含一個項目
9. severity 欄位只能是 "high"、"medium" 或 "low"
10. priority 欄位只能是 "P0"、"P1"、"P2" 或 "P3"

【評分分佈規則 — 嚴格遵守】
- 所有分數（overall_score、各 skill score、fit_analysis.score、professor_reviews score 等）必須遵守以下常態分佈標準：
  · 平均分：50 分
  · 標準差：15 分
  · 因此大多數學習歷程的分數應落在 20–80 之間
  · 80 分以上代表相對頂尖（約 9% 的人）
  · 85 分以上代表非常傑出（約 3% 的人）
  · 90 分以上代表極少見的頂尖水準，必須有明確且具體的強力佐證才能給予
  · 70 分代表中等偏上，已屬不錯
  · 50 分代表普通水準
  · 40 分以下代表有明顯不足
- 禁止：不得因為學習歷程文字寫得漂亮、資料多、或感覺努力就給予虛高分數
- 禁止：分數不得集中在 70–90 區間，這表示評分過度寬鬆
- 整體評分必須客觀反映該份學習歷程在台灣申請入學中的實際競爭力

【目標校系】
${schoolList}
（以第一個目標校系為主要分析對象）

【學習歷程內容】
${warningBlock}
${portfolioText || '（未提供任何文字內容，請根據已上傳的圖片進行分析）'}

---

請輸出完整 JSON，包含：
- overall_score：0–100 整數
- summary：60–100 字繁體中文總結
- inference_note：如有 AI 推論說明，否則輸出空字串
- skills：10 個能力維度，每項含 score（0–100）與 reason（20–40字）
- strengths：3–6 項優勢，每項含 title、evidence（引用具體內容）、value
- weaknesses：3–6 項弱點，每項含 problem、severity、reason、improvement
- key_points：4–7 項，每項 15–30 字
- fit_analysis：契合度分析，含 score、level、dimensions（5個維度分數）、reasons（為何適合）、gaps（不足之處）
- professor_reviews：4 種教授（academic/practical/interdisciplinary/character），每種含 type、type_name、focus、score、positive、concerns、questions（含 question 與 why）、impression
- interview_questions：7–10 個面試問題，每個含 question 與 why
- improvement_plan：4–8 項，按優先級排列，含 priority（P0/P1/P2/P3）、title、description

所有文字使用繁體中文。`;
  }

  /**
   * 在送給 Gemini 前清理 portfolio 文字中會破壞 JSON 的危險字元
   * 不修改文意，只把原始字元替換為 JSON 安全的等效字元
   */
  function sanitizePortfolioText(text) {
    if (!text) return text;
    return text
      // 半形引號換成全形，防止 Gemini 回傳時未逸脫
      .replace(/"/g, '\u201C').replace(/"/g, '\u201D')
      .replace(/'/g, '\u2018').replace(/'/g, '\u2019')
      // 反斜線替換（防止錯誤逸脫序列）
      .replace(/\\/g, '／')
      // 移除不可見控制字元（保留 \n \t）
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      // 壓縮多餘空行
      .replace(/\n{4,}/g, '\n\n\n');
  }

  /**
   * 發送單次 API 請求（含 HTTP 503 指數退避重試、備援模型、思考預算控制）
   */
  async function doRequest({ portfolioText, imageParts, schools, parseWarnings, isRetry = false, onProgress }) {
    // 清理輸入文字，避免特殊字元破壞 JSON 輸出
    const safePortfolioText = sanitizePortfolioText(portfolioText);

    const systemInstructionText = isRetry
      ? '你是一位 JSON 輸出機器。你只能輸出純 JSON，不包含任何 Markdown、說明文字或額外文字。上一個回應格式有誤，請重新根據 Schema 輸出完整、合法的 JSON。所有字串欄位中禁止使用半形引號，請改用全形引號「」。'
      : '你是一位台灣頂尖大學招生顧問與學習歷程評估專家。你只能輸出純 JSON，絕對不能輸出 Markdown、說明文字或任何 JSON 以外的內容。所有字串欄位中禁止使用半形引號（"），請改用全形引號（「」）或省略。所有字串欄位中禁止換行符直接出現，請改用空格。';

    const promptText = buildPrompt(safePortfolioText, schools, parseWarnings);
    const parts = [{ text: promptText }];

    for (const img of imageParts) {
      const [, b64data] = img.dataUrl.split(',');
      parts.push({
        inlineData: {
          mimeType: img.mimeType || 'image/jpeg',
          data: b64data,
        }
      });
      parts.push({ text: `（以上為圖片檔案：${img.fileName}）` });
    }

    const body = {
      systemInstruction: {
        parts: [{ text: systemInstructionText }],
      },
      contents: [{ role: 'user', parts }],
      generationConfig: {
        temperature: 0.1,   // 極低 temperature，減少格式創意錯誤
        topP: 0.8,
        maxOutputTokens: 32768, // 充足的輸出空間（Gemini 2.5/3 支援至 65536），防止截斷
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
        thinkingConfig: {
          // 首次正常評估給予 2048 tokens 深度思考以保證評價品質；Retry 時為 0 避免思考耗時且避免超額
          thinkingBudget: isRetry ? 0 : 2048,
        },
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH',        threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',  threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT',  threshold: 'BLOCK_NONE' },
      ],
    };

    // 主要模型與備援模型候選清單
    const candidateModels = [MODEL, 'gemini-3.8-flash', 'gemini-3.5-flash'];
    let lastError = null;

    for (let mIdx = 0; mIdx < candidateModels.length; mIdx++) {
      const currentModel = candidateModels[mIdx];
      const url = `${API_BASE}/${currentModel}:generateContent?key=${_apiKey}`;
      const MAX_HTTP_ATTEMPTS = 3;

      for (let attempt = 1; attempt <= MAX_HTTP_ATTEMPTS; attempt++) {
        let resp;
        try {
          resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
        } catch (netErr) {
          lastError = new Error('網路連線錯誤，請確認網路後重試。');
          if (attempt < MAX_HTTP_ATTEMPTS) {
            const waitSec = attempt * 2;
            if (onProgress) onProgress('server_retry', { attempt, maxAttempts: MAX_HTTP_ATTEMPTS, waitSec, status: '連線異常' });
            await new Promise(r => setTimeout(r, waitSec * 1000));
            continue;
          }
          break;
        }

        if (!resp.ok) {
          let serverMsg = '';
          try {
            const errData = await resp.json();
            serverMsg = errData.error?.message || '';
          } catch (_) { /* ignore */ }

          // 判斷是否為暫時性伺服器過載 (503, 500, 502, 504)
          const isServerBusy = [500, 502, 503, 504].includes(resp.status);
          if (isServerBusy && attempt < MAX_HTTP_ATTEMPTS) {
            const waitSec = attempt * 2.5;
            console.warn(`[GeminiAPI] ${currentModel} HTTP ${resp.status}，將於 ${waitSec} 秒後進行第 ${attempt}/${MAX_HTTP_ATTEMPTS} 次重試…`);
            if (onProgress) onProgress('server_retry', { attempt, maxAttempts: MAX_HTTP_ATTEMPTS, waitSec, status: resp.status });
            await new Promise(r => setTimeout(r, waitSec * 1000));
            continue;
          }

          // 若為 503 或 429 配額用盡，且還有備援模型，切換至備援模型
          if ((resp.status === 503 || resp.status === 429) && mIdx < candidateModels.length - 1) {
            const nextModel = candidateModels[mIdx + 1];
            console.warn(`[GeminiAPI] ${currentModel} (HTTP ${resp.status})，切換至備援模型 ${nextModel}…`);
            if (onProgress) onProgress('server_retry', { attempt: 1, maxAttempts: 1, waitSec: 1, status: `${currentModel} 忙碌，切換備用模型` });
            await new Promise(r => setTimeout(r, 1000));
            break; // 跳出此模型的 attempt 迴圈，換下一個模型
          }

          lastError = new Error(friendlyHttpError(resp.status, serverMsg));
          throw lastError;
        }

        const data = await resp.json();
        const candidate = data.candidates?.[0];

        if (!candidate) {
          throw new Error('Gemini 未回傳任何分析結果，請重試。');
        }
        if (candidate.finishReason === 'SAFETY') {
          throw new Error('Gemini 因安全政策拒絕分析，請確認上傳內容是否符合使用條款。');
        }
        if (candidate.finishReason === 'RECITATION') {
          throw new Error('Gemini 回傳因版權問題被截斷，請嘗試減少引用內容後重試。');
        }
        if (candidate.finishReason === 'MAX_TOKENS') {
          throw new Error('Gemini 回應超過長度上限被截斷，請嘗試縮減學習歷程文字或分批上傳。');
        }

        const rawText = candidate.content?.parts?.[0]?.text;
        if (!rawText || !rawText.trim()) {
          throw new Error('Gemini 回傳空白結果，請重試。');
        }

        return rawText;
      }
    }

    throw lastError || new Error('無法完成 Gemini 請求，請稍後再試。');
  }

  /**
   * 主要分析函式（含自動 Retry）
   */
  async function analyzePortfolio({ portfolioText, imageParts, schools, parseWarnings, onProgress }) {
    if (!hasApiKey()) throw new Error('請先輸入有效的 Gemini API Key');

    if (onProgress) onProgress('sending');

    // 第一次請求
    let rawText;
    try {
      rawText = await doRequest({ portfolioText, imageParts, schools, parseWarnings, isRetry: false, onProgress });
    } catch (err) {
      throw err;
    }

    // 嘗試解析
    let parsed = AssessmentParser.parseGeminiResponse(rawText);

    if (parsed.error) {
      // 自動 Retry 一次
      console.warn('[GeminiAPI] 第一次回應解析失敗，進行 Retry：', parsed.error);
      if (onProgress) onProgress('retry');

      let retryRaw;
      try {
        retryRaw = await doRequest({ portfolioText, imageParts, schools, parseWarnings, isRetry: true, onProgress });
      } catch (retryErr) {
        throw retryErr;
      }

      const retryParsed = AssessmentParser.parseGeminiResponse(retryRaw);

      if (retryParsed.error) {
        console.error('[GeminiAPI] Retry 後仍失敗：', retryParsed.error);
        throw new Error('AI 分析暫時無法完成，請稍後重新嘗試。');
      }

      return retryParsed.data;
    }

    return parsed.data;
  }

  return {
    setApiKey,
    getApiKey,
    hasApiKey,
    validateApiKey,
    analyzePortfolio,
    MODEL,
  };
})();
