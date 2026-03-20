# Deploying on Databricks Apps

## `{"detail": "Not Found"}` in the browser

This usually means the **built frontend is missing** on the app host.

`app/frontend/dist/` is **gitignored**. If you deploy from Git without a build step, `main.py` will not mount the React app and `GET /` returns FastAPI’s 404/503 response as JSON.

### Fix

1. Build the frontend (from repo root or `app/frontend`):

   ```bash
   cd app/frontend && bun install && bun run build
   ```

2. Deploy the **`app/frontend/dist/`** directory **together** with the Python app (same layout as locally: `app/main.py` next to `app/frontend/dist/`).

3. In CI/CD for Databricks Apps, add a step that runs the build above **before** packaging or syncing files.

### App served under a URL path (subpath)

If the app is not at the origin root (e.g. `https://…/o/…/apps/<id>/`), set the Vite base at build time so API calls and assets resolve correctly:

```bash
export VITE_BASE_URL=/your/prefix/
cd app/frontend && bun run build
```

Use the path prefix your workspace uses for the app (must end with `/` or Vite will normalize it).
