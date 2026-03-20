"""Allow ``python -m collect_metrics ...``."""

import sys

from collect_metrics.collect_metrics import main

if __name__ == "__main__":
    main(sys.argv[1:])
