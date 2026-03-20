"""
Abstract base for per-cloud metric exporters.

To add a new database / cloud type:

1. Create ``collect_metrics/databases/your_provider.py``.
2. Subclass :class:`MetricsCollector`.
3. Set ``provider_id`` and ``description`` class attributes.
4. Implement :meth:`register_arguments` and :meth:`run`.
5. Import your class in ``collect_metrics/collect_metrics.py`` and append it to ``COLLECTORS``.
"""

from __future__ import annotations

import argparse
from abc import ABC, abstractmethod
from typing import ClassVar


class MetricsCollector(ABC):
    """One export target (e.g. AWS RDS PostgreSQL)."""

    #: Subcommand name, e.g. ``aws-rds-postgres``
    provider_id: ClassVar[str]
    #: Short help for argparse subparser
    description: ClassVar[str]

    @classmethod
    @abstractmethod
    def register_arguments(cls, parser: argparse.ArgumentParser) -> None:
        """Add provider-specific arguments to the subparser."""

    @classmethod
    @abstractmethod
    def run(cls, args: argparse.Namespace) -> None:
        """Execute export using parsed namespace."""
