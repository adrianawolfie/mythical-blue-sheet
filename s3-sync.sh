#!/usr/bin/env bash
source .env

S3_BUCKET="${S3_BUCKET:-raperonzolo}"
S3_REGION="${S3_REGION:-ams3}"
S3_ENDPOINT="${S3_ENDPOINT:-${S3_REGION}.digitaloceanspaces.com}"
DATA_DIR="${DATA_DIR:-./data/}"

if [[ -z "${S3_KEY:-}" ]]; then
  echo "S3_KEY is required" >&2
  exit 1
fi

if [[ -z "${S3_SECRET:-}" ]]; then
  echo "S3_SECRET is required" >&2
  exit 1
fi

mode="${1:---dry-run}"
case "$mode" in
  --dry-run)
    dry_run=(--dry-run)
    source_path="s3://$S3_BUCKET/"
    destination_path="$DATA_DIR"
    ;;
  --download)
    dry_run=()
    source_path="s3://$S3_BUCKET/"
    destination_path="$DATA_DIR"
    ;;
  --upload)
    dry_run=()
    source_path="$DATA_DIR"
    destination_path="s3://$S3_BUCKET/"
    ;;
  *)
    echo "Usage: $0 [--dry-run|--download|--upload]" >&2
    exit 1
    ;;
esac

s3cmd \
  --access_key="$S3_KEY" \
  --secret_key="$S3_SECRET" \
  --host="$S3_ENDPOINT" \
  --host-bucket="%(bucket)s.$S3_ENDPOINT" \
  "${dry_run[@]}" \
  sync "$source_path" "$destination_path"
