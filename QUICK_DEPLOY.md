# Railway Deployment Quick Reference

> Current deployment is controlled by `.github/workflows/deploy-railway.yml`. Pull requests validate only; a push to `main` deploys through the protected GitHub `production` environment.

## Step 1: Go to Railway Dashboard
Open: https://railway.app/dashboard

## Step 2: Create New Project
- Click "+ New Project" or "Deploy from GitHub"
- Select "Deploy from GitHub repo"

## Step 3: Connect Your Repository
- Select: `francis872/BACKSTAGE`
- Railway will auto-detect `backend/package.json`
- Automatically deploy!

## That's it! 🎉

Before deployment, configure a Railway PostgreSQL service and the backend variables `DATABASE_URL`, `JWT_SECRET` (random, at least 32 characters), `NODE_ENV=production`, and `CORS_ORIGIN`. Configure the GitHub `RAILWAY_TOKEN` secret and protect the `production` environment. The workflow applies migrations before deploying; it does not seed demo data.

---

## After Deploy

Use the public Railway URL configured for your service:
```
https://backstage-intelligence-prod.railway.app
```

For Vercel, configure `BACKEND_URL` for its API proxy and build the frontend:
```bash
cd frontend
npm ci
npm run build
```

Verify the backend at `https://<your-railway-domain>/health` after deployment.

---

## Need Help?

Railway Docs: https://docs.railway.app
Support: https://station.railway.com
