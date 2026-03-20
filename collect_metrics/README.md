# collect_metrics

Single entry point to export **~90 days** of metrics as JSON for [lakebase-migration-sizing](../) uploads.

## Security & connectivity

- **No database password is required.** This tool does **not** open a TCP connection to PostgreSQL and does not run SQL against your database.
- Metrics and sizing hints come only from your cloud provider’s **management and monitoring APIs** (instance metadata + time-series metrics).
- You still need **cloud credentials** with permission to call those APIs (see per-provider sections below).

## Run

Install deps, then either run as a module from the **repository root**, or run **`collect_metrics.py` from `collect_metrics/`** (the script adds the repo root to `sys.path`).

```bash
pip install -r collect_metrics/requirements.txt   # or install subsets per cloud

# From repository root:
python -m collect_metrics --help
python -m collect_metrics aws-rds-postgres --help

# From collect_metrics/ (equivalent):
cd collect_metrics
python collect_metrics.py --help
python collect_metrics.py aws-rds-postgres --help
```

### Examples

```bash
python -m collect_metrics aws-rds-postgres \
  --db-instance-id my-db \
  --region us-east-1 \
  --output-dir ./output

python -m collect_metrics azure-postgres \
  --subscription-id <sub> \
  --resource-group <rg> \
  --server-name <server> \
  --output-dir ./output
```

Legacy wrapper scripts still work: `AWSPostgres/export_metrics.py` and `AzurePostgres/export_metrics.py` delegate to this package.

## API calls (what each collector uses)

Below are the **service APIs** invoked (via AWS SDK / Azure SDK). Names match the underlying REST operations.

### `aws-rds-postgres` — Amazon RDS / Aurora

| Service | Client (boto3) | API operations | Purpose |
|--------|----------------|----------------|---------|
| **Amazon RDS** | `rds` | `DescribeDBInstances` | Resolve a **DB instance** by identifier; read instance class, allocated storage, engine, AZ (→ region). |
| **Amazon RDS** | `rds` | `DescribeDBClusters` | If the id is not an instance, treat it as an **Aurora cluster**; read cluster storage, members, optional Serverless v2 scaling. |
| **Amazon RDS** | `rds` | `DescribeDBInstances` (on cluster **writer** member) | For Aurora, load writer’s **DBInstanceClass** for vCPU/memory and the **CloudWatch dimension** instance id. |
| **Amazon CloudWatch** | `cloudwatch` | `GetMetricStatistics` | Time series for each metric (namespace `AWS/RDS`, dimension `DBInstanceIdentifier` = writer instance when cluster). Requests are **chunked** (~30 days per call) over the ~90 day window. |

**Authentication:** Default AWS credential chain (`aws configure`, env vars, IAM role, SSO profile via `--profile`, etc.).  
**IAM (typical):** `rds:DescribeDBInstances`, `rds:DescribeDBClusters`, `cloudwatch:GetMetricStatistics` on the relevant resources.

**CloudWatch metrics queried** (logical names in output JSON): e.g. `CPUUtilization`, `FreeableMemory`, `FreeStorageSpace`, `ReadIOPS` / `WriteIOPS`, `DatabaseConnections`, `BufferCacheHitRatio`, `DiskQueueDepth` — see `databases/aws_rds_postgres.py` (`METRICS`) for the full map and any proxy notes.

---

### `azure-postgres` — Azure Database for PostgreSQL

| Service | Client (Azure SDK) | API operations | Purpose |
|--------|--------------------|----------------|---------|
| **Azure DB for PostgreSQL** | `PostgreSQLManagementClient` | `servers.get` | Read server **SKU** (name/tier), **storage** size, **location** (region). |
| **Azure Monitor** | `MonitorManagementClient` | `metrics.list` | Time series per metric for the server’s ARM resource ID (see `databases/azure_postgres.py` → `build_resource_id`). Over ~90 days, interval from `--granularity` (e.g. `PT1H`). |

**Authentication:** `DefaultAzureCredential` (`az login`, managed identity, environment-based service principal, etc.).  
**RBAC (typical):** read on the server resource + **Monitoring Reader** (or equivalent) for metrics.

**Metrics queried** (Azure Monitor metric names): e.g. `cpu_percent`, `memory_percent`, `storage_percent`, `storage_used`, `iops`, `read_iops`, `write_iops`, `xact_commit`, `blks_hit`, `blks_read` — see `databases/azure_postgres.py` (`METRICS`).

---

## Add a new database / cloud

1. Create `collect_metrics/databases/<your_module>.py`.
2. Subclass `MetricsCollector` from `collect_metrics.base`.
3. Set `provider_id` (CLI subcommand) and `description`.
4. Implement `register_arguments(parser)` and `run(args)`.
5. Register the class in `collect_metrics/collect_metrics.py` → `COLLECTORS` list.

Keep provider-specific SDK imports **inside** `run()` / `export_metrics()` so `python -m collect_metrics --help` works without every cloud library installed.

Document new providers here under **API calls** (management + monitoring only unless you intentionally connect to the DB).

## Layout

| Path | Role |
|------|------|
| `base.py` | `MetricsCollector` ABC |
| `collect_metrics.py` | Argparse + `COLLECTORS` registry |
| `databases/` | One Python module per database / cloud type |
| `databases/aws_rds_postgres.py` | RDS / Aurora + CloudWatch |
| `databases/azure_postgres.py` | Azure Database for PostgreSQL + Monitor |
