const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const scoring = require("../scoring.js");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

function configSource() {
  const match = html.match(/window\.CNA_CONFIG\s*=\s*(\{[\s\S]*?\n\s{4}\});/);
  assert.ok(match, "CNA_CONFIG should be readable");
  return match[1];
}

function loadConfig() {
  const sandbox = { window: {} };
  vm.runInNewContext(`window.CNA_CONFIG = ${configSource()}`, sandbox);
  return sandbox.window.CNA_CONFIG;
}

function applicationSource() {
  const marker = '<script src="scoring.js"></script>';
  const afterMarker = html.slice(html.indexOf(marker) + marker.length);
  const match = afterMarker.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(match, "application script should be readable");
  return match[1].replace(/\n\s*init\(\);\s*\n/, "\n");
}

function appContext(answers = {}) {
  const window = { CNA_CONFIG: loadConfig() };
  const sandbox = {
    window,
    CNAScoring: scoring,
    localStorage: {
      getItem: key => key === "cnaAnswersV1" ? JSON.stringify(answers) : null,
      setItem() {}
    },
    document: {},
    location: { href: "https://example.test/", hash: "" },
    navigator: {},
    console
  };
  vm.createContext(sandbox);
  vm.runInContext(applicationSource(), sandbox);
  return sandbox;
}

function maximumAnswers(config) {
  const answers = {};
  for (const section of config.sections) {
    for (const item of section.questions) {
      if (!item.scoreMode) continue;
      const key = `${section.id}.${item.id}`;
      if (item.scoreMode === "choice") {
        const [label, points] = [...item.options].sort((a, b) => b[1] - a[1])[0];
        answers[key] = { label, score: points };
      } else {
        answers[key] = { values: item.options.map(option => option[0]) };
      }
    }
  }
  return answers;
}

test("renders scored checkbox options as clean participant-facing labels", () => {
  const sandbox = appContext({
    "impact.employment": { values: ["We have an Aboriginal employment target."] }
  });
  const rendered = vm.runInContext(`renderQuestion(
    config.sections.find(section => section.id === "impact"),
    config.sections.find(section => section.id === "impact").questions.find(question => question.id === "employment")
  )`, sandbox);

  assert.match(rendered, /value="We have an Aboriginal employment target\." checked/);
  assert.doesNotMatch(rendered, /target\.,2/);
});

test("the application report uses the raw 98-point rubric", () => {
  const config = loadConfig();
  const sandbox = appContext(maximumAnswers(config));
  const report = vm.runInContext("scoreReport()", sandbox);

  assert.equal(report.score, 98);
  assert.equal(report.maxScore, 98);
  assert.equal(report.level.id, "regenerative");
  assert.equal(report.answeredScoreQuestions, 9);
  assert.equal(report.totalScoreQuestions, 9);
});

test("plain-text reports recognise evidence and tailor next steps to gaps", () => {
  const answers = {
    "impact.employment": { values: ["We have an Aboriginal employment target."] },
    "impact.procurement": { values: ["We have a procurement target."] },
    "impact.measurement": { label: "Mostly activity counts", score: 1 }
  };
  const sandbox = appContext(answers);
  const report = vm.runInContext("reportPlainText()", sandbox);

  assert.match(report, /Current maturity category: Seedling \(5\/98 points/);
  assert.match(report, /What you have achieved:\n✅ /);
  assert.match(report, /We have an Aboriginal employment target\./);
  assert.match(report, /Evidence to build next:\n↑ /);
  assert.match(report, /Build an Aboriginal Employment Strategy for Long-Term Success/);
  assert.match(report, /Maximise the Impact of Aboriginal Procurement/);
  assert.doesNotMatch(report, /Develop Authentic Acknowledgement of Country Practices/);
});

test("plain-text reports retain qualitative ratings without adding them to the point score", () => {
  const sandbox = appContext({
    "leadership.advocacy": { label: "5 out of 5", score: 5 },
    "leadership.strategy": { label: "2 out of 5", score: 2 },
    "workforce.capabilityMeasurement": { text: "Quarterly belonging survey and retention review." }
  });
  const report = vm.runInContext("reportPlainText()", sandbox);

  assert.match(report, /Current maturity category: Seedling \(0\/98 points/);
  assert.match(report, /Qualitative strengths:\n✦ /);
  assert.match(report, /Leadership actively advocates.*5\/5/);
  assert.match(report, /Qualitative growth signals:\n🍃 /);
  assert.match(report, /Cultural capability is connected.*2\/5/);
  assert.match(report, /Examples supplied:/);
  assert.match(report, /Quarterly belonging survey and retention review\./);
});

test("shows the requested five-point legend under every one-to-five rating question", () => {
  const sandbox = appContext();
  const expected = "1 = started, 2 = emerging, 3 = developing, 4 = refining, 5 = embedded and impact-led";
  const rendered = vm.runInContext(`config.sections.flatMap(section =>
    section.questions
      .filter(question => question.type === "scale")
      .map(question => renderQuestion(section, question))
  )`, sandbox);

  assert.equal(rendered.length, 9);
  for (const questionHtml of rendered) assert.match(questionHtml, new RegExp(expected));
});

test("recommended next steps have one line of separation between items", () => {
  const sandbox = appContext();
  const rendered = vm.runInContext(
    `listOrNote(["First action", "Second action"], "No actions", "recommended-next-steps")`,
    sandbox
  );

  assert.match(rendered, /^<ul class="recommended-next-steps">/);
  assert.match(html, /\.recommended-next-steps li \+ li\s*\{\s*margin-top:\s*1rem;/);
  assert.match(
    html,
    /<h3>Recommended next steps<\/h3>\$\{listOrNote\(tailored\.actions, [^}]+, "recommended-next-steps"\)\}/
  );
});

test("report insight points use accessible icon bullets", () => {
  const source = applicationSource();
  assert.match(source, /function iconListOrNote/);

  const sandbox = appContext();
  const markers = [
    ["circle-check", "achievement"],
    ["arrow-up", "evidence"],
    ["sparkles", "strength"],
    ["leaf", "growth"]
  ];

  for (const [icon, tone] of markers) {
    const rendered = vm.runInContext(
      `iconListOrNote(["First point", "Second point"], "No points", ${JSON.stringify(icon)}, ${JSON.stringify(tone)})`,
      sandbox
    );
    assert.match(rendered, /^<ul class="report-icon-list">/);
    assert.equal((rendered.match(/<li>/g) || []).length, 2);
    assert.equal((rendered.match(new RegExp(`data-lucide="${icon}"`, "g")) || []).length, 2);
    assert.equal((rendered.match(new RegExp(`report-list-icon-${tone}`, "g")) || []).length, 2);
    assert.equal((rendered.match(/aria-hidden="true"/g) || []).length, 2);
    assert.match(rendered, />First point</);
    assert.match(rendered, />Second point</);
  }

  const fallback = vm.runInContext(
    `iconListOrNote([], "No points", "circle-check", "achievement")`,
    sandbox
  );
  assert.equal((fallback.match(/<li>/g) || []).length, 1);
  assert.match(fallback, />No points</);

  assert.match(html, /report-list-icon-achievement[\s\S]*color:\s*var\(--primary-2\)/);
  assert.match(html, /report-list-icon-growth[\s\S]*color:\s*var\(--primary-2\)/);
  assert.match(source, /<h3>What you have achieved<\/h3>\$\{iconListOrNote\([^\n]+"circle-check", "achievement"\)\}/);
  assert.match(source, /<h3>Evidence to build next<\/h3>\$\{iconListOrNote\([^\n]+"arrow-up", "evidence"\)\}/);
  assert.match(source, /<h3>Qualitative strengths<\/h3>\$\{iconListOrNote\([^\n]+"sparkles", "strength"\)\}/);
  assert.match(source, /<h3>Qualitative growth signals<\/h3>\$\{iconListOrNote\([^\n]+"leaf", "growth"\)\}/);
  assert.doesNotMatch(source, /function reportSectionHeading/);
});

test("session brief creates a non-email paid-session handoff", () => {
  const sandbox = appContext({
    "future.organisation": { text: "Example Health" },
    "future.contactName": { text: "Avery" },
    "future.role": { text: "People and Culture" },
    "future.priorities": { values: ["Leadership coaching", "RAP planning or refresh"] },
    "impact.procurement": { values: ["We have a procurement target."] },
    "impact.measurement": { label: "Mostly activity counts", score: 1 }
  });
  const brief = vm.runInContext("sessionBriefText()", sandbox);
  const packet = vm.runInContext("leadPacketPayload()", sandbox);

  assert.match(brief, /CNA paid-session facilitator brief/);
  assert.match(brief, /Recommended paid pathway:/);
  assert.match(brief, /Pre-session questions:/);
  assert.match(brief, /The tool has not sent email, created a draft, issued an invoice or requested payment\./);
  assert.equal(packet.sessionBrief, brief);
  assert.match(html, /id="copySessionBriefBtn"/);
});
