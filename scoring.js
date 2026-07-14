(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.CNAScoring = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function levelForScore(levels, score) {
    const points = Number.isFinite(Number(score)) ? Number(score) : 0;
    return [...levels].reverse().find(level => points >= level.min) || levels[0];
  }

  function normaliseOption(option) {
    if (Array.isArray(option)) return { label: option[0], points: Number(option[1]) || 0 };
    if (option && typeof option === "object") return { label: option.label, points: Number(option.points) || 0 };
    return { label: String(option), points: 0 };
  }

  function maximumForQuestion(question) {
    if (Number.isFinite(question.maxPoints)) return question.maxPoints;
    const points = (question.options || []).map(normaliseOption).map(option => option.points);
    if (question.scoreMode === "sum") return points.reduce((total, value) => total + value, 0);
    return points.length ? Math.max(...points) : 0;
  }

  function scoreQuestion(question, answer) {
    const options = (question.options || []).map(normaliseOption);
    const maximum = maximumForQuestion(question);
    const hasAnswer = answer !== undefined && answer !== null && (
      Array.isArray(answer.values) || answer.label !== undefined || answer.score !== undefined
    );
    if (!hasAnswer) return { answered: false, points: 0, maxPoints: maximum };

    let points = 0;
    if (question.scoreMode === "choice") {
      const selected = options.find(option => option.label === answer.label)
        || options.find(option => option.points === Number(answer.score));
      points = selected ? selected.points : 0;
    } else {
      const selectedPoints = options
        .filter(option => (answer.values || []).includes(option.label))
        .map(option => option.points);
      points = question.scoreMode === "max"
        ? (selectedPoints.length ? Math.max(...selectedPoints) : 0)
        : selectedPoints.reduce((total, value) => total + value, 0);
    }

    return { answered: true, points: Math.min(maximum, points), maxPoints: maximum };
  }

  function updateCheckSelection(currentValues = [], changedValue, checked, noneOption) {
    if (checked && noneOption && changedValue === noneOption) return [noneOption];
    const next = new Set(currentValues);
    if (noneOption && changedValue !== noneOption) next.delete(noneOption);
    if (checked) next.add(changedValue);
    else next.delete(changedValue);
    return [...next];
  }

  function calculateAssessment(config, answers = {}) {
    let score = 0;
    let calculatedMaximum = 0;
    let answeredScoreQuestions = 0;
    let totalScoreQuestions = 0;
    const questionScores = [];
    const sectionScores = (config.sections || []).map(section => {
      let points = 0;
      let maxPoints = 0;
      let answered = 0;
      let total = 0;

      for (const question of section.questions || []) {
        if (!question.scoreMode) continue;
        total += 1;
        totalScoreQuestions += 1;
        const result = scoreQuestion(question, answers[`${section.id}.${question.id}`]);
        points += result.points;
        maxPoints += result.maxPoints;
        score += result.points;
        calculatedMaximum += result.maxPoints;
        if (result.answered) {
          answered += 1;
          answeredScoreQuestions += 1;
        }
        questionScores.push({
          id: `${section.id}.${question.id}`,
          sectionId: section.id,
          questionId: question.id,
          label: question.label,
          ...result
        });
      }

      return {
        id: section.id,
        title: section.title,
        points,
        maxPoints,
        percent: maxPoints ? (points / maxPoints) * 100 : 0,
        answered,
        total
      };
    }).filter(section => section.total > 0);

    const maxScore = Number.isFinite(config.maxScore) ? config.maxScore : calculatedMaximum;
    return {
      score,
      maxScore,
      percent: maxScore ? Math.round((score / maxScore) * 100) : 0,
      level: levelForScore(config.levels || [], score),
      sectionScores,
      questionScores,
      answeredScoreQuestions,
      totalScoreQuestions
    };
  }

  function buildTailoredInsights(config, answers = {}, assessment = calculateAssessment(config, answers)) {
    const achievements = [];
    const evidenceGaps = [];
    const qualitativeStrengths = [];
    const qualitativeGrowth = [];
    const narrativeEvidence = [];
    const recommendationCandidates = [];
    const scoreByQuestion = new Map(assessment.questionScores.map(item => [item.id, item]));

    for (const section of config.sections || []) {
      for (const question of section.questions || []) {
        const id = `${section.id}.${question.id}`;
        const answer = answers[id];
        if (question.reportEvidence && answer?.text?.trim()) {
          narrativeEvidence.push({
            sectionId: section.id,
            sectionTitle: section.title,
            questionId: question.id,
            text: `${question.label} — ${answer.text.trim()}`
          });
        }
        if (!question.scoreMode) {
          if (question.reportOnly || !answer || !["scale", "choice"].includes(question.type)) continue;
          const rating = Number(answer.score);
          if (!Number.isFinite(rating)) continue;
          const text = question.type === "scale"
            ? `${question.label} — ${rating}/5`
            : `${question.label} — ${answer.label || `${rating}/5`}`;
          const signal = { sectionId: section.id, sectionTitle: section.title, questionId: question.id, text, rating };
          (rating >= 4 ? qualitativeStrengths : qualitativeGrowth).push(signal);
          continue;
        }
        if (question.insightMode === "context") continue;
        const scored = scoreByQuestion.get(id);
        if (!scored?.answered) continue;
        if (scored.points < scored.maxPoints) {
          recommendationCandidates.push({
            deficit: scored.maxPoints ? 1 - (scored.points / scored.maxPoints) : 0,
            actionIds: question.actionIds || [],
            serviceIds: question.serviceIds || []
          });
        }
        const scoredAnswer = answer || {};
        const options = (question.options || []).map(normaliseOption);
        const item = option => ({
          sectionId: section.id,
          sectionTitle: section.title,
          questionId: question.id,
          questionLabel: question.label,
          text: option.label,
          points: option.points
        });

        if (question.scoreMode === "choice") {
          const selected = options.find(option => option.label === scoredAnswer.label)
            || options.find(option => option.points === Number(scoredAnswer.score));
          if (selected?.points > 0) achievements.push(item(selected));
          const next = options
            .filter(option => option.points > (selected?.points || 0))
            .sort((a, b) => a.points - b.points)[0];
          if (next) evidenceGaps.push(item(next));
          continue;
        }

        const selected = new Set(scoredAnswer.values || []);
        for (const option of options) {
          if (option.points <= 0) continue;
          (selected.has(option.label) ? achievements : evidenceGaps).push(item(option));
        }
      }
    }

    achievements.sort((a, b) => b.points - a.points);
    evidenceGaps.sort((a, b) => b.points - a.points);
    const prioritySections = [...assessment.sectionScores]
      .filter(section => section.maxPoints > 0)
      .sort((a, b) => a.percent - b.percent);

    recommendationCandidates.sort((a, b) => b.deficit - a.deficit);
    const uniqueIds = field => [...new Set(recommendationCandidates.flatMap(item => item[field]))];
    const recommendedActionIds = uniqueIds("actionIds");
    const recommendedServiceIds = uniqueIds("serviceIds");

    return { achievements, evidenceGaps, qualitativeStrengths, qualitativeGrowth, narrativeEvidence, prioritySections, recommendedActionIds, recommendedServiceIds };
  }

  return { buildTailoredInsights, calculateAssessment, levelForScore, maximumForQuestion, normaliseOption, scoreQuestion, updateCheckSelection };
});
