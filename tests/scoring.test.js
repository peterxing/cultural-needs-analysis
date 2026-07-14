const test = require("node:test");
const assert = require("node:assert/strict");

const { buildTailoredInsights, calculateAssessment, levelForScore, updateCheckSelection } = require("../scoring.js");

const levels = [
  { id: "seedling", min: 0, max: 26 },
  { id: "growing", min: 27, max: 45 },
  { id: "grounded", min: 46, max: 65 },
  { id: "thriving", min: 66, max: 83 },
  { id: "regenerative", min: 84, max: 98 }
];

test("places boundary scores in the workbook maturity bands", () => {
  const cases = [
    [0, "seedling"],
    [26, "seedling"],
    [27, "growing"],
    [45, "growing"],
    [46, "grounded"],
    [65, "grounded"],
    [66, "thriving"],
    [83, "thriving"],
    [84, "regenerative"],
    [98, "regenerative"]
  ];

  for (const [score, expected] of cases) {
    assert.equal(levelForScore(levels, score).id, expected, `score ${score}`);
  }
});

test("adds evidence points but uses only the highest progressive milestone", () => {
  const config = {
    maxScore: 18,
    levels,
    sections: [
      {
        id: "foundations",
        title: "Foundations",
        questions: [
          { id: "drivers", type: "check", scoreMode: "sum", options: [["A", 1], ["B", 1]] }
        ]
      },
      {
        id: "outcomes",
        title: "Outcomes",
        questions: [
          { id: "employment", type: "check", scoreMode: "max", options: [["Target", 2], ["Annual monitoring", 10]] },
          { id: "measurement", type: "choice", scoreMode: "choice", options: [["Not measured", 0], ["Evidence-led", 6]] }
        ]
      }
    ]
  };
  const answers = {
    "foundations.drivers": { values: ["A", "B"], score: 99 },
    "outcomes.employment": { values: ["Target", "Annual monitoring"], score: 99 },
    "outcomes.measurement": { label: "Evidence-led", score: 99 }
  };

  const result = calculateAssessment(config, answers);

  assert.equal(result.score, 18);
  assert.equal(result.maxScore, 18);
  assert.equal(result.percent, 100);
  assert.equal(result.answeredScoreQuestions, 3);
  assert.equal(result.totalScoreQuestions, 3);
  assert.deepEqual(result.sectionScores.map(({ id, points, maxPoints }) => ({ id, points, maxPoints })), [
    { id: "foundations", points: 2, maxPoints: 2 },
    { id: "outcomes", points: 16, maxPoints: 16 }
  ]);
});

test("counts an explicit zero-point answer as completed", () => {
  const config = {
    maxScore: 6,
    levels,
    sections: [{
      id: "impact",
      title: "Impact",
      questions: [{
        id: "measurement",
        type: "choice",
        scoreMode: "choice",
        label: "How mature is measurement?",
        options: [["Not yet measured", 0], ["Evidence-led", 6]]
      }]
    }]
  };

  const result = calculateAssessment(config, {
    "impact.measurement": { label: "Not yet measured", score: 0 }
  });

  assert.equal(result.score, 0);
  assert.equal(result.answeredScoreQuestions, 1);
  assert.equal(result.totalScoreQuestions, 1);
});

test("separates selected evidence from the next evidence gaps", () => {
  const config = {
    maxScore: 9,
    levels,
    sections: [{
      id: "leadership",
      title: "Leadership",
      questions: [
        {
          id: "structures",
          type: "check",
          scoreMode: "sum",
          label: "Which structures are in place?",
          options: [["Cultural governance group", 3], ["Dedicated budget", 3]]
        },
        {
          id: "commitment",
          type: "choice",
          scoreMode: "choice",
          label: "How mature is commitment?",
          options: [["Forming", 1], ["Developing", 3], ["Accountable", 6]]
        }
      ]
    }]
  };
  const answers = {
    "leadership.structures": { values: ["Cultural governance group"] },
    "leadership.commitment": { label: "Developing", score: 3 }
  };

  const insights = buildTailoredInsights(config, answers, calculateAssessment(config, answers));

  assert.deepEqual(insights.achievements.map(item => item.text), [
    "Cultural governance group",
    "Developing"
  ]);
  assert.deepEqual(insights.evidenceGaps.map(item => item.text), [
    "Accountable",
    "Dedicated budget"
  ]);
  assert.equal(insights.evidenceGaps.some(item => item.text === "Cultural governance group"), false);
});

test("recommends mapped actions only for scored evidence that is not yet complete", () => {
  const config = {
    maxScore: 12,
    levels,
    sections: [{
      id: "impact",
      title: "Impact",
      questions: [
        {
          id: "employment",
          type: "check",
          scoreMode: "max",
          actionIds: ["employment-strategy"],
          serviceIds: ["employment-advisory"],
          options: [["Target", 2], ["Annual monitoring", 10]]
        },
        {
          id: "procurement",
          type: "check",
          scoreMode: "max",
          actionIds: ["procurement-impact"],
          serviceIds: ["procurement-advisory"],
          options: [["Target", 2]]
        }
      ]
    }]
  };
  const answers = {
    "impact.employment": { values: ["Target"] },
    "impact.procurement": { values: ["Target"] }
  };

  const insights = buildTailoredInsights(config, answers, calculateAssessment(config, answers));

  assert.deepEqual(insights.recommendedActionIds, ["employment-strategy"]);
  assert.deepEqual(insights.recommendedServiceIds, ["employment-advisory"]);
});

test("treats an explicit none option as zero points without calling it an achievement", () => {
  const config = {
    maxScore: 3,
    levels,
    sections: [{
      id: "leadership",
      title: "Leadership",
      questions: [{
        id: "structures",
        type: "check",
        scoreMode: "sum",
        noneOption: "None are currently in place.",
        options: [["Executive sponsor", 3], ["None are currently in place.", 0]]
      }]
    }]
  };
  const answers = {
    "leadership.structures": { values: ["None are currently in place."] }
  };

  const insights = buildTailoredInsights(config, answers, calculateAssessment(config, answers));

  assert.deepEqual(insights.achievements, []);
  assert.deepEqual(insights.evidenceGaps.map(item => item.text), ["Executive sponsor"]);
});

test("keeps a none option mutually exclusive with evidence selections", () => {
  const none = "None are currently in place.";

  assert.deepEqual(updateCheckSelection(["Executive sponsor"], none, true, none), [none]);
  assert.deepEqual(updateCheckSelection([none], "Dedicated budget", true, none), ["Dedicated budget"]);
  assert.deepEqual(updateCheckSelection(["Executive sponsor", "Dedicated budget"], "Executive sponsor", false, none), ["Dedicated budget"]);
});

test("keeps unscored ratings as qualitative strengths and growth signals", () => {
  const config = {
    maxScore: 0,
    levels,
    sections: [{
      id: "leadership",
      title: "Leadership",
      questions: [
        { id: "advocacy", type: "scale", label: "Leaders actively advocate." },
        { id: "strategy", type: "scale", label: "Capability informs strategy." }
      ]
    }]
  };
  const answers = {
    "leadership.advocacy": { label: "5 out of 5", score: 5 },
    "leadership.strategy": { label: "2 out of 5", score: 2 }
  };

  const insights = buildTailoredInsights(config, answers, calculateAssessment(config, answers));

  assert.deepEqual(insights.qualitativeStrengths.map(item => item.text), ["Leaders actively advocate. — 5/5"]);
  assert.deepEqual(insights.qualitativeGrowth.map(item => item.text), ["Capability informs strategy. — 2/5"]);
});

test("retains free-text evidence that is marked for the final report", () => {
  const config = {
    maxScore: 0,
    levels,
    sections: [{
      id: "impact",
      title: "Impact",
      questions: [{ id: "method", type: "text", reportEvidence: true, label: "How is this measured?" }]
    }]
  };
  const answers = { "impact.method": { text: "Quarterly staff belonging survey." } };

  const insights = buildTailoredInsights(config, answers, calculateAssessment(config, answers));

  assert.deepEqual(insights.narrativeEvidence.map(item => item.text), ["How is this measured? — Quarterly staff belonging survey."]);
});
