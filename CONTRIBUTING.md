# Contributing to Dispatch

Ideas, bug reports and pull requests are welcome.

## Run it

```bash
npm install
npm start      # the app, with sample issues until you have real ones
npm test       # all tests, no network needed
```

Node.js 20 or newer. If Electron does not unpack on a very new Node version, see *Troubleshooting* in the README.

## Good first contributions

- **A new interface language.** Copy `locales/en.json` to `locales/<code>.json`, translate the values, keep the keys. `npm test` checks that the shipped languages have exactly the same keys.
- **A new source type** for `EDITORIAL.md`, written so that it works for any user, not only for you.
- **macOS or Linux findings.** Dispatch is only tested on Windows so far.

## Ground rules

- **No AI inside the app.** The editor is Claude running in the user's own session. The app only reads files, so it needs no API key and no account.
- **No new runtime dependencies** without a good reason. `src/` and `tools/` use Node's built-in modules only.
- **Texts live in `locales/`**, never in the code. English is the base language.
- **Personal data stays out of the repository.** `dispatch.config.json`, `profile/profile.md`, `profile/generated.md` and `issues/` are ignored on purpose. Sample issues must be about public pages and written in your own words.
- **Add a test** for logic you add or change. Tests use Node's built-in test runner (`node --test`).

## Artwork

The logo and the README artwork are generated, so they stay in the same style:

```bash
node scripts/make-assets.js        # logo, app icon
node scripts/make-readme-art.js    # banner, section headers, flow cards
```
