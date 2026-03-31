# Demo Shield

Real-time PII redaction Chrome extension for live product demos.

## Installation (Developer Mode)

1. Open `chrome://extensions/` in Chrome
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** and select this directory
4. The Demo Shield icon will appear in the Chrome toolbar

> **Note:** The extension requires `lib/compromise.min.js` for NLP name detection.
> Download it from the [compromise releases page](https://github.com/spencermountain/compromise/releases)
> and place it at `lib/compromise.min.js`. Without it the extension still works —
> regex and custom-word detection remain fully functional.

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
