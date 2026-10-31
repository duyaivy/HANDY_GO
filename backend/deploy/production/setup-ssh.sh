#!/usr/bin/env bash
# GitHub runner only. Used by refresh and its independent recovery job.
set -euo pipefail
umask 077
install -d -m 700 "$HOME/.ssh"
for role in VPS1 VPS2 VPS3; do
  key_name="${role}_SSH_KEY"
  if [[ -z "${!key_name:-}" ]]; then
    echo "::error::Missing production secret $key_name"
    exit 1
  fi
  key_file="$HOME/.ssh/handygo_${role,,}"
  printf '%s\n' "${!key_name}" | tr -d '\r' > "$key_file"
  chmod 600 "$key_file"
  if ! ssh-keygen -y -P '' -f "$key_file" >/dev/null 2>&1; then
    echo "::error::Invalid or passphrase-protected SSH key: $key_name"
    exit 1
  fi
done
install -m 600 /dev/null "$HOME/.ssh/handygo_known_hosts"
