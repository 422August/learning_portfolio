# AI 學習歷程評估平台

> 從你的學習歷程出發，讓 AI 幫你看見教授眼中的你。

## 如何啟動

```bash
cd learning_portfolio
python3 -m http.server 8080
# 在瀏覽器開啟 http://localhost:8080
```

## Gemini API Key

1. 前往 https://aistudio.google.com/app/apikey 取得免費 Key
2. 在首頁「步驟 1」貼上 API Key
3. 點擊「驗證」確認有效

## 專案結構

- index.html   — 主頁面
- style.css    — 樣式
- app.js       — 主邏輯
- gemini.js    — Gemini API 整合
- parser.js    — 檔案解析

## 支援格式：PDF, DOCX, TXT, MD, PNG, JPG（單檔上限 15MB）

## 聲明：AI 評估僅供參考，不代表實際招生結果。