# Eagle Web Commerce - Render Deployment Guide

## Step 1: Push to GitHub

```bash
# Create a new repo on GitHub, then:
cd flexwork
git init
git add .
git commit -m "Eagle Web Commerce - Complete"

# Add your repo
git remote add origin https://github.com/YOUR_USERNAME/eagleweb-commerce.git
git push -u origin main
```

## Step 2: Deploy Backend on Render

1. Go to [render.com](https://render.com) → Sign in
2. Click "New" → "Web Service"
3. Connect your GitHub repo
4. Configure:

| Setting | Value |
|---------|-------|
| Name | eagleweb-api |
| Branch | main |
| Root Directory | backend |
| Build Command | `npm install` |
| Start Command | `npm start` |

5. Add Environment Variables:
   - `JWT_SECRET` = your-secret-key
   - `PESAPAL_KEY` = your-pesapal-key
   - `PESAPAL_SECRET` = your-pesapal-secret
   - `COINBASE_KEY` = your-coinbase-key

6. Click "Create Web Service"

Your API will be at: `https://eagleweb-api.onrender.com`

## Step 3: Deploy Frontend on Render (Static)

1. On Render → "New" → "Static Site"
2. Connect your GitHub repo
3. Configure:

| Setting | Value |
|---------|-------|
| Name | eagleweb |
| Branch | main |
| Root Directory | fronted |
| Build Command | (empty) |
| Publish Directory | . |

4. Click "Create Static Site"

Your site will be at: `https://eagleweb.onrender.com`

## Step 4: Update API URL in Frontend

In `fronted/script.js`, change the API base URL:

```javascript
// Around line 10, add:
const API_BASE = 'https://eagleweb-api.onrender.com';
```

Update API calls to use:
```javascript
// Instead of simulating, use real API:
const response = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
});
```

## Quick Alternative: Deploy Both as One

For a simpler deployment, merge into one server:

```bash
# In backend/server.js, add at the end:
app.use(express.static('../fronted'));

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../fronted/index.html'));
});
```

Then just deploy the backend as a **Web Service** (not Static) - it serves the frontend too!

## Render Free Tier Limits

| Resource | Free |
|----------|------|
| Storage | 512MB |
| Bandwidth | 1GB/month |
| Sleep | Sleeps after 15min idle |

For production, upgrade to Paid tier ($7+/month).