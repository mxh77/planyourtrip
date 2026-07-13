#!/bin/bash
# Pre-edit backup: saves timestamped copy of files before modification
BACKUP_DIR="$(dirname "$0")/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"
for f in "$@"; do
  if [ -f "$f" ]; then
    cp "$f" "$BACKUP_DIR/"
    echo "✅ Backed up: $f → $BACKUP_DIR/"
  fi
done
echo "📁 Backup done: $BACKUP_DIR"
