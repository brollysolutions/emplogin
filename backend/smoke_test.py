#!/usr/bin/env python3
"""
Live endpoint smoke test — hits EVERY API endpoint over real HTTP and reports,
per environment, whether each one is reachable and behaving.

This is the tool for the "works on localhost but not on the cloud" problem:
run it against BOTH your local server and the deployed URL at the same time and
it prints a side-by-side table so you can instantly see which endpoints break
once they go through Nginx / the cloud proxy.

    # Local only
    python smoke_test.py http://127.0.0.1:8000/api/v1/

    # Local vs cloud, side by side  (this is what you want)
    python smoke_test.py http://127.0.0.1:8000/api/v1/  https://brollysolutions.in/login/api/v1/

If you pass no URL it defaults to the local server above.

It is NON-DESTRUCTIVE: every probe either reads data, sends an intentionally
invalid body (so the endpoint answers 400 without creating anything), or targets
a non-existent id (so it answers 404). Nothing real is created, updated, or
deleted. The one auto-provisioning endpoint (profile/<id>/) is probed with
OPTIONS so it never creates a throwaway account.

Pure standard library — no pip installs needed.

Exit code is 0 only if every endpoint passed in every environment (handy for CI).
"""

import json
import sys
import time
import urllib.error
import urllib.request

# ── The probe table ──────────────────────────────────────────────────────────
# Each row: (label, METHOD, path, body_or_None, {acceptable status codes})
# `path` is relative to the base URL (which already ends in .../api/v1/).
# The expected status is the one ONLY the real Django view produces, so a proxy
# that fails to route the path (Nginx 404 / 502 / 504) will not match and is
# flagged as a failure.
PROBES = [
    # label,                         method,   path,                              body,                       expected
    ("health",                       "GET",    "health/",                         None,                       {200}),
    ("sessions (create, bad)",       "POST",   "sessions/",                       {},                         {400}),
    ("sessions (validate)",          "GET",    "sessions/__smoke__/",             None,                       {200}),
    ("sessions (logout)",            "POST",   "sessions/__smoke__/logout/",      {},                         {200}),
    ("attendance (list)",            "GET",    "attendance/",                     None,                       {200}),
    ("attendance (post, bad)",       "POST",   "attendance/",                     {},                         {400}),
    ("forgot-password (bad)",        "POST",   "forgot-password/",                {},                         {400}),
    ("reset-password (bad)",         "POST",   "reset-password/",                 {},                         {400}),
    ("sync-users (bad)",             "POST",   "sync-users/",                     {},                         {400}),
    ("tasks (list)",                 "GET",    "tasks/",                          None,                       {200}),
    ("tasks (post, bad)",            "POST",   "tasks/",                          {},                         {400}),
    ("tasks (patch missing)",        "PATCH",  "tasks/999999999/",                {},                         {404}),
    ("leaves (list)",                "GET",    "leaves/",                         None,                       {200}),
    ("leaves (post, bad)",           "POST",   "leaves/",                         {},                         {400}),
    ("leaves (detail missing)",      "GET",    "leaves/999999999/",               None,                       {404}),
    ("leaves (approve missing)",     "PATCH",  "leaves/999999999/approve/",       {},                         {404}),
    ("leaves (notify missing)",      "PATCH",  "leaves/999999999/notify/",        {},                         {404}),
    ("profiles (list)",              "GET",    "profiles/",                       None,                       {200}),
    ("profile (routing)",            "OPTIONS","profile/__smoke__/",              None,                       {200}),
    ("messages (bad)",               "GET",    "messages/",                       None,                       {400}),
    ("messages/read (bad)",          "PATCH",  "messages/read/",                  {},                         {400}),
    ("groups (list)",                "GET",    "groups/",                         None,                       {200}),
    ("groups (post, bad)",           "POST",   "groups/",                         {},                         {400}),
    ("groups (patch missing)",       "PATCH",  "groups/999999999/",               {},                         {404}),
    ("groups/membership (missing)",  "POST",   "groups/999999999/membership/",    {},                         {404}),
    ("heartbeat (bad)",              "POST",   "heartbeat/",                      {},                         {400}),
    ("chat-summaries",               "GET",    "chat-summaries/",                 None,                       {200}),
    ("test-reminder (bad)",          "POST",   "test-reminder/",                  {},                         {400}),
    ("holidays (list)",              "GET",    "holidays/",                       None,                       {200}),
    ("holidays (delete missing)",    "DELETE", "holidays/999999999/",             None,                       {404}),
]

TIMEOUT = 15  # seconds per request


class Result:
    __slots__ = ("status", "ms", "ctype", "snippet", "error")

    def __init__(self, status=None, ms=0, ctype="", snippet="", error=""):
        self.status = status
        self.ms = ms
        self.ctype = ctype
        self.snippet = snippet
        self.error = error


def probe(base, method, path, body):
    url = base + path
    data = None
    headers = {"Accept": "application/json"}
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"

    # Retry a connection-refused a couple of times so a slow cold-start (gunicorn
    # still booting, first request warming Django) isn't mistaken for an outage.
    last_conn_err = None
    for attempt in range(3):
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        start = time.time()
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
                raw = resp.read(400)
                return Result(
                    status=resp.status,
                    ms=int((time.time() - start) * 1000),
                    ctype=resp.headers.get("Content-Type", ""),
                    snippet=raw.decode("utf-8", "replace").replace("\n", " ")[:120],
                )
        except urllib.error.HTTPError as e:
            return _from_http_error(e, start)
        except urllib.error.URLError as e:
            last_conn_err = e.reason
            time.sleep(1.5)
            continue
        except Exception as e:  # noqa: BLE001
            return Result(error=f"ERROR: {e}")
    return Result(error=f"CONNECT FAIL: {last_conn_err}")


def _from_http_error(e, start):
    """An HTTPError IS the response (4xx/5xx) — turn it into a Result."""
    raw = e.read(400) if hasattr(e, "read") else b""
    return Result(
        status=e.code,
        ms=int((time.time() - start) * 1000),
        ctype=e.headers.get("Content-Type", "") if e.headers else "",
        snippet=raw.decode("utf-8", "replace").replace("\n", " ")[:120],
    )


def verdict(res, expected):
    """Return (ok: bool, note: str)."""
    if res.error:
        return False, res.error
    if res.status not in expected:
        return False, f"got {res.status}, expected {sorted(expected)}"
    # Status matched — but a text/html body on an API path usually means a proxy
    # (or a Django error page) answered, not the JSON API. Warn but still pass.
    if "html" in (res.ctype or "").lower():
        return True, "WARN: HTML body (proxy/error page?), not JSON"
    return True, ""


def normalize(base):
    return base if base.endswith("/") else base + "/"


def run(bases):
    bases = [normalize(b) for b in bases]
    print("\nLive endpoint smoke test")
    for i, b in enumerate(bases):
        print(f"  [{i}] {b}")
    print()

    label_w = max(len(p[0]) for p in PROBES) + 1
    header = f"{'ENDPOINT':<{label_w}} {'METHOD':<8}"
    for i in range(len(bases)):
        header += f" | [{i}] result".ljust(22)
    print(header)
    print("-" * len(header))

    totals = [0] * len(bases)
    failures = []  # (base_index, label, note)

    for label, method, path, body, expected in PROBES:
        row = f"{label:<{label_w}} {method:<8}"
        for bi, base in enumerate(bases):
            res = probe(base, method, path, body)
            ok, note = verdict(res, expected)
            if ok:
                totals[bi] += 1
                mark = "OK " if not note else "OK*"
                cell = f"{mark} {res.status if res.status else '-'} {res.ms}ms"
                if note:  # passed, but with a warning worth surfacing
                    failures.append((bi, label, note, res.snippet))
            else:
                cell = f"FAIL {res.status if res.status else '-'}"
                failures.append((bi, label, note or res.error, res.snippet))
            row += " | " + cell.ljust(20)
        print(row)

    print("-" * len(header))
    for bi, base in enumerate(bases):
        print(f"  [{bi}] {totals[bi]}/{len(PROBES)} passed   ({base})")

    if failures:
        print("\nFAILURES / WARNINGS (detail):")
        for bi, label, note, snippet in failures:
            print(f"  [{bi}] {label}: {note}")
            if snippet:
                print(f"        body: {snippet}")
        print(
            "\nHints:\n"
            "  - 404 where 200/400 expected  -> Nginx isn't proxying that path to Django\n"
            "  - 502 / 504 / CONNECT FAIL    -> backend not running / gunicorn crash / bad upstream\n"
            "  - 405 Method Not Allowed      -> proxy strips the HTTP method or route mismatch\n"
            "  - HTML body on an API path     -> a proxy or Django DEBUG error page answered, not the API\n"
            "  - Passes in curl but fails in browser only -> almost always CORS (check CORS_ALLOWED_ORIGINS)\n"
        )

    all_ok = all(t == len(PROBES) for t in totals)
    print("\nRESULT:", "ALL GREEN" if all_ok else "SOME ENDPOINTS FAILED")
    return 0 if all_ok else 1


if __name__ == "__main__":
    args = sys.argv[1:] or ["http://127.0.0.1:8000/api/v1/"]
    sys.exit(run(args))
