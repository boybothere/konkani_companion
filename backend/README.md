# Konkani Companion — backend

FastAPI service that replaces the old `backend_colab.ipynb`. Output is always
Devanagari Konkani; the frontend's English/Konkani toggle only describes the
input, and the script of the text is checked as well.

```
input ─▶ script check ─▶ [Qwen kok→en] ─▶ [web search] ─▶ Groq (streamed)
      ─▶ split at line / sentence (≤250 words) ─▶ Qwen en→kok per piece ─▶ SSE
```

Groq keeps generating while earlier pieces are translated, so the first
Konkani text appears after the first finished line, not after the whole answer.

## Layout

| File | What it does |
|---|---|
| `app/main.py` | FastAPI app and endpoints |
| `app/pipeline.py` | Orchestration for chat, document Q&A and document analysis |
| `app/translator.py` | Qwen LoRA translation, chunked, with output-length budgets |
| `app/stt.py` | Whisper transcription (ffmpeg decoding, duration limit) |
| `app/search.py` | Firecrawl → Tavily → DuckDuckGo fallback chain |
| `app/llm.py` | Groq streaming with a fallback model |
| `app/ocr.py` | PDF text layer first, Tesseract OCR (`hin+mar+eng`) fallback |
| `app/guardrails.py` | Prompt-injection filtering, untrusted-content wrapping, leak detection |
| `app/prompts.py` | System prompts and message builders |
| `app/security.py` | API key check, rate limit, upload validation |
| `app/config.py` | Every setting, from environment variables (see `.env.example`) |
| `colab_runner.ipynb` | Runs this backend on a Colab GPU with ngrok, keys from Colab Secrets |

## Endpoints

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/health` | — | status and configured providers |
| POST | `/transcribe` | multipart `file` (webm/ogg/wav/mp3/m4a/flac) | `{text}` |
| POST | `/openai/v1/chat/completions` | `{messages:[{role,content,english?}], language}` | SSE |
| POST | `/analyze-document` | multipart `file` (PDF/PNG/JPEG/WEBP/TIFF) | `{ocr_text, english_translation, summary, summary_english, error, pages, method, truncated}` |
| POST | `/document-chat` | `{question, document_context}` | SSE |

All endpoints except `/health` require the `X-API-Key` header when
`BACKEND_API_KEY` is set.

### SSE events

Answer text is sent as OpenAI-style `chat.completion.chunk` objects
(`data: {...}`), ending with `data: [DONE]`. Named events carry the rest:

| Event | Data |
|---|---|
| `status` | `{stage}`: `understanding`, `searching`, `thinking`, `translating` |
| `meta` | `{input_language, query_en}` |
| `sources` | `{provider, sources:[{id, title, url, provider}]}` — `[n]` in the answer refers to `id` |
| `english` | `{text}` — the English answer, which the browser sends back as history |
| `error` | `{message}` |

## Guardrails

- Web pages and OCR text go into the **user** message inside
  `<untrusted_…_{random}>` tags, never into the system prompt. Lines that look
  like instructions ("ignore previous instructions", fake `system:` roles,
  chat-template tokens) are replaced before the model sees them.
- The system prompt holds a random canary. If the output contains the canary
  or a 12-word run of the system prompt, the answer is stopped and replaced
  with a refusal.
- Clients can't send `system` messages; they are dropped.
- Uploads are identified by their first bytes, not their name, and are size
  limited. Audio is limited by duration; documents by pages and characters.
- Error responses never include stack traces or provider error text.

## Running

**Colab (GPU):** open `colab_runner.ipynb` in Colab, add the secrets it
lists, run cells 1–5. Put the printed URL in the frontend's `.env.local` as
`BACKEND_URL`, and the same `BACKEND_API_KEY` value.

**Without a GPU (UI development):**

```bash
cd backend
pip install -r requirements-dev.txt
MODEL_BACKEND=mock LLM_BACKEND=mock uvicorn app.main:create_app --factory --port 8000
```

Mock mode marks text as `[KOK] …` / `[EN] …` instead of translating, so the
whole UI can be exercised without models. With a real `GROQ_API_KEY` you can
keep `LLM_BACKEND=groq` and only mock the GPU models.

**Tests:**

```bash
cd backend
pip install -r requirements-dev.txt
pytest
```

## Known limits

- `/analyze-document` is one blocking request. Long scanned documents take
  minutes on a T4; `MAX_DOCUMENT_CHARS` (default 6000) keeps it under the
  ~5-minute header timeout of Node's `fetch` in the Next.js route.
- One GPU job runs at a time (shared lock), so concurrent users queue.
- Rate limits are in memory, per process.
- Whisper still decodes with `language="hi"`; compare models and languages on
  Konkani audio before changing it (see `AUDIT_REPORT.md`, F-09).
