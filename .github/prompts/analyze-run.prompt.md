---
mode: agent
description: Analyse complète d'un run GitHub Actions en un seul appel — logs, erreurs, diagnostic et recommandations
---

# Analyser un run GitHub Actions

Analyse le run GitHub Actions indiqué par l'utilisateur pour le repo `mxh77/PlanYourTrip`.

## Étapes à exécuter (tout en une fois)

1. **Identifier le run** : si l'utilisateur donne un numéro de run (ex: "run #3"), utilise le TOKEN depuis `backend/.env` (`GITHUB_PAT`) pour trouver le run ID correspondant via l'API GitHub.

2. **Récupérer les informations du run** via un seul appel terminal :

```bash
cd "C:/PlanYourTrip"
TOKEN=$(grep GITHUB_PAT backend/.env | cut -d= -f2)
REPO="mxh77/PlanYourTrip"

# Récupère runs + jobs + logs en une passe
python3 - <<'EOF'
import urllib.request, urllib.error, json, sys, re, os

TOKEN = open("backend/.env").read()
TOKEN = next(l.split("=",1)[1].strip() for l in TOKEN.splitlines() if l.startswith("GITHUB_PAT"))
REPO = "mxh77/PlanYourTrip"
BASE = f"https://api.github.com/repos/{REPO}"
HEADERS = {"Authorization": f"Bearer {TOKEN}", "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}

def gh(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())

def gh_text(url):
    import subprocess
    # Utiliser curl -L pour suivre les redirects (l'API logs GitHub redirige vers un pre-signed URL)
    result = subprocess.run(
        ["curl", "-s", "-L", "-H", f"Authorization: Bearer {TOKEN}",
         "-H", "Accept: application/vnd.github+json", url],
        capture_output=True, text=True
    )
    return result.stdout

# ─── Trouver le run ───────────────────────────────────────────────────────────
run_target = sys.argv[1] if len(sys.argv) > 1 else None
runs = gh(f"{BASE}/actions/runs?per_page=30")["workflow_runs"]

run = None
if run_target and run_target.isdigit():
    rn = int(run_target)
    # D'abord chercher par run_number
    for r in runs:
        if r["run_number"] == rn:
            run = r
            break
    # Sinon par ID
    if not run:
        for r in runs:
            if r["id"] == rn:
                run = r
                break

if not run:
    # Prendre le plus récent en échec
    for r in runs:
        if r["conclusion"] == "failure":
            run = r
            break

if not run:
    run = runs[0]

print(f"\n{'='*60}")
print(f"  Run #{run['run_number']} — {run['name']}")
print(f"  ID       : {run['id']}")
print(f"  Status   : {run['status']} / {run.get('conclusion') or 'en cours'}")
print(f"  Branche  : {run['head_branch']}")
print(f"  Commit   : {run['head_sha'][:12]}")
print(f"  Créé le  : {run['created_at']}")
print(f"{'='*60}\n")

# ─── Jobs ────────────────────────────────────────────────────────────────────
jobs = gh(f"{BASE}/actions/runs/{run['id']}/jobs?per_page=20")["jobs"]

print("── JOBS ──────────────────────────────────────────────────")
for j in jobs:
    icon = "✅" if j["conclusion"] == "success" else ("❌" if j["conclusion"] == "failure" else ("⏭️" if j["conclusion"] == "skipped" else "🔄"))
    print(f"  {icon}  {j['name'][:55]:<55}  {j.get('conclusion') or 'running'}")

# ─── Logs des jobs en erreur ──────────────────────────────────────────────────
SKIP_NAMES = ["check-branch", "Set up job", "Complete job"]
SKIP_STEPS = ["Set up", "Post ", "Complete", "Nettoyer"]

failed = [j for j in jobs if j["conclusion"] == "failure"]
if not failed:
    failed = [j for j in jobs if j["name"] not in SKIP_NAMES]

keep_pat = re.compile(
    r"error|erreur|Error|Traceback|failed|FAILED|exit code|TS\d{4}|npm ERR|"
    r"bloquant|Itération|Appel IA|stop_reason|tronqu|partiel|"
    r"\[review-|##\[error\]|REVIEW |Correction|Aucune|Terminé|"
    r"AI_MODEL|ai_model|deepseek|claude|gpt|tsc|TSC|"
    r"Fichiers mentionnés|commentaire|retenu|fix_reviews",
    re.IGNORECASE
)
ts_pat = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z\s")

for j in failed:
    print(f"\n── LOGS : {j['name']} ──────────────────────────────────")
    logs = gh_text(f"{BASE}/actions/jobs/{j['id']}/logs")
    lines = [ts_pat.sub("", l) for l in logs.splitlines()]
    filtered = [l for l in lines if keep_pat.search(l)]
    # Déduplication
    dedup, prev = [], None
    for l in filtered:
        if l != prev:
            dedup.append(l)
        prev = l
    if dedup:
        print("\n".join(dedup[:150]))
    else:
        # Fallback : 80 dernières lignes
        print("[Aucune ligne filtrée — dernières lignes brutes:]")
        print("\n".join(lines[-80:]))

EOF
```

3. **Analyser et diagnostiquer** : sur la base des logs récupérés, **explique en français** :
   - Quelle étape exacte a échoué et pourquoi
   - S'il s'agit d'une erreur de code (TypeScript, lint, test), cite les fichiers et numéros de ligne
   - S'il s'agit d'une erreur d'API (GitHub, OpenAI, etc.), explique la cause
   - S'il s'agit d'un timeout ou limitation de tokens, explique l'impact
   - **Recommande la correction concrète** à apporter (fichier à modifier, config à changer, ou action à relancer)

4. **Résumé final** en 3 points :
   - ❌ Ce qui a échoué
   - 🔍 La cause probable
   - ✅ Action recommandée
