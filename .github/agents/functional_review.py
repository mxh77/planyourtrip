#!/usr/bin/env python3
"""
Functional Review Agent — Mon Petit Roadtrip
Valide qu'une PR couvre fonctionnellement les exigences décrites dans l'issue liée.
Stratégie :
  1. Lit la PR (titre, description, branche)
  2. Extrait le(s) numéro(s) d'issue lié(s) (Closes #N, Fixes #N, etc.)
  3. Récupère le texte complet de chaque issue
  4. Lit le diff complet de la PR (tous fichiers pertinents)
  5. Demande au LLM : couverture fonctionnelle ou manques ?
  6. Poste un commentaire structuré sur la PR
"""
import json
import os
import pathlib
import re
import sys
import urllib.request
import urllib.error
import urllib.parse

GITHUB_EVENT_PATH = os.environ["GITHUB_EVENT_PATH"]
GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "")
GITHUB_REPOSITORY = os.environ.get("GITHUB_REPOSITORY", "")
AI_MODEL = os.environ.get("AI_MODEL", "").strip() or "deepseek-v4-flash"

RELEVANT_EXTENSIONS = {".js", ".jsx", ".json", ".sql", ".prisma", ".md"}
IGNORE_PATHS = ("node_modules/", "dist/", ".git/", "package-lock.json", "backups/")


# ─── Helpers GitHub API ───────────────────────────────────────────────────────

def github_request(method: str, path: str, body: dict | None = None) -> dict | list:
    url = f"https://api.github.com/repos/{GITHUB_REPOSITORY}/{path}"
    data = json.dumps(body).encode("utf-8") if body else None
    req = urllib.request.Request(
        url, data=data,
        headers={
            "Authorization": f"Bearer {GITHUB_TOKEN}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "Content-Type": "application/json",
        },
        method=method,
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        print(f"[functional-review] GitHub {method} {path} → {e.code}: {e.read().decode()[:200]}", file=sys.stderr)
        return {}


def get_pr_info(pr_number: int) -> dict:
    return github_request("GET", f"pulls/{pr_number}")


def get_pr_files(pr_number: int) -> list[dict]:
    result, page = [], 1
    while True:
        files = github_request("GET", f"pulls/{pr_number}/files?per_page=100&page={page}")
        if not files or not isinstance(files, list):
            break
        result.extend(files)
        if len(files) < 100:
            break
        page += 1
    return result


def get_issue(issue_number: int) -> dict:
    return github_request("GET", f"issues/{issue_number}")


def get_issue_comments(issue_number: int) -> list[dict]:
    result = github_request("GET", f"issues/{issue_number}/comments?per_page=50")
    return result if isinstance(result, list) else []


def post_pr_comment(pr_number: int, body: str) -> None:
    github_request("POST", f"issues/{pr_number}/comments", {"body": body})


def add_pr_label(pr_number: int, label: str) -> None:
    github_request("POST", f"issues/{pr_number}/labels", {"labels": [label]})


def ensure_labels_exist() -> None:
    existing = github_request("GET", "labels?per_page=100")
    existing_names = {l.get("name") for l in (existing if isinstance(existing, list) else [])}
    for label in [
        {"name": "review: fonctionnelle ✅", "color": "0e8a16", "description": "Couverture fonctionnelle validée"},
        {"name": "review: fonctionnelle ⚠️", "color": "e4a817", "description": "Couverture fonctionnelle partielle"},
        {"name": "review: fonctionnelle ❌", "color": "d93f0b", "description": "Exigences fonctionnelles non couvertes"},
    ]:
        if label["name"] not in existing_names:
            github_request("POST", "labels", label)


# ─── Extraction des issues liées ─────────────────────────────────────────────

CLOSING_KEYWORDS = re.compile(
    r"(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*#(\d+)",
    re.IGNORECASE,
)
PLAIN_ISSUE_REF = re.compile(r"#(\d+)")


def extract_linked_issues(pr_info: dict) -> list[int]:
    text = (pr_info.get("body") or "") + " " + (pr_info.get("title") or "")
    closing = CLOSING_KEYWORDS.findall(text)
    if closing:
        return [int(n) for n in closing]
    plain = PLAIN_ISSUE_REF.findall(text)
    return [int(n) for n in plain]


# ─── Construction du contexte ─────────────────────────────────────────────────

def is_relevant_file(filename: str) -> bool:
    if any(filename.startswith(p) for p in IGNORE_PATHS):
        return False
    return pathlib.Path(filename).suffix in RELEVANT_EXTENSIONS


def build_issues_context(issue_numbers: list[int]) -> str:
    if not issue_numbers:
        return "Aucune issue liée détectée dans cette PR.\n"

    parts = []
    for num in issue_numbers:
        issue = get_issue(num)
        if not issue:
            continue
        parts.append(f"=== Issue #{num} — {issue.get('title', '')} ===")
        parts.append(issue.get("body") or "(pas de description)")
        parts.append("")

        # Pièces jointes de spec dans les commentaires
        comments = get_issue_comments(num)
        spec_comments = [c for c in comments if "spec.md" in (c.get("body") or "").lower()
                         or "spécification" in (c.get("body") or "").lower()
                         or "critères d'acceptation" in (c.get("body") or "").lower()]
        for i, c in enumerate(spec_comments[:3]):
            parts.append(f"--- Commentaire spec #{i+1} ---")
            parts.append((c.get("body") or "")[:2000])
            parts.append("")

    return "\n".join(parts) if parts else "Aucune issue liée trouvée.\n"


def build_pr_diff_context(pr_files: list[dict], pr_info: dict) -> str:
    relevant = [f for f in pr_files if is_relevant_file(f.get("filename", ""))]

    parts = [
        f"=== PR #{pr_info.get('number')} — {pr_info.get('title')} ===",
        f"Branche: {pr_info.get('head', {}).get('ref', '')}",
        f"Description: {pr_info.get('body', '') or 'Aucune'}",
        f"\n{len(relevant)} fichier(s) pertinent(s) modifié(s).",
        "",
    ]

    for f in relevant:
        filename = f.get("filename", "")
        patch = f.get("patch", "")
        parts.append(f"--- {filename} ({f.get('status','')}, +{f.get('additions',0)}/-{f.get('deletions',0)}) ---")
        if patch:
            parts.append(patch[:4000])
        parts.append("")

    return "\n".join(parts)


# ─── Prompt ───────────────────────────────────────────────────────────────────

FUNCTIONAL_REVIEW_PROMPT = """Tu es un expert en validation fonctionnelle pour Mon Petit Roadtrip (app de planification de road trips).

Ta mission : évaluer si la PR couvre fonctionnellement toutes les exigences décrites dans la (les) issue(s) liée(s).

== CONTEXTE DE L'ISSUE ==

{issues_context}

== DIFF DE LA PR ==

{pr_context}

== FORMAT DE RÉPONSE ==

Réponds UNIQUEMENT avec du JSON brut (sans balises markdown) :
{{
  "verdict": "approved" | "warning" | "blocked",
  "summary": "résumé en 2-3 phrases de la couverture fonctionnelle",
  "covered": [
    "exigence couverte 1",
    "exigence couverte 2"
  ],
  "missing": [
    {{
      "severity": "blocking" | "warning",
      "requirement": "exigence manquante ou incomplète",
      "detail": "explication de ce qui manque et comment le corriger"
    }}
  ],
  "suggestions": ["suggestion d'amélioration facultative 1"]
}}

Règles de verdict :
- "blocked" → au moins 1 exigence manquante "blocking" (fonctionnalité principale non implémentée)
- "warning" → exigences partiellement couvertes ou cas limites non gérés
- "approved" → toutes les exigences principales sont couvertes
"""


# ─── Appel IA ─────────────────────────────────────────────────────────────────

def _urlopen_with_retry(req: urllib.request.Request, label: str) -> dict:
    import time
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req) as resp:
                return json.loads(resp.read().decode())
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < 4:
                wait = int(e.headers.get("retry-after", 60))
                print(f"[{label}] Rate limit 429 — attente {wait}s (tentative {attempt+1}/5)...", file=sys.stderr)
                time.sleep(wait)
            else:
                raise
    raise RuntimeError(f"[{label}] Échec après 5 tentatives")


def call_api(prompt: str) -> str:
    if AI_MODEL.startswith("claude-"):
        api_key = os.environ.get("ANTHROPIC_API_KEY", "")
        if not api_key:
            sys.exit("[functional-review] ANTHROPIC_API_KEY manquant.")
        payload = {"model": AI_MODEL, "max_tokens": 8000, "messages": [{"role": "user", "content": prompt}]}
        req = urllib.request.Request(
            "https://api.anthropic.com/v1/messages",
            data=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json", "x-api-key": api_key, "anthropic-version": "2023-06-01"},
            method="POST",
        )
        data = _urlopen_with_retry(req, "functional-review")
        return "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text")
    elif "deepseek" in AI_MODEL:
        api_key = os.environ.get("DEEPSEEK_API_KEY", "")
        if not api_key:
            sys.exit("[functional-review] DEEPSEEK_API_KEY manquant.")
        payload = {"model": AI_MODEL, "max_tokens": 8000, "messages": [{"role": "user", "content": prompt}]}
        req = urllib.request.Request(
            "https://api.deepseek.com/v1/chat/completions",
            data=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"},
            method="POST",
        )
        data = _urlopen_with_retry(req, "functional-review")
        return data.get("choices", [{}])[0].get("message", {}).get("content", "")
    else:
        api_key = os.environ.get("OPENAI_API_KEY", "")
        if not api_key:
            sys.exit("[functional-review] OPENAI_API_KEY manquant.")
        payload = {
            "model": AI_MODEL,
            "max_tokens": 8000,
            "messages": [{"role": "user", "content": prompt}],
            "response_format": {"type": "json_object"},
        }
        req = urllib.request.Request(
            "https://api.openai.com/v1/chat/completions",
            data=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"},
            method="POST",
        )
        data = _urlopen_with_retry(req, "functional-review")
        return data.get("choices", [{}])[0].get("message", {}).get("content", "")


def strip_json_fences(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        text = "\n".join(lines[1:])
        if text.endswith("```"):
            text = text[:-3]
    return text.strip()


# ─── Formatage du commentaire ─────────────────────────────────────────────────

# ─── Exceptions persistantes ─────────────────────────────────────────────────

EXCEPTIONS_MARKER = "<!-- review-exceptions-v1 -->"


def get_review_exceptions(pr_number: int) -> set[str]:
    """Lit le commentaire d'exceptions sur la PR et retourne un set de bullet-headers."""
    comments = github_request("GET", f"issues/{pr_number}/comments?per_page=100")
    exc = next((c for c in (comments if isinstance(comments, list) else [])
                if EXCEPTIONS_MARKER in c.get("body", "")), None)
    if not exc:
        return set()
    result = set()
    for line in exc["body"].split("\n"):
        if line.startswith("- "):
            header = re.sub(r"\s*\*\(downgraded:.*?\)\*\s*$", "", line[2:]).strip()
            if header:
                result.add(header)
    return result


def apply_exceptions(review: dict, exceptions: set[str]) -> dict:
    """Downgrade les éléments 'blocking' dans missing dont le header est dans les exceptions."""
    if not exceptions:
        return review
    for item in review.get("missing", []):
        header = f"**{item.get('requirement', '')}**"
        if item.get("severity") == "blocking" and header in exceptions:
            item["severity"] = "warning"
            item["_downgraded"] = True
    # Recalculer le verdict
    missing = review.get("missing", [])
    if any(m.get("severity") == "blocking" for m in missing):
        review["verdict"] = "blocked"
    elif any(m.get("severity") == "warning" for m in missing):
        review["verdict"] = "warning"
    else:
        review["verdict"] = "approved"
    return review


# ─── Formatage du commentaire ─────────────────────────────────────────────────

def format_comment(review: dict) -> str:
    verdict = review.get("verdict", "warning")
    emoji = {"approved": "✅", "warning": "⚠️", "blocked": "❌"}.get(verdict, "❓")

    lines = [
        f"<!-- review:functional run_id={os.environ.get('GITHUB_RUN_ID', '')} run_url=https://github.com/{os.environ.get('GITHUB_REPOSITORY', '')}/actions/runs/{os.environ.get('GITHUB_RUN_ID', '')} -->",
        f"## {emoji} Validation Fonctionnelle",
        "",
        f"**Verdict :** `{verdict}`",
        "",
        f"**Résumé :** {review.get('summary', '')}",
        "",
    ]

    covered = review.get("covered", [])
    if covered:
        lines += ["### ✅ Exigences couvertes", ""]
        for c in covered:
            lines.append(f"- {c}")
        lines.append("")

    missing = review.get("missing", [])
    blocking_missing = [m for m in missing if m.get("severity") == "blocking"]
    warning_missing = [m for m in missing if m.get("severity") == "warning"]

    if blocking_missing:
        lines += ["### 🔴 Exigences manquantes (bloquant)", ""]
        for m in blocking_missing:
            lines += [
                f"- **{m.get('requirement', '')}**",
                f"  > {m.get('detail', '')}",
                "",
            ]
    if warning_missing:
        lines += ["### 🟡 Exigences partielles (avertissement)", ""]
        for m in warning_missing:
            lines += [
                f"- **{m.get('requirement', '')}**",
                f"  > {m.get('detail', '')}",
                "",
            ]

    suggestions = review.get("suggestions", [])
    if suggestions:
        lines += ["### 💡 Suggestions", ""]
        for s in suggestions:
            lines.append(f"- {s}")

    return "\n".join(lines)


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    with open(GITHUB_EVENT_PATH) as f:
        event = json.load(f)

    pr_number = int(
        event.get("pull_request", {}).get("number")
        or event.get("inputs", {}).get("pr_number")
        or 0
    )
    if not pr_number:
        sys.exit("[functional-review] Numéro de PR introuvable dans l'event.")

    print(f"[functional-review] PR #{pr_number} — modèle : {AI_MODEL}")

    pr_info = get_pr_info(pr_number)
    pr_files = get_pr_files(pr_number)
    issue_numbers = extract_linked_issues(pr_info)

    print(f"[functional-review] Issues liées : {issue_numbers or 'aucune'}")

    issues_context = build_issues_context(issue_numbers)
    pr_context = build_pr_diff_context(pr_files, pr_info)

    prompt = FUNCTIONAL_REVIEW_PROMPT.format(
        issues_context=issues_context,
        pr_context=pr_context,
    )

    raw = call_api(prompt)
    raw = strip_json_fences(raw)

    try:
        review = json.loads(raw)
    except json.JSONDecodeError:
        print(f"[functional-review] ⚠️ JSON invalide : {raw[:300]}", file=sys.stderr)
        review = {"verdict": "warning", "summary": "Erreur de parsing.", "covered": [], "missing": [], "suggestions": []}

    exceptions = get_review_exceptions(pr_number)
    if exceptions:
        print(f"[functional-review] {len(exceptions)} exception(s) trouvée(s), downgrade appliqué.")
        review = apply_exceptions(review, exceptions)

    verdict = review.get("verdict", "warning")
    label_map = {
        "approved": "review: fonctionnelle ✅",
        "warning": "review: fonctionnelle ⚠️",
        "blocked": "review: fonctionnelle ❌",
    }
    label = label_map.get(verdict, "review: fonctionnelle ⚠️")

    ensure_labels_exist()
    # Supprimer les anciens labels de review fonctionnelle
    for old_label in label_map.values():
        try:
            github_request("DELETE", f"issues/{pr_number}/labels/{urllib.parse.quote(old_label)}")
        except Exception:
            pass
    add_pr_label(pr_number, label)

    comment = format_comment(review)
    post_pr_comment(pr_number, comment)

    print(f"[functional-review] Verdict : {verdict} — commentaire posté.")


if __name__ == "__main__":
    main()
