"""
One module per database / cloud target (e.g. AWS RDS PostgreSQL).

Add a new backend: create a new module here with a :class:`collect_metrics.base.MetricsCollector`
subclass, then register it in ``collect_metrics.collect_metrics.COLLECTORS``.
"""
