"""命令列入口：讀取新聞文字檔，串流輸出繁體中文重點摘要。"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Literal

import openai
from dotenv import load_dotenv
from openai import OpenAI
from pydantic import BaseModel, Field, ValidationError

SYSTEM_PROMPT = (
    "你是一位生態保育新聞編輯。請只根據使用者提供的新聞內容，"
    "用台灣慣用的繁體中文（zh-Hant-TW）整理 3 到 5 個重點，"
    "每個重點一行、以「- 」開頭，不要加入原文沒有的資訊。"
)

JSON_PROMPT = (
    "你是一位生態保育新聞編輯。請只根據使用者提供的新聞內容，"
    "用台灣慣用的繁體中文（zh-Hant-TW）輸出 JSON，欄位：title（標題）、"
    "key_points（3 到 5 個重點）、topics（提到的物種或議題）、"
    "sentiment（只能是 positive、neutral、negative 其中之一）。"
)


class NewsSummary(BaseModel):
    """結構化輸出的格式（JSON Schema 由 Pydantic 自動產生）。"""

    title: str = Field(description="新聞標題（繁體中文）")
    key_points: list[str] = Field(description="3 到 5 個重點")
    topics: list[str] = Field(description="提到的物種或保育議題")
    sentiment: Literal["positive", "neutral", "negative"] = Field(description="整體語氣")


PLACEHOLDER_KEYS = {"", "your-api-key-here"}


def make_client(provider: str) -> tuple[OpenAI, str]:
    """依 provider 建立 OpenAI 相容的 client，回傳 (client, 模型名稱)。"""
    if provider == "cloud":
        api_key = os.getenv("CLOUD_API_KEY", "").strip()
        base_url = os.getenv("CLOUD_BASE_URL", "").strip()
        model = os.getenv("CLOUD_MODEL", "").strip()
        if api_key in PLACEHOLDER_KEYS or not base_url or not model:
            sys.exit(
                "錯誤：找不到雲端模型設定。\n"
                "請先 `cp .env.example .env`，並在 .env 填入 CLOUD_API_KEY、"
                "CLOUD_BASE_URL、CLOUD_MODEL；\n或不加 --provider cloud，改用本地 Ollama。"
            )
        return OpenAI(api_key=api_key, base_url=base_url), model

    # 預設：本地 Ollama（使用它的 OpenAI 相容端點 /v1，不需要真正的金鑰）
    base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")
    model = os.getenv("OLLAMA_MODEL", "qwen2.5:14b")
    return OpenAI(api_key="ollama", base_url=f"{base_url}/v1", timeout=300), model


def stream_summary(client: OpenAI, model: str, text: str) -> str:
    """串流摘要：模型每產生一小段文字就立刻印出來。"""
    stream = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"新聞內容：\n{text}"},
        ],
        temperature=0.3,
        stream=True,
    )
    parts: list[str] = []
    for chunk in stream:
        if not chunk.choices:
            continue
        delta = chunk.choices[0].delta.content or ""
        print(delta, end="", flush=True)
        parts.append(delta)
    print()
    return "".join(parts)


def structured_summary(client: OpenAI, model: str, text: str) -> NewsSummary:
    """結構化輸出：要求模型依 JSON Schema 回傳，再用 Pydantic 驗證。"""
    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": JSON_PROMPT},
            {"role": "user", "content": f"新聞內容：\n{text}"},
        ],
        temperature=0,
        response_format={
            "type": "json_schema",
            "json_schema": {"name": "news_summary", "schema": NewsSummary.model_json_schema()},
        },
    )
    return NewsSummary.model_validate_json(response.choices[0].message.content or "")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="eco-news-summary",
        description="用 LLM 以串流方式摘要生態保育新聞（繁體中文）。",
    )
    parser.add_argument("file", type=Path, help="新聞文字檔路徑，例如 samples/01_black_bear.txt")
    parser.add_argument(
        "--provider",
        choices=["ollama", "cloud"],
        default="ollama",
        help="ollama＝本地模型（預設）；cloud＝.env 中設定的 OpenAI 相容雲端模型",
    )
    parser.add_argument("--model", help="覆寫模型名稱，例如 llama3.2:1b")
    parser.add_argument(
        "--json",
        action="store_true",
        help="改用結構化輸出（JSON：title、key_points、topics、sentiment），不串流",
    )
    return parser


def main() -> None:
    load_dotenv()
    args = build_parser().parse_args()

    if not args.file.is_file():
        sys.exit(f"錯誤：找不到檔案 {args.file}")
    text = args.file.read_text(encoding="utf-8").strip()
    if not text:
        sys.exit(f"錯誤：檔案 {args.file} 是空的")

    client, model = make_client(args.provider)
    if args.model:
        model = args.model

    print(f"[模型] {args.provider} / {model}", file=sys.stderr)
    try:
        if args.json:
            result = structured_summary(client, model, text)
            print(json.dumps(result.model_dump(), ensure_ascii=False, indent=2))
        else:
            stream_summary(client, model, text)
    except ValidationError:
        sys.exit("\n錯誤：模型回傳的 JSON 格式不正確，請再試一次或換一個較大的模型。")
    except openai.APIConnectionError:
        if args.provider == "ollama":
            sys.exit(
                "\n錯誤：連不到 Ollama（" + str(client.base_url) + "）。\n"
                "請確認：\n"
                "  1. 已安裝 Ollama：https://ollama.com/download\n"
                "  2. Ollama 正在執行：另開終端機執行 `ollama serve`（或開啟 Ollama App）\n"
                f"  3. 已下載模型：`ollama pull {model}`"
            )
        sys.exit("\n錯誤：連不到雲端 API，請檢查網路與 .env 中的 CLOUD_BASE_URL。")
    except openai.NotFoundError:
        sys.exit(f"\n錯誤：找不到模型「{model}」。若使用 Ollama，請先執行 `ollama pull {model}`。")
    except openai.AuthenticationError:
        sys.exit("\n錯誤：API 金鑰無效，請檢查 .env 中的 CLOUD_API_KEY。")
    except KeyboardInterrupt:
        sys.exit("\n已中斷。")
