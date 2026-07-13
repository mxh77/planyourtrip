#!/usr/bin/env python3
"""
QA Fix Agent — Mon Petit Roadtrip
Déclenché manuellement depuis le DevHub quand un testeur signale un bug sur la preview.
Reçoit la description du bug, lit la PR, et tente de corriger le problème.
"""
import json
import os
import pathlib
import re
import subprocess
import sys
import time
import urllib.request
import urllib.error
import base64

GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "")
GITHUB_REPOSITORY = os.environ.get("GITHUB_REPOSITORY", "")
AI_MODEL = os.environ.get("AI_MODEL", "claude-sonnet-4-6")
PR_NUMBER = int(os.environ.get("PR_NUMBER", "0") or "0")
BUG_DESCRIPTION = os.environ.get("BUG_DESCRIPTION", "")
BUG_CATEGORY = os.environ.get("BUG_CATEGORY", "missing_feature")
MAX_AGENT_TURNS = 30

if not PR_NUMBER:
    sys.exit("[qa-fix] PR_NUMBER manquant.")
if not BUG_DESCRIPTION:
    sys.exit("[qa-fix] BUG_DESCRIPTION manquant.")


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
print(f"[qa-fix] ROOT résolu : {ROOT}")


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
        print(f"[qa-fix] GitHub {method} {path} → {e.code}: {e.read().decode()[:200]}", file=sys.stderr)
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
                print(f"[{label}] Erreur réseau ({e.reason}) — retry dans {wait}s...", file=sys.stderr)
                time.sleep(wait)
            else:
                sys.exit(f"[{label}] Erreur réseau après 5 tentatives : {e.reason}")
    raise RuntimeError(f"[{label}] Échec après 5 tentatives")


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


def get_pr_branch() -> str:
    pr = github_request("GET", f"pulls/{PR_NUMBER}")
    return pr.get("head", {}).get("ref", "")


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


def extract_issue_number_from_branch(branch: str) -> int | None:
    m = re.search(r"issue-([0-9]+)-", branch)
    if m:
        return int(m.group(1))
    return None


def load_acceptance_criteria(issue_number: int) -> list[dict]:
    issues_dir = ROOT / ".ai" / "issues"
    if not issues_dir.exists():
        return []
    for d in issues_dir.iterdir():
        if d.is_dir() and d.name.startswith(f"{issue_number}-"):
            ac_path = d / "acceptance_criteria.json"
            if ac_path.exists():
                try:
                    data = json.loads(ac_path.read_text(encoding="utf-8"))
                    criteria = data.get("criteria", [])
                    print(f"[qa-fix] ✅ {len(criteria)} critère(s) d'acceptation chargés (issue #{issue_number})")
                    return criteria
                except Exception as e:
                    print(f"[qa-fix] ⚠️ Impossible de lire acceptance_criteria.json : {e}")
    print(f"[qa-fix] ℹ️ Aucun acceptance_criteria.json trouvé pour l'issue #{issue_number}")
    return []


def format_acceptance_criteria(criteria: list[dict], bug_category: str) -> str:
    if not criteria:
        return ""
    lines = ["## Critères d'acceptation de la feature\n"]
    matching = [c for c in criteria if c.get("bug_category") == bug_category]
    others = [c for c in criteria if c.get("bug_category") != bug_category]
    if matching:
        lines.append(f"### ⚠️ Critères liés à la catégorie `{bug_category}` (prioritaires) :\n")
        for c in matching:
            lines.append(f"- **{c['id']}** [{c.get('priority','?')}] {c['criterion']}")
            if c.get('expected') and c['expected'] != c['criterion']:
                lines.append(f"  → Attendu : {c['expected']}")
    if others:
        lines.append("\n### Autres critères (non-régression) :\n")
        for c in others:
            lines.append(f"- **{c['id']}** {c['criterion']}")
    lines.append("\n> Vérifie que ta correction respecte les critères ci-dessus et ne casse aucun des autres.")
    return "\n".join(lines)


def post_pr_comment(body: str) -> None:
    github_request("POST", f"issues/{PR_NUMBER}/comments", {"body": body})


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
        print(f"[qa-fix] ⚠️  Fichier suspect : {filename} ({size} bytes, contenu: {repr(content_preview)})")

        if commits is None:
            commits = get_pr_commits()
            print(f"[qa-fix] {len(commits)} commit(s) dans la PR")

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
            print(f"[qa-fix] ✅ Version saine trouvée : commit {sha[:8]} '{msg[:60]}' ({len(good_content)} chars)")
            break

        if good_content is None:
            print(f"[qa-fix] ❌ Aucune version saine trouvée pour {filename}")
            continue

        target.write_text(good_content, encoding="utf-8")
        print(f"[qa-fix] ✅ {filename} restauré depuis {good_sha[:8]}")
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
        print(f"[qa-fix] 📖 read_file({path}) — {len(content)} chars")
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
    print(f"[qa-fix] 📁 list_files({directory}) — {len(files)} fichier(s)")
    return "\n".join(files) if files else "(répertoire vide)"


TRUNCATION_PATTERNS = re.compile(
    r'^\s*\.{3}\s*$'                      # ligne contenant uniquement "..."
    r'|^\s*#\s*\.{3}\s*$'                 # ligne "# ..."
    r'|^\s*//\s*\.{3}\s*$'               # ligne "// ..."
    r'|^\s*/\*\s*\.{3}\s*\*/\s*$'        # ligne "/* ... */"
    r'|<unchanged>|<existing code>|<rest of file>|<same as before>|…',
    re.IGNORECASE | re.MULTILINE,
)


def tool_write_file(path: str, content: str) -> str:
    path = path.lstrip("/")
    if not path or not path.endswith((".js", ".jsx", ".css", ".json", ".md", ".html", ".sql", ".prisma")):
        return f"[REFUSÉ] Chemin invalide ou extension non autorisée : {repr(path)}"
    filename = path.split("/")[-1]
    if filename in PROTECTED_FILES:
        return f"[REFUSÉ] {path} est un fichier de configuration protégé."

    # ── Détection de contenu tronqué / placeholder ────────────────────────────
    stripped = content.strip()
    if stripped in ("...", "…", "// ...", "# ..."):
        return (
            "[REFUSÉ] Contenu invalide : tu as fourni uniquement '...' comme contenu. "
            "Tu dois écrire le contenu COMPLET du fichier. "
            "Lis d'abord le fichier avec read_file, modifie uniquement ce qui doit l'être, "
            "puis écris l'intégralité du fichier avec write_file."
        )
    if TRUNCATION_PATTERNS.search(content):
        return (
            "[REFUSÉ] Contenu tronqué détecté : le contenu contient des placeholders ('...', "
            "'<unchanged>', etc.) qui remplacent du code existant. "
            "Tu DOIS fournir le contenu COMPLET sans aucun raccourci. "
            "Relis le fichier avec read_file et réécris-le en entier avec tes modifications."
        )

    # ── Vérification de régression de taille (fichier existant seulement) ─────
    target = ROOT / path
    if target.exists() and target.is_file():
        original_size = target.stat().st_size
        new_size = len(content.encode("utf-8"))
        if original_size > 500 and new_size < original_size * 0.25:
            return (
                f"[REFUSÉ] Contenu suspect : le nouveau contenu fait {new_size} octets alors que "
                f"l'original fait {original_size} octets (réduction > 75%). "
                f"Un fichier ne peut pas perdre plus de 75% de son contenu lors d'une correction de bug. "
                f"Vérifie que tu as bien copié l'intégralité du fichier original avant d'appliquer tes modifications."
            )

    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")
    print(f"[qa-fix] ✏️  write_file({path})")
    return f"OK — {path} écrit ({len(content)} chars)"


def tool_delete_file(path: str) -> str:
    path = path.lstrip("/")
    target = ROOT / path
    if not target.exists() or not target.is_file():
        return f"[IGNORÉ] {path} introuvable"
    target.unlink()
    print(f"[qa-fix] 🗑️  delete_file({path})")
    return f"OK — {path} supprimé"


def tool_finish(summary: str) -> str:
    print(f"[qa-fix] ✅ finish() — agent terminé")
    return f"DONE:{summary}"


def tool_get_file_at_commit(path: str, sha: str) -> str:
    """Récupère le contenu d'un fichier à un commit spécifique via l'API GitHub."""
    if not sha or len(sha) < 7:
        return "[ERREUR] SHA invalide."
    content = get_file_content_at_ref(path.lstrip("/"), sha)
    if content is None:
        return f"[ERREUR] Impossible de récupérer {path} au commit {sha[:8]}"
    print(f"[qa-fix] 🔍 get_file_at_commit({path}, {sha[:8]}) — {len(content)} chars")
    return content


# ─── Définitions des outils ───────────────────────────────────────────────────

TOOLS_DEFINITION = [
    {
        "name": "read_file",
        "description": "Lit le contenu d'un fichier du repository. Toujours lire avant de modifier.",
        "parameters": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Chemin relatif depuis la racine du repo"}
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
                "directory": {"type": "string", "description": "Chemin relatif du répertoire"}
            },
            "required": ["directory"],
        },
    },
    {
        "name": "write_file",
        "description": (
            "Écrit le contenu COMPLET d'un fichier. "
            "RÈGLES ABSOLUES : "
            "1) Toujours lire le fichier avec read_file AVANT d'écrire. "
            "2) Le paramètre 'content' doit contenir 100% du fichier — JAMAIS de '...', '…', '<unchanged>', ou tout autre placeholder. "
            "3) Si le fichier est long, recopie intégralement toutes les parties non modifiées. "
            "4) Un contenu avec '...' sera automatiquement refusé par le système. "
            "5) Ne jamais modifier package.json, package-lock.json, vite.config.js, ecosystem.config.cjs."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Chemin relatif depuis la racine du repo"},
                "content": {"type": "string", "description": "Contenu COMPLET du fichier"},
            },
            "required": ["path", "content"],
        },
    },
    {
        "name": "delete_file",
        "description": "Supprime un fichier. Utiliser uniquement pour des doublons confirmés.",
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
            "Utile pour inspecter l'historique : voir ce qu'un commit précédent avait tenté de faire, "
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
        "description": "Termine l'agent quand le bug est corrigé.",
        "parameters": {
            "type": "object",
            "properties": {
                "summary": {"type": "string", "description": "Résumé concis des corrections effectuées"}
            },
            "required": ["summary"],
        },
    },
]


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
    return [{"type": "function", "function": {"name": t["name"], "description": t["description"], "parameters": t["parameters"]}} for t in TOOLS_DEFINITION]


def tools_for_claude() -> list[dict]:
    return [{"name": t["name"], "description": t["description"], "input_schema": t["parameters"]} for t in TOOLS_DEFINITION]


def run_agent_openai_compat(system_prompt: str, initial_user_message: str, api_url: str, api_key: str, model_override: str = None) -> str:
    model = model_override or AI_MODEL
    messages = [{"role": "system", "content": system_prompt}, {"role": "user", "content": initial_user_message}]
    tools = tools_for_openai_compat()
    files_written: list[str] = []
    summary = ""
    turns_without_write = 0

    for turn in range(MAX_AGENT_TURNS):
        print(f"[qa-fix] 🔄 Turn {turn+1}/{MAX_AGENT_TURNS}")
        payload = {"model": model, "max_tokens": 8192, "messages": messages, "tools": tools, "tool_choice": "auto"}
        req = urllib.request.Request(
            api_url, data=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"},
            method="POST",
        )
        data = _urlopen_with_retry(req, "qa-fix")
        choice = data.get("choices", [{}])[0]
        message = choice.get("message", {})
        messages.append(message)
        tool_calls = message.get("tool_calls", [])
        if not tool_calls:
            if not files_written:
                print(f"[qa-fix] ⚠️ end_turn sans write_file — relance forcée")
                messages.append({"role": "user", "content": "Tu n'as pas encore appelé write_file. Tu DOIS corriger le bug avec write_file avant d'appeler finish(). Procède maintenant."})
                continue
            return summary or message.get("content", "")
        if not files_written:
            turns_without_write += 1
        for tc in tool_calls:
            fn = tc.get("function", {})
            tool_name = fn.get("name", "")
            try:
                tool_args = json.loads(fn.get("arguments", "{}"))
            except json.JSONDecodeError:
                tool_args = {}
            result = dispatch_tool(tool_name, tool_args)
            print(f"[qa-fix] Tool {tool_name} → {result[:120]}")
            if tool_name == "write_file" and result.startswith("OK"):
                files_written.append(tool_args.get("path", "?"))
                turns_without_write = 0
            messages.append({"role": "tool", "tool_call_id": tc.get("id", ""), "content": result})
            if result.startswith("DONE:"):
                return result[5:]
        if not files_written and turns_without_write >= 5:
            messages.append({"role": "user", "content": f"Tu lis des fichiers depuis {turns_without_write} tours mais tu n'as toujours pas appelé write_file. ARRÊTE de lire et APPLIQUE la correction maintenant avec write_file. C'est OBLIGATOIRE."})
            turns_without_write = 0

    print(f"[qa-fix] ⚠️ Limite de {MAX_AGENT_TURNS} turns atteinte.")
    return summary


def run_agent_claude(system_prompt: str, initial_user_message: str) -> str:
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        sys.exit("[qa-fix] ANTHROPIC_API_KEY manquant.")

    messages = [{"role": "user", "content": initial_user_message}]
    tools = tools_for_claude()
    files_written: list[str] = []
    summary = ""
    turns_without_write = 0

    for turn in range(MAX_AGENT_TURNS):
        print(f"[qa-fix] 🔄 Turn {turn+1}/{MAX_AGENT_TURNS}")
        payload = {"model": AI_MODEL, "max_tokens": 8192, "system": system_prompt, "messages": messages, "tools": tools}
        req = urllib.request.Request(
            "https://api.anthropic.com/v1/messages",
            data=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json", "x-api-key": api_key, "anthropic-version": "2023-06-01"},
            method="POST",
        )
        data = _urlopen_with_retry(req, "qa-fix")
        stop_reason = data.get("stop_reason", "")
        content_blocks = data.get("content", [])
        messages.append({"role": "assistant", "content": content_blocks})

        if stop_reason == "end_turn":
            text = "".join(b.get("text", "") for b in content_blocks if b.get("type") == "text")
            if not files_written:
                print(f"[qa-fix] ⚠️ end_turn sans write_file — relance forcée")
                messages.append({"role": "user", "content": "Tu n'as pas encore appelé write_file. Tu DOIS corriger le bug avec write_file avant d'appeler finish(). Procède maintenant."})
                continue
            return summary or text

        if stop_reason != "tool_use":
            return summary

        if not files_written:
            turns_without_write += 1
            if turns_without_write >= 5:
                print(f"[qa-fix] ⚠️ {turns_without_write} tours sans write_file — injection message forcé")
                turns_without_write = 0

        tool_results = []
        for block in content_blocks:
            if block.get("type") != "tool_use":
                continue
            tool_name = block.get("name", "")
            result = dispatch_tool(tool_name, block.get("input", {}))
            print(f"[qa-fix] Tool {tool_name} → {result[:120]}")
            if tool_name == "write_file" and result.startswith("OK"):
                files_written.append(block.get("input", {}).get("path", "?"))
                turns_without_write = 0
            tool_results.append({"type": "tool_result", "tool_use_id": block.get("id", ""), "content": result})
            if result.startswith("DONE:"):
                return result[5:]

        user_content: list = tool_results
        if not files_written and turns_without_write >= 5:
            user_content = tool_results + [{"type": "text", "text": f"Tu lis des fichiers depuis {turns_without_write} tours mais tu n'as toujours pas appelé write_file. ARRÊTE de lire et APPLIQUE la correction maintenant avec write_file. C'est OBLIGATOIRE."}]
        messages.append({"role": "user", "content": user_content})

    return summary


def run_agent(system_prompt: str, initial_user_message: str) -> str:
    if AI_MODEL.startswith("claude-"):
        anthropic_key = os.environ.get("ANTHROPIC_API_KEY", "")
        if not anthropic_key:
            # Fallback automatique sur DeepSeek si disponible
            deepseek_key = os.environ.get("DEEPSEEK_API_KEY", "")
            if deepseek_key:
                print(f"[qa-fix] ⚠️ ANTHROPIC_API_KEY absent — fallback sur deepseek-chat")
                return run_agent_openai_compat(system_prompt, initial_user_message,
                                               "https://api.deepseek.com/v1/chat/completions", deepseek_key,
                                               model_override="deepseek-chat")
            openai_key = os.environ.get("OPENAI_API_KEY", "")
            if openai_key:
                print(f"[qa-fix] ⚠️ ANTHROPIC_API_KEY absent — fallback sur gpt-4.1")
                return run_agent_openai_compat(system_prompt, initial_user_message,
                                               "https://api.openai.com/v1/chat/completions", openai_key,
                                               model_override="gpt-4.1")
            sys.exit("[qa-fix] Aucune clé API disponible (ANTHROPIC, DEEPSEEK, OPENAI).")
        return run_agent_claude(system_prompt, initial_user_message)
    elif "deepseek" in AI_MODEL:
        api_key = os.environ.get("DEEPSEEK_API_KEY", "")
        if not api_key:
            sys.exit("[qa-fix] DEEPSEEK_API_KEY manquant.")
        return run_agent_openai_compat(system_prompt, initial_user_message,
                                       "https://api.deepseek.com/v1/chat/completions", api_key)
    else:
        api_key = os.environ.get("OPENAI_API_KEY", "")
        if not api_key:
            sys.exit("[qa-fix] OPENAI_API_KEY manquant.")
        return run_agent_openai_compat(system_prompt, initial_user_message,
                                       "https://api.openai.com/v1/chat/completions", api_key)


# ─── Prompt système ───────────────────────────────────────────────────────────

CATEGORY_LABELS = {
    "missing_feature": "🔴 Fonctionnalité manquante",
    "visual_bug": "🟡 Bug visuel",
    "functional_bug": "🟠 Erreur fonctionnelle",
    "other": "⚪ Autre",
}

SYSTEM_PROMPT = """Tu es un agent senior de correction de code pour le projet Mon Petit Roadtrip (app de planification de road trips).

Ta mission : corriger un bug signalé par un testeur humain sur la preview de la PR, en te basant sur sa description.

== WORKFLOW OBLIGATOIRE ==

1. Analyse le bug signalé et identifie quels fichiers sont concernés
2. Liste les fichiers du répertoire pertinent si nécessaire (list_files)
3. Lis TOUJOURS un fichier avant de le modifier (read_file)
4. Lis aussi les fichiers dépendants (composants parents, api, hooks)
5. Applique les corrections avec write_file
6. Appelle finish() UNIQUEMENT quand le bug est corrigé

== CAS TYPIQUES DE BUGS ==

### Fonctionnalité manquante (composant non intégré)
- Chercher si le composant existe dans les répertoires (list_files + read_file)
- Vérifier qu'il est importé dans la page parente
- Si absent → l'intégrer au bon endroit avec les props correctes
- IMPORTANT : ne jamais appeler finish() si tu as identifié qu'un composant est absent sans l'avoir intégré

### Erreur fonctionnelle (API, hook, store)
- Lire le fichier API et les hooks associés
- Vérifier la cohérence des appels backend et frontend

### Bug visuel (CSS, layout)
- Lire le composant et identifier la correction Tailwind

== CONVENTIONS MON PETIT ROADTRIP ==

### Backend (Node.js / CommonJS)
- require() / module.exports — PAS d'import/export ES6 dans le backend
- Express 4 + Prisma ORM
- Auth via middleware auth.js : req.user.userId
- Erreurs : res.status(400).json({ error: '...' }) — pas d'AppError
- Routes dans backend/src/routes/

### Prisma / SQL
- Modèles Prisma : camelCase (roadtrip, step, accommodation, activity, photo, user)
- Colonnes camelCase : userId, startDate, endDate, createdAt
- Colonnes avec majuscules entre guillemets dans SQL : "userId", "startDate"

### Frontend web (React 18 + Vite + Tailwind)
- React 18, JSX (.jsx), Tailwind — PAS TypeScript
- Appels API via axios (frontend/web/src/api/)
- useState + useEffect pour les appels API (pas de TanStack Query)
- Icônes : lucide-react

### Frontend mobile (Expo React Native)
- React Native, JSX (.js), fichiers dans frontend/src/
- Lecture données : useQuery PowerSync
- Écriture données : localWrite.js

### RÈGLE CRITIQUE — Dates
- NE JAMAIS utiliser date.toISOString() — cela décale la date selon le timezone
- Toujours sérialiser : getFullYear() + getMonth() + getDate() → "YYYY-MM-DD"
- Toujours désérialiser : new Date(year, month-1, day, 12, 0, 0) depuis "YYYY-MM-DD"

== RÈGLES ANTI-RÉGRESSION ==

1. Ne jamais modifier package.json, package-lock.json, vite.config.js, ecosystem.config.cjs
2. Corrections chirurgicales uniquement — pas de réécriture complète
3. Vérifier les imports manquants après chaque modification

== RÈGLE ABSOLUE — CONTENU COMPLET UNIQUEMENT ==

Quand tu appelles write_file, le paramètre 'content' DOIT contenir l'intégralité du fichier.

INTERDIT (le système refusera automatiquement) :
- Écrire uniquement '...' ou '…' comme contenu
- Utiliser '...' comme raccourci pour 'code inchangé'
- Utiliser des placeholders : '<unchanged>', '<existing code>', '<rest of file>', '<same as before>'
- Tronquer le fichier sous prétexte qu'une partie "n'a pas changé"

OBLIGATOIRE :
- Lire TOUJOURS le fichier avec read_file avant de l'écrire
- Recopier mot pour mot toutes les parties non modifiées
- Si le fichier fait 2000 lignes et tu ne changes que 5 lignes, écrire les 2000 lignes complètes
- Un fichier de 2000 lignes ne peut pas être réduit à 10 lignes sous aucun prétexte
"""


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    print(f"[qa-fix] PR #{PR_NUMBER} | bug_category={BUG_CATEGORY} | modèle={AI_MODEL}")
    print(f"[qa-fix] Bug : {BUG_DESCRIPTION[:100]}")

    pr_files = get_pr_files()
    pr_filenames = [f.get("filename", "") for f in pr_files if f.get("status") != "removed"]
    print(f"[qa-fix] {len(pr_filenames)} fichier(s) dans la PR")

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
        lines.append("\n> Le fichier restauré contient la feature mais PAS le fix tenté par le commit corrompu.")
        lines.append("> Applique le fix décrit dans 'Description du bug' ci-dessus sur ce fichier restauré.")
        lines.append("> Utilise `get_file_at_commit` si tu as besoin d'inspecter un commit précis de l'historique.\n")
        restoration_note = "\n".join(lines)

    pr_branch = get_pr_branch()
    issue_number = extract_issue_number_from_branch(pr_branch)
    print(f"[qa-fix] Branche : {pr_branch} | Issue liée : {issue_number or 'inconnue'}")

    criteria = load_acceptance_criteria(issue_number) if issue_number else []
    ac_section = format_acceptance_criteria(criteria, BUG_CATEGORY)

    category_label = CATEGORY_LABELS.get(BUG_CATEGORY, "⚪ Autre")

    initial_message = f"""## Bug signalé sur la preview — PR #{PR_NUMBER}

**Catégorie :** {category_label}

**Description du bug :**
{BUG_DESCRIPTION}

{ac_section}{restoration_note}
## Fichiers modifiés dans la PR
{chr(10).join(f"- {f}" for f in pr_filenames)}

## Instructions
1. Identifie les fichiers concernés et lis-les avec read_file
2. Liste les répertoires si tu as besoin de trouver des fichiers connexes
3. Applique la correction avec write_file (après avoir lu le fichier)
4. Appelle finish() quand le bug est corrigé, avec un résumé de ce qui a été fait
"""

    print(f"[qa-fix] Lancement de l'agent IA...")
    summary = run_agent(SYSTEM_PROMPT, initial_message)

    (ROOT / ".ai").mkdir(exist_ok=True)
    (ROOT / ".ai" / f"qa_fix_summary_pr{PR_NUMBER}.md").write_text(
        summary or "Correction appliquée automatiquement.",
        encoding="utf-8"
    )

    post_pr_comment(
        f"## 🔧 Correction QA appliquée\n\n"
        f"**Bug :** {BUG_DESCRIPTION[:200]}\n\n"
        f"**Résumé :** {summary[:500] if summary else 'Corrections appliquées.'}",
    )

    print(f"\n[qa-fix] Terminé.")


if __name__ == "__main__":
    main()
