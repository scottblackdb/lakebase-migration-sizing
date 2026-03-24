"""CLI entry: dispatches to registered :class:`MetricsCollector` implementations."""

from __future__ import annotations

import argparse
import sys
import textwrap
from pathlib import Path

# Support `python collect_metrics.py` from inside `collect_metrics/` (not only
# `python -m collect_metrics` from repo root).
_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from collect_metrics.databases.aws_rds_postgres import AwsRdsPostgresCollector
from collect_metrics.databases.azure_postgres import AzurePostgresCollector
from collect_metrics.databases.azure_sql import AzureSqlCollector
from collect_metrics.base import MetricsCollector

# Register new collectors here (order defines ``collect_metrics`` help order).
COLLECTORS: list[type[MetricsCollector]] = [
    AwsRdsPostgresCollector,
    AzurePostgresCollector,
    AzureSqlCollector,
]

_MAIN_DESCRIPTION = """\
Export ~90 days of database metrics as JSON for the Lakebase migration sizing app.
Uses your cloud provider APIs only (RDS / CloudWatch or Azure Resource Manager /
Monitor). No PostgreSQL connection and no database password.

Prefer: run from the repository root as: python -m collect_metrics. You can
also run: python collect_metrics.py from the collect_metrics/ directory (the repository root
is added to sys.path automatically).
"""

_MAIN_EPILOG = """\
how to get help:
  %(prog)s --help                    Show this overview and list providers.
  %(prog)s <PROVIDER> --help         Show all options for that provider
                                     (e.g. aws-rds-postgres, azure-postgres).

examples (from repo root):
  %(prog)s aws-rds-postgres \\
      --db-instance-id my-postgres \\
      --region us-east-1 \\
      --output-dir ./output

  %(prog)s azure-postgres \\
      --subscription-id <azure-subscription-id> \\
      --resource-group <resource-group> \\
      --server-name <server-name> \\
      --output-dir ./output

  %(prog)s azure-sql \\
      --subscription-id <azure-subscription-id> \\
      --resource-group <resource-group> \\
      --server-name <logical-sql-server> \\
      --database-name <database-name> \\
      --output-dir ./output

from collect_metrics/ directory:
  python collect_metrics.py --help
  python collect_metrics.py aws-rds-postgres --help

legacy wrappers (same CLI as above):
  python AWSPostgres/export_metrics.py --help
  python AzurePostgres/export_metrics.py --help
  python AzureSql/export_metrics.py --help

More detail: collect_metrics/README.md
"""


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="collect_metrics",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        description=textwrap.dedent(_MAIN_DESCRIPTION).strip(),
        epilog=textwrap.dedent(_MAIN_EPILOG),
    )
    sub = parser.add_subparsers(
        dest="provider",
        required=True,
        metavar="PROVIDER",
        help="Cloud/database target (see descriptions below).",
    )

    for cls in COLLECTORS:
        subparser = sub.add_parser(
            cls.provider_id,
            help=cls.description,
            description=cls.description,
        )
        cls.register_arguments(subparser)
        subparser.set_defaults(_collector=cls)

    return parser


def main(argv: list[str] | None = None) -> None:
    if argv is None:
        argv = sys.argv[1:]
    if len(argv) == 0:
        argv = ["--help"]

    parser = build_parser()
    args = parser.parse_args(argv)
    collector: type[MetricsCollector] = args._collector
    collector.run(args)


if __name__ == "__main__":
    main(sys.argv[1:])
