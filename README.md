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
- Questions, answer points and score modes: `sections[].questions`
- Maturity level descriptions: `levels`
- Recommended actions and suggested services: edit each item's `text`

## Scoring rubric

The assessment uses the 98-point rubric supplied in the CNA survey workbook:

- Seedling: 0-26
- Growing: 27-45
- Grounded: 46-65
- Thriving: 66-83
- Regenerative: 84-98

Scored questions declare a `scoreMode` in `window.CNA_CONFIG`:

- `sum` adds selected evidence points, up to any configured `maxPoints` cap.
- `max` uses only the highest selected progressive milestone.
- `choice` uses the points attached to the selected radio option.

Questions without `scoreMode` remain qualitative and do not change category placement. The scoring and tailored-evidence functions live in `scoring.js`; the browser report uses them to recognise selected evidence, identify missing evidence and choose mapped next actions and services.

Evidence checkbox groups include an explicit zero-point "none currently in place" answer so participants can distinguish a genuine zero from an unanswered question. Those answers are mutually exclusive with positive evidence selections. High and low qualitative ratings, plus the two implementation text examples, appear in the report without changing the 98-point category score.

Run the regression suite after changing points, thresholds or report logic:

```powershell
node --test tests/*.test.js
```

Keep the quote marks and commas intact. If the page breaks after an edit, revert the last commit in GitHub.

## Feed reports into HubSpot

This page is ready to submit CNA reports into a HubSpot form using HubSpot's public forms endpoint. Do not paste a private HubSpot API token into this public page.

To connect Speaking in Colour HubSpot:

1. Create or open the HubSpot form that should receive CNA enquiries.
2. Copy the portal ID and form GUID from the HubSpot embed code.
3. Paste them into `window.CNA_CONFIG.hubspot.portalId` and `window.CNA_CONFIG.hubspot.formGuid`.
4. Make sure the HubSpot form includes the standard fields `email`, `firstname`, `company`, `jobtitle`, and `message`.
5. Optional: create custom HubSpot properties if you want maturity level, score, aspiration, priorities and consent stored as separate fields, then paste those property names into the blank optional entries in `hubspot.fields`.

If no HubSpot form IDs are configured, the page still saves the lead payload in the browser, copies the report handoff, and opens the Calendly booking step as the fallback. This keeps the public tool usable without preparing or sending email drafts.
