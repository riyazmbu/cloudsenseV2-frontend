# CloudSense AI Frontend

## Run
```powershell
npm install
npm run dev
```

Open `http://localhost:5173`.

Set `VITE_API_URL` when the FastAPI backend is not on `http://127.0.0.1:8000`.

## UI flow
- Overview
- AWS connection and data collection
- Cost & Usage analysis
- User-specific cost attribution
- Optimization recommendations
- Savings review
- CloudSense AI chat

The interface uses one production workflow. There is no demo/live mode switch and no simulated AWS dataset.
