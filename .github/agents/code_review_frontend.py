#!/usr/bin/env python3
"""
Code Review Frontend Agent — Mon Petit Roadtrip
Analyse les fichiers frontend d'une PR et poste des commentaires de review.
Vérifie : React/Vite/Tailwind, axios, gestion des dates locales, structure fichiers.
"""
import json
import os
import pathlib
import sys
import urllib.request
import urllib.error

GITHUB_EVENT_PATH = os.environ["GITHUB_EVENT_PATH"]
GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "")
GITHUB_REPOSITORY = os.environ.get("GITHUB_REPOSITORY", "")
AI_MODEL = os.environ.get("AI_MODEL", "").strip() or "deepseek-v4-flash"

FRONTEND_EXTENSIONS = {".jsx", ".js", ".css"}
FRONTEND_PATHS = ("frontend/web/src/", "frontend/src/")
IGNORE_PATHS = ("node_modules", "dist", ".git")


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
        print(f"[review-frontend] GitHub {method} {path} → {e.code}: {e.read().decode()[:200]}", file=sys.stderr)
        return {}


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


def get_pr_info(pr_number: int) -> dict:
    return github_request("GET", f"pulls/{pr_number}")


def post_pr_comment(pr_number: int, body: str) -> None:
    github_request("POST", f"issues/{pr_number}/comments", {"body": body})


def add_pr_label(pr_number: int, label: str) -> None:
    github_request("POST", f"issues/{pr_number}/labels", {"labels": [label]})


def ensure_labels_exist() -> None:
    existing = github_request("GET", "labels?per_page=100")
    existing_names = {l.get("name") for l in (existing if isinstance(existing, list) else [])}
    for label in [
        {"name": "review: frontend ✅", "color": "0e8a16", "description": "Review frontend approuvée"},
        {"name": "review: frontend ⚠️", "color": "e4a817", "description": "Review frontend: avertissements"},
        {"name": "review: frontend ❌", "color": "d93f0b", "description": "Review frontend: problèmes bloquants"},
    ]:
        if label["name"] not in existing_names:
            github_request("POST", "labels", label)


# ─── Filtrage des fichiers frontend ──────────────────────────────────────────

def is_frontend_file(filename: str) -> bool:
    return (
        pathlib.Path(filename).suffix in FRONTEND_EXTENSIONS
        and any(filename.startswith(p) for p in FRONTEND_PATHS)
        and not any(ign in filename for ign in IGNORE_PATHS)
    )


def build_review_context(pr_files: list[dict], pr_info: dict) -> str:
    frontend_files = [f for f in pr_files if is_frontend_file(f.get("filename", ""))]

    parts = [
        f"=== PR #{pr_info.get('number')} — {pr_info.get('title')} ===",
        f"Branche: {pr_info.get('head', {}).get('ref', '')}",
        f"Description: {pr_info.get('body', '') or 'Aucune'}",
        f"\n{len(frontend_files)} fichier(s) frontend modifié(s).",
        "",
    ]

    for f in frontend_files:
        filename = f.get("filename", "")
        patch = f.get("patch", "")
        parts.append(f"--- {filename} ({f.get('status','')}, +{f.get('additions',0)}/-{f.get('deletions',0)}) ---")
        if patch:
            # Tronquer à la dernière ligne complète pour éviter les faux positifs
            truncated = patch[:30000]
            if len(patch) > 30000:
                truncated = truncated[:truncated.rfind('\n') + 1] + '... [diff tronqué]'
            parts.append(truncated)
        parts.append("")

    return "\n".join(parts)


# ─── Prompt ───────────────────────────────────────────────────────────────────

REVIEW_PROMPT = """Tu es un expert en review de code frontend pour le projet Mon Petit Roadtrip.
Analyse les fichiers modifiés ci-dessous et produis une review exhaustive.

== STACK TECHNIQUE MON PETIT ROADTRIP ==

- React 18 + Vite + Tailwind CSS
- React Router v6
- JavaScript (pas TypeScript) — fichiers .jsx et .js
- axios pour les appels API (pas de TanStack Query)
- useState + useEffect pour les données
- Zustand pour le state global (stores)
- PowerSync pour la lecture offline (mobile)
- Expo React Native pour le mobile (frontend/src/)

== CONVENTIONS OBLIGATOIRES ==

### JavaScript / React
- Fichiers .jsx pour les composants React, .js pour les utilitaires
  ❌ TypeScript (.tsx, .ts) — ce projet n'utilise pas TypeScript
- Pas d'annotations de type TypeScript dans le code

### Structure fichiers frontend web (frontend/web/src/)
- Pages → src/pages/
- Composants réutilisables → src/components/
- Appels API → src/api/ (fonctions axios pures)
- Pas de hooks React Query — utiliser useState + useEffect + axios directement dans les composants ou pages

### Appels API
- Utiliser axios depuis src/api/axios.js (instance configurée avec baseURL et token)
  ❌ fetch() directement — utiliser axios
  ❌ URLs hardcodées — utiliser l'instance axios configurée
- Gérer les erreurs dans les catch avec affichage utilisateur

### Dates — RÈGLE CRITIQUE
- Les dates dans cette app sont des jours calendaires (pas d'instants UTC)
  ❌ date.toISOString() → décale les dates si timezone ≠ UTC
  ❌ new Date("2026-03-16") → interprété en UTC, décale d'un jour en timezone non-UTC
- Sérialisation : toujours extraire y/m/d locaux manuellement
  ✅ `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getDate().toString().padStart(2,'0')}`
- Désérialisation : construire en heure locale : new Date(y, m-1, d, 12, 0, 0)
- Affichage : toLocaleDateString('fr-FR') — jamais toUTCString()

### Tailwind CSS
- Classes Tailwind pour tout le style
  ❌ style inline (sauf exception justifiée)
  ❌ CSS modules
- Responsive avec sm:, md:, lg:

### Accessibilité
- Boutons avec texte lisible ou aria-label
- Inputs avec label associé ou aria-label

== CONTEXTE PR ==

{context}

== FORMAT DE RÉPONSE ==

Réponds UNIQUEMENT avec du JSON brut (sans balises markdown) :
{{
  "verdict": "approved" | "warning" | "blocked",
  "summary": "résumé en 2-3 phrases",
  "issues": [
    {{
      "severity": "blocking" | "warning" | "suggestion",
      "file": "chemin/du/fichier",
      "line_hint": "ligne ou emplacement approximatif",
      "category": "dates" | "api" | "structure" | "tailwind" | "accessibility" | "conventions" | "state",
      "description": "description du problème",
      "fix": "correction recommandée"
    }}
  ],
  "positives": ["point positif 1"]
}}

Règles de verdict :
- "blocked" → au moins 1 issue "blocking"
- "warning" → au moins 1 "warning", aucun "blocking"
- "approved" → uniquement suggestions ou aucune issue
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
            sys.exit("[review-frontend] ANTHROPIC_API_KEY manquant.")
        payload = {"model": AI_MODEL, "max_tokens": 16000, "messages": [{"role": "user", "content": prompt}]}
        req = urllib.request.Request(
            "https://api.anthropic.com/v1/messages",
            data=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json", "x-api-key": api_key, "anthropic-version": "2023-06-01"},
            method="POST",
        )
        data = _urlopen_with_retry(req, "review-frontend")
        return "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text")
    elif "deepseek" in AI_MODEL:
        api_key = os.environ.get("DEEPSEEK_API_KEY", "")
        if not api_key:
            sys.exit("[review-frontend] DEEPSEEK_API_KEY manquant.")
        payload = {"model": AI_MODEL, "max_tokens": 16000, "messages": [{"role": "user", "content": prompt}]}
        req = urllib.request.Request(
            "https://api.deepseek.com/v1/chat/completions",
            data=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"},
            method="POST",
        )
        data = _urlopen_with_retry(req, "review-frontend")
        return data.get("choices", [{}])[0].get("message", {}).get("content", "")
    else:
        api_key = os.environ.get("OPENAI_API_KEY", "")
        if not api_key:
            sys.exit("[review-frontend] OPENAI_API_KEY manquant.")
        payload = {
            "model": AI_MODEL,
            "max_tokens": 16000,
            "messages": [{"role": "user", "content": prompt}],
            "response_format": {"type": "json_object"},
        }
        req = urllib.request.Request(
            "https://api.openai.com/v1/chat/completions",
            data=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"},
            method="POST",
        )
        data = _urlopen_with_retry(req, "review-frontend")
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

def verdict_emoji(verdict: str) -> str:
    return {"approved": "✅", "warning": "⚠️", "blocked": "❌"}.get(verdict, "❓")


def format_comment(review: dict, pr_number: int) -> str:
    verdict = review.get("verdict", "warning")
    emoji = verdict_emoji(verdict)
    lines = [
        f"<!-- review:frontend run_id={os.environ.get('GITHUB_RUN_ID', '')} run_url=https://github.com/{os.environ.get('GITHUB_REPOSITORY', '')}/actions/runs/{os.environ.get('GITHUB_RUN_ID', '')} -->",
        f"## {emoji} Code Review Frontend",
        "",
        f"**Verdict :** `{verdict}`",
        "",
        f"**Résumé :** {review.get('summary', '')}",
        "",
    ]

    issues = review.get("issues", [])
    blocking = [i for i in issues if i.get("severity") == "blocking"]
    warnings = [i for i in issues if i.get("severity") == "warning"]
    suggestions = [i for i in issues if i.get("severity") == "suggestion"]

    if blocking:
        lines += ["### 🔴 Problèmes bloquants", ""]
        for i in blocking:
            lines += [
                f"- **[{i.get('category', '')}]** `{i.get('file', '')}` — {i.get('line_hint', '')}",
                f"  > {i.get('description', '')}",
                f"  > 💡 {i.get('fix', '')}",
                "",
            ]
    if warnings:
        lines += ["### 🟡 Avertissements", ""]
        for i in warnings:
            lines += [
                f"- **[{i.get('category', '')}]** `{i.get('file', '')}` — {i.get('line_hint', '')}",
                f"  > {i.get('description', '')}",
                f"  > 💡 {i.get('fix', '')}",
                "",
            ]
    if suggestions:
        lines += ["### 💡 Suggestions", ""]
        for i in suggestions:
            lines += [
                f"- **[{i.get('category', '')}]** `{i.get('file', '')}` — {i.get('description', '')}",
            ]
        lines.append("")

    positives = review.get("positives", [])
    if positives:
        lines += ["### ✨ Points positifs", ""]
        for p in positives:
            lines.append(f"- {p}")

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
        sys.exit("[review-frontend] Numéro de PR introuvable dans l'event.")

    print(f"[review-frontend] PR #{pr_number} — modèle : {AI_MODEL}")

    pr_info = get_pr_info(pr_number)
    pr_files = get_pr_files(pr_number)

    # Restriction au périmètre du fix si FILES_FILTER est défini
    files_filter_env = os.environ.get('FILES_FILTER', '').strip()
    if files_filter_env:
        allowed = {f.strip() for f in files_filter_env.split(',') if f.strip()}
        pr_files = [f for f in pr_files if f.get('filename', '') in allowed]
        print(f"[review-frontend] FILES_FILTER actif — {len(pr_files)} fichier(s) ciblé(s) : {', '.join(allowed)}")

    frontend_files = [f for f in pr_files if is_frontend_file(f.get("filename", ""))]
    if not frontend_files:
        print("[review-frontend] Aucun fichier frontend à reviewer.")
        ensure_labels_exist()
        add_pr_label(pr_number, "review: frontend ✅")
        run_id = os.environ.get('GITHUB_RUN_ID', '')
        repo = os.environ.get('GITHUB_REPOSITORY', '')
        tag = f"<!-- review:frontend run_id={run_id} run_url=https://github.com/{repo}/actions/runs/{run_id} -->"
        post_pr_comment(pr_number, f"## ✅ Code Review Frontend\n\nAucun fichier frontend modifié dans cette PR.\n{tag}")
        return

    context = build_review_context(pr_files, pr_info)
    prompt = REVIEW_PROMPT.replace("{context}", context)

    raw = call_api(prompt)
    raw = strip_json_fences(raw)

    try:
        review = json.loads(raw)
    except json.JSONDecodeError:
        print(f"[review-frontend] ⚠️ JSON invalide : {raw[:300]}", file=sys.stderr)
        review = {"verdict": "warning", "summary": "Erreur de parsing de la review.", "issues": [], "positives": []}

    verdict = review.get("verdict", "warning")
    label_map = {"approved": "review: frontend ✅", "warning": "review: frontend ⚠️", "blocked": "review: frontend ❌"}
    label = label_map.get(verdict, "review: frontend ⚠️")

    ensure_labels_exist()
    import urllib.parse
    for old_label in label_map.values():
        try:
            github_request("DELETE", f"issues/{pr_number}/labels/{urllib.parse.quote(old_label)}")
        except Exception:
            pass
    add_pr_label(pr_number, label)

    comment = format_comment(review, pr_number)
    post_pr_comment(pr_number, comment)

    print(f"[review-frontend] Verdict : {verdict} — commentaire posté.")
    if verdict == "blocked":
        sys.exit(1)


if __name__ == "__main__":
    main()
