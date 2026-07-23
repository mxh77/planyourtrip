#!/bin/bash

# ──────────────────────────────────────────────────────────────────────────────
# sync-check.sh — Vérifie la synchronisation entre local, GitHub et serveur CT
#
# Usage :
#   ./sync-check.sh              → local + GitHub + serveur CT117
#   ./sync-check.sh local        → local + GitHub uniquement
#   ./sync-check.sh ct117        → serveur CT117 + GitHub uniquement
#   ./sync-check.sh local --fix  → idem + suggestions de correction
#
# Codes couleur :
#   ✅ = synchronisé        ⚠  = avertissement
#   ❌ = écart critique      🔵 = action corrective disponible
# ──────────────────────────────────────────────────────────────────────────────

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
RESET='\033[0m'
BOLD='\033[1m'

MODE="${1:-full}"
FIX_MODE="${2:-}"

REPO_DIR="/c/PlanYourTrip"
REMOTE_DIR="/opt/planyourtrip"
SERVER="ct117"
BRANCH="main"
ORIGIN="origin"
GH_REPO="mxh77/planyourtrip"

OK=0
WARN=0
ERR=0

ok()   { echo -e " ${GREEN}✅${RESET} $1"; }
warn() { echo -e " ${YELLOW}⚠${RESET}  $1"; WARN=$((WARN+1)); }
err()  { echo -e " ${RED}❌${RESET} $1"; ERR=$((ERR+1)); }
fix()  { echo -e " ${BLUE}🔵${RESET} $1"; }
info() { echo -e " ${CYAN}→${RESET}  $1"; }
hr()   { echo -e " ${CYAN}─────────────────────────────────────────────────${RESET}"; }

echo -e "\n${BOLD}🔍 SYNC CHECK — PlanYourTrip${RESET}"
echo -e " ${CYAN}├─ GitHub :${RESET} $GH_REPO ($BRANCH)"

CHECK_LOCAL=false
CHECK_SERVER=false
case "$MODE" in
  local)
    CHECK_LOCAL=true
    echo -e " ${CYAN}├─ Local  :${RESET} $(hostname)"
    echo -e " ${CYAN}└─ Mode   :${RESET} local + GitHub"
    ;;
  ct117)
    CHECK_SERVER=true
    echo -e " ${CYAN}├─ Remote :${RESET} $SERVER:$REMOTE_DIR"
    echo -e " ${CYAN}└─ Mode   :${RESET} serveur + GitHub"
    ;;
  full)
    CHECK_LOCAL=true
    CHECK_SERVER=true
    echo -e " ${CYAN}├─ Local  :${RESET} $(hostname)"
    echo -e " ${CYAN}├─ Remote :${RESET} $SERVER:$REMOTE_DIR"
    echo -e " ${CYAN}└─ Mode   :${RESET} local + serveur + GitHub"
    ;;
  *)
    echo -e " ${RED}❌ Mode invalide : $MODE${RESET}"
    echo -e "   Usage: ./sync-check.sh [local|ct117] [--fix]"
    exit 1
    ;;
esac
echo
echo

STEP=0
TOTAL=0
[ "$CHECK_LOCAL" = true ] && TOTAL=$((TOTAL+1))
[ "$CHECK_SERVER" = true ] && TOTAL=$((TOTAL+1))

# ═══════════════════════════════════════════════════════════════════════════════
# CHECK 1 — LOCAL → GITHUB
# ═══════════════════════════════════════════════════════════════════════════════

if [ "$CHECK_LOCAL" = true ]; then
  STEP=$((STEP+1))
  cd "$REPO_DIR"

  echo -e "${BOLD}[$STEP/$TOTAL] Local vs GitHub${RESET}"
  hr

  if ! git rev-parse --git-dir &>/dev/null; then
    err "Ce dossier n'est pas un dépôt git"
    exit 1
  fi

  LOCAL_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
  info "Branche locale : $LOCAL_BRANCH"

  git fetch "$ORIGIN" "$BRANCH" 2>/dev/null || {
    err "Impossible de contacter GitHub"
  }

  LOCAL_COMMIT=$(git rev-parse HEAD 2>/dev/null)
  REMOTE_COMMIT=$(git rev-parse "$ORIGIN/$BRANCH" 2>/dev/null)
  LOCAL_COMMIT_SHORT=$(git rev-parse --short HEAD 2>/dev/null)
  REMOTE_COMMIT_SHORT=$(git rev-parse --short "$ORIGIN/$BRANCH" 2>/dev/null)
  LOCAL_DATE=$(git log -1 --format="%ci" 2>/dev/null | cut -d' ' -f1,2)
  REMOTE_DATE=$(git log -1 --format="%ci" "$ORIGIN/$BRANCH" 2>/dev/null | cut -d' ' -f1,2)

  info "Local  : $LOCAL_COMMIT_SHORT ($LOCAL_DATE)"
  info "GitHub : $REMOTE_COMMIT_SHORT ($REMOTE_DATE)"

  BEHIND=$(git rev-list --count "$ORIGIN/$BRANCH..HEAD" 2>/dev/null)
  AHEAD=$(git rev-list --count "HEAD..$ORIGIN/$BRANCH" 2>/dev/null)

  if [ "$LOCAL_COMMIT" = "$REMOTE_COMMIT" ]; then
    ok "Local et GitHub synchronisés (même commit)"
  elif [ "$AHEAD" -gt 0 ] && [ "$BEHIND" -eq 0 ]; then
    warn "Local a $AHEAD commit(s) d'avance sur GitHub (non pushés)"
    [ "$FIX_MODE" = "--fix" ] && fix "→ git push origin $LOCAL_BRANCH"
  elif [ "$BEHIND" -gt 0 ] && [ "$AHEAD" -eq 0 ]; then
    warn "Local a $BEHIND commit(s) de retard sur GitHub (pull nécessaire)"
    [ "$FIX_MODE" = "--fix" ] && fix "→ git pull origin $LOCAL_BRANCH"
  else
    err "Local et GitHub ont divergé ($BEHIND behind, $AHEAD ahead)"
    [ "$FIX_MODE" = "--fix" ] && fix "→ git pull --rebase origin $LOCAL_BRANCH puis git push"
  fi

  UNCOMMITTED=$(git status --porcelain 2>/dev/null | wc -l)
  if [ "$UNCOMMITTED" -gt 0 ]; then
    warn "$UNCOMMITTED fichier(s) modifié(s) non commités"
    git status --short 2>/dev/null | head -20
    [ "$FIX_MODE" = "--fix" ] && fix "→ git add -A && git commit -m \"...\" && git push"
  else
    ok "Aucun fichier modifié non commité"
  fi
  echo
fi

# ═══════════════════════════════════════════════════════════════════════════════
# CHECK 2 — SERVEUR CT → GITHUB
# ═══════════════════════════════════════════════════════════════════════════════

if [ "$CHECK_SERVER" = true ]; then
  STEP=$((STEP+1))
  echo -e "${BOLD}[$STEP/$TOTAL] Serveur $SERVER vs GitHub${RESET}"
  hr

  if ! ssh -o ConnectTimeout=5 "$SERVER" "echo ok" &>/dev/null; then
    err "Serveur $SERVER inaccessible"
  else
    ok "Serveur $SERVER joignable"

    if ! ssh "$SERVER" "test -d $REMOTE_DIR/.git" &>/dev/null; then
      err "Le dossier $REMOTE_DIR sur le serveur n'est pas un dépôt git"
    else
      REMOTE_COMMIT=$(git rev-parse "$ORIGIN/$BRANCH" 2>/dev/null)
      REMOTE_COMMIT_SHORT=$(git rev-parse --short "$ORIGIN/$BRANCH" 2>/dev/null)
      REMOTE_DATE=$(git log -1 --format="%ci" "$ORIGIN/$BRANCH" 2>/dev/null | cut -d' ' -f1,2)

      SERVER_COMMIT=$(ssh "$SERVER" "cd $REMOTE_DIR && git rev-parse HEAD 2>/dev/null")
      SERVER_COMMIT_SHORT=$(ssh "$SERVER" "cd $REMOTE_DIR && git rev-parse --short HEAD 2>/dev/null")
      SERVER_BRANCH=$(ssh "$SERVER" "cd $REMOTE_DIR && git rev-parse --abbrev-ref HEAD 2>/dev/null")
      SERVER_DATE=$(ssh "$SERVER" "cd $REMOTE_DIR && git log -1 --format='%ci' 2>/dev/null | cut -d' ' -f1,2")

      info "Serveur : $SERVER_COMMIT_SHORT ($SERVER_DATE) sur $SERVER_BRANCH"
      info "GitHub  : $REMOTE_COMMIT_SHORT ($REMOTE_DATE)"

      if [ "$SERVER_COMMIT" = "$REMOTE_COMMIT" ]; then
        ok "Serveur et GitHub synchronisés"
      else
        SERVER_AHEAD=$(ssh "$SERVER" "cd $REMOTE_DIR && git rev-list --count HEAD..origin/$BRANCH 2>/dev/null" 2>/dev/null || echo "0")
        if [ "$SERVER_AHEAD" -gt 0 ] 2>/dev/null; then
          warn "Serveur a $SERVER_AHEAD commit(s) de retard sur GitHub (./deploy.sh nécessaire)"
          [ "$FIX_MODE" = "--fix" ] && fix "→ ssh $SERVER \"cd $REMOTE_DIR && git pull origin $BRANCH && pm2 restart planyourtrip-api\""
        fi
      fi

      SERVER_DIRTY=$(ssh "$SERVER" "cd $REMOTE_DIR && git status --porcelain 2>/dev/null | wc -l")
      [ "$SERVER_DIRTY" -gt 0 ] && warn "Le serveur a $SERVER_DIRTY fichier(s) modifié(s) localement" || ok "Aucune modification locale sur le serveur"

      PM2_STATUS=$(ssh "$SERVER" "pm2 show planyourtrip-api 2>/dev/null | grep -c 'online' || true")
      [ "$PM2_STATUS" -gt 0 ] && ok "PM2 (backend) en ligne" || err "PM2 (backend) hors ligne"

      HEALTH=$(ssh "$SERVER" "curl -s -o /dev/null -w '%{http_code}' http://localhost:3111/health 2>/dev/null || echo '000'")
      [ "$HEALTH" = "200" ] && ok "Health check backend OK" || err "Health check backend échoué (HTTP $HEALTH)"
    fi
  fi
  echo
fi

# ═══════════════════════════════════════════════════════════════════════════════
# RÉSUMÉ
# ═══════════════════════════════════════════════════════════════════════════════

echo -e "${BOLD}[Résumé]${RESET}"
hr

if [ "$ERR" -eq 0 ] && [ "$WARN" -eq 0 ]; then
  echo -e " ${GREEN}✅✅✅ Tout est synchronisé${RESET}"
elif [ "$ERR" -eq 0 ]; then
  echo -e " ${YELLOW}⚠  Synchronisation partielle ($WARN avertissement(s))${RESET}"
else
  echo -e " ${RED}❌ $ERR erreur(s), $WARN avertissement(s)${RESET}"
fi

echo -e " ${CYAN}├─ GitHub :${RESET} $REMOTE_COMMIT_SHORT"
if [ "$CHECK_LOCAL" = true ]; then
  echo -e " ${CYAN}├─ Local  :${RESET} $LOCAL_COMMIT_SHORT"
fi
if [ "$CHECK_SERVER" = true ]; then
  echo -e " ${CYAN}└─ $SERVER :${RESET} $SERVER_COMMIT_SHORT"
fi
echo
