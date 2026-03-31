# Demo Shield

Real-time PII redaction Chrome extension for live product demos.

## Installation

### Quick setup (recommended for non-technical users)

**Windows** — double-click `setup.bat`, then follow the on-screen instructions.

**macOS** — macOS will block double-clicking scripts downloaded from the internet.
Use the Terminal one-liner below instead (one copy-paste, no technical knowledge needed):

1. Download this repository as a ZIP — click **Code → Download ZIP** on GitHub, then unzip it
2. Open **Terminal**: press `Cmd + Space`, type `Terminal`, press `Enter`
3. Paste this command and press `Enter` — replace the path if you unzipped somewhere other than Downloads:

```bash
bash ~/Downloads/pii-browser-anon-plugin-main/setup.sh
```

> **Tip:** Not sure of the path? Drag the unzipped folder into the Terminal window after typing `bash ` — it will fill in the correct path automatically.

4. Follow the on-screen instructions — the script downloads the NLP library and opens Chrome to the right page

---

### Manual setup

### Prerequisites

- Google Chrome (version 88+) or any Chromium-based browser (Edge, Brave, Arc)
- Git (to clone the repo)

### Step 1 — Clone the repository

```bash
git clone https://github.com/elysian-is/pii-browser-anon-plugin.git
cd pii-browser-anon-plugin
```

### Step 2 — (Optional) Add NLP name detection

The extension uses [compromise.js](https://github.com/spencermountain/compromise) for
detecting person names. It is not bundled in the repo due to file size.

1. Go to the [compromise releases page](https://github.com/spencermountain/compromise/releases)
2. Download `compromise.min.js` from the latest release
3. Place it at `lib/compromise.min.js` inside the cloned folder

> Without this file the extension still works fully — regex patterns, CSS selectors,
> and custom word lists remain active. Only NLP-based name detection is disabled.

### Step 3 — Load in Chrome

1. Open **`chrome://extensions/`** in Chrome
2. Enable **Developer mode** using the toggle in the top-right corner
3. Click **Load unpacked**
4. Select the `pii-browser-anon-plugin` folder you cloned in Step 1
5. The **Demo Shield** icon will appear in the Chrome toolbar

> To pin it for easy access: click the puzzle-piece (Extensions) icon in the toolbar
> and pin Demo Shield.

### Step 4 — Verify it works

1. Navigate to any page with visible text (e.g. a claims record in Conductor)
2. Click the Demo Shield icon → flip the toggle to **ON**
3. PII fields should be redacted immediately

### Updating the extension

```bash
git pull origin main
```

Then go to `chrome://extensions/` and click the **refresh** icon on the Demo Shield card.

## Usage

- Click the extension icon to open the popup
- Flip the toggle to **ON** before screen sharing
- Use **Alt+Shift+D** to toggle redaction without opening the popup
- Use **Alt+Shift+M** to cycle through redaction modes

## Redaction Modes

| Mode | Appearance | Description |
|------|-----------|-------------|
| **Blackout** | ████████ | Solid black overlay (default) |
| **Replace** | *Alex Johnson* | Realistic fake placeholder values |
| **Blur** | ·········· | CSS blur filter |

## Detection Categories

| Category | Examples Detected |
|----------|------------------|
| Names (NLP) | Person names, organizations, places |
| SSN / Tax ID | `123-45-6789`, `12-3456789` |
| Phone Numbers | `(555) 123-4567`, `555.123.4567` |
| Email Addresses | `jane@example.com` |
| Dollar Amounts | `$12,500.00` |
| Dates | `03/15/1985`, `1985-03-15` |
| Addresses | Street addresses, ZIP codes |
| Claim / Policy # | `CLM-20240823001`, `WC0012345678` |
| Medical Codes | ICD-10 codes like `M54.5` |
| Custom Word List | Your own terms and names |

## Configuration

### Custom Words
Add domain-specific terms (client names, adjuster names, hospital names) in the
**Custom Words** section of the popup. One term per line.

### Conductor Selectors
The extension ships with Conductor-specific CSS selector rules pre-configured.
Edit them under **Conductor Selectors (Advanced)** in the popup.

### Profiles
Save the current configuration as a named profile and switch between profiles
during demos. Use **Export** / **Import** to share profiles with teammates.

## File Structure

```
demo-shield/
├── manifest.json
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── background/
│   └── service-worker.js
├── content/
│   ├── content.js          # Main orchestrator
│   ├── detector.js         # PII detection engine
│   ├── redactor.js         # DOM redaction logic
│   └── observer.js         # MutationObserver wrapper
├── lib/
│   └── compromise.min.js   # NLP library (add manually)
├── config/
│   └── default-rules.json
└── icons/
```

## Security Notes

- Redaction is **visual only** — underlying DOM data is not modified
- Custom word lists are stored in `chrome.storage.local` (not synced)
- Copy/paste is intercepted to prevent clipboard leakage of redacted values
- Print stylesheets preserve redaction in print preview

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Alt+Shift+D` | Toggle redaction on/off |
| `Alt+Shift+M` | Cycle redaction mode |

Shortcuts can be customized at `chrome://extensions/shortcuts`.
