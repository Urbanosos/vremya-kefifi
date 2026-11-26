#!/bin/bash
# Saves of the game folder without git: full snapshots in .checkpoints/.
#   bash tools/checkpoint.sh save "short-label"   snapshot the current state
#   bash tools/checkpoint.sh list                 list snapshots, newest last
#   bash tools/checkpoint.sh diff [name]          what changed since a snapshot (default: the latest)
#   bash tools/checkpoint.sh restore <name>       roll back to a snapshot (current state is saved first)
# Unchanged files are hard-linked to the previous snapshot, so a save costs almost no disk space.
# Videos (*.MOV, *.mp4) are reference material and are not saved: they weigh hundreds of MB.
# Snapshots never share files with the working folder, so editing the game cannot damage a save.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIR="$ROOT/.checkpoints"
EXCLUDES=(--exclude=/.checkpoints --exclude=/tools/node_modules --exclude=/tools/out --exclude=.DS_Store --exclude=*.MOV --exclude=*.mov --exclude=*.mp4)
mkdir -p "$DIR"

latest() { ls -1 "$DIR" | grep -E '^[0-9]{4}-' | sort | tail -n 1 || true; }

resolve() {
  local name="${1:-}"
  [ -z "$name" ] && name="$(latest)"
  [ -z "$name" ] && { echo "Сохранений нет" >&2; exit 1; }
  [ -d "$DIR/$name" ] || { echo "Нет сохранения $name. Смотри: bash tools/checkpoint.sh list" >&2; exit 1; }
  echo "$name"
}

save() {
  local label
  label="$(printf '%s' "${1:-save}" | tr -c 'A-Za-z0-9._-' '-' | cut -c1-40)"
  # non-Latin labels turn into dashes in the folder name; the full label stays in log.md
  printf '%s' "$label" | grep -q '[A-Za-z0-9]' || label="save"
  local name prev
  name="$(date +%Y-%m-%d_%H-%M-%S)_$label"
  prev="$(latest)"
  local link=()
  [ -n "$prev" ] && link=(--link-dest="$DIR/$prev")
  rsync -a "${EXCLUDES[@]}" ${link[@]+"${link[@]}"} "$ROOT/" "$DIR/$name/"
  printf -- '- %s: %s\n' "$name" "${1:-save}" >> "$DIR/log.md"
  echo "Сохранено: $name"
}

case "${1:-}" in
  save) save "${2:-save}" ;;
  list) ls -1 "$DIR" | grep -E '^[0-9]{4}-' | sort || echo "Сохранений нет" ;;
  diff)
    name="$(resolve "${2:-}")"
    echo "Изменения с $name:"
    diff -rq "${DIR}/$name" "$ROOT" -x .checkpoints -x node_modules -x out -x .DS_Store -x '*.MOV' -x '*.mov' -x '*.mp4' | sed "s#$DIR/##; s#$ROOT#сейчас#" || true
    ;;
  restore)
    [ -z "${2:-}" ] && { echo "Укажи сохранение: bash tools/checkpoint.sh restore <name>" >&2; exit 1; }
    name="$(resolve "$2")"
    save "before-restore"
    rsync -a --delete "${EXCLUDES[@]}" "$DIR/$name/" "$ROOT/"
    echo "Откат к $name выполнен. Состояние до отката лежит в сохранении before-restore."
    ;;
  *) sed -n '2,7p' "$0"; exit 1 ;;
esac
