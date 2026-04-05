#!/usr/bin/env bash
#
# lovable_download.sh - Download a Lovable project as a ZIP file.
#
# API: https://api.lovable.dev
#   List:  /projects/{id}/git/files?ref=main
#   File:  /projects/{id}/git/file?path=...&ref=main
#
# Dependencies: curl, jq, zip
#

set -euo pipefail

API_BASE="https://api.lovable.dev"
CONFIG_DIR="${HOME}/.config/lovable"
TOKEN_FILE="${CONFIG_DIR}/token"
DEFAULT_REF="main"

die() { echo "!! $*" >&2; exit 1; }

check_deps() {
    for cmd in curl jq zip; do
        command -v "$cmd" &>/dev/null || die "'$cmd' is required."
    done
}

extract_project_id() {
    local uuid
    uuid=$(echo "$1" | grep -oE '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}' | head -1)
    echo "${uuid:-$1}"
}

api_download() {
    curl -s -w '%{http_code}' -o "$2" --compressed \
        -H "Authorization: Bearer $TOKEN" \
        -H "Accept: */*" \
        -H "Origin: https://lovable.dev" \
        -H "Referer: https://lovable.dev/" \
        "$1"
}

# --- Token ---
save_token() {
    mkdir -p "$CONFIG_DIR"
    echo "$1" > "$TOKEN_FILE"
    chmod 600 "$TOKEN_FILE"
}

ensure_token() {
    if [[ -n "${TOKEN:-}" ]]; then return; fi
    if [[ -f "$TOKEN_FILE" ]]; then
        TOKEN=$(cat "$TOKEN_FILE")
        if [[ -n "$TOKEN" ]]; then
            echo ">> Token loaded ($TOKEN_FILE)"
            return
        fi
    fi
    echo ""
    echo "  To find your token:"
    echo "  1. Open your project on lovable.dev"
    echo "  2. F12 > Network > filter 'api.lovable'"
    echo "  3. Copy the Authorization: Bearer ... header value"
    echo ""
    read -rp "Token: " TOKEN
    [[ -z "$TOKEN" ]] && die "No token provided."
    save_token "$TOKEN"
    echo "   Saved to $TOKEN_FILE"
}

# ---------------------------------------------------------------------------
main() {
    check_deps

    local project_input="" ref="$DEFAULT_REF" output_dir="." workers=6
    TOKEN="${LOVABLE_TOKEN:-}"

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --token)   TOKEN="$2"; save_token "$TOKEN"; shift 2 ;;
            --ref)     ref="$2"; shift 2 ;;
            --output)  output_dir="$2"; shift 2 ;;
            --workers)
                if ! [[ "$2" =~ ^[1-9][0-9]*$ ]]; then
                    die "--workers expects a positive integer, got: $2"
                fi
                if (( $2 > 6 )); then
                    echo "Note: --workers capped at 6 to avoid API rate-limiting (requested: $2)." >&2
                    workers=6
                else
                    workers="$2"
                fi
                shift 2 ;;
            --forget)  rm -f "$TOKEN_FILE"; echo "Token removed."; exit 0 ;;
            -h|--help)
                echo "Usage: lovable_download.sh [url-or-id]"
                echo ""
                echo "  --token <t>   Set/update the token"
                echo "  --ref <r>     Branch or commit (default: main)"
                echo "  --output <d>  Output directory (default: .)"
                echo "  --workers <n> Parallel download workers, 1-6 (default: 6)"
                echo "  --forget      Delete stored token"
                exit 0 ;;
            -*) die "Unknown option: $1" ;;
            *)  project_input="$1"; shift ;;
        esac
    done

    ensure_token

    if [[ -z "$project_input" ]]; then
        echo ""
        read -rp "Project URL: " project_input
        [[ -z "$project_input" ]] && die "Nothing provided."
    fi

    local project_id
    project_id=$(extract_project_id "$project_input")
    echo ">> Project: $project_id"
    echo ">> Branch:  $ref"

    # --- File list ---
    echo ">> Fetching file list..."
    local tmp_list work_dir status_file
    tmp_list=$(mktemp)
    work_dir=$(mktemp -d)
    status_file=$(mktemp)
    trap 'rm -rf "${tmp_list:-}" "${work_dir:-}" "${status_file:-}"' EXIT

    local list_url="${API_BASE}/projects/${project_id}/git/files?ref=${ref}"
    local code
    code=$(api_download "$list_url" "$tmp_list") || true

    case "$code" in
        200) ;;
        401) die "Token expired. Get a new one then: ./lovable_download.sh --token <new>" ;;
        *)   die "HTTP $code on $list_url" ;;
    esac

    local file_paths
    file_paths=$(jq -r '.files[].path' "$tmp_list" 2>/dev/null) || true
    [[ -z "$file_paths" ]] && die "No files found."

    local file_count total_size size_kb
    file_count=$(echo "$file_paths" | wc -l | tr -d ' ')
    total_size=$(jq '[.files[].size] | add' "$tmp_list" 2>/dev/null) || total_size=0
    size_kb=$(( total_size / 1024 ))

    echo "   $file_count file(s) (~${size_kb} KB)"
    echo ""

    # --- Download (parallel) ---
    echo ">> Downloading (${workers} worker(s))..."
    mkdir -p "$output_dir"

    export TOKEN API_BASE project_id ref work_dir status_file
    (printf '%s\n' "$file_paths" | xargs -d '\n' -I{} -P "$workers" bash -c '
        fpath="$1"
        [[ -z "$fpath" ]] && exit 0
        mkdir -p "${work_dir}/$(dirname "$fpath")"
        encoded=$(printf "%s" "$fpath" | jq -sRr @uri)
        url="${API_BASE}/projects/${project_id}/git/file?path=${encoded}&ref=${ref}"
        code=$(curl -s -w "%{http_code}" -o "${work_dir}/${fpath}" --compressed \
            -H "Authorization: Bearer $TOKEN" \
            -H "Accept: */*" \
            -H "Origin: https://lovable.dev" \
            -H "Referer: https://lovable.dev/" \
            "$url") || code="000"
        printf "%s\t%s\n" "$code" "$fpath" >> "$status_file"
    ' _ {}) &
    local xargs_pid=$!

    while kill -0 "$xargs_pid" 2>/dev/null; do
        local progress
        progress=$(wc -l < "$status_file" 2>/dev/null | tr -d ' ')
        printf '\r   [%s/%s]' "${progress:-0}" "$file_count"
        sleep 0.2
    done
    wait "$xargs_pid" 2>/dev/null || true
    printf '\r   [%s/%s]\n' "$file_count" "$file_count"

    local downloaded errors
    downloaded=$(awk -F'\t' '$1=="200"' "$status_file" | wc -l | tr -d ' ')
    errors=$(awk -F'\t' '$1!="200"' "$status_file" | wc -l | tr -d ' ')

    if awk -F'\t' '$1=="401"{found=1} END{exit !found}' "$status_file"; then
        die "Token expired mid-download."
    fi

    if (( errors > 0 )); then
        awk -F'\t' '$1!="200" {printf "   WARN: %s -> %s\n", $2, $1}' "$status_file"
    fi

    echo "   $downloaded/$file_count OK ($errors errors)"
    [[ $downloaded -eq 0 ]] && die "No files downloaded."

    # --- ZIP ---
    local zip_name zip_path
    zip_name="lovable-${project_id:0:8}-$(date +%Y%m%d-%H%M%S).zip"
    zip_path="$(cd "$output_dir" && pwd)/${zip_name}"

    (cd "$work_dir" && zip -r -q "$zip_path" .)

    echo ""
    echo ">> $zip_path ($downloaded files)"
}

main "$@"