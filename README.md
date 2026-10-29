# 🌿 生態新聞摘要器（eco-news-summary）

期中作業：用 Python 呼叫**本地 Ollama 模型**，以**串流（streaming）**方式把生態保育新聞整理成繁體中文重點；另外提供 `--json` **結構化輸出**。

- 專案網站（GitHub Pages）：`https://<你的帳號>.github.io/<repo 名稱>/`（部署後填入）

## 功能

| 功能 | 說明 |
| --- | --- |
| 串流摘要（主要功能） | 模型一邊產生、一邊印出 3～5 個繁體中文重點 |
| 結構化輸出（`--json`） | 依 JSON Schema 輸出 `title`、`key_points`、`topics`、`sentiment`，並用 Pydantic 驗證 |
| 本地模型（預設） | 透過 Ollama 的 OpenAI 相容 API（`http://localhost:11434/v1`），**不需要 API 金鑰** |
| 雲端模型（選用） | 在 `.env` 設定 OpenAI 相容 API 後，用 `--provider cloud` 切換 |
| 友善錯誤訊息 | Ollama 沒開、模型沒下載、找不到檔案、雲端金鑰未設定時，顯示中文說明 |

## 專案結構

```
eco-news-summary/
├── .github/workflows/pages.yml   # GitHub Actions：把 docs/ 部署到 GitHub Pages
├── docs/                         # GitHub Pages 靜態網站
│   ├── index.html                # 首頁：做了什麼＋各頁導覽
│   ├── demo.html                 # 線上試玩
│   ├── run.html                  # 怎麼執行
│   ├── results.html              # 執行結果
│   ├── ai.html                   # AI 使用說明
│   ├── app.js                    # 線上試玩：瀏覽器直接呼叫本機 Ollama
│   ├── style.css                 # 所有頁面共用的樣式
│   └── samples/                  # 範例文章副本（給網頁載入）
├── samples/                      # 三篇自行撰寫的「虛構」範例新聞
│   ├── 01_black_bear.txt
│   ├── 02_wetland.txt
│   └── 03_coral_reef.txt
├── src/eco_news_summary/
│   ├── __init__.py
│   └── cli.py                    # 主程式：串流摘要、--json 結構化輸出
├── .env.example                  # 環境變數範本（只有假值）
├── .gitignore                    # 排除 .env、.venv 等
├── .python-version
├── pyproject.toml                # uv 專案設定
└── uv.lock                       # 鎖定套件版本
```

## 執行步驟

### 1. 安裝 uv

```bash
# macOS / Linux
curl -LsSf https://astral.sh/uv/install.sh | sh
# Windows（PowerShell）
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
```

### 2. 安裝 Ollama 並下載模型

1. 到 <https://ollama.com/download> 下載並安裝 Ollama。
2. 確認 Ollama 正在執行（開啟 Ollama App，或在終端機執行 `ollama serve`）。
3. 下載模型：

```bash
ollama pull qwen2.5:14b
```

> 💡 預設模型 `qwen2.5:14b` 約 9GB，執行時大約佔用 9GB VRAM（例如 16GB 顯示卡用掉一半多一點，不會吃滿），中文表現也比小模型好。
> 較輕的電腦或沒有獨立顯示卡，可以改用小模型：先 `ollama pull llama3.2:1b`（或 `qwen2.5:1.5b`），執行時加上 `--model llama3.2:1b`（或 `--model qwen2.5:1.5b`）。

### 3. 安裝套件

```bash
git clone <你的 repo 網址>
cd eco-news-summary
uv sync
```

### 4. 執行

```bash
# 串流摘要（預設使用 qwen2.5:14b）
uv run eco-news-summary samples/01_black_bear.txt

# 結構化 JSON 輸出
uv run eco-news-summary samples/02_wetland.txt --json

# 指定其他（較小的）模型
uv run eco-news-summary samples/03_coral_reef.txt --model llama3.2:1b

# 查看所有參數
uv run eco-news-summary --help
```

也可以摘要自己的新聞：把文字存成 UTF-8 的 `.txt` 檔，再把路徑傳給程式。

## 環境變數（.env）

設定是**選用**的；不建立 `.env` 也能直接用本地 Ollama 執行。

```bash
cp .env.example .env
```

| 變數 | 預設值 | 說明 |
| --- | --- | --- |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama 位址 |
| `OLLAMA_MODEL` | `qwen2.5:14b` | 預設的本地模型 |
| `CLOUD_API_KEY` | （無） | 雲端 API 金鑰，只有用 `--provider cloud` 才需要 |
| `CLOUD_BASE_URL` | （無） | 雲端 OpenAI 相容 API 位址，例如 `https://api.openai.com/v1` |
| `CLOUD_MODEL` | （無） | 雲端模型名稱，例如 `gpt-4o-mini` |

> ⚠️ 金鑰只能放在 `.env`。`.env` 已列在 `.gitignore`，**不要**把真實金鑰寫進程式碼或 `.env.example`。

## 網頁線上試玩（連到自己電腦的 Ollama）

GitHub Pages 網站的「線上試玩」頁面（`docs/demo.html`）可以直接在瀏覽器裡產生摘要（串流顯示，也可勾選 JSON 結構化輸出）。網頁是用純 JavaScript（`docs/app.js`）直接呼叫**使用者自己電腦上的** Ollama（`http://localhost:11434` 的 `/api/tags`、`/api/chat`），不需要任何金鑰，新聞文字也不會送到別的伺服器。範例文章的副本放在 `docs/samples/`，供網頁載入。

Ollama 預設會拒絕其他網站的連線，所以要用 `OLLAMA_ORIGINS` 允許 Pages 網址：

```powershell
# Windows（PowerShell）：設定後從系統匣「Quit Ollama」完全結束，再重新開啟
setx OLLAMA_ORIGINS "https://<username>.github.io"
```

```bash
# macOS（Ollama App）：設定後結束 Ollama 再重新開啟
launchctl setenv OLLAMA_ORIGINS "https://<username>.github.io"
# Linux（手動執行）
OLLAMA_ORIGINS="https://<username>.github.io" ollama serve
```

- 也可以設成 `*`（允許任何網站），比較簡單但較不安全。
- Chrome、Edge、Firefox 允許 HTTPS 網頁連到 `http://localhost`；Safari 可能會封鎖。
- 本機測試網頁：`cd docs && python -m http.server 8000`，再開 <http://localhost:8000/demo.html>（localhost 來源 Ollama 預設就允許）。

## 執行結果

實際執行輸出請見 GitHub Pages 網站的「執行結果」頁面（`docs/results.html`）。

## GitHub Pages 部署

1. 在 GitHub 建立 repo 並 push 這個專案。
2. 到 repo 的 **Settings → Pages → Build and deployment → Source**，選擇 **GitHub Actions**。
3. 之後每次 push 到 `main`，`.github/workflows/pages.yml` 會自動把 `docs/` 部署成網站（也可以在 Actions 頁面手動執行）。

## AI 使用說明

本作業使用 Grok Bot（對話式 AI 程式助手）協助產生程式初版、GitHub Actions 工作流程、範例新聞與文件初稿，詳細說明請見網站的「AI 使用說明」頁面（`docs/ai.html`）。
