const themes = [
  'reflection',
  'science_nature',
  'history_politics',
  'technology_innovation',
  'arts_culture',
  'society_ethics',
  'sports'
];

function themeIdToNatural(themeId) {
  if (!themeId) return '';
  const parts = themeId.split('_');
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return themeId.replace(/_/g, ' ');
}

const COMMON_HEADLINE_WORDS = new Set([
  'about', 'after', 'against', 'among', 'amid', 'and', 'are', 'before', 'being',
  'could', 'first', 'from', 'have', 'into', 'latest', 'more', 'news', 'over',
  'said', 'says', 'some', 'that', 'their', 'there', 'these', 'they', 'this',
  'those', 'through', 'today', 'under', 'what', 'when', 'where', 'which',
  'while', 'will', 'with', 'world', 'would', 'year', 'years'
]);

function headlineTerms(headline) {
  let title = headline.title || '';
  if (headline.source && title.toLowerCase().endsWith(` - ${headline.source.toLowerCase()}`)) {
    title = title.slice(0, -headline.source.length - 3);
  }
  const terms = title.slice(0, 2000).toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
  return new Set(terms
    .map(term => term.length > 4 && term.endsWith('s') && !term.endsWith('ss') ? term.slice(0, -1) : term)
    .filter(term => term.length >= 4 && !COMMON_HEADLINE_WORDS.has(term))
    .slice(0, 40));
}

function selectTargetHeadlines(headlines) {
  if (!Array.isArray(headlines) || headlines.length === 0) {
    throw new Error('At least one headline is required to select a story.');
  }
  const groups = new Map();
  headlines.forEach((headline, index) => {
    const terms = [...headlineTerms(headline)].sort();
    for (let first = 0; first < terms.length; first++) {
      for (let second = first + 1; second < terms.length; second++) {
        const key = `${terms[first]}\0${terms[second]}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(index);
      }
    }
  });

  let best = [];
  for (const indexes of groups.values()) {
    if (indexes.length < 3) continue;
    const firstDifference = indexes.findIndex((index, i) => index !== best[i]);
    if (indexes.length > best.length || (indexes.length === best.length &&
        firstDifference !== -1 && indexes[firstDifference] < best[firstDifference])) {
      best = indexes;
    }
  }
  if (best.length >= 3) {
    return { reason: 'similar-headlines', indexes: best, headlines: best.map(index => headlines[index]) };
  }
  return { reason: 'first-result', indexes: [0], headlines: [headlines[0]] };
}

function buildHeadlineRequest(headlines, naturalTheme) {
  const target = selectTargetHeadlines(headlines);
  const prompt = `You will generate ONE concise, neutral statement (<= 140 chars) for public discussion that people can AGREE or DISAGREE with.
    
Theme: ${naturalTheme}
Target story headlines:
${target.headlines.map((h) => `- ${h.title}`).join('\n')}

Guidelines:
- Output a single balanced statement (not a question).
- Focus on one specific issue, action, or policy from the target story, not the broad theme.
- Make the statement clear and debatable for a general audience.
- Do not assume facts not supported by the headlines.
- Avoid naming individuals unless essential.
- Output ONLY the statement, without quotes.`;
  return {
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: 'You generate one concise, neutral civic question from headlines.' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.4,
    max_tokens: 80
  };
}

module.exports = { themes, themeIdToNatural, selectTargetHeadlines, buildHeadlineRequest };
