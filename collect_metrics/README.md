# collect_metrics

Single entry point to export **~90 days** of metrics as JSON for [lakebase-migration-sizing](../) uploads.

## Security & connectivity

- **No database password is required.** This tool does **not** open a connection to cloud managed databases and does not run SQL against your database. Currently AWS RDS Postgres, Azure Postgres and Azure SQL Server are supported.
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

python -m collect_metrics azure-sql \
  --subscription-id <sub> \
  --resource-group <rg> \
  --server-name <logical-sql-server> \
  --database-name <database> \
  --output-dir ./output
```

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

### `azure-sql` — Azure SQL Database

| Service | Client (Azure SDK) | API operations | Purpose |
|--------|--------------------|----------------|---------|
| **Azure SQL** | `SqlManagementClient` | `databases.get` | Read database **SKU** (name/tier/capacity), **max size**, **location**. |
| **Azure Monitor** | `MonitorManagementClient` | `metrics.list` | Time series for the **database** ARM resource ID (`Microsoft.Sql/servers/{server}/databases/{db}` — see `databases/azure_sql.py` → `build_resource_id`). |

**Authentication:** `DefaultAzureCredential` (same as PostgreSQL).  
**RBAC (typical):** read on the SQL server/database + **Monitoring Reader** for metrics.

**Metrics (same logical JSON keys as `azure-postgres`):**

| Logical key | Azure Monitor source | Notes |
|-------------|---------------------|--------|
| `cpu_percent` | `cpu_percent` (vCore / GP / BC / Hyperscale) or `dtu_consumption_percent` (Basic / Standard / Premium) | Tier is inferred from the database SKU. |
| `memory_percent` | `sql_instance_memory_percent` | Instance/app advanced metric; may be empty on some SKUs if not published. |
| `storage_percent` | `storage_percent` | Not published for Hyperscale per Microsoft docs — series may be empty. |
| `storage_used` | `storage` | Data space used (bytes). |
| `read_iops` | `physical_data_read_percent` | **Data IO %**, not raw IOPS (Azure does not expose DB-level read IOPS like PostgreSQL flexible server). |
| `write_iops` | `log_write_percent` | **Log IO %**. |
| `iops`, `xact_commit`, `blks_hit`, `blks_read` | — | **Not available** at this resource scope; exported with **empty** `data` arrays so the JSON shape matches other providers. |

Top-level `server_name` in the file is `"{server_name}.{database_name}"` so uploads stay unique per database.

---