"""Load test for the Konkani Companion backend.

Steps up the number of simultaneous users and reports, per stage, how fast
answers start and finish and how many requests were refused as busy or failed.

Local, free (mock models with simulated GPU time):
    MODEL_BACKEND=mock LLM_BACKEND=mock MOCK_LATENCY_MS=400 BACKEND_API_KEY=local \\
        python -m uvicorn app.main:create_app --factory --port 8765
    python scripts/load_test.py --url http://localhost:8765 --key local

Real backend on Lightning (uses GPU time and Groq quota; keep it short):
    python scripts/load_test.py --url https://<your-ngrok-domain> --key <BACKEND_API_KEY> \\
        --stages 1,3,6,10 --per-user 2 --i-understand-this-costs-credits

Each simulated user sends requests with its own X-Client-Id, like separate
signed-in users, so the per-user rate limit doesn't hide the real capacity.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import statistics
import sys
import time
import uuid
from dataclasses import dataclass, field
from urllib.parse import urlparse

import httpx

QUESTIONS = [
    "What is the capital of Goa?",
    "Tell me about the monsoon in Goa.",
    "How do I apply for a ration card in Goa?",
    "What crops grow well in Goa?",
    "Explain the history of Fort Aguada.",
    "What are good places to visit in South Goa?",
]
TRANSLATIONS = [
    "The water supply will be interrupted tomorrow from 8 a.m. to 6 p.m.",
    "Please bring your Aadhaar card and a photograph to the office.",
    "The market is closed on Sunday.",
]


@dataclass
class Result:
    kind: str
    ok: bool
    busy: bool = False
    status: int = 0
    first_s: float | None = None  # time to first answer text (chat)
    total_s: float = 0.0
    error: str = ""


@dataclass
class Stage:
    users: int
    results: list[Result] = field(default_factory=list)
    wall_s: float = 0.0


def pct(values: list[float], p: float) -> float | None:
    if not values:
        return None
    values = sorted(values)
    k = min(len(values) - 1, max(0, round(p / 100 * (len(values) - 1))))
    return values[k]


async def chat(client: httpx.AsyncClient, headers: dict, question: str, output_language: str) -> Result:
    start = time.perf_counter()
    first = None
    try:
        async with client.stream(
            "POST",
            "/openai/v1/chat/completions",
            headers=headers,
            json={"messages": [{"role": "user", "content": question}], "output_language": output_language},
        ) as r:
            if r.status_code != 200:
                body = (await r.aread()).decode(errors="replace")[:200]
                return Result("chat", False, busy=r.status_code in (429, 503), status=r.status_code,
                              total_s=time.perf_counter() - start, error=body)
            event, error = "message", ""
            async for line in r.aiter_lines():
                if line.startswith("event: "):
                    event = line[7:]
                elif line.startswith("data: "):
                    data = line[6:]
                    if data == "[DONE]":
                        break
                    if event == "error":
                        error = json.loads(data).get("message", "error")
                    elif event == "message" and first is None:
                        content = json.loads(data)["choices"][0]["delta"].get("content")
                        if content:
                            first = time.perf_counter() - start
                elif line == "":
                    event = "message"
            total = time.perf_counter() - start
            if error:
                return Result("chat", False, busy="busy" in error.lower(), status=200, first_s=first, total_s=total, error=error)
            return Result("chat", True, status=200, first_s=first, total_s=total)
    except httpx.HTTPError as exc:
        return Result("chat", False, total_s=time.perf_counter() - start, error=type(exc).__name__)


async def translate(client: httpx.AsyncClient, headers: dict, text: str) -> Result:
    start = time.perf_counter()
    try:
        r = await client.post("/translate", headers=headers, json={"text": text, "direction": "en2kok"})
        total = time.perf_counter() - start
        return Result("translate", r.status_code == 200, busy=r.status_code in (429, 503), status=r.status_code,
                      total_s=total, error="" if r.status_code == 200 else r.text[:200])
    except httpx.HTTPError as exc:
        return Result("translate", False, total_s=time.perf_counter() - start, error=type(exc).__name__)


async def user(client: httpx.AsyncClient, key: str, n: int, index: int, args) -> list[Result]:
    headers = {"X-Client-Id": f"loadtest:{uuid.uuid4().hex[:8]}", "ngrok-skip-browser-warning": "true"}
    if key:
        headers["X-API-Key"] = key
    out = []
    for i in range(n):
        if (index + i) % args.translate_every == args.translate_every - 1:
            out.append(await translate(client, headers, TRANSLATIONS[(index + i) % len(TRANSLATIONS)]))
        else:
            out.append(await chat(client, headers, QUESTIONS[(index + i) % len(QUESTIONS)], args.output_language))
    return out


async def run_stage(base: str, key: str, users: int, args) -> Stage:
    stage = Stage(users)
    limits = httpx.Limits(max_connections=users + 4, max_keepalive_connections=users + 4)
    async with httpx.AsyncClient(base_url=base, timeout=args.timeout, limits=limits) as client:
        start = time.perf_counter()
        groups = await asyncio.gather(*(user(client, key, args.per_user, i, args) for i in range(users)))
        stage.wall_s = time.perf_counter() - start
    stage.results = [r for g in groups for r in g]
    return stage


def report(stage: Stage) -> dict:
    rs = stage.results
    ok = [r for r in rs if r.ok]
    chats = [r for r in ok if r.kind == "chat"]
    row = {
        "users": stage.users,
        "requests": len(rs),
        "ok": len(ok),
        "busy": sum(r.busy for r in rs),
        "errors": sum((not r.ok) and not r.busy for r in rs),
        "first_p50": pct([r.first_s for r in chats if r.first_s], 50),
        "first_p95": pct([r.first_s for r in chats if r.first_s], 95),
        "total_p50": pct([r.total_s for r in ok], 50),
        "total_p95": pct([r.total_s for r in ok], 95),
        "throughput": len(ok) / stage.wall_s if stage.wall_s else 0,
        "sample_error": next((r.error for r in rs if not r.ok), ""),
    }
    return row


def fmt(v: float | None) -> str:
    return "   -  " if v is None else f"{v:6.2f}"


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--url", default="http://localhost:8765")
    ap.add_argument("--key", default=os.getenv("BACKEND_API_KEY", ""))
    ap.add_argument("--stages", default="1,5,10,20,40", help="comma-separated simultaneous users per stage")
    ap.add_argument("--per-user", type=int, default=3, help="requests each user sends, one after another")
    ap.add_argument("--translate-every", type=int, default=4, help="every Nth request is a plain translation")
    ap.add_argument("--output-language", choices=["kok", "en"], default="kok")
    ap.add_argument("--timeout", type=float, default=180)
    ap.add_argument("--max-requests", type=int, default=400, help="safety cap on total requests")
    ap.add_argument("--slo", type=float, default=30.0, help="acceptable p95 total seconds for a full answer")
    ap.add_argument("--json", help="also write results to this file")
    ap.add_argument("--i-understand-this-costs-credits", action="store_true")
    args = ap.parse_args()

    stages = [int(s) for s in args.stages.split(",") if s.strip()]
    total = sum(stages) * args.per_user
    host = urlparse(args.url).hostname or ""
    local = host in ("localhost", "127.0.0.1", "::1")
    if total > args.max_requests:
        sys.exit(f"Refusing: {total} requests exceeds --max-requests {args.max_requests}.")
    if not local and not args.i_understand_this_costs_credits:
        sys.exit(
            f"Refusing: {args.url} is not local. This run sends {total} requests (GPU time + Groq quota).\n"
            "Re-run with --i-understand-this-costs-credits if that's intended."
        )

    health = httpx.get(args.url + "/health", headers={"ngrok-skip-browser-warning": "true"}, timeout=20).json()
    print(f"Target {args.url}  models={health.get('model_backend')}/{health.get('llm_backend')}  "
          f"jobs={health.get('jobs')}  total requests={total}\n")
    print("users  reqs   ok  busy  err | first-word p50  p95 | full answer p50  p95 | ok req/s")
    rows = []
    for users in stages:
        row = report(asyncio.run(run_stage(args.url, args.key, users, args)))
        rows.append(row)
        print(f"{row['users']:5} {row['requests']:5} {row['ok']:4} {row['busy']:5} {row['errors']:4} |"
              f"      {fmt(row['first_p50'])} {fmt(row['first_p95'])} |"
              f"       {fmt(row['total_p50'])} {fmt(row['total_p95'])} | {row['throughput']:6.2f}")
        if row["sample_error"] and row["ok"] < row["requests"]:
            print(f"      e.g. {row['sample_error'][:120]}")

    good = [r for r in rows if r["requests"] and (r["busy"] + r["errors"]) / r["requests"] <= 0.02
            and (r["total_p95"] or 0) <= args.slo]
    print()
    if good:
        best = max(good, key=lambda r: r["users"])
        print(f"Comfortable capacity: about {best['users']} simultaneous users "
              f"(p95 full answer {best['total_p95']:.1f}s, under {args.slo:.0f}s, with <2% refused).")
    else:
        print(f"No stage met the target (p95 under {args.slo:.0f}s and <2% refused).")
    if args.json:
        with open(args.json, "w", encoding="utf-8") as fh:
            json.dump({"target": args.url, "health": health, "stages": rows}, fh, indent=2)


if __name__ == "__main__":
    main()
