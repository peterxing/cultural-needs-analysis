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
  assert.match(report, /What you have achieved:/);
  assert.match(report, /We have an Aboriginal employment target\./);
  assert.match(report, /Evidence to build next:/);
  assert.match(report, /Build an Aboriginal Employment Strategy for Long-Term Success/);
  assert.match(report, /Maximise the Impact of Aboriginal Procurement/);
  assert.doesNotMatch(report, /Develop Authentic Acknowledgement of Country Practices/);
});

test("plain-text reports retain qualitative ratings without adding them to the point score", () => {
  const sandbox = appContext({
    "leadership.advocacy": { label: "5 out of 5", score: 5 },
    "leadership.strategy": { label: "2 out of 5", score: 2 },
    "impact.capabilityMeasurement": { text: "Quarterly belonging survey and retention review." }
  });
  const report = vm.runInContext("reportPlainText()", sandbox);

  assert.match(report, /Current maturity category: Seedling \(0\/98 points/);
  assert.match(report, /Qualitative strengths:/);
  assert.match(report, /Leadership actively advocates.*5\/5/);
  assert.match(report, /Qualitative growth signals:/);
  assert.match(report, /Cultural capability is connected.*2\/5/);
  assert.match(report, /Examples supplied:/);
  assert.match(report, /Quarterly belonging survey and retention review\./);
});
