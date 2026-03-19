#!/bin/bash
set -euo pipefail

# --- Validation ---
if [ -z "${GITHUB_TOKEN:-}" ]; then
    echo "FATAL: GITHUB_TOKEN is not set."
    echo "Generate one at: https://github.com/settings/tokens"
    echo "Required scope: repo (Full control of private repositories)"
    exit 1
fi

if [ -z "${GITHUB_REPOSITORY:-}" ]; then
    echo "FATAL: GITHUB_REPOSITORY is not set (format: owner/repo)."
    exit 1
fi

RUNNER_NAME="${RUNNER_NAME:-self-hosted-docker}"
RUNNER_LABELS="${RUNNER_LABELS:-self-hosted,linux,x64}"
RUNNER_WORKDIR="${RUNNER_WORKDIR:-_work}"

# --- Get registration token from GitHub API ---
echo "Requesting registration token for ${GITHUB_REPOSITORY}..."
REG_TOKEN=$(curl -s -X POST \
    -H "Authorization: token ${GITHUB_TOKEN}" \
    -H "Accept: application/vnd.github.v3+json" \
    "https://api.github.com/repos/${GITHUB_REPOSITORY}/actions/runners/registration-token" \
    | jq -r '.token')

if [ "$REG_TOKEN" = "null" ] || [ -z "$REG_TOKEN" ]; then
    echo "FATAL: Could not obtain registration token."
    echo "Check that GITHUB_TOKEN has 'repo' scope and GITHUB_REPOSITORY is correct."
    exit 1
fi

echo "Registration token obtained."

# --- Cleanup on shutdown (deregister runner) ---
cleanup() {
    echo "Caught signal, deregistering runner..."
    ./config.sh remove --token "$REG_TOKEN" 2>/dev/null || true
    echo "Runner deregistered."
}
trap cleanup SIGTERM SIGINT SIGQUIT

# --- Configure runner ---
echo "Configuring runner '${RUNNER_NAME}' for ${GITHUB_REPOSITORY}..."
./config.sh \
    --url "https://github.com/${GITHUB_REPOSITORY}" \
    --token "$REG_TOKEN" \
    --name "$RUNNER_NAME" \
    --labels "$RUNNER_LABELS" \
    --work "$RUNNER_WORKDIR" \
    --unattended \
    --replace \
    --disableupdate

echo "Runner configured. Starting..."

# --- Run (foreground, handles signals) ---
./run.sh &
wait $!
