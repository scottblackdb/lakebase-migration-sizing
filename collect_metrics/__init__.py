"""
Unified metric collection for cloud PostgreSQL targets.

Run: ``python -m collect_metrics <subcommand> --help``

Add a new backend: add a module under ``collect_metrics/databases/`` with a
subclass of :class:`collect_metrics.base.MetricsCollector`, implement
``register_arguments`` and ``run``, then append the class to ``COLLECTORS`` in
``collect_metrics.collect_metrics``.
"""

from collect_metrics.base import MetricsCollector

__all__ = ["MetricsCollector"]
