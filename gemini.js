/* =========================================================
   gemini.js — 多服務商 LLM API 整合模組
   支援：Google Gemini、OpenAI、Anthropic Claude、OpenRouter、Groq、自訂 OpenAI 相容端點
   輸出均以 AssessmentParser 解析並正規化
   ========================================================= */

const GeminiAPI = (() => {

  const PROVIDERS = {
    gemini: {
      id: 'gemini',
      name: 'Google Gemini',
      type: 'gemini',
      defaultModel: 'gemini-3.8-flash',
      models: [
        { id: 'gemini-4-argon',        name: 'Gemini 4 Argon (旗艦推理)' },
        { id: 'gemini-3.8-flash',      name: 'Gemini 3.8 Flash (主力平衡)' },
        { id: 'gemini-3.1-pro',        name: 'Gemini 3.1 Pro (複雜任務)' },
        { id: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash-Lite (低延遲)' },
        { id: 'gemini-2.5-flash',      name: 'Gemini 2.5 Flash' },
        { id: 'gemini-2.5-pro',        name: 'Gemini 2.5 Pro' },
        { id: 'gemini-2.0-flash',      name: 'Gemini 2.0 Flash' },
        { id: 'gemini-1.5-flash',      name: 'Gemini 1.5 Flash' },
      ],
      placeholder: 'AIza…',
      hintHtml: '前往 <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener">Google AI Studio</a> 免費取得。',
      needBaseUrl: false,
      defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
    },
    openai: {
      id: 'openai',
      name: 'OpenAI (ChatGPT)',
      type: 'openai',
      defaultModel: 'gpt-6.1-sol',
      models: [
        { id: 'gpt-6-astra',   name: 'GPT-6 Astra (最強旗艦・深度推理)' },
        { id: 'gpt-6.1-sol',   name: 'GPT-6.1 Sol (高性價比主力・推薦)' },
        { id: 'gpt-6-luna',    name: 'GPT-6 Luna (極速輕量)' },
        { id: 'gpt-5.6-sol',   name: 'GPT-5.6 Sol (前代穩定主力)' },
        { id: 'gpt-5.6-terra', name: 'GPT-5.6 Terra (前代平衡版)' },
        { id: 'gpt-5.6-luna',  name: 'GPT-5.6 Luna (前代輕量版)' },
        { id: 'gpt-4o-mini',   name: 'GPT-4o mini' },
        { id: 'gpt-4o',        name: 'GPT-4o' },
      ],
      placeholder: 'sk-…',
      hintHtml: '前往 <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener">OpenAI Platform</a> 取得 API Key。',
      needBaseUrl: false,
      defaultBaseUrl: 'https://api.openai.com/v1',
    },
    anthropic: {
      id: 'anthropic',
      name: 'Anthropic Claude',
      type: 'anthropic',
      defaultModel: 'claude-sonnet-5-5',
      models: [
        { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5 (黃金平衡・最推薦)' },
        { id: 'claude-fable-5-1',  name: 'Claude Fable 5.1 (地表最強推理)' },
        { id: 'claude-opus-5-5',   name: 'Claude Opus 5.5 (企業級全能旗艦)' },
        { id: 'claude-haiku-5-5',  name: 'Claude Haiku 5.5 (極速高性價比)' },
        { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
        { id: 'claude-3-5-haiku-20241022',  name: 'Claude 3.5 Haiku' },
      ],
      placeholder: 'sk-ant-…',
      hintHtml: '前往 <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">Anthropic Console</a> 取得 API Key。',
      needBaseUrl: false,
      defaultBaseUrl: 'https://api.anthropic.com/v1',
    },
    openrouter: {
      id: 'openrouter',
      name: 'OpenRouter (多模型/含免費額度)',
      type: 'openai',
      defaultModel: 'google/gemini-2.0-flash-exp:free',
      models: [
        { id: 'google/gemini-2.0-flash-exp:free',  name: 'Gemini 2.0 Flash (免費額度)' },
        { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B (免費額度)' },
        { id: 'deepseek/deepseek-chat',            name: 'DeepSeek V3 (極高性價比)' },
        { id: 'anthropic/claude-3.5-sonnet',       name: 'Claude 3.5 Sonnet' },
        { id: 'openai/gpt-4o-mini',                name: 'GPT-4o mini' },
      ],
      placeholder: 'sk-or-…',
      hintHtml: '前往 <a href="https://openrouter.ai/keys" target="_blank" rel="noopener">OpenRouter</a> 取得。提供多款免費模型，額度受限時的推薦選擇。',
      needBaseUrl: false,
      defaultBaseUrl: 'https://openrouter.ai/api/v1',
    },
    groq: {
      id: 'groq',
      name: 'Groq (極速 Llama / 免費額度)',
      type: 'openai',
      defaultModel: 'llama-3.3-70b-versatile',
      models: [
        { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B (推薦・超快速度)' },
        { id: 'llama-3.1-8b-instant',    name: 'Llama 3.1 8B (極輕量)' },
        { id: 'mixtral-8x7b-32768',      name: 'Mixtral 8x7B' },
      ],
      placeholder: 'gsk_…',
      hintHtml: '前往 <a href="https://console.groq.com/keys" target="_blank" rel="noopener">Groq Console</a> 免費取得，速度極快且每日有充裕免費額度。',
      needBaseUrl: false,
      defaultBaseUrl: 'https://api.groq.com/openai/v1',
    },
    custom: {
      id: 'custom',
      name: '自訂 OpenAI 相容端點',
      type: 'openai',
      defaultModel: 'deepseek-chat',
      models: [
        { id: 'deepseek-chat',     name: 'DeepSeek V3 (https://api.deepseek.com/v1)' },
        { id: 'deepseek-reasoner', name: 'DeepSeek R1 (推理模型)' },
      ],
      placeholder: 'API Key（本機模型若無驗證可填任意字）',
      hintHtml: '支援 DeepSeek、Ollama（本機）、vLLM 或任何相容 OpenAI 格式的 API 端點。',
      needBaseUrl: true,
      defaultBaseUrl: 'https://api.deepseek.com/v1',
    },
  };

  // 當前狀態（API Key 僅在記憶體中維護，不寫入 localStorage）
  let _providerId = 'gemini';
  let _model = PROVIDERS.gemini.defaultModel;
  let _baseUrl = PROVIDERS.gemini.defaultBaseUrl;
  const _apiKeys = {
    gemini: '',
    openai: '',
    anthropic: '',
    openrouter: '',
    groq: '',
    custom: '',
  };

  function setProvider(id) {
    if (!PROVIDERS[id]) id = 'gemini';
    _providerId = id;
    const p = PROVIDERS[id];
    _model = p.defaultModel;
    _baseUrl = p.defaultBaseUrl;
  }

  function getProvider() {
    return _providerId;
  }

  function getProviderInfo() {
    return PROVIDERS[_providerId] || PROVIDERS.gemini;
  }

  function getProviders() {
    return PROVIDERS;
  }

  function setModel(m) {
    _model = m ? m.trim() : (PROVIDERS[_providerId]?.defaultModel || 'gemini-3.8-flash');
  }

  function getModel() {
    return _model;
  }

  function setBaseUrl(url) {
    _baseUrl = url ? url.trim() : (PROVIDERS[_providerId]?.defaultBaseUrl || '');
  }

  function getBaseUrl() {
    return _baseUrl || (PROVIDERS[_providerId]?.defaultBaseUrl || '');
  }

  function setApiKey(key) {
    _apiKeys[_providerId] = key ? key.trim() : '';
  }

  function getApiKey() {
    return _apiKeys[_providerId] || '';
  }

  function hasApiKey() {
    const k = getApiKey();
    return Boolean(k && k.length > 0);
  }

  /**
   * 將 HTTP 錯誤碼轉換為使用者友善訊息
   */
  function friendlyHttpError(status, serverMsg, providerInfo) {
    const pName = providerInfo ? providerInfo.name : 'AI';
    const msg = String(serverMsg || '');

    // 優先判定是否為 API Key 無效（Google 常以 400 回傳 API_KEY_INVALID）
    if (msg.includes('API key not valid') || msg.includes('API_KEY_INVALID') || msg.includes('invalid_api_key') || msg.includes('Incorrect API key') || status === 401) {
      return `${pName} API Key 無效，請確認所輸入的 Key 是否正確。`;
    }
    if (msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('Rate limit') || msg.includes('rate_limit') || status === 429) {
      return `${pName} 目前 API 使用量或請求頻率已達限制（HTTP 429），請稍候重試或更換服務商／模型。`;
    }
    if (msg.includes('is not found') || msg.includes('not supported for generateContent') || msg.includes('model_not_found') || msg.includes('does not exist') || status === 404) {
      return `${pName} 找不到指定的模型或端點未開放，請確認模型 ID 是否正確或切換其他模型。`;
    }

    switch (status) {
      case 400: return `${pName} API 請求格式錯誤。` + (serverMsg ? `（${serverMsg}）` : '');
      case 403: return `${pName} API Key 無效或未開通權限，請前往該服務商平台確認。`;
      case 500: return `${pName} 伺服器發生內部錯誤，請稍後重試。`;
      case 502:
      case 503:
      case 504: return `${pName} 伺服器目前忙碌（HTTP ${status}），系統會自動重試，亦可稍後重試。`;
      default:  return serverMsg || `${pName} 回應異常（HTTP ${status}），請重試。`;
    }
  }

  /**
   * 驗證 API Key（發送最小測試請求）
   */
  async function validateApiKey(key) {
    const testKey = key ? key.trim() : getApiKey();
    const prov = getProviderInfo();
    if (!testKey) throw new Error(`請先輸入 ${prov.name} API Key`);

    const currentModel = _model || prov.defaultModel;
    const currentBaseUrl = getBaseUrl();

    try {
      if (prov.type === 'gemini') {
        const body = {
          contents: [{ role: 'user', parts: [{ text: 'Hi' }] }],
        };
        const url = `${currentBaseUrl}/${currentModel}:generateContent?key=${testKey}`;
        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (resp.ok) {
          return { ok: true, message: `✓ ${prov.name} API Key 有效（${currentModel}）` };
        }

        const errData = await resp.json().catch(() => ({}));
        const serverMsg = errData.error?.message || '';

        // 明確 API Key 無效
        if (serverMsg.includes('API key not valid') || serverMsg.includes('API_KEY_INVALID') || resp.status === 401 || resp.status === 403) {
          throw new Error(`${prov.name} API Key 無效，請確認所輸入的 Key 是否正確。`);
        }

        // 若當前模型端點未開放或回傳 400/404，嘗試用已開放的穩定模型驗證 Key 本身是否有效
        const fallbackCandidates = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'].filter(m => m !== currentModel);
        for (const fbModel of fallbackCandidates) {
          try {
            const fbResp = await fetch(`${currentBaseUrl}/${fbModel}:generateContent?key=${testKey}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            });
            if (fbResp.ok) {
              return {
                ok: true,
                warning: true,
                message: `✓ API Key 有效！但 Google 尚未開放「${currentModel}」公開端點，建議切換為 ${fbModel} 即可順利分析。`,
              };
            }
            const fbErr = await fbResp.json().catch(() => ({}));
            const fbMsg = fbErr.error?.message || '';
            if (fbMsg.includes('API key not valid') || fbMsg.includes('API_KEY_INVALID')) {
              throw new Error(`${prov.name} API Key 無效，請確認所輸入的 Key 是否正確。`);
            }
          } catch (innerErr) {
            if (innerErr.message && innerErr.message.includes('API Key 無效')) throw innerErr;
          }
        }

        throw new Error(friendlyHttpError(resp.status, serverMsg, prov));

      } else if (prov.type === 'anthropic') {
        const url = `${currentBaseUrl.replace(/\/+$/, '')}/messages`;
        const testPayload = {
          model: currentModel,
          max_tokens: 5,
          messages: [{ role: 'user', content: 'Hi' }],
        };
        const resp = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': testKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
          },
          body: JSON.stringify(testPayload),
        });
        if (resp.ok) return { ok: true, message: `✓ Anthropic API Key 有效（${currentModel}）` };
        const errData = await resp.json().catch(() => ({}));
        const serverMsg = errData.error?.message || '';

        // 嘗試備用已公開模型確認 Key 本身有效性
        if (resp.status === 404 || serverMsg.includes('not_found')) {
          const fallbackCandidates = ['claude-3-5-haiku-20241022', 'claude-3-5-sonnet-20241022'].filter(m => m !== currentModel);
          for (const fbModel of fallbackCandidates) {
            try {
              const fbResp = await fetch(url, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'x-api-key': testKey,
                  'anthropic-version': '2023-06-01',
                  'anthropic-dangerous-direct-browser-access': 'true',
                },
                body: JSON.stringify({ ...testPayload, model: fbModel }),
              });
              if (fbResp.ok) {
                return {
                  ok: true,
                  warning: true,
                  message: `✓ API Key 有效！但 Anthropic 尚未開放「${currentModel}」，建議切換為 ${fbModel}。`,
                };
              }
            } catch (_) {}
          }
        }
        throw new Error(friendlyHttpError(resp.status, serverMsg, prov));

      } else {
        // OpenAI / Groq / OpenRouter / Custom (OpenAI-compatible)
        const base = currentBaseUrl.replace(/\/+$/, '');
        const url = base.endsWith('/chat/completions') ? base : `${base}/chat/completions`;
        const headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${testKey}`,
        };
        if (prov.id === 'openrouter') {
          headers['HTTP-Referer'] = window.location?.origin || 'http://localhost';
          headers['X-Title'] = '學習歷程評估平台';
        }
        const resp = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: currentModel,
            messages: [{ role: 'user', content: 'Hi' }],
            max_tokens: 5,
          }),
        });
        if (resp.ok) return { ok: true, message: `✓ ${prov.name} API Key 有效（${currentModel}）` };
        const errData = await resp.json().catch(() => ({}));
        const serverMsg = errData.error?.message || '';

        if (prov.id === 'openai' && (resp.status === 404 || serverMsg.includes('model_not_found'))) {
          const fallbackCandidates = ['gpt-4o-mini', 'gpt-4o'].filter(m => m !== currentModel);
          for (const fbModel of fallbackCandidates) {
            try {
              const fbResp = await fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                  model: fbModel,
                  messages: [{ role: 'user', content: 'Hi' }],
                  max_tokens: 5,
                }),
              });
              if (fbResp.ok) {
                return {
                  ok: true,
                  warning: true,
                  message: `✓ API Key 有效！但 OpenAI 尚未開放「${currentModel}」，建議切換為 ${fbModel}。`,
                };
              }
            } catch (_) {}
          }
        }

        throw new Error(friendlyHttpError(resp.status, serverMsg, prov));
      }
    } catch (err) {
      if (err.message && (err.message.includes('API Key') || err.message.includes('HTTP') || err.message.includes('格式錯誤') || err.message.includes('端點') || err.message.includes('尚未開放') || err.message.includes('限制'))) {
        throw err;
      }
      throw new Error(`網路連線異常，無法連接至 ${prov.name} 端點，請確認網路或 Base URL。`);
    }
  }

  // ----------------------------------------------------------
  // responseSchema：精確的 JSON 結構（用於 Gemini 原生 Schema）
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
      file_analysis: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            file_name:  { type: 'STRING' },
            role:       { type: 'STRING' },
            score:      { type: 'INTEGER' },
            highlights: { type: 'STRING' },
            issues:     { type: 'STRING' },
          },
          required: ['file_name', 'role', 'score', 'highlights', 'issues'],
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
      'interview_questions','improvement_plan','file_analysis',
    ],
  };

  /**
   * 依模式取得 Schema：單一學習歷程模式不含校系相關欄位
   */
  function getSchema(mode) {
    if (mode !== 'single') return RESPONSE_SCHEMA;
    const schema = JSON.parse(JSON.stringify(RESPONSE_SCHEMA));
    const drop = ['fit_analysis', 'professor_reviews', 'interview_questions'];
    drop.forEach(k => delete schema.properties[k]);
    schema.required = schema.required.filter(k => !drop.includes(k));
    delete schema.properties.skills.properties.fit;
    schema.properties.skills.required = schema.properties.skills.required.filter(k => k !== 'fit');
    return schema;
  }

  const MODE_INTROS = {
    apply: `【分析模式：個人申請】
這是一般大學個人申請的備審資料（含學習歷程、自傳、讀書計畫等）。請以書面審查與面試委員的角度，評估整體資料與目標校系的契合度與競爭力。`,
    special: `【分析模式：特殊選才】
這是大學特殊選才的申請資料。特殊選才重視特殊專長、突出成就、非典型學習背景與對該領域的熱忱，不以一般學業成績為主要依據。請以特殊選才審查委員的角度，評估申請者的專長深度、實績，以及與目標校系的契合度。`,
    single: `【分析模式：單一學習歷程分析】
這不是備審資料，也沒有目標校系。使用者只提供「單一一份學習歷程」（例如一份課程學習成果、探究實作、多元表現或專題），請只針對這一份內容本身進行分析：主題與問題意識、方法與過程、成果品質、反思深度、呈現方式與可改進之處。不要評估校系契合度、不要模擬教授審查、不要設計面試題，也不要把它當成完整備審資料來評價整體申請競爭力。`,
  };

  /**
   * 建立完整的評估 Prompt（System Instruction 風格）
   */
  function buildPrompt(portfolioText, schools, parseWarnings, mode = 'apply', criteria = '', fileNames = []) {
    const schoolList = schools
      .map((s, i) => `  ${i + 1}. ${s.university}｜${s.department}`)
      .join('\n');

    const warningBlock = parseWarnings.length > 0
      ? `\n【注意：以下檔案無法完整解析，僅供參考】\n${parseWarnings.join('\n')}\n`
      : '';

    return `你是一位台灣頂尖大學招生顧問與學習歷程評估專家。

${MODE_INTROS[mode] || MODE_INTROS.apply}

【輸出規則 — 嚴格遵守】
- 你只能輸出符合指定 JSON 格式的純 JSON 資料
- 不要輸出任何 Markdown 格式（不要使用 \`\`\`json 或 \`\`\`）
- 不要在 JSON 前後加入任何說明文字或註解
- 所有文字內容中的雙引號必須正確 escaped（\\\"）
- JSON 必須完整結束，不可截斷

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

【評分原則】
- 分數僅作為 0–100 的相對參考尺度，不設固定的平均分或分佈，請依內容的實際證據與品質自由評分
- 不得因為文字寫得漂亮、資料多或看起來努力就給予虛高分數，也不必刻意壓低分數
- 評分必須有學習歷程中的具體內容作為依據

${criteria && mode !== 'single' ? `【使用者提供的審查重點／招生簡章內容】
${criteria}
（請優先依據以上內容判斷校系契合度、教授關注面向與面試問題；若與一般認知不同，以使用者提供的內容為準）

` : ''}${mode === 'single' ? '' : `【目標校系】
${schoolList}
（以第一個目標校系為主要分析對象）
`}
【上傳的檔案清單】
${fileNames.length ? fileNames.map((n, i) => `  ${i + 1}. ${n}`).join('\n') : '（無）'}

【學習歷程內容】
${warningBlock}
${portfolioText || '（未提供任何文字內容，請根據已上傳的圖片進行分析）'}

---

${mode === 'single' ? `請輸出完整 JSON，包含：
- overall_score：0–100 整數（這份學習歷程本身的品質）
- summary：60–100 字繁體中文總結
- inference_note：如有 AI 推論說明，否則輸出空字串
- skills：9 個能力維度（academic/professional/practical/creativity/problem_solving/self_learning/communication/reflection/interdisciplinary），每項含 score（0–100）與 reason（20–40字）
- strengths：3–6 項優勢，每項含 title、evidence（引用具體內容）、value
- weaknesses：3–6 項弱點，每項含 problem、severity、reason、improvement
- key_points：4–7 項，每項 15–30 字
- file_analysis：針對上述每個檔案各一項，含 file_name（須與檔案清單一致）、role（該檔案的性質與內容）、score（0–100）、highlights（亮點）、issues（問題）
- improvement_plan：4–8 項，按優先級排列，含 priority（P0/P1/P2/P3）、title、description` : `請輸出完整 JSON，包含：
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
- file_analysis：針對上述每個檔案各一項，含 file_name（須與檔案清單一致）、role（該檔案的性質與內容）、score（0–100）、highlights（亮點）、issues（問題）
- improvement_plan：4–8 項，按優先級排列，含 priority（P0/P1/P2/P3）、title、description`}

所有文字使用繁體中文。`;
  }

  function sanitizePortfolioText(text) {
    if (!text) return text;
    return text
      .replace(/"/g, '\u201C').replace(/"/g, '\u201D')
      .replace(/'/g, '\u2018').replace(/'/g, '\u2019')
      .replace(/\\/g, '／')
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      .replace(/\n{4,}/g, '\n\n\n');
  }

  /**
   * 呼叫 Google Gemini API
   */
  async function callGeminiApi({ system, prompt, images, isRetry, maxTokens, temperature, responseSchema, onProgress }) {
    const candidateModels = [_model, 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
    const uniqueModels = Array.from(new Set(candidateModels));
    const apiKey = getApiKey();
    const baseUrl = getBaseUrl();
    let lastError = null;

    const parts = [{ text: prompt }];
    for (const img of images) {
      const [, b64data] = (img.dataUrl || '').split(',');
      if (b64data) {
        parts.push({
          inlineData: {
            mimeType: img.mimeType || 'image/jpeg',
            data: b64data,
          }
        });
        parts.push({ text: `（以上為圖片檔案：${img.fileName}）` });
      }
    }

    const body = {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts }],
      generationConfig: {
        temperature: temperature ?? 0.1,
        topP: 0.8,
        maxOutputTokens: maxTokens || 32768,
        responseMimeType: 'application/json',
        ...(responseSchema ? { responseSchema } : {}),
        thinkingConfig: { thinkingBudget: isRetry ? 0 : 2048 },
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH',        threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',  threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT',  threshold: 'BLOCK_NONE' },
      ],
    };

    for (let mIdx = 0; mIdx < uniqueModels.length; mIdx++) {
      const currentModel = uniqueModels[mIdx];
      const url = `${baseUrl}/${currentModel}:generateContent?key=${apiKey}`;
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
          } catch (_) {}

          // 若因 thinkingConfig 導致 400，移除後即刻重試
          if (resp.status === 400 && body.generationConfig?.thinkingConfig) {
            delete body.generationConfig.thinkingConfig;
            continue;
          }

          const isServerBusy = [500, 502, 503, 504].includes(resp.status);
          if (isServerBusy && attempt < MAX_HTTP_ATTEMPTS) {
            const waitSec = attempt * 2.5;
            if (onProgress) onProgress('server_retry', { attempt, maxAttempts: MAX_HTTP_ATTEMPTS, waitSec, status: resp.status });
            await new Promise(r => setTimeout(r, waitSec * 1000));
            continue;
          }

          // 若該模型在端點不支援或找不到（404 或 400 not found / invalid argument），切換下一個備用模型
          const isModelUnavailable = resp.status === 404 ||
            (resp.status === 400 && (serverMsg.includes('not found') || serverMsg.includes('not supported') || serverMsg.includes('Request contains an invalid argument')));
          if ((resp.status === 503 || resp.status === 429 || isModelUnavailable) && mIdx < uniqueModels.length - 1) {
            const nextModel = uniqueModels[mIdx + 1];
            if (onProgress) onProgress('server_retry', { attempt: 1, maxAttempts: 1, waitSec: 1, status: `${currentModel} 暫無法使用，切換備用模型 ${nextModel}` });
            await new Promise(r => setTimeout(r, 1000));
            break;
          }

          lastError = new Error(friendlyHttpError(resp.status, serverMsg, PROVIDERS.gemini));
          throw lastError;
        }

        const data = await resp.json();
        const candidate = data.candidates?.[0];
        if (!candidate) throw new Error('Gemini 未回傳任何分析結果，請重試。');
        if (candidate.finishReason === 'SAFETY') throw new Error('Gemini 因安全政策拒絕分析，請確認上傳內容是否符合使用條款。');
        if (candidate.finishReason === 'MAX_TOKENS') throw new Error('Gemini 回應超過長度上限被截斷，請嘗試縮減內容。');

        const rawText = candidate.content?.parts?.[0]?.text;
        if (!rawText || !rawText.trim()) throw new Error('Gemini 回傳空白結果，請重試。');
        return rawText;
      }
    }

    throw lastError || new Error('無法完成 Gemini 請求，請稍後再試。');
  }

  /**
   * 呼叫 Anthropic Messages API
   */
  async function callAnthropicApi({ system, prompt, images, maxTokens, temperature, onProgress }) {
    const prov = PROVIDERS.anthropic;
    const apiKey = getApiKey();
    const baseUrl = getBaseUrl().replace(/\/+$/, '');
    const url = `${baseUrl}/messages`;
    const model = _model || prov.defaultModel;

    const userContent = [{ type: 'text', text: prompt }];
    for (const img of images) {
      const [, b64] = (img.dataUrl || '').split(',');
      if (b64) {
        userContent.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: img.mimeType || 'image/jpeg',
            data: b64,
          },
        });
        userContent.push({ type: 'text', text: `（以上為圖片檔案：${img.fileName}）` });
      }
    }

    const body = {
      model,
      system,
      messages: [{ role: 'user', content: userContent }],
      max_tokens: Math.min(maxTokens || 8192, 8192),
      temperature: temperature ?? 0.1,
    };

    let lastError = null;
    const MAX_ATTEMPTS = 3;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      let resp;
      try {
        resp = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
          },
          body: JSON.stringify(body),
        });
      } catch (err) {
        lastError = new Error('網路連線錯誤，請確認網路狀態後重試。');
        if (attempt < MAX_ATTEMPTS) {
          await new Promise(r => setTimeout(r, attempt * 2000));
          continue;
        }
        break;
      }

      if (!resp.ok) {
        let serverMsg = '';
        try {
          const errData = await resp.json();
          serverMsg = errData.error?.message || '';
        } catch (_) {}

        if ([500, 502, 503, 529].includes(resp.status) && attempt < MAX_ATTEMPTS) {
          const waitSec = attempt * 2.5;
          if (onProgress) onProgress('server_retry', { attempt, maxAttempts: MAX_ATTEMPTS, waitSec, status: resp.status });
          await new Promise(r => setTimeout(r, waitSec * 1000));
          continue;
        }
        throw new Error(friendlyHttpError(resp.status, serverMsg, prov));
      }

      const data = await resp.json();
      const textPart = data.content?.find(c => c.type === 'text');
      const rawText = textPart?.text || data.content?.[0]?.text;
      if (!rawText || !rawText.trim()) throw new Error('Claude 回傳空白結果，請重試。');
      return rawText;
    }

    throw lastError || new Error('無法完成 Anthropic 請求，請稍後再試。');
  }

  /**
   * 呼叫 OpenAI 相容端點（OpenAI、OpenRouter、Groq、Custom）
   */
  async function callOpenAiCompatibleApi({ system, prompt, images, maxTokens, temperature, onProgress }) {
    const prov = getProviderInfo();
    const apiKey = getApiKey();
    const base = getBaseUrl().replace(/\/+$/, '');
    const url = base.endsWith('/chat/completions') ? base : `${base}/chat/completions`;
    const model = _model || prov.defaultModel;

    const userContent = [{ type: 'text', text: prompt }];
    for (const img of images) {
      if (img.dataUrl) {
        userContent.push({
          type: 'image_url',
          image_url: { url: img.dataUrl },
        });
        userContent.push({ type: 'text', text: `（以上為圖片檔案：${img.fileName}）` });
      }
    }

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    };
    if (prov.id === 'openrouter') {
      headers['HTTP-Referer'] = window.location?.origin || 'http://localhost';
      headers['X-Title'] = '學習歷程評估平台';
    }

    const body = {
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userContent.length === 1 ? prompt : userContent },
      ],
      temperature: temperature ?? 0.1,
      max_tokens: Math.min(maxTokens || 16384, 16384),
    };

    // 多數 OpenAI 相容模型支援 response_format: json_object
    if (['openai', 'groq', 'openrouter', 'custom'].includes(prov.id)) {
      body.response_format = { type: 'json_object' };
    }

    let lastError = null;
    const MAX_ATTEMPTS = 3;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      let resp;
      try {
        resp = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        });
      } catch (err) {
        lastError = new Error('網路連線錯誤，請確認網路狀態後重試。');
        if (attempt < MAX_ATTEMPTS) {
          await new Promise(r => setTimeout(r, attempt * 2000));
          continue;
        }
        break;
      }

      if (!resp.ok) {
        let serverMsg = '';
        try {
          const errData = await resp.json();
          serverMsg = errData.error?.message || errData.message || '';
        } catch (_) {}

        // 若因 response_format 不被該自訂模型支援而報錯，移除後重試
        if (resp.status === 400 && body.response_format && serverMsg.includes('response_format')) {
          delete body.response_format;
          continue;
        }

        if ([500, 502, 503, 504].includes(resp.status) && attempt < MAX_ATTEMPTS) {
          const waitSec = attempt * 2.5;
          if (onProgress) onProgress('server_retry', { attempt, maxAttempts: MAX_ATTEMPTS, waitSec, status: resp.status });
          await new Promise(r => setTimeout(r, waitSec * 1000));
          continue;
        }

        throw new Error(friendlyHttpError(resp.status, serverMsg, prov));
      }

      const data = await resp.json();
      const choice = data.choices?.[0];
      const rawText = choice?.message?.content;
      if (!rawText || !rawText.trim()) throw new Error(`${prov.name} 回傳空白結果，請重試。`);
      return rawText;
    }

    throw lastError || new Error(`無法完成 ${prov.name} 請求，請稍後再試。`);
  }

  /**
   * 統派呼叫目前選定服務商
   */
  async function callCurrentProvider(args) {
    const prov = getProviderInfo();
    const apiKey = getApiKey();
    if (!apiKey) throw new Error(`請先輸入有效的 ${prov.name} API Key`);

    if (prov.type === 'gemini') {
      return callGeminiApi(args);
    } else if (prov.type === 'anthropic') {
      return callAnthropicApi(args);
    } else {
      return callOpenAiCompatibleApi(args);
    }
  }

  /**
   * 發送單次評估請求
   */
  async function doRequest({ portfolioText, imageParts, schools, parseWarnings, mode = 'apply', criteria = '', fileNames = [], isRetry = false, onProgress }) {
    const safePortfolioText = sanitizePortfolioText(portfolioText);
    const systemInstructionText = isRetry
      ? '你是一位 JSON 輸出機器。你只能輸出純 JSON，不包含任何 Markdown、說明文字或額外文字。上一個回應格式有誤，請重新根據 Schema 輸出完整、合法的 JSON。所有字串欄位中禁止使用半形引號，請改用全形引號「」。'
      : '你是一位台灣頂尖大學招生顧問與學習歷程評估專家。你只能輸出純 JSON，絕對不能輸出 Markdown、說明文字或任何 JSON 以外的內容。所有字串欄位中禁止使用半形引號（"），請改用全形引號（「」）或省略。所有字串欄位中禁止換行符直接出現，請改用空格。';

    const promptText = buildPrompt(safePortfolioText, schools, parseWarnings, mode, criteria, fileNames);

    return callCurrentProvider({
      system: systemInstructionText,
      prompt: promptText,
      images: imageParts || [],
      isRetry,
      maxTokens: 32768,
      temperature: 0.1,
      responseSchema: getSchema(mode),
      onProgress,
    });
  }

  /**
   * 主要分析函式（含自動 Retry）
   */
  async function analyzePortfolio({ portfolioText, imageParts, schools, parseWarnings, mode = 'apply', criteria = '', fileNames = [], onProgress }) {
    const prov = getProviderInfo();
    if (!hasApiKey()) throw new Error(`請先輸入有效的 ${prov.name} API Key`);

    if (onProgress) onProgress('sending');

    let rawText;
    try {
      rawText = await doRequest({ portfolioText, imageParts, schools, parseWarnings, mode, criteria, fileNames, isRetry: false, onProgress });
    } catch (err) {
      throw err;
    }

    let parsed = AssessmentParser.parseGeminiResponse(rawText, mode);
    if (parsed.error) {
      console.warn(`[${prov.name}] 第一次回應解析失敗，進行 Retry：`, parsed.error);
      if (onProgress) onProgress('retry');

      let retryRaw;
      try {
        retryRaw = await doRequest({ portfolioText, imageParts, schools, parseWarnings, mode, criteria, fileNames, isRetry: true, onProgress });
      } catch (retryErr) {
        throw retryErr;
      }

      const retryParsed = AssessmentParser.parseGeminiResponse(retryRaw, mode);
      if (retryParsed.error) {
        console.error(`[${prov.name}] Retry 後仍失敗：`, retryParsed.error);
        throw new Error('AI 分析暫時無法完成，請稍後重新嘗試。');
      }
      return retryParsed.data;
    }

    return parsed.data;
  }

  // ----------------------------------------------------------
  // 模擬面試：針對單一問題與使用者的回答給回饋
  // ----------------------------------------------------------
  const ANSWER_SCHEMA = {
    type: 'OBJECT',
    properties: {
      score:         { type: 'INTEGER' },
      verdict:       { type: 'STRING' },
      strengths:     { type: 'ARRAY', items: { type: 'STRING' } },
      improvements:  { type: 'ARRAY', items: { type: 'STRING' } },
      sample_answer: { type: 'STRING' },
    },
    required: ['score', 'verdict', 'strengths', 'improvements', 'sample_answer'],
  };

  async function reviewAnswer({ question, why, answer, schools, mode, summary, criteria, onProgress }) {
    const prov = getProviderInfo();
    if (!hasApiKey()) throw new Error(`請先輸入有效的 ${prov.name} API Key`);

    const target = (schools && schools[0]) ? `${schools[0].university}｜${schools[0].department}` : '（未指定）';
    const text = `你是一位台灣大學${mode === 'special' ? '特殊選才' : '個人申請'}的面試委員，正在協助考生練習面試。
【目標校系】${target}
${criteria ? `【審查重點】\n${criteria}\n` : ''}【考生學習歷程摘要】${summary || '（無）'}
【面試問題】${question}
${why ? `【提問原因】${why}\n` : ''}【考生的回答】
${answer}

請以面試委員的角度評估這份回答，輸出純 JSON：
- score：0–100 整數，依回答的實際品質評分
- verdict：一句話總評（30 字內）
- strengths：回答中的優點（1–4 項，引用回答中的具體內容）
- improvements：需要改進的地方（1–4 項，具體可執行）
- sample_answer：以考生的立場、根據其學習歷程重寫一段更好的示範回答（150–250 字）
所有文字使用繁體中文，字串中不要使用半形雙引號。`;

    const raw = await callCurrentProvider({
      system: '你是一位面試評審專家。你只能輸出符合格式的純 JSON。字串中禁止使用半形雙引號，請改用「」。不要輸出 Markdown 代碼塊或任何 JSON 以外的文字。',
      prompt: text,
      images: [],
      isRetry: false,
      maxTokens: 8192,
      temperature: 0.3,
      responseSchema: ANSWER_SCHEMA,
      onProgress,
    });

    let obj;
    try {
      obj = JSON.parse(raw);
    } catch (_) {
      const fixed = window.JSONRepair?.jsonrepair ? window.JSONRepair.jsonrepair(raw) : null;
      if (!fixed) throw new Error('AI 回應格式有誤，請重試。');
      obj = JSON.parse(fixed);
    }
    const arr = v => Array.isArray(v) ? v.map(x => String(x)) : [];
    return {
      score: Math.min(Math.max(Math.round(Number(obj.score) || 0), 0), 100),
      verdict: String(obj.verdict || ''),
      strengths: arr(obj.strengths),
      improvements: arr(obj.improvements),
      sample_answer: String(obj.sample_answer || ''),
    };
  }

  return {
    PROVIDERS,
    setProvider,
    getProvider,
    getProviderInfo,
    getProviders,
    setModel,
    getModel,
    setBaseUrl,
    getBaseUrl,
    setApiKey,
    getApiKey,
    hasApiKey,
    validateApiKey,
    analyzePortfolio,
    reviewAnswer,
    // 向下相容
    MODEL: PROVIDERS.gemini.defaultModel,
  };
})();
