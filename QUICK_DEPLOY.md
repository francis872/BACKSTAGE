# 🚀 Quick Deploy to Railway - 3 Steps Only

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

Railway will:
1. ✅ Deploy Express.js backend
2. ✅ Create PostgreSQL database
3. ✅ Set up environment variables
4. ✅ Run init-railway.js automatically
5. ✅ Give you a public URL

---

## After Deploy

Your backend will be at:
```
https://backstage-intelligence-prod.railway.app
```

Update frontend:
```bash
echo "VITE_API_URL=https://backstage-intelligence-prod.railway.app" > frontend/.env.production
git add -A
git push
```

Vercel will auto-redeploy ✅

---

## Need Help?

Railway Docs: https://docs.railway.app
Support: https://station.railway.com
