#!/usr/bin/env python3
"""
Backward-compatible entry point for Azure SQL Database metrics export.

Prefer (from repo root):

    python -m collect_metrics azure-sql --help
"""

from __future__ import annotations

import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from collect_metrics.collect_metrics import main

if __name__ == "__main__":
    main(["azure-sql", *sys.argv[1:]])
