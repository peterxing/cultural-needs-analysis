const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const { buildTailoredInsights, calculateAssessment } = require("../scoring.js");

const htmlPath = path.join(__dirname, "..", "index.html");
const html = fs.readFileSync(htmlPath, "utf8");

function loadConfig() {
  const match = html.match(/window\.CNA_CONFIG\s*=\s*(\{[\s\S]*?\n\s{4}\});/);
  assert.ok(match, "CNA_CONFIG should be readable from index.html");
  const sandbox = { window: {} };
  vm.runInNewContext(`window.CNA_CONFIG = ${match[1]}`, sandbox);
  return sandbox.window.CNA_CONFIG;
}

function question(config, sectionId, questionId) {
  return config.sections.find(section => section.id === sectionId).questions.find(item => item.id === questionId);
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
        answers[key] = { values: item.options.map(option => Array.isArray(option) ? option[0] : option) };
      }
    }
  }
  return answers;
}

test("loads the scoring engine before the assessment application", () => {
  const scoringScript = html.indexOf('<script src="scoring.js"></script>');
  const applicationScript = html.indexOf("const config = window.CNA_CONFIG;");
  assert.ok(scoringScript >= 0, "scoring.js script tag should exist");
  assert.ok(scoringScript < applicationScript, "scoring.js should load before the application script");
});

test("matches the workbook's 98-point section totals and maturity bands", () => {
  const config = loadConfig();
  const result = calculateAssessment(config, maximumAnswers(config));

  assert.equal(config.maxScore, 98);
  assert.deepEqual(Array.from(config.levels, level => [level.min, level.max]), [
    [0, 26], [27, 45], [46, 65], [66, 83], [84, 98]
  ]);
  assert.equal(result.score, 98);
  assert.deepEqual(Array.from(result.sectionScores, section => [section.id, section.maxPoints]), [
    ["today", 11],
    ["leadership", 21],
    ["workforce", 16],
    ["community", 24],
    ["impact", 26]
  ]);
});

test("uses the workbook points for milestone and additive questions", () => {
  const config = loadConfig();
  const positivePoints = item => Array.from(item.options, option => option[1]).filter(points => points > 0);

  assert.deepEqual(positivePoints(question(config, "workforce", "training")), [1, 2, 5, 8, 10]);
  assert.deepEqual(positivePoints(question(config, "community", "partnership")), [1, 2, 3, 5, 7]);
  assert.deepEqual(positivePoints(question(config, "impact", "employment")), [2, 3, 4, 6, 8, 10]);
  assert.deepEqual(positivePoints(question(config, "impact", "procurement")), [2, 6, 10, 10]);
  assert.deepEqual(Array.from(question(config, "impact", "measurement").options, option => option[1]), [0, 1, 2, 4, 6]);
  assert.equal(question(config, "impact", "employment").scoreMode, "max");
  assert.equal(question(config, "impact", "procurement").scoreMode, "max");
});

test("uses reciprocal-first wording for the Aboriginal organisations question", () => {
  const config = loadConfig();

  assert.equal(
    question(config, "community", "organisations").label,
    "Reciprocal relationships with Aboriginal organisations and community partners are developing."
  );
});

test("maps incomplete evidence to tailored actions and advisory services", () => {
  const config = loadConfig();
  const actionIds = new Set(config.recommendedActions.map(item => item.id));
  const serviceIds = new Set(config.services.map(item => item.id));
  const answers = {
    "impact.employment": { values: ["We have an Aboriginal employment target."] },
    "impact.procurement": { values: ["We have a procurement target."] },
    "impact.measurement": { label: "Mostly activity counts", score: 1 }
  };

  const insights = buildTailoredInsights(config, answers, calculateAssessment(config, answers));

  assert.ok(insights.recommendedActionIds.includes("employment-strategy"));
  assert.ok(insights.recommendedActionIds.includes("procurement-impact"));
  assert.ok(insights.recommendedActionIds.includes("esg-social"));
  assert.ok(insights.recommendedServiceIds.includes("employment-advisory"));
  assert.ok(insights.recommendedServiceIds.includes("procurement-advisory"));
  assert.ok(insights.recommendedServiceIds.includes("esg-advisory"));
  assert.ok(insights.recommendedActionIds.every(id => actionIds.has(id)));
  assert.ok(insights.recommendedServiceIds.every(id => serviceIds.has(id)));
});

test("offers an explicit zero-point answer when no checkbox evidence is in place", () => {
  const config = loadConfig();
  const questions = [
    question(config, "leadership", "structures"),
    question(config, "workforce", "belongingTracking"),
    question(config, "community", "practices"),
    question(config, "impact", "employment"),
    question(config, "impact", "procurement")
  ];

  for (const item of questions) {
    assert.ok(item.noneOption, `${item.id} should name its none option`);
    assert.deepEqual(Array.from(item.options.at(-1)), [item.noneOption, 0]);
  }
});

test("includes the two implementation text responses as report evidence", () => {
  const config = loadConfig();

  assert.equal(question(config, "impact", "capabilityMeasurement").reportEvidence, true);
  assert.equal(question(config, "impact", "communityImplementation").reportEvidence, true);
});
