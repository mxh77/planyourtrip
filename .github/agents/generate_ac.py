#!/usr/bin/env python3
"""
generate_ac.py — Mon Petit Roadtrip
Lit le spec.md d'une issue et génère acceptance_criteria.json dans le même répertoire.
Déclenché automatiquement après le product-spec-agent.

Usage : python3 .github/agents/generate_ac.py <issue_number>
"""
import json
import os
import pathlib
import re
import sys
from datetime import datetime, timezone

ISSUE_NUMBER = int(sys.argv[1]) if len(sys.argv) > 1 else int(os.environ.get("ISSUE_NUMBER", "0") or "0")

if not ISSUE_NUMBER:
    sys.exit("[generate_ac] ISSUE_NUMBER manquant (argument ou env).")


def _find_root() -> pathlib.Path:
    import subprocess
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
print(f"[generate_ac] ROOT : {ROOT}")

# Trouver le répertoire de l'issue (slug contient le numéro au début)
issues_dir = ROOT / ".ai" / "issues"
issue_dir: pathlib.Path | None = None
if issues_dir.exists():
    for d in issues_dir.iterdir():
        if d.is_dir() and d.name.startswith(f"{ISSUE_NUMBER}-"):
            issue_dir = d
            break

if issue_dir is None:
    sys.exit(f"[generate_ac] Répertoire .ai/issues/{ISSUE_NUMBER}-* introuvable.")

spec_path = issue_dir / "spec.md"
if not spec_path.exists():
    sys.exit(f"[generate_ac] spec.md introuvable dans {issue_dir}.")

print(f"[generate_ac] Lecture de {spec_path}")
spec = spec_path.read_text(encoding="utf-8")

print("[generate_ac] Sections trouvées :")
for _line in spec.splitlines():
    if _line.startswith("#"):
        print(f"  {_line}")


# ─── Parsing ─────────────────────────────────────────────────────────────────

def _extract_section(text: str, heading: str) -> str:
    """Extrait le contenu d'une section markdown jusqu'à la prochaine section de même niveau."""
    level = len(heading.split()[0])  # nombre de # dans le heading
    escaped_title = re.escape(heading.lstrip("#").strip())
    pattern = rf"(?:^|\n)#{{{level}}}\s+{escaped_title}\s*\n(.*?)(?=\n#{{{level}}}\s|\Z)"
    m = re.search(pattern, text, re.DOTALL | re.IGNORECASE)
    result = m.group(1).strip() if m else ""
    print(f"[generate_ac] Section '{heading}' → {len(result)} chars")
    return result


def _infer_bug_category(text: str) -> str:
    t = text.lower()
    if any(w in t for w in ["manquant", "absent", "pas implémenté", "pas de ", "introuvable", "accessible"]):
        return "missing_feature"
    if any(w in t for w in ["visuel", "ui", "affichage", "responsive", "mobile", "css", "couleur", "layout"]):
        return "visual_bug"
    return "functional_bug"


def _infer_priority(text: str, category: str) -> str:
    t = text.lower()
    if any(w in t for w in ["critique", "bloquant", "essentiel", "obligatoire"]):
        return "critique"
    if category in ("fonctionnel", "validation"):
        return "haute"
    if any(w in t for w in ["régression", "perte de données", "sécurité"]):
        return "haute"
    return "normale"


criteria: list[dict] = []
counter = 0

# ── Section "Checklist de validation" ─────────────────────────────────────────
checklist_raw = _extract_section(spec, "# Checklist de validation")
if not checklist_raw:
    checklist_raw = _extract_section(spec, "# Checklist")
for line in checklist_raw.splitlines():
    m = re.match(r"\s*-\s*\[[ xX]\]\s*(.*)", line)
    if not m:
        continue
    text = m.group(1).strip()
    if not text:
        continue
    counter += 1
    bug_cat = _infer_bug_category(text)
    criteria.append({
        "id": f"AC-{counter:02d}",
        "category": "validation",
        "priority": _infer_priority(text, "validation"),
        "criterion": text,
        "expected": text,
        "bug_category": bug_cat,
    })

# ── Section "Tests à prévoir" ─────────────────────────────────────────────────
tests_raw = _extract_section(spec, "# Tests à prévoir")
if not tests_raw:
    tests_raw = _extract_section(spec, "# Tests")

current_category = "fonctionnel"
CATEGORY_MAP = {
    "fonctionnel": "fonctionnel",
    "non-régression": "non-régression",
    "régression": "non-régression",
    "interface": "visuel",
    "données": "données",
    "intégration": "fonctionnel",
    "unitaire": "unitaire",
}

for line in tests_raw.splitlines():
    sub_m = re.match(r"\s*\d+\.\s+\*\*([^*]+)\*\*", line)
    if sub_m:
        label = sub_m.group(1).lower()
        for key, val in CATEGORY_MAP.items():
            if key in label:
                current_category = val
                break
        continue

    item_m = re.match(r"\s*[-–•]\s+(.*)", line)
    if not item_m:
        continue
    text = item_m.group(1).strip()
    if not text or len(text) < 10:
        continue

    if "→" in text:
        parts = text.split("→", 1)
        criterion_text = parts[0].strip()
        expected_text = parts[1].strip()
    elif ":" in text and len(text.split(":", 1)[1].strip()) > 10:
        parts = text.split(":", 1)
        criterion_text = parts[0].strip()
        expected_text = parts[1].strip()
    else:
        criterion_text = text
        expected_text = text

    counter += 1
    bug_cat = _infer_bug_category(text)
    criteria.append({
        "id": f"AC-{counter:02d}",
        "category": current_category,
        "priority": _infer_priority(text, current_category),
        "criterion": criterion_text,
        "expected": expected_text,
        "bug_category": bug_cat,
    })

if not criteria:
    print("[generate_ac] ❌ Aucun critère extrait — spec.md ne contient pas les sections attendues.")
    sys.exit(1)

# ─── Écriture ─────────────────────────────────────────────────────────────────
output = {
    "issue_number": ISSUE_NUMBER,
    "generated_at": datetime.now(timezone.utc).isoformat(),
    "criteria": criteria,
}

out_path = issue_dir / "acceptance_criteria.json"
out_path.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"[generate_ac] ✅ {len(criteria)} critères écrits dans {out_path}")
