#!/usr/bin/env bash
# analyze_run.sh — Analyse d'un run GitHub Actions (Code Reviews / fix-reviews)
#
# Usage :
#   ./analyze_run.sh <RUN_NUMBER>         # run number (ex: 51)
#   ./analyze_run.sh <RUN_NUMBER> full    # affiche aussi les logs bruts complets

set -euo pipefail

RUN_NUMBER="${1:-}"
MODE="${2:-}"  # "" | "full"

if [[ -z "$RUN_NUMBER" ]]; then
  echo "Usage : $0 <RUN_NUMBER> [full]"
  exit 1
fi

REPO=$(git remote get-url origin 2>/dev/null | sed 's|https://github.com/||;s|git@github.com:||;s|\.git$||')
TOKEN="${TOKEN:-$(grep '^GITHUB_PAT=' backend/.env | cut -d= -f2)}"

# ─── Trouver le run par son run_number ────────────────────────────────────────
echo ">> Recherche du run #${RUN_NUMBER}..."

RUN_ID=$(curl -s \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/${REPO}/actions/runs?per_page=50" \
  | python3 -c "
import json, sys
runs = json.load(sys.stdin)['workflow_runs']
for r in runs:
    if r['run_number'] == ${RUN_NUMBER}:
        print(r['id'])
        break
")

if [[ -z "$RUN_ID" ]]; then
  echo "KO Run #${RUN_NUMBER} introuvable (cherche dans les 50 derniers runs)."
  exit 1
fi

# ─── Infos générales du run ───────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════"
echo "  Run #${RUN_NUMBER} — ID GitHub : ${RUN_ID}"
echo "════════════════════════════════════════════════════"

curl -s \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/${REPO}/actions/runs/${RUN_ID}" \
  | python3 -c "
import json, sys
r = json.load(sys.stdin)
print(f\"  Workflow  : {r['name']}\")
print(f\"  Status    : {r['status']} / {r.get('conclusion') or 'en cours'}\")
print(f\"  Créé le   : {r['created_at']}\")
print(f\"  Branche   : {r['head_branch']}\")
print(f\"  Commit    : {r['head_sha'][:12]}\")
"

# ─── Liste des jobs ───────────────────────────────────────────────────────────
echo ""
echo "── Jobs ─────────────────────────────────────────"

JOBS_JSON=$(curl -s \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/${REPO}/actions/runs/${RUN_ID}/jobs?per_page=20")

echo "$JOBS_JSON" | python3 -c "
import json, sys
jobs = json.load(sys.stdin)['jobs']
for j in jobs:
    icon = 'OK' if j['conclusion'] == 'success' else ('KO' if j['conclusion'] == 'failure' else ('--' if j['conclusion'] == 'skipped' else '..'))
    print('  ' + icon + ' [' + str(j['id']) + '] ' + j['name'][:60] + ' -> ' + (j.get('conclusion') or 'running'))
"

# ─── Logs par job ─────────────────────────────────────────────────────────────
JOB_IDS=$(echo "$JOBS_JSON" | python3 -c "
import json, sys
jobs = json.load(sys.stdin)['jobs']
for j in jobs:
    skip_names = ['check-branch', 'Nettoyer', 'Set up']
    skip = any(s in j['name'] for s in skip_names)
    if not skip:
        print(j['id'], j['name'][:60], j.get('conclusion') or 'running')
")

while IFS=' ' read -r JOB_ID JOB_NAME JOB_RESULT; do
  echo ""
  echo "── Logs : ${JOB_NAME} ──────────────────────────────"

  LOGS=$(curl -s \
    -H "Authorization: Bearer $TOKEN" \
    "https://api.github.com/repos/${REPO}/actions/jobs/${JOB_ID}/logs" \
    -L 2>/dev/null)

  if [[ "$MODE" == "full" ]]; then
    echo "$LOGS" | head -500
  else
    # Filtrage intelligent selon le type de job
    echo "$LOGS" | python3 -c "
import sys, re

lines = sys.stdin.read().splitlines()

# Supprimer timestamps et garder le contenu utile
clean = []
for l in lines:
    # Supprimer le prefix timestamp GitHub Actions
    l2 = re.sub(r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z ', '', l)
    clean.append(l2)

# Patterns intéressants
keep_patterns = [
    r'\[fix-reviews\]',
    r'\[review-frontend\]',
    r'\[review-backend\]',
    r'\[feature-dev',
    r'\[product-spec\]',
    r'AI_MODEL:',
    r'ai_model:',
    r'fix_model:',
    r'review_model:',
    r'Itération',
    r'erreur|error|Error',
    r'TSC|tsc',
    r'TS\d{4}',
    r'Taille du prompt',
    r'fichier.*corrigé',
    r'max_tokens|tronquée|partiel',
    r'Appel IA',
    r'stop_reason',
    r'Aucune erreur|Aucune correction',
    r'Terminé',
    r'Corrections',
    r'REVIEW FRONTEND|REVIEW BACKEND',
    r'bloquant',
    r'\[debug\]',
    r'deepseek|claude|gpt',
    r'##\[error\]',
    r'npm|tsc|build',
    r'error TS',
    r'Fichiers mentionnés',
    r'commentaire.*retenu',
    r'product.spec|spec.agent|branch_name|pr_body',
    r'issue.*#|cadrage|acceptance',
]

pat = re.compile('|'.join(keep_patterns), re.IGNORECASE)

shown = [l for l in clean if pat.search(l)]

# Dédupliquer les lignes consécutives identiques
dedup = []
prev = None
for l in shown:
    if l != prev:
        dedup.append(l)
    prev = l

print('\n'.join(dedup[:200]))
"
  fi
done <<< "$JOB_IDS"

echo ""
echo "════════════════════════════════════════════════════"
echo "  Fin de l'analyse du run #${RUN_NUMBER}"
echo "════════════════════════════════════════════════════"
