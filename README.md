# Buckland Memorial Hall website (bucklandvillage.com)

A new site for Buckland Memorial Hall. It runs on **Cloudflare Workers** with a **D1** database for the regular events.

| Address | What it is |
|---|---|
| `bucklandvillage.com` | Public site: Home, What's On, Hire the hall, Gallery, Contact |
| `admin.bucklandvillage.com` | Password-protected admin for adding, editing, hiding and deleting regular events |

The admin app and its API only respond on the `admin.` hostname. On the public site those paths return the normal 404 page.

## What's in here

```
public/            static site (HTML, CSS, JS, images, fonts)
  index.html       Home
  whats-on.html    What's On (events loaded from /api/events)
  hire.html        Hire the hall
  gallery.html     Gallery (photos from the old site)
  contact.html     Contact
  404.html         Not-found page
  admin.html       Events admin app (served at admin.bucklandvillage.com/)
  _headers         Security headers (CSP etc.) and image caching
  _redirects       Old WordPress URLs (/about, /blog, /log-in) → new pages
src/worker.js      API, admin login and the public/admin hostname split
migrations/        D1 database schema
seed/              Made-up sample events for LOCAL testing only
wrangler.jsonc     Cloudflare config
```

There are no tracking or analytics cookies. The only cookie is the admin login session, which is strictly necessary, so no cookie banner is needed. Fonts are self-hosted, so the site makes no calls to Google.

## Run it locally

```bash
npm install
cp .dev.vars.example .dev.vars        # then set a local test password in it
npm run db:migrate:local
npm run db:seed:local                 # optional: sample events
npm run dev
```

- Public site: http://localhost:8787
- Admin: http://admin.localhost:8787 (Chrome, Edge and Firefox send `*.localhost` to your machine automatically)

## Deploying

Deploys run from GitHub (`brickvaults/bucklandvillagehall`) using GitHub Actions ([.github/workflows/deploy.yml](.github/workflows/deploy.yml)):

- **Push to `main`** → applies any new database migrations in `migrations/`, then deploys the site to Cloudflare.
- **Pull request** → dry-run build check only, nothing is deployed.
- **Actions tab → Deploy to Cloudflare → Run workflow** → redeploys by hand.

Event changes are made in the admin and never need a deploy.

### Already done

- The D1 database `bucklandvillage-db` exists (Western Europe) with its tables, and its ID is in `wrangler.jsonc`.
- `wrangler.jsonc` attaches `bucklandvillage.com`, `www.bucklandvillage.com` (which redirects to the main domain) and `admin.bucklandvillage.com`. Cloudflare creates their DNS records on the first deploy.
- The `CLOUDFLARE_ACCOUNT_ID` repository secret is set.

### One-off setup

1. **Create a Cloudflare API token** for GitHub to deploy with: Cloudflare dashboard → *My Profile → API Tokens → Create Token* → **Edit Cloudflare Workers** template. Then:
   - Under *Permissions*, add **Account → D1 → Edit**.
   - Under *Account Resources*, choose only this account. Under *Zone Resources*, choose only `bucklandvillage.com`.
   - If the first deploy fails with a permissions error while attaching the domains, edit the token and add **Zone → DNS → Edit**.

2. **Give the token to GitHub.** Run this and paste the token when asked:
   ```bash
   gh secret set CLOUDFLARE_API_TOKEN --repo brickvaults/bucklandvillagehall
   ```
   Or use GitHub → repo *Settings → Secrets and variables → Actions → New repository secret*.

3. **Run the first deploy:** GitHub → *Actions → Deploy to Cloudflare → Run workflow*.

4. **Set the admin secrets** once the Worker exists. Pick a strong admin password and share it only with the people who manage events:
   ```bash
   npx wrangler secret put ADMIN_PASSWORD
   ```
   ```bash
   openssl rand -hex 32 | npx wrangler secret put SESSION_SECRET
   ```
   Or add them as type *Secret* under Cloudflare dashboard → *Workers & Pages → bucklandvillagehall → Settings → Variables and Secrets*. Deploys from GitHub don't touch these.

5. **Add events** at `https://admin.bucklandvillage.com`. The live database starts empty: the sample events are only in your local copy.

### Email

The site shows `enquiries@buckhall.org.uk`. That address stays with the old domain's DNS. bucklandvillage.com has no email set up.

### Recommended: Cloudflare Access for the admin subdomain

For a second layer of protection, put **Cloudflare Zero Trust → Access** in front of `admin.bucklandvillage.com`. It's free for up to 50 users. Committee members then confirm their email with a one-time code before they see the login page. No code changes are needed.

## Managing events (for committee members)

- **Add an event:** give the name, day, how often (e.g. "Every week" or "1st Wednesday of the month"), times, room, a short description, cost and the organiser's contact details. Only publish contact details the organiser has agreed to.
- **Hide** takes an event off the website without losing it, for example over the summer break. **Show** puts it back.
- **Delete** removes it permanently.
- Events with no fixed day ("Varies") appear under "Other regular events".
- The home page shows the next six events coming up this week.
- After 8 wrong passwords, logins from that address are locked for 15 minutes.

## Editing page content

The pages are plain HTML in `public/`. The header and footer are repeated in each page, so a menu change has to be made in all six (`index`, `whats-on`, `hire`, `gallery`, `contact`, `404`). Colours and fonts are set at the top of `public/css/site.css`.
