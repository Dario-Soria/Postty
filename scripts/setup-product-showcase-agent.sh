#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AGENT_DIR="${ROOT_DIR}/Agents/Product Showcase"
VENV_DIR="${AGENT_DIR}/.venv"

if [[ ! -d "${AGENT_DIR}" ]]; then
  echo "Agent directory not found: ${AGENT_DIR}" >&2
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required but was not found on PATH." >&2
  exit 1
fi

echo "Setting up Product Showcase agent venv..."
echo "Agent dir: ${AGENT_DIR}"

if [[ ! -d "${VENV_DIR}" ]]; then
  python3 -m venv "${VENV_DIR}"
fi

PYTHON="${VENV_DIR}/bin/python"
PIP="${VENV_DIR}/bin/pip"

if [[ ! -x "${PYTHON}" ]]; then
  echo "Virtualenv python not found at: ${PYTHON}" >&2
  exit 1
fi

export PIP_DISABLE_PIP_VERSION_CHECK=1

"${PIP}" install --upgrade pip setuptools wheel
"${PIP}" install -r "${AGENT_DIR}/requirements.txt"
if [[ -f "${AGENT_DIR}/requirements-server.txt" ]]; then
  "${PIP}" install -r "${AGENT_DIR}/requirements-server.txt"
fi

echo "Verifying agent imports..."
"${PYTHON}" -c "import google.genai; import PIL; import requests; print('OK')"

echo "Done. Agent venv ready at: ${VENV_DIR}"
