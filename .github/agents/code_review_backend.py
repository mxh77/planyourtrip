#!/usr/bin/env python3
"""
Code Review Backend Agent — Mon Petit Roadtrip
Analyse les fichiers backend d'une PR et poste des commentaires de review.
Vérifie : conventions Node.js/Express/Prisma, sécurité, routes, auth.
"""
import json
import os
import pathlib
import re
import sys
import urllib.parse
import urllib.request
import urllib.error

GITHUB_EVENT_PATH = os.environ["GITHUB_EVENT_PATH"]
GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "")
GITHUB_REPOSITORY = os.environ.get("GITHUB_REPOSITORY", "")
AI_MODEL = os.environ.get("AI_MODEL", "").strip() or "deepseek-v4-flash"

BACKEND_EXTENSIONS = {".js", ".json", ".sql", ".prisma"}
BACKEND_PATHS = ("backend/src/", "backend/prisma/")
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
        print(f"[review-backend] GitHub {method} {path} → {e.code}: {e.read().decode()[:200]}", file=sys.stderr)
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
        {"name": "review: backend ✅", "color": "0e8a16", "description": "Review backend approuvée"},
        {"name": "review: backend ⚠️", "color": "e4a817", "description": "Review backend: avertissements"},
        {"name": "review: backend ❌", "color": "d93f0b", "description": "Review backend: problèmes bloquants"},
    ]:
        if label["name"] not in existing_names:
            github_request("POST", "labels", label)


# ─── Filtrage des fichiers backend ────────────────────────────────────────────

def is_backend_file(filename: str) -> bool:
    return (
        pathlib.Path(filename).suffix in BACKEND_EXTENSIONS
        and any(filename.startswith(p) for p in BACKEND_PATHS)
        and not any(ign in filename for ign in IGNORE_PATHS)
    )


def build_review_context(pr_files: list[dict], pr_info: dict) -> str:
    backend_files = [f for f in pr_files if is_backend_file(f.get("filename", ""))]

    parts = [
        f"=== PR #{pr_info.get('number')} — {pr_info.get('title')} ===",
        f"Branche: {pr_info.get('head', {}).get('ref', '')}",
        f"Description: {pr_info.get('body', '') or 'Aucune'}",
        f"\n{len(backend_files)} fichier(s) backend modifié(s).",
        "",
    ]

    for f in backend_files:
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

REVIEW_PROMPT = """Tu es un expert en review de code backend pour le projet Mon Petit Roadtrip.
Analyse les fichiers modifiés ci-dessous et produis une review exhaustive.

== STACK TECHNIQUE MON PETIT ROADTRIP ==

- Node.js + Express 4 (JavaScript CommonJS — require/module.exports)
- Prisma ORM + PostgreSQL (Supabase Frankfurt)
- JWT maison (jsonwebtoken) — pas de refresh token
- Pas de TypeScript — tout en .js
- Pas de monorepo — projet unique

== CONVENTIONS OBLIGATOIRES ==

### Structure des fichiers
- Routes : backend/src/routes/*.js — chaque fichier = un domaine (roadtrips, steps, etc.)
- Middleware auth : backend/src/middleware/auth.js — req.user = { userId, email, role }
- Client Prisma : backend/src/lib/prisma.js — import unique, réutilisé partout
- Pas de séparation controller/service — logique dans les routes

### JavaScript CommonJS
- require() pour les imports, module.exports pour les exports
  ❌ import/export ES modules (sauf si explicitement configuré)
- Pas de TypeScript, pas d'annotations de type

### Prisma / SQL
- Utiliser prisma.tableName.findMany(), findUnique(), create(), update(), delete()
- Noms de modèles Prisma en camelCase : prisma.roadtrip, prisma.step, prisma.accommodation
- Tables PostgreSQL avec camelCase dans les colonnes Prisma : userId, startDate, etc.
- Colonnes camelCase doivent être entre guillemets dans SQL brut : "userId", "startDate"
  ❌ Requêtes SQL brutes quand Prisma suffit

### Routes Express
- router.get/post/put/patch/delete avec async/await
- Toujours un try/catch avec res.status(500).json({ error: message })
- Codes HTTP corrects : 200 (GET/PATCH), 201 (POST/create), 204 (DELETE), 400, 401, 403, 404
- Middleware auth appliqué sur toutes les routes protégées
  ❌ res.json() sans code HTTP explicite sur les erreurs

### Authentification & Autorisation
- Middleware auth.js vérifie le JWT et injecte req.user
- requireAdmin pour les routes /api/admin/*
- Toujours vérifier que l'utilisateur ne peut modifier que ses propres données
  ❌ Opérations sans vérification d'ownership

### Sécurité (OWASP)
- Toujours valider les inputs côté serveur (manque de validation = problème bloquant)
- Pas d'injection SQL possible (utiliser les paramètres Prisma/prisma.$queryRaw avec $1,$2)
- Pas de secrets (clés, mots de passe, tokens) en dur dans le code
- Pas de path traversal dans les téléchargements de fichiers
- Limiter les infos d'erreur exposées au client (pas de stack trace en prod)

### Variables d'environnement
- process.env.VAR pour toutes les configs sensibles
- Jamais en dur dans le code

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
      "category": "security" | "auth" | "prisma" | "routes" | "validation" | "structure" | "conventions",
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
            sys.exit("[review-backend] ANTHROPIC_API_KEY manquant.")
        payload = {"model": AI_MODEL, "max_tokens": 16000, "messages": [{"role": "user", "content": prompt}]}
        req = urllib.request.Request(
            "https://api.anthropic.com/v1/messages",
            data=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json", "x-api-key": api_key, "anthropic-version": "2023-06-01"},
            method="POST",
        )
        data = _urlopen_with_retry(req, "review-backend")
        return "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text")
    elif "deepseek" in AI_MODEL:
        api_key = os.environ.get("DEEPSEEK_API_KEY", "")
        if not api_key:
            sys.exit("[review-backend] DEEPSEEK_API_KEY manquant.")
        payload = {"model": AI_MODEL, "max_tokens": 16000, "messages": [{"role": "user", "content": prompt}]}
        req = urllib.request.Request(
            "https://api.deepseek.com/v1/chat/completions",
            data=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"},
            method="POST",
        )
        data = _urlopen_with_retry(req, "review-backend")
        return data.get("choices", [{}])[0].get("message", {}).get("content", "")
    else:
        api_key = os.environ.get("OPENAI_API_KEY", "")
        if not api_key:
            sys.exit("[review-backend] OPENAI_API_KEY manquant.")
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
        data = _urlopen_with_retry(req, "review-backend")
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


def build_issue_header(issue: dict) -> str:
    cat = issue.get("category", "")
    file = issue.get("file", "")
    hint = issue.get("line_hint", "")
    return f"**[{cat}]** `{file}` — {hint}"


def apply_exceptions(review: dict, exceptions: set[str]) -> dict:
    """Downgrade les issues 'blocking' dont le header est dans les exceptions."""
    if not exceptions:
        return review
    for issue in review.get("issues", []):
        if issue.get("severity") == "blocking" and build_issue_header(issue) in exceptions:
            issue["severity"] = "warning"
            issue["_downgraded"] = True
    # Recalculer le verdict
    issues = review.get("issues", [])
    if any(i.get("severity") == "blocking" for i in issues):
        review["verdict"] = "blocked"
    elif any(i.get("severity") == "warning" for i in issues):
        review["verdict"] = "warning"
    else:
        review["verdict"] = "approved"
    return review


# ─── Formatage du commentaire ─────────────────────────────────────────────────

def format_comment(review: dict, pr_number: int) -> str:
    verdict = review.get("verdict", "warning")
    emoji = verdict_emoji(verdict)
    lines = [
        f"<!-- review:backend run_id={os.environ.get('GITHUB_RUN_ID', '')} run_url=https://github.com/{os.environ.get('GITHUB_REPOSITORY', '')}/actions/runs/{os.environ.get('GITHUB_RUN_ID', '')} -->",
        f"## {emoji} Code Review Backend",
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
        sys.exit("[review-backend] Numéro de PR introuvable dans l'event.")

    print(f"[review-backend] PR #{pr_number} — modèle : {AI_MODEL}")

    pr_info = get_pr_info(pr_number)
    pr_files = get_pr_files(pr_number)

    # Restriction au périmètre du fix si FILES_FILTER est défini
    files_filter_env = os.environ.get('FILES_FILTER', '').strip()
    if files_filter_env:
        allowed = {f.strip() for f in files_filter_env.split(',') if f.strip()}
        pr_files = [f for f in pr_files if f.get('filename', '') in allowed]
        print(f"[review-backend] FILES_FILTER actif — {len(pr_files)} fichier(s) ciblé(s) : {', '.join(allowed)}")

    backend_files = [f for f in pr_files if is_backend_file(f.get("filename", ""))]
    if not backend_files:
        print("[review-backend] Aucun fichier backend à reviewer.")
        ensure_labels_exist()
        add_pr_label(pr_number, "review: backend ✅")
        run_id = os.environ.get('GITHUB_RUN_ID', '')
        repo = os.environ.get('GITHUB_REPOSITORY', '')
        tag = f"<!-- review:backend run_id={run_id} run_url=https://github.com/{repo}/actions/runs/{run_id} -->"
        post_pr_comment(pr_number, f"## ✅ Code Review Backend\n\nAucun fichier backend modifié dans cette PR.\n{tag}")
        return

    context = build_review_context(pr_files, pr_info)
    prompt = REVIEW_PROMPT.replace("{context}", context)

    raw = call_api(prompt)
    raw = strip_json_fences(raw)

    try:
        review = json.loads(raw)
    except json.JSONDecodeError:
        print(f"[review-backend] ⚠️ JSON invalide : {raw[:300]}", file=sys.stderr)
        review = {"verdict": "warning", "summary": "Erreur de parsing de la review.", "issues": [], "positives": []}

    exceptions = get_review_exceptions(pr_number)
    if exceptions:
        print(f"[review-backend] {len(exceptions)} exception(s) trouvée(s), downgrade appliqué.")
        review = apply_exceptions(review, exceptions)

    verdict = review.get("verdict", "warning")
    label_map = {"approved": "review: backend ✅", "warning": "review: backend ⚠️", "blocked": "review: backend ❌"}
    label = label_map.get(verdict, "review: backend ⚠️")

    ensure_labels_exist()
    # Supprimer les anciens labels de review backend
    for old_label in label_map.values():
        try:
            github_request("DELETE", f"issues/{pr_number}/labels/{urllib.parse.quote(old_label)}")
        except Exception:
            pass
    add_pr_label(pr_number, label)

    comment = format_comment(review, pr_number)
    post_pr_comment(pr_number, comment)

    print(f"[review-backend] Verdict : {verdict} — commentaire posté.")


if __name__ == "__main__":
    main()
