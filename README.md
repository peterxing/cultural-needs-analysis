# Cultural Needs Analysis

Public page: https://peterxing.github.io/cultural-needs-analysis/

## Edit wording

Most content lives in `window.CNA_CONFIG` near the top of `index.html`.

To update wording without asking an agent:

1. Open `index.html` in GitHub.
2. Click the pencil icon.
3. Edit text inside `window.CNA_CONFIG`.
4. Commit to `master`.
5. GitHub Pages will republish automatically.

Common edits:

- Calendly link: `calendlyUrl`
- HubSpot form connection: `hubspot.portalId` and `hubspot.formGuid`
- HubSpot field mapping: `hubspot.fields`
- Section headings and intro copy: `sections[].title` and `sections[].intro`
- Questions and options: `sections[].questions`
- Maturity level descriptions: `levels`
- Suggested services: `services`

Keep the quote marks and commas intact. If the page breaks after an edit, revert the last commit in GitHub.

## Feed reports into HubSpot

This page is ready to submit CNA reports into a HubSpot form using HubSpot's public forms endpoint. Do not paste a private HubSpot API token into this public page.

To connect Speaking in Colour HubSpot:

1. Create or open the HubSpot form that should receive CNA enquiries.
2. Copy the portal ID and form GUID from the HubSpot embed code.
3. Paste them into `window.CNA_CONFIG.hubspot.portalId` and `window.CNA_CONFIG.hubspot.formGuid`.
4. Make sure the HubSpot form includes the standard fields `email`, `firstname`, `company`, `jobtitle`, and `message`.
5. Optional: create custom HubSpot properties if you want maturity level, score, aspiration, priorities and consent stored as separate fields, then paste those property names into the blank optional entries in `hubspot.fields`.

If no HubSpot form IDs are configured, the page still saves the lead payload in the browser and opens the email handoff as a fallback.
