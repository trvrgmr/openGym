# openGym

A self-hosted gym, workout, and nutrition tracker that keeps your data under your control. Modern interface, passkey login, offline-first operation, and cross-device sync between your phone, tablet, and browser.

No forced subscriptions, no ads, no third-party cloud lock-in. One `docker compose up -d` and your personal fitness stack is running.

---

## Features

### 🥗 Nutrition & Diet Adherence
- **Local-First Calorie & Macro Tracker**: Track calories, protein, carbs, and fat across breakfast, lunch, dinner, and snacks.
- **Diet Consistency Score (0–100)**: Evidence-based adherence scoring based on daily caloric precision (±10% to 50% scale), protein target fulfillment, and logging habit over a 7-day rolling window with tier badges (*Optimal*, *Good*, *Fair*, *Building habit*).
- **Food Database & Barcode Scanner**: Built-in food search and Open Food Facts barcode scanning with instant Grams vs. Servings scaling, favorites, and custom food creation.
- **7-Day & 30-Day Nutrition History**: Visual intake charts with goal lines and average macros, accessible directly from the top summary widget.
- **Homepage Nutrition Widget**: Interactive 7-day intake strip and consistency score right on your main dashboard, with 1-tap food logging pills.

### 🤖 AI Performance & Nutrition Coach
- **Cross-Domain Telemetry**: Correlates lifting performance (volume, reps, stalls, e1RM progression) against caloric intake and energy balance.
- **Evidence-Based Autoregulation**: Identifies whether stalled lifts correlate with caloric deficits or low-carb days, offering actionable pre/post-workout nutrition guidance.
- **Automated Context Pipeline**: Gathers rolling 7-day and 14-day training volume and nutrition logs into a compact telemetry payload for the LLM.
- **Hero Card & Quick Chips**: Single-tap coach launcher on the Homepage with dynamic status and quick-analysis prompt pills (*Weekly analysis*, *Macro status*, *Ask Coach*).
- **Bring Your Own Key (BYOK)**: Supports Gemini, OpenAI, Anthropic, or any local/compatible endpoint (e.g. Ollama).

### 🏋️ Planning & Workouts
- **5,600+ Exercise Library**: Muscle-targeted searchable catalogue with animated demonstrations and equipment filters.
- **Flexible Scheduling**: Traditional weekly routines or rolling rotations (A, B, C, A...), supersets, drop sets, warm-up ramps, and deloads.
- **Guided Workout Sessions**: Auto-filled weights from previous sessions, rest timer alerts, plate math calculator, and live session volume counter.
- **Custom Exercises**: Add your own exercises with custom media and instructions.

### 📈 Analytics & Progress
- **Progression Systems**: Linear, Greyskull LP, double and triple progression per routine or exercise.
- **Metrics & Estimation**: Estimated 1RM curves, Structural Balance ratios, body-part volume heatmap, and recovery tracking.
- **Body Measurements & Photos**: Weight tracking against goal lines, rate of change, and progress photo timeline with before/after comparison slider.

### 🔒 Accounts & Privacy
- **Passkey Authentication**: Secure Face ID, Touch ID, or fingerprint sign-in with optional password fallback.
- **Multi-Device Sync**: Conflict-free field-level sync across all your devices.
- **Data Ownership & Portability**: Export your complete database as JSON or workouts as CSV. Import from Hevy, Strong, FitNotes, and Apple Health.
- **Privacy First**: Zero telemetry. All database records stay on your host under `./data`.

---

## Quick Start (Docker)

You need [Docker](https://docs.docker.com/get-docker/) with Compose.

```bash
git clone https://github.com/trvrgmr/openGym
cd openGym
cp .env.example .env
docker compose up -d --build
```

Open **`http://localhost:8080`**, tap **Create profile**, and start tracking.

> [!NOTE]
> To access passkey authentication from your mobile device over the local network or domain, configure `RP_ID` and `ORIGIN` in `.env` as described in [docs/SELF_HOSTING.md](docs/SELF_HOSTING.md).

<details>
<summary><b>Configuration reference</b> (via <code>.env</code>)</summary>

| Variable | Description | Default |
|---|---|---|
| `RP_ID` | Hostname passkeys are bound to | `localhost` |
| `ORIGIN` | Full URL the app is served from | `http://localhost:8080` |
| `WEB_PORT` | Host port for the web interface | `8080` |
| `NGINX_PORT` | Internal port for web container | `80` |
| `PORT` | API listening port | `3000` |
| `FIRST_USER_ADMIN` | `1`: First registered account becomes admin | `0` |
| `ALLOW_GUEST` | Offer "Continue without account" | `1` |
| `API_TARGET` | `default` or `coach` for local AI runtime | `default` |

</details>

---

## Mobile & Updates

- **Android APK**: Download signed APKs directly from the [Latest Release](https://github.com/trvrgmr/openGym/releases/latest).
- **In-App Auto-Updater**: Native Android builds check and install updates automatically from GitHub Releases.
- **Web App**: PWA installable on iOS and Android browsers with full offline capabilities.
- **Update Checks**: Check for updates and download the latest release anytime via **Settings → About & updates**.

---

## Architecture

- **`frontend/`**: React 19, Vite, Zustand, and client-side storage with responsive dark/green design.
- **`api/`**: Lightweight Node HTTP service (`@simplewebauthn/server`, `web-push`, `undici`).
- **`web/`**: Production multi-stage Nginx container serving static frontend assets and reverse-proxying `/api`.
- **`data/`**: All database state, profiles, and media remain strictly stored in `./data`.

---

## Community & Feedback

- **[GitHub Issues](https://github.com/trvrgmr/openGym/issues)**: Bug reports and feature suggestions.
- **[Discussions](https://github.com/trvrgmr/openGym/discussions)**: General questions, advice, and ideas.
- **[Releases](https://github.com/trvrgmr/openGym/releases)**: Change notes and downloadable APK builds.

---

## License

openGym code is licensed under the [GNU AGPL v3.0](LICENSE).  
Exercise animations and stills are © Aliaksandr Makatserchyk ([Gym visual](https://gymvisual.com/)), licensed for use in openGym. See [NOTICE.md](NOTICE.md) for details.
