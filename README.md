# ChartWatch
*Built to demo an MVP of a underexplored functionality. Stack chosen to demonstrate full-stack capability with a real clinical workflow problem.*

**Medical Coding Accuracy Intelligence Platform**

> **Demo data notice:** All patient names, MRNs, clinical details, and chart content used by this MVP are **synthetic/fabricated demo data**. No real patient records or PHI are included in this repository.

This app is exploring medical coding accuracies with larger charts (500 - 1000+ pages). Most medical coding vendors are paid by the hour, tracking productivty, with guidance to be moving faster through charts. A key behavioral signal: coders spend progressively less time per pagein larger charts. ChartWatch captures this signal in real time and surfaces it to administrators before it impacts revenue cycle or compliance.

Accuracy and speed can vary by chart for a number of normal reasons, first being that the majority of the chart is obviously void of MEAT, allowing skilled coders to move through pages quickly. This app is meant to flag where potential coding accuracy issues may stem and where additional QA might be best placed. 

---

## Features

### Coder Workspace
- Split-panel view: **PDF chart on the left**, **ICD-10 coding form on the right**
- Passive page-timing tracker (green dot = actively recording)
- Fields per code: ICD-10 code, description, page number, provider, date of service, comment
- Per-session code list with delete support

### Admin Analytics
- **Page Heatmap** — color-coded view of avg dwell time per page (blue=thorough → red=fast/risky)
- **Speed Trend Line** — rolling 10-page bucket trend showing if coders are accelerating
- **Per-Coder Comparison** — bar chart comparing avg seconds/page across all coders
- **Flagged Sessions** — pages where avg time fell below 50% of chart mean

### Auth
- JWT-based login
- Role-based access: `coder` and `admin`
- Demo accounts seeded on first run

---

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React 18, Vite, custom CSS (no UI framework) |
| Backend | Python 3.11, Flask, SQLAlchemy |
| Auth | Flask-JWT-Extended, bcrypt |
| Database | SQLite (dev) — would swap for Postgres in prod |
| PDF serving | Flask static file serving |

---

## Quick Start

### 1. Server

```bash
cd server
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
export JWT_SECRET_KEY="$(python -c 'import secrets; print(secrets.token_urlsafe(32))')"
python app.py
```

The Flask server starts at `http://localhost:5000`.  
On first run it creates a local SQLite database and seeds synthetic demo users and page-timing data.

> **Security note:** `JWT_SECRET_KEY` is intentionally required at startup and is never stored in source control. For production, use a managed secret store and a production database/file-storage configuration.

### 2. Client

```bash
cd client
npm install
npm run dev
```

The React app starts at `http://localhost:3000`.

---

## Demo Accounts

| Role | Username | Password |
|---|---|---|
| Admin | `admin` | `Admin123!` |
| Coder | `jsmith` | `Coder123!` |
| Coder | `alopez` | `Coder123!` |
| Coder | `mchen` | `Coder123!` |
| Coder | `tpatel` | `Coder123!` |
| Coder | `sbrown` | `Coder123!` |
| Coder | `dwilliams` | `Coder123!` |
| Coder | `rnguyen` | `Coder123!` |

The demo includes synthetic 81-page and 310-page charts with seeded timing data that demonstrates the fatigue pattern across coders.

---

## Security Notes

This is a local MVP/demo, not a production HIPAA/SOC 2 system. The repository intentionally contains no real patient data, committed database, audit log, or uploaded PDFs.

- `JWT_SECRET_KEY` is required via the environment and must be at least 32 characters.
- Flask debug mode is disabled in the application entrypoint.
- Uploaded charts, the SQLite database, and audit log are ignored by Git.
- Coder write endpoints verify that the caller is assigned to the target chart.
- The SPA currently stores the JWT in `localStorage`. This is a common SPA tradeoff, but it means an XSS vulnerability could expose the token. A production implementation could use a Secure, HttpOnly, SameSite cookie-based session/token strategy with appropriate CSRF protections.

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/login` | Login → JWT token |
| POST | `/api/auth/register` | Register new user |
| GET | `/api/charts` | List all charts |
| POST | `/api/charts/upload` | Upload PDF (admin) |
| GET | `/api/charts/:id/file` | Serve PDF file |
| POST | `/api/events/page` | Record page dwell time |
| POST | `/api/codes` | Add ICD-10 code |
| GET | `/api/codes/:chart_id` | Get codes for chart |
| DELETE | `/api/codes/entry/:id` | Delete code entry |
| GET | `/api/analytics/chart/:id` | Full analytics payload |

---

## Project Structure

```
chartwatch/
├── server/
│   ├── app.py              # Flask app, models, routes
│   ├── requirements.txt
│   └── uploads/            # PDF storage (gitignored)
└── client/
    ├── src/
    │   ├── context/
    │   │   └── AuthContext.jsx
    │   ├── components/
    │   │   ├── CoderWorkspace.jsx
    │   │   ├── ChartsPage.jsx
    │   │   └── AdminDashboard.jsx
    │   ├── pages/
    │   │   └── LoginPage.jsx
    │   ├── App.jsx
    │   ├── App.css
    │   └── main.jsx
    ├── index.html
    ├── package.json
    └── vite.config.js
```

---

## Roadmap (Post-MVP)

- [ ] Real-time alerting when a coder's pace drops sharply mid-session
- [ ] ML model to predict accuracy score from behavioral signals
- [ ] EHR integration (Epic, Cerner) for automatic chart ingestion
- [ ] Export analytics to PDF/CSV for compliance reporting
- [ ] Keystroke/scroll heatmap (more granular than page-level)

---


