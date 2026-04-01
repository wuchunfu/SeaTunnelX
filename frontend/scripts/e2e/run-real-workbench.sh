#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export E2E_REAL_PLAYWRIGHT_SPEC="${E2E_REAL_PLAYWRIGHT_SPEC:-e2e/workbench-real.spec.ts}"
exec bash "${SCRIPT_DIR}/run-real-installer.sh"
