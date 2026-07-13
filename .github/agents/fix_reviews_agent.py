#!/usr/bin/env python3
"""
Fix Reviews Agent — Mon Petit Roadtrip (Tool Calling Edition)
L'agent IA décide lui-même quels fichiers lire, dans quel ordre, et quand écrire.
Chaque provider (DeepSeek, Claude, OpenAI) est adapté au format tool calling natif.
"""
import json
import os
import pathlib
import subprocess
import sys
import time
import urllib.request
import urllib.error
import base64

GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "")
GITHUB_REPOSITORY = os.environ.get("GITHUB_REPOSITORY", "")
AI_MODEL = os.environ.get("AI_MODEL", "deepseek-chat")
PR_NUMBER = int(os.environ.get("PR_NUMBER", "0") or "0")
MAX_AGENT_TURNS = 30

if not PR_NUMBER:
    sys.exit("[fix-reviews] PR_NUMBER manquant.")


def _find_root() -> pathlib.Path:
    if os.environ.get("GITHUB_WORKSPACE"):
        return pathlib.Path(os.environ["GITHUB_WORKSPACE"])
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            capture_output=True, text=True, check=True,
        )
        return pathlib.Path(result.stdout.strip())
    except Exception:
        return pathlib.Path.cwd()


ROOT = _find_root()
print(f"[fix-reviews] ROOT résolu : {ROOT}")


# ─── GitHub API ───────────────────────────────────────────────────────────────

def github_request(method: str, path: str, body: dict | None = None):
    url = f"https://api.github.com/repos/{GITHUB_REPOSITORY}/{path}"
    data = json.dumps(body).encode() if body else None
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
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        print(f"[fix-reviews] GitHub {method} {path} → {e.code}: {e.read().decode()[:200]}", file=sys.stderr)
        return {}


def _urlopen_with_retry(req: urllib.request.Request, label: str) -> dict:
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=360) as resp:
                return json.loads(resp.read().decode())
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < 4:
                wait = int(e.headers.get("retry-after", 60))
                print(f"[{label}] Rate limit 429 — attente {wait}s (tentative {attempt+1}/5)...", file=sys.stderr)
                time.sleep(wait)
            else:
                body = e.read().decode()
                sys.exit(f"[{label}] Erreur API {e.code}: {body[:500]}")
        except urllib.error.URLError as e:
            if attempt < 4:
                wait = 30 * (attempt + 1)
                print(f"[{label}] Erreur réseau ({e.reason}) — retry dans {wait}s (tentative {attempt+1}/5)...", file=sys.stderr)
                time.sleep(wait)
            else:
                sys.exit(f"[{label}] Erreur réseau après 5 tentatives : {e.reason}")
    raise RuntimeError(f"[{label}] Échec après 5 tentatives")


# ─── Récupération des commentaires de review ──────────────────────────────────

def get_review_comments() -> list[tuple[str, str]]:
    all_comments = []
    page = 1
    while True:
        batch = github_request("GET", f"issues/{PR_NUMBER}/comments?per_page=100&page={page}")
        if not isinstance(batch, list) or not batch:
            break
        all_comments.extend(batch)
        if len(batch) < 100:
            break
        page += 1
    print(f"[fix-reviews] {len(all_comments)} commentaire(s) total(aux) sur la PR.", file=sys.stderr)

    latest: dict[str, tuple[str, str, str]] = {}
    all_reviews: list[tuple[str, str]] = []
    for c in all_comments:
        if c.get("user", {}).get("login") != "github-actions[bot]":
            continue
        body = c.get("body", "")
        if "Code Review Frontend" in body:
            scope, title = "frontend", "REVIEW FRONTEND"
        elif "Code Review Backend" in body:
            scope, title = "backend", "REVIEW BACKEND"
        elif "Validation Fonctionnelle" in body:
            scope, title = "functional", "REVIEW FUNCTIONAL"
        else:
            print(f"[fix-reviews] Comment non-matché: {repr(body[:60])}", file=sys.stderr)
            continue
        all_reviews.append((title, body))
        existing = latest.get(scope)
        if not existing or c.get("created_at", "") > existing[2]:
            latest[scope] = (title, body, c.get("created_at", ""))

    for scope in ["frontend", "backend"]:
        if scope not in latest:
            continue
        _, latest_body, _ = latest[scope]
        if not ("🔴" in latest_body or "Problèmes bloquants" in latest_body):
            scope_prefix = "Backend" if scope == "backend" else "Frontend"
            blocking = [
                (title, body) for title, body in all_reviews
                if scope_prefix in title and ("🔴" in body or "Problèmes bloquants" in body)
            ]
            if blocking:
                print(f"[fix-reviews] Le dernier commentaire {scope} est ⚠️ mais un ❌ existe — utilisation du bloquant.")
                latest[scope] = (blocking[-1][0], blocking[-1][1], "")

    result = [(v[0], v[1]) for v in latest.values()]
    for title, body in result:
        has_red = "🔴" in body
        has_bloquant = "Problèmes bloquants" in body
        preview = body[:80].replace("\n", " ")
        print(f"[fix-reviews] Commentaire retenu — {title} | 🔴={has_red} bloquant={has_bloquant} | {preview!r}", file=sys.stderr)
    return result


def get_pr_labels() -> set[str]:
    pr = github_request("GET", f"pulls/{PR_NUMBER}")
    return {lbl.get("name", "") for lbl in pr.get("labels", [])}


def has_blocking_issues(reviews: list[tuple[str, str]]) -> bool:
    if any("🔴" in body or "Problèmes bloquants" in body for _, body in reviews):
        return True
    if any("REVIEW FUNCTIONAL" in title and "Exigences manquantes" in body for title, body in reviews):
        return True
    labels = get_pr_labels()
    if any("❌" in lbl for lbl in labels):
        print(f"[fix-reviews] Label bloquant détecté sur la PR : {labels}")
        return True
    return False


def get_pr_files() -> list[dict]:
    result, page = [], 1
    while True:
        files = github_request("GET", f"pulls/{PR_NUMBER}/files?per_page=100&page={page}")
        if not files or not isinstance(files, list):
            break
        result.extend(files)
        if len(files) < 100:
            break
        page += 1
    return result


def get_pr_commits() -> list[dict]:
    """Retourne la liste des commits de la PR (du plus ancien au plus récent)."""
    result, page = [], 1
    while True:
        commits = github_request("GET", f"pulls/{PR_NUMBER}/commits?per_page=100&page={page}")
        if not commits or not isinstance(commits, list):
            break
        result.extend(commits)
        if len(commits) < 100:
            break
        page += 1
    return result


def get_file_content_at_ref(path: str, ref: str) -> str | None:
    """Récupère le contenu décodé d'un fichier à un ref (SHA ou branche) via l'API GitHub."""
    data = github_request("GET", f"contents/{path}?ref={ref}")
    if not isinstance(data, dict) or data.get("encoding") != "base64":
        return None
    try:
        return base64.b64decode(data["content"]).decode("utf-8", errors="replace")
    except Exception:
        return None


# ─── Outils locaux ────────────────────────────────────────────────────────────

PROTECTED_FILES = {
    "package.json", "package-lock.json", "vite.config.js", "ecosystem.config.cjs",
    ".env", ".env.production",
}

CORRUPTION_THRESHOLD_BYTES = 100


def restore_corrupted_files(pr_filenames: list[str]) -> list[dict]:
    """
    Parcourt les fichiers de la PR sur le disque.
    Si un fichier est < CORRUPTION_THRESHOLD_BYTES, remonte les commits de la PR
    du plus récent au plus ancien pour trouver la dernière version saine et la restaure.
    Retourne la liste des fichiers restaurés avec leurs infos de commit.
    """
    restored = []
    commits = None

    for filename in pr_filenames:
        target = ROOT / filename
        if not target.exists() or not target.is_file():
            continue
        size = target.stat().st_size
        if size >= CORRUPTION_THRESHOLD_BYTES:
            continue

        content_preview = target.read_text(encoding="utf-8", errors="replace")[:50].strip()
        print(f"[fix-reviews] ⚠️  Fichier suspect : {filename} ({size} bytes, contenu: {repr(content_preview)})")

        if commits is None:
            commits = get_pr_commits()
            print(f"[fix-reviews] {len(commits)} commit(s) dans la PR")

        corrupted_commit = None
        good_content = None
        good_sha = None

        for commit in reversed(commits):
            sha = commit.get("sha", "")
            msg = commit.get("commit", {}).get("message", "").split("\n")[0]
            content = get_file_content_at_ref(filename, sha)
            if content is None:
                continue
            if len(content.encode("utf-8")) < CORRUPTION_THRESHOLD_BYTES:
                if corrupted_commit is None:
                    corrupted_commit = {"sha": sha, "message": msg}
                continue
            good_content = content
            good_sha = sha
            print(f"[fix-reviews] ✅ Version saine trouvée : commit {sha[:8]} '{msg[:60]}' ({len(good_content)} chars)")
            break

        if good_content is None:
            print(f"[fix-reviews] ❌ Aucune version saine trouvée pour {filename}")
            continue

        target.write_text(good_content, encoding="utf-8")
        print(f"[fix-reviews] ✅ {filename} restauré depuis {good_sha[:8]}")
        restored.append({
            "path": filename,
            "restored_from_sha": good_sha,
            "corrupted_commit": corrupted_commit,
        })

    return restored


def tool_read_file(path: str) -> str:
    path = path.lstrip("/")
    target = ROOT / path
    if not target.exists() or not target.is_file():
        return f"[ERREUR] Fichier introuvable : {path}"
    try:
        content = target.read_text(encoding="utf-8", errors="replace")
        print(f"[fix-reviews] 📖 read_file({path}) — {len(content)} chars")
        return content
    except Exception as e:
        return f"[ERREUR] Impossible de lire {path} : {e}"


def tool_list_files(directory: str) -> str:
    directory = directory.lstrip("/")
    base = ROOT / directory
    if not base.exists():
        return f"[ERREUR] Répertoire introuvable : {directory}"
    files = []
    for p in sorted(base.rglob("*")):
        if p.is_file() and not any(part.startswith(".") for part in p.parts):
            try:
                files.append(str(p.relative_to(ROOT)).replace("\\", "/"))
            except ValueError:
                pass
    print(f"[fix-reviews] 📁 list_files({directory}) — {len(files)} fichier(s)")
    return "\n".join(files) if files else "(répertoire vide)"


def tool_write_file(path: str, content: str) -> str:
    path = path.lstrip("/")
    if not path or not path.endswith((".js", ".jsx", ".css", ".json", ".md", ".html", ".sql", ".prisma")):
        return f"[REFUSÉ] Chemin invalide ou extension non autorisée : {repr(path)}"
    filename = path.split("/")[-1]
    if filename in PROTECTED_FILES:
        return f"[REFUSÉ] {path} est un fichier de configuration protégé."
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")
    print(f"[fix-reviews] ✏️  write_file({path})")
    return f"OK — {path} écrit ({len(content)} chars)"


def tool_delete_file(path: str) -> str:
    path = path.lstrip("/")
    target = ROOT / path
    if not target.exists() or not target.is_file():
        return f"[IGNORÉ] {path} introuvable"
    target.unlink()
    print(f"[fix-reviews] 🗑️  delete_file({path})")
    return f"OK — {path} supprimé"


def tool_finish(summary: str) -> str:
    print(f"[fix-reviews] ✅ finish() — agent terminé")
    return f"DONE:{summary}"


def tool_get_file_at_commit(path: str, sha: str) -> str:
    """Récupère le contenu d'un fichier à un commit spécifique via l'API GitHub."""
    if not sha or len(sha) < 7:
        return "[ERREUR] SHA invalide."
    content = get_file_content_at_ref(path.lstrip("/"), sha)
    if content is None:
        return f"[ERREUR] Impossible de récupérer {path} au commit {sha[:8]}"
    print(f"[fix-reviews] 🔍 get_file_at_commit({path}, {sha[:8]}) — {len(content)} chars")
    return content


# ─── Définitions des outils ───────────────────────────────────────────────────

TOOLS_DEFINITION = [
    {
        "name": "read_file",
        "description": (
            "Lit le contenu d'un fichier du repository. "
            "TOUJOURS lire un fichier avant de le modifier — ne jamais inventer son contenu."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Chemin relatif depuis la racine du repo (ex: backend/src/routes/roadtrips.js)"}
            },
            "required": ["path"],
        },
    },
    {
        "name": "list_files",
        "description": "Liste récursivement tous les fichiers d'un répertoire.",
        "parameters": {
            "type": "object",
            "properties": {
                "directory": {"type": "string", "description": "Chemin relatif du répertoire (ex: frontend/web/src/pages)"}
            },
            "required": ["directory"],
        },
    },
    {
        "name": "write_file",
        "description": (
            "Écrit le contenu complet d'un fichier. "
            "RÈGLES : (1) Toujours lire le fichier avec read_file AVANT d'écrire. "
            "(2) Corrections chirurgicales uniquement — pas de réécriture complète. "
            "(3) Ne jamais modifier package.json, package-lock.json, vite.config.js, ecosystem.config.cjs."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Chemin relatif depuis la racine du repo"},
                "content": {"type": "string", "description": "Contenu COMPLET du fichier (pas de ... ni placeholder)"},
            },
            "required": ["path", "content"],
        },
    },
    {
        "name": "delete_file",
        "description": "Supprime un fichier. Utiliser UNIQUEMENT pour des doublons confirmés signalés par les reviewers.",
        "parameters": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Chemin relatif du fichier à supprimer"}
            },
            "required": ["path"],
        },
    },
    {
        "name": "get_file_at_commit",
        "description": (
            "Récupère le contenu d'un fichier à un commit spécifique via l'API GitHub. "
            "Utile pour inspecter l'historique : comprendre ce qu'un commit précédent avait tenté de faire, "
            "ou vérifier l'état d'un fichier avant qu'il soit corrompu."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Chemin relatif du fichier depuis la racine du repo"},
                "sha": {"type": "string", "description": "SHA du commit (7 à 40 caractères hex)"},
            },
            "required": ["path", "sha"],
        },
    },
    {
        "name": "finish",
        "description": (
            "Termine l'agent. Appeler UNIQUEMENT quand tous les problèmes bloquants des reviews sont corrigés."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "summary": {"type": "string", "description": "Résumé concis de toutes les corrections effectuées"}
            },
            "required": ["summary"],
        },
    },
]


# ─── Dispatching ──────────────────────────────────────────────────────────────

def dispatch_tool(name: str, args: dict) -> str:
    if name == "read_file":
        return tool_read_file(args.get("path", ""))
    if name == "list_files":
        return tool_list_files(args.get("directory", ""))
    if name == "write_file":
        return tool_write_file(args.get("path", ""), args.get("content", ""))
    if name == "delete_file":
        return tool_delete_file(args.get("path", ""))
    if name == "finish":
        return tool_finish(args.get("summary", ""))
    if name == "get_file_at_commit":
        return tool_get_file_at_commit(args.get("path", ""), args.get("sha", ""))
    return f"[ERREUR] Outil inconnu : {name}"


# ─── Providers ────────────────────────────────────────────────────────────────

def tools_for_openai_compat() -> list[dict]:
    return [
        {"type": "function", "function": {"name": t["name"], "description": t["description"], "parameters": t["parameters"]}}
        for t in TOOLS_DEFINITION
    ]


def tools_for_claude() -> list[dict]:
    return [
        {"name": t["name"], "description": t["description"], "input_schema": t["parameters"]}
        for t in TOOLS_DEFINITION
    ]


def run_agent_openai_compat(system_prompt: str, initial_user_message: str, api_url: str, api_key: str) -> str:
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": initial_user_message},
    ]
    tools = tools_for_openai_compat()
    summary = ""

    for turn in range(MAX_AGENT_TURNS):
        print(f"[fix-reviews] 🔄 Turn {turn+1}/{MAX_AGENT_TURNS}")
        payload = {"model": AI_MODEL, "max_tokens": 8192, "messages": messages, "tools": tools, "tool_choice": "auto"}
        req = urllib.request.Request(
            api_url, data=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"},
            method="POST",
        )
        data = _urlopen_with_retry(req, "fix-reviews")
        choice = data.get("choices", [{}])[0]
        message = choice.get("message", {})
        messages.append(message)

        tool_calls = message.get("tool_calls", [])
        if not tool_calls:
            content = message.get("content", "")
            print(f"[fix-reviews] Agent terminé sans finish() — {content[:200]}")
            return summary or content

        for tc in tool_calls:
            fn = tc.get("function", {})
            tool_name = fn.get("name", "")
            try:
                tool_args = json.loads(fn.get("arguments", "{}"))
            except json.JSONDecodeError:
                tool_args = {}
            result = dispatch_tool(tool_name, tool_args)
            print(f"[fix-reviews] Tool {tool_name} → {result[:120]}")
            messages.append({"role": "tool", "tool_call_id": tc.get("id", ""), "content": result})
            if result.startswith("DONE:"):
                return result[5:]

    print(f"[fix-reviews] ⚠️ Limite de {MAX_AGENT_TURNS} turns atteinte.")
    return summary


def run_agent_claude(system_prompt: str, initial_user_message: str) -> str:
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        sys.exit("[fix-reviews] ANTHROPIC_API_KEY manquant.")

    messages = [{"role": "user", "content": initial_user_message}]
    tools = tools_for_claude()
    summary = ""

    for turn in range(MAX_AGENT_TURNS):
        print(f"[fix-reviews] 🔄 Turn {turn+1}/{MAX_AGENT_TURNS}")
        payload = {"model": AI_MODEL, "max_tokens": 8192, "system": system_prompt, "messages": messages, "tools": tools}
        req = urllib.request.Request(
            "https://api.anthropic.com/v1/messages",
            data=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json", "x-api-key": api_key, "anthropic-version": "2023-06-01"},
            method="POST",
        )
        data = _urlopen_with_retry(req, "fix-reviews")
        stop_reason = data.get("stop_reason", "")
        content_blocks = data.get("content", [])
        messages.append({"role": "assistant", "content": content_blocks})

        if stop_reason == "end_turn":
            text = "".join(b.get("text", "") for b in content_blocks if b.get("type") == "text")
            print(f"[fix-reviews] Agent Claude terminé (end_turn) sans finish().")
            return summary or text

        if stop_reason != "tool_use":
            print(f"[fix-reviews] ⚠️ stop_reason inattendu : {stop_reason}")
            return summary

        tool_results = []
        for block in content_blocks:
            if block.get("type") != "tool_use":
                continue
            tool_name = block.get("name", "")
            tool_args = block.get("input", {})
            result = dispatch_tool(tool_name, tool_args)
            print(f"[fix-reviews] Tool {tool_name} → {result[:120]}")
            tool_results.append({"type": "tool_result", "tool_use_id": block.get("id", ""), "content": result})
            if result.startswith("DONE:"):
                return result[5:]

        messages.append({"role": "user", "content": tool_results})

    print(f"[fix-reviews] ⚠️ Limite de {MAX_AGENT_TURNS} turns atteinte.")
    return summary


def run_agent(system_prompt: str, initial_user_message: str) -> str:
    if AI_MODEL.startswith("claude-"):
        return run_agent_claude(system_prompt, initial_user_message)
    elif "deepseek" in AI_MODEL:
        api_key = os.environ.get("DEEPSEEK_API_KEY", "")
        if not api_key:
            sys.exit("[fix-reviews] DEEPSEEK_API_KEY manquant.")
        return run_agent_openai_compat(system_prompt, initial_user_message,
                                       "https://api.deepseek.com/v1/chat/completions", api_key)
    else:
        api_key = os.environ.get("OPENAI_API_KEY", "")
        if not api_key:
            sys.exit("[fix-reviews] OPENAI_API_KEY manquant.")
        return run_agent_openai_compat(system_prompt, initial_user_message,
                                       "https://api.openai.com/v1/chat/completions", api_key)


# ─── Prompt système ───────────────────────────────────────────────────────────

SYSTEM_PROMPT = """Tu es un agent senior de correction de code pour le projet Mon Petit Roadtrip (app de planification de road trips).

Ta mission : corriger les problèmes identifiés dans les rapports de code review d'une PR.
Tu as accès à des outils pour lire les fichiers, les modifier, et lister des répertoires.

== WORKFLOW OBLIGATOIRE ==

1. Commence par lire les fichiers mentionnés dans les reviews avec read_file
2. Lis TOUJOURS un fichier avant de le modifier — ne jamais inventer ou supposer son contenu
3. Si un fichier fait référence à un autre fichier (route, middleware, composant), lis ce fichier aussi
4. Applique les corrections avec write_file
5. Appelle finish() UNIQUEMENT quand tous les problèmes bloquants sont résolus

== CONVENTIONS MON PETIT ROADTRIP ==

### Backend (Node.js / CommonJS)
- require() / module.exports — PAS d'import/export ES6 dans le backend
- Express 4 + Prisma ORM
- Auth via middleware auth.js : req.user.userId
- Erreurs : res.status(400).json({ error: '...' }) — pas d'AppError
- Routes dans backend/src/routes/, models Prisma dans backend/prisma/schema.prisma

### Prisma / SQL
- Noms de modèles camelCase : roadtrip, step, accommodation, activity, photo, user
- Colonnes camelCase : userId, startDate, endDate, createdAt
- Colonnes avec majuscules entre guillemets dans le SQL brut : "userId", "startDate"
- Tables de la DB : roadtrips, steps, accommodations, activities, photos, users

### Frontend web (React 18 + Vite + Tailwind)
- React 18, JSX (.jsx), CSS Tailwind — PAS TypeScript
- Appels API via axios (fichiers dans frontend/web/src/api/)
- useState + useEffect pour les appels API (pas de TanStack Query)
- Icônes : lucide-react

### Frontend mobile (Expo React Native)
- React Native, JSX (.js), fichiers dans frontend/src/
- Appels API via connecteur PowerSync ou API axios
- Lecture données : useQuery PowerSync
- Écriture données : localWrite.js

### RÈGLE CRITIQUE — Dates
- NE JAMAIS utiliser date.toISOString() — cela décale la date selon le timezone
- Toujours sérialiser : getFullYear() + getMonth() + getDate() → "YYYY-MM-DD"
- Toujours désérialiser : new Date(year, month-1, day, 12, 0, 0) depuis "YYYY-MM-DD"

== RÈGLES ANTI-RÉGRESSION ==

1. Ne jamais modifier package.json, package-lock.json, vite.config.js, ecosystem.config.cjs
2. Vérifier les imports manquants après chaque modification
3. Corrections chirurgicales uniquement — pas de réécriture complète de fichiers
4. Ne jamais changer la logique d'authentification dans backend/src/middleware/auth.js
"""


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    print(f"[fix-reviews] PR #{PR_NUMBER} — modèle : {AI_MODEL} — mode tool calling")

    reviews = get_review_comments()
    has_blocking = reviews and has_blocking_issues(reviews)

    if not reviews:
        print("[fix-reviews] Aucun commentaire de review trouvé.")
    elif not has_blocking:
        print("[fix-reviews] Aucun problème bloquant (🔴) dans les reviews.")
        (ROOT / ".ai").mkdir(exist_ok=True)
        (ROOT / ".ai" / "fix_reviews_summary.md").write_text("Aucune correction nécessaire.", encoding="utf-8")
        sys.exit(0)

    pr_files = get_pr_files()
    if not pr_files:
        sys.exit("[fix-reviews] Impossible de récupérer les fichiers de la PR.")

    pr_filenames = [f.get("filename", "") for f in pr_files if f.get("status") != "removed"]
    print(f"[fix-reviews] {len(pr_filenames)} fichier(s) dans la PR")

    # ── Restauration automatique des fichiers corrompus ───────────────────────
    restored = restore_corrupted_files(pr_filenames)
    restoration_note = ""
    if restored:
        lines = ["\n## ⚠️ Fichiers corrompus — restauration automatique effectuée\n"]
        lines.append("Les fichiers suivants étaient corrompus (contenu tronqué, ex: '...') et ont été restaurés depuis le dernier commit sain :\n")
        for r in restored:
            corrupted = r.get("corrupted_commit")
            if corrupted:
                lines.append(f"- `{r['path']}` : restauré depuis `{r['restored_from_sha'][:8]}` (le commit `{corrupted['sha'][:8]}` avait tenté : _{corrupted['message'][:80]}_)")
            else:
                lines.append(f"- `{r['path']}` : restauré depuis `{r['restored_from_sha'][:8]}`")
        lines.append("\n> Le fichier restauré contient la feature mais PAS la correction tentée par le commit corrompu.")
        lines.append("> Tu dois appliquer sur ce fichier restauré les corrections indiquées par les reviews ci-dessus.")
        lines.append("> Utilise `get_file_at_commit` si tu as besoin d'inspecter un commit précis de l'historique.\n")
        restoration_note = "\n".join(lines)

    code_reviews = [(t, b) for t, b in reviews if t in ("REVIEW FRONTEND", "REVIEW BACKEND")]
    functional_reviews = [(t, b) for t, b in reviews if t == "REVIEW FUNCTIONAL"]
    reviews_text = "\n\n".join(f"=== {title} ===\n{body}" for title, body in code_reviews) if code_reviews else ""
    functional_text = "\n\n".join(f"=== {title} ===\n{body}" for title, body in functional_reviews) if functional_reviews else ""

    functional_section = (
        f"\n## Rapport de Validation Fonctionnelle\n\n{functional_text}\n\n"
        "Note : si des exigences fonctionnelles manquantes (🔴) sont listées ci-dessus, implémente-les.\n"
    ) if functional_text else ""

    initial_message = f"""## Rapports de Code Review — PR #{PR_NUMBER}

{reviews_text if reviews_text else "(Pas de rapport de review de code)"}
{functional_section}{restoration_note}
## Fichiers modifiés dans la PR
{chr(10).join(f"- {f}" for f in pr_filenames)}

## Instructions
1. Lis les fichiers mentionnés dans les reviews avec read_file
2. Lis aussi les fichiers dépendants dont tu as besoin pour comprendre le contexte
3. Applique les corrections avec write_file (après avoir lu le fichier)
4. Appelle finish() quand tous les problèmes bloquants sont corrigés
"""

    print(f"[fix-reviews] Lancement de l'agent IA (tool calling)...")
    summary = run_agent(SYSTEM_PROMPT, initial_message)

    (ROOT / ".ai").mkdir(exist_ok=True)
    (ROOT / ".ai" / "fix_reviews_summary.md").write_text(
        summary or "Corrections appliquées automatiquement.",
        encoding="utf-8"
    )
    print(f"\n[fix-reviews] Terminé.")


if __name__ == "__main__":
    main()
