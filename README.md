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
- Section headings and intro copy: `sections[].title` and `sections[].intro`
- Questions and options: `sections[].questions`
- Maturity level descriptions: `levels`
- Suggested services: `services`

Keep the quote marks and commas intact. If the page breaks after an edit, revert the last commit in GitHub.
