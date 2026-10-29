// 線上試玩：瀏覽器直接連到「使用者自己電腦上的」Ollama（不需要任何金鑰）
// 提示詞與 JSON Schema 和 Python 版 src/eco_news_summary/cli.py 相同。

const SYSTEM_PROMPT =
  "你是一位生態保育新聞編輯。請只根據使用者提供的新聞內容，" +
  "用台灣慣用的繁體中文（zh-Hant-TW）整理 3 到 5 個重點，" +
  "每個重點一行、以「- 」開頭，不要加入原文沒有的資訊。";

const JSON_PROMPT =
  "你是一位生態保育新聞編輯。請只根據使用者提供的新聞內容，" +
  "用台灣慣用的繁體中文（zh-Hant-TW）輸出 JSON，欄位：title（標題）、" +
  "key_points（3 到 5 個重點）、topics（提到的物種或議題）、" +
  "sentiment（只能是 positive、neutral、negative 其中之一）。";

// 與 Python 的 NewsSummary（Pydantic）產生的 JSON Schema 相同
const NEWS_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "新聞標題（繁體中文）" },
    key_points: { type: "array", items: { type: "string" }, description: "3 到 5 個重點" },
    topics: { type: "array", items: { type: "string" }, description: "提到的物種或保育議題" },
    sentiment: { type: "string", enum: ["positive", "neutral", "negative"], description: "整體語氣" },
  },
  required: ["title", "key_points", "topics", "sentiment"],
};

const $ = (id) => document.getElementById(id);
const baseUrl = () => $("ollama-url").value.trim().replace(/\/+$/, "");
const modelName = () => $("model").value.trim();

function setStatus(msg, kind = "") {
  const el = $("status");
  el.textContent = msg;
  el.className = "status " + kind;
}

function connectionHelp() {
  return (
    `連不到 Ollama（${baseUrl()}）。可能原因：\n` +
    "1. Ollama 沒有在執行：請開啟 Ollama App，或在終端機執行 ollama serve。\n" +
    `2. 沒有允許這個網頁連線：請依下方說明設定 OLLAMA_ORIGINS（目前網頁來源是 ${location.origin}），` +
    "設定後要「完全結束」Ollama 再重新開啟。\n" +
    "3. 使用 Safari：Safari 可能封鎖 HTTPS 網頁連到 http://localhost，請改用 Chrome、Edge 或 Firefox。"
  );
}

async function checkConnection() {
  setStatus("檢查中…");
  $("models").textContent = "";
  let res;
  try {
    res = await fetch(`${baseUrl()}/api/tags`);
  } catch {
    setStatus(connectionHelp(), "error");
    return;
  }
  if (!res.ok) {
    setStatus(`Ollama 回應錯誤：HTTP ${res.status}`, "error");
    return;
  }
  const data = await res.json();
  const names = (data.models || []).map((m) => m.name);
  if (names.length === 0) {
    setStatus(`已連線，但還沒有下載任何模型。請執行：ollama pull ${modelName()}`, "warn");
    return;
  }
  setStatus(`已連線！共 ${names.length} 個模型。`, "ok");
  $("models").textContent = "已安裝的模型：" + names.join("、");
}

async function loadSample(file) {
  try {
    const res = await fetch(`samples/${file}`);
    if (!res.ok) throw new Error(res.status);
    $("news").value = (await res.text()).trim();
  } catch {
    setStatus("載入範例失敗，請直接貼上新聞文字。", "error");
  }
}

let controller = null;

async function summarize() {
  const text = $("news").value.trim();
  if (!text) {
    setStatus("請先貼上新聞文字，或點一篇範例。", "warn");
    return;
  }
  const useJson = $("use-json").checked;
  const model = modelName();
  const output = $("output");
  output.textContent = "";
  setStatus(`使用 ${model} 產生中…（第一次載入模型可能需要一點時間）`);
  $("run").disabled = true;
  $("stop").disabled = false;
  controller = new AbortController();

  const body = {
    model,
    stream: true,
    messages: [
      { role: "system", content: useJson ? JSON_PROMPT : SYSTEM_PROMPT },
      { role: "user", content: `新聞內容：\n${text}` },
    ],
    options: { temperature: useJson ? 0 : 0.3 },
  };
  if (useJson) body.format = NEWS_SCHEMA;

  let full = "";
  try {
    let res;
    try {
      res = await fetch(`${baseUrl()}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (e) {
      if (e.name === "AbortError") throw e;
      setStatus(connectionHelp(), "error");
      return;
    }
    if (!res.ok) {
      let err = "";
      try { err = (await res.json()).error || ""; } catch {}
      if (res.status === 404 || /not found/i.test(err)) {
        setStatus(`找不到模型「${model}」。請在終端機執行：ollama pull ${model}`, "error");
      } else {
        setStatus(`Ollama 回應錯誤（HTTP ${res.status}）：${err}`, "error");
      }
      return;
    }

    // 串流：Ollama 回傳 NDJSON，每一行是一個 JSON 物件
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        const chunk = JSON.parse(line);
        if (chunk.error) throw new Error(chunk.error);
        const piece = chunk.message?.content || "";
        full += piece;
        output.textContent += piece;
      }
    }

    if (useJson) {
      try {
        output.textContent = JSON.stringify(JSON.parse(full), null, 2);
      } catch {
        setStatus("模型回傳的 JSON 格式不正確，請再試一次或換較大的模型。", "warn");
        return;
      }
    }
    setStatus(`完成（模型：${model}）`, "ok");
  } catch (e) {
    if (e.name === "AbortError") setStatus("已停止。", "warn");
    else setStatus(`發生錯誤：${e.message}`, "error");
  } finally {
    $("run").disabled = false;
    $("stop").disabled = true;
    controller = null;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  $("origin").textContent = location.origin;
  $("check").addEventListener("click", checkConnection);
  $("run").addEventListener("click", summarize);
  $("stop").addEventListener("click", () => controller?.abort());
  $("open-setup").addEventListener("click", () => { $("setup").open = true; });
  document.querySelectorAll("[data-sample]").forEach((btn) =>
    btn.addEventListener("click", () => loadSample(btn.dataset.sample))
  );
});
