"""Hospital Security Operations Platform API.

The shared feature-extraction code lives in the top-level ``ml`` package; make it
importable when the backend is started from the ``backend`` directory.
"""

import sys
from pathlib import Path

_ROOT = str(Path(__file__).resolve().parents[2])
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)
