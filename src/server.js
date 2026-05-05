const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 5188);
const PUBLIC_DIR = path.join(__dirname, "renderer");
const QUESTION_BANK_PATH = path.resolve(__dirname, "..", "data", "processed", "question_bank.jsonl");
const DEMO_QUESTION_BANK_PATH = path.resolve(__dirname, "..", "data", "processed-demo", "question_bank.jsonl");
const DEFAULT_BASE_URL = "https://api.openai.com/v1/chat/completions";
const MAX_BODY_SIZE = 28 * 1024 * 1024;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

function normalizeBaseUrl(input) {
  const value = (input || DEFAULT_BASE_URL).trim();
  if (value.endsWith("/chat/completions")) return value;
  return `${value.replace(/\/$/, "")}/chat/completions`;
}

function buildSystemPrompt() {
  return [
    "你是一个考研数学导学 Agent，目标是帮助用户快速看懂题目并学会这类题。",
    "你要直接给出完整答案，但不能只报答案；必须解释知识点、题型识别、关键转化和易错点。",
    "回答要完整但精炼，优先讲清关键步骤，不要展开无关背景。",
    "如果图片内容识别不清，你要先说明不确定处，并基于可见内容尽量解答。",
    "输出必须使用中文，风格像耐心但高效的考研数学老师。",
    "公式必须使用合法 LaTeX。行内公式用 \\(...\\)，独立公式用 \\[...\\]。不要输出未闭合的 $$，不要把普通文字放进公式环境。",
    "请严格按以下结构输出：",
    "1. 题目识别：用自己的话复述题意，若有不清楚内容请标注。",
    "2. 涉及知识点：列出本题用到的核心知识点和公式。",
    "3. 解题思路：说明为什么这样做，不要跳过关键判断。",
    "4. 完整解答：给出从条件到答案的详细过程。",
    "5. 易错提醒：指出本题最容易错在哪里。",
    "6. 复习卡片：用三到五句话总结这类题以后怎么做。",
    "数学公式尽量使用 Markdown/LaTeX 表达。"
  ].join("\n");
}

function buildEnhanceSystemPrompt() {
  return [
    "你是一个考研数学私人导学 Agent。你会收到：用户的短问题、本地题库已有解析、题干和知识点。",
    "本地题库已有解析是主资料，通常由更强模型或人工整理生成。你必须优先相信并沿用它。",
    "你的任务是解释、扩写、补充本地解析中用户问到的部分，不是重新解整道题。",
    "除非本地解析与题干存在明显数学矛盾，否则不得推翻本地解析的题干、最终答案、核心方法、符号命名和解题路线。",
    "不要另起炉灶生成一份新答案。不要把完整题目从头到尾重新做一遍。",
    "如果发现明显疑点，只能在'本地解析疑点'小节中简短标注，并给出保守修正建议。",
    "回答要中文，使用 Markdown 和 LaTeX。",
    "如果用户只问一个知识点，就围绕本地解析中该知识点出现的位置讲透。",
    "如果用户问'为什么'，重点解释本地解析中对应步骤的动机、第一步来源、关键转化和容易卡住的位置。",
    "如果用户问'怎么复习'，基于本地解析的题型和方法给出同类题识别方法、必要公式和练习建议。",
    "公式必须使用合法 LaTeX。行内公式用 \\(...\\)，独立公式用 \\[...\\]。不要输出未闭合的 $$，不要把普通文字放进公式环境。",
    "如果要引用本地解析中的公式，优先原样引用，不要随意改写成新的复杂公式。",
    "请严格按以下结构输出：",
    "1. 依据的本地解析：说明你参考了本地解析中的哪一部分，例如题目识别、解题思路、完整解答、易错提醒或复习卡片。",
    "2. 直接回答：先用短段落回答用户真正问的点。",
    "3. 本题定位：说明这个点在本题解法中的位置，并沿用本地解析的路线解释为什么这里这样做。",
    "4. 局部展开：只展开与用户问题相关的局部步骤，不要复述全题。",
    "5. 常见误区：指出学习时最容易混淆的地方。",
    "6. 迁移复习：总结遇到同类题该如何识别和下手。"
  ].join("\n");
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function loadQuestionBank() {
  const bankPath = fs.existsSync(QUESTION_BANK_PATH) ? QUESTION_BANK_PATH : DEMO_QUESTION_BANK_PATH;
  if (!fs.existsSync(bankPath)) return [];

  return fs.readFileSync(bankPath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function normalizeFileName(value) {
  return path.basename(String(value || "")).trim().toLowerCase();
}

function normalizeHash(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeSpace(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function hammingDistanceHex(left, right) {
  left = normalizeHash(left);
  right = normalizeHash(right);
  if (!left || !right || left.length !== right.length) return Number.POSITIVE_INFINITY;

  let distance = 0;
  for (let index = 0; index < left.length; index += 1) {
    const xor = parseInt(left[index], 16) ^ parseInt(right[index], 16);
    distance += xor.toString(2).replace(/0/g, "").length;
  }
  return distance;
}

function parseChineseNumber(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  if (/^\d+$/.test(text)) return Number(text);

  const normalized = text
    .replace(/[零〇]/g, "零")
    .replace(/[两二]/g, "二");
  const digitMap = {
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  };

  if (normalized === "十") return 10;
  if (/^十[一二三四五六七八九]$/.test(normalized)) {
    return 10 + digitMap[normalized[1]];
  }
  if (/^[一二三四五六七八九]十$/.test(normalized)) {
    return digitMap[normalized[0]] * 10;
  }
  if (/^[一二三四五六七八九]十[一二三四五六七八九]$/.test(normalized)) {
    return digitMap[normalized[0]] * 10 + digitMap[normalized[2]];
  }
  if (/^[一二三四五六七八九]$/.test(normalized)) {
    return digitMap[normalized];
  }
  return null;
}

function inferYearAndQuestionNo(text) {
  const value = String(text || "");
  const compact = value.replace(/\s+/g, "");
  const yearMatch = compact.match(/(19|20)\d{2}/);
  const shortYearMatch = !yearMatch ? compact.match(/(?:^|[^\d])(\d{2})年/) : null;
  const questionPatterns = [
    /第([一二三四五六七八九十两〇零\d]{1,4})(?:题|道|问|小题)/,
    /(?:^|[^\d])([一二三四五六七八九十两〇零\d]{1,4})(?:题|道|问|小题)/,
  ];
  let questionNo = null;
  for (const pattern of questionPatterns) {
    const match = compact.match(pattern);
    if (match) {
      questionNo = parseChineseNumber(match[1]);
      if (questionNo) break;
    }
  }

  const inferredYear = yearMatch
    ? Number(yearMatch[0])
    : shortYearMatch
      ? 2000 + Number(shortYearMatch[1])
      : null;
  const withoutYear = compact
    .replace(/(19|20)\d{2}/g, " ")
    .replace(/(?:^|[^\d])\d{2}年/g, " ");
  const numberMatches = [...withoutYear.matchAll(/(?:^|[^\d])(\d{1,2})(?=$|[^\d])/g)]
    .map((match) => Number(match[1]));
  return {
    year: inferredYear,
    questionNo: questionNo || numberMatches.at(-1) || null,
  };
}

function normalizeSearchText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/\\[a-z]+/g, " ")
    .replace(/[{}()[\]$`*_#>~^=+\-–—|/\\:：,，.。;；!?！？、\s]+/g, " ")
    .trim();
}

const MATH_KEYWORDS = [
  "极限", "连续", "间断", "导数", "微分", "中值定理", "罗尔", "拉格朗日", "柯西",
  "泰勒", "泰勒公式", "积分", "定积分", "不定积分", "二重积分", "三重积分", "换元",
  "曲线积分", "曲面积分", "级数", "幂级数", "收敛", "发散", "微分方程", "矩阵",
  "行列式", "特征值", "特征向量", "二次型", "线性方程组", "概率", "随机变量",
  "分布", "正态分布", "期望", "方差", "协方差", "参数估计", "最大似然", "假设检验",
  "证明", "放缩", "单调", "凹凸性", "拐点", "渐近线", "偏导数", "条件极值",
];

const SEARCH_STOPWORDS = new Set([
  "一个", "一种", "这个", "这里", "其中", "因此", "所以", "于是", "因为", "如果",
  "可以", "得到", "需要", "利用", "进行", "说明", "求解", "题目", "本题",
  "已知", "答案", "最终", "完整", "解析", "方法", "步骤", "选择题", "填空题", "解答题",
  "常见", "注意", "容易", "错误", "时候", "对应", "关键", "直接", "同类", "类题",
  "推荐", "选择", "择题", "不是",
]);

function tokenizeSearchText(text) {
  const normalized = normalizeSearchText(text);
  if (!normalized) return [];

  const tokens = [];
  for (const keyword of MATH_KEYWORDS) {
    if (normalized.includes(keyword)) tokens.push(keyword);
  }

  for (const token of normalized.split(/\s+/)) {
    if (!token || token.length < 2) continue;
    if (/^(19|20)\d{2}$/.test(token)) continue;
    if (/^(第)?[\d一二三四五六七八九十两〇零]{1,4}(题|道|问|小题)?$/.test(token)) continue;
    tokens.push(token);

    const cjkRuns = token.match(/[\u4e00-\u9fa5]{2,}/g) || [];
    for (const run of cjkRuns) {
      if (run.length <= 8) tokens.push(run);
      for (let index = 0; index < run.length - 1; index += 1) {
        tokens.push(run.slice(index, index + 2));
      }
      for (let index = 0; index < run.length - 2; index += 1) {
        tokens.push(run.slice(index, index + 3));
      }
    }
  }

  return [...new Set(tokens)]
    .filter((token) => token.length >= 2)
    .filter((token) => !SEARCH_STOPWORDS.has(token))
    .filter((token) => !/^(第)?[\d一二三四五六七八九十两〇零]{1,4}(题|道|问|小题)?$/.test(token));
}

function extractSearchTokens(text) {
  return tokenizeSearchText(text);
}

function countTokens(tokens) {
  const counts = new Map();
  for (const token of tokens) counts.set(token, (counts.get(token) || 0) + 1);
  return counts;
}

function buildRecordSearchFields(record) {
  const metadata = record?.metadata || {};
  const sections = record?.answers?.gpt?.sections || {};
  return [
    {
      name: "题目标识",
      weight: 2.2,
      text: [
        record?.id,
        metadata.year ? `${metadata.year}年` : "",
        metadata.subject,
        metadata.question_no ? `第${metadata.question_no}题` : "",
        metadata.type,
      ].filter(Boolean).join(" ")
    },
    {
      name: "题目识别",
      weight: 3.4,
      text: firstNonEmpty(record?.problem_text, sections.intro)
    },
    {
      name: "知识点",
      weight: 4.2,
      text: [
        ...(record?.knowledge_points || []),
        sections.knowledge_points || "",
      ].join(" ")
    },
    {
      name: "解题思路",
      weight: 2.4,
      text: sections.idea || ""
    },
    {
      name: "易错提醒",
      weight: 1.8,
      text: sections.pitfalls || ""
    },
    {
      name: "复习卡片",
      weight: 1.8,
      text: sections.review_card || ""
    },
    {
      name: "完整解答",
      weight: 0.8,
      text: sections.solution || ""
    },
  ];
}

function buildSearchDocument(record) {
  const termCounts = new Map();
  const matchedFields = new Map();
  let length = 0;

  for (const field of buildRecordSearchFields(record)) {
    const tokens = tokenizeSearchText(field.text);
    if (!tokens.length) continue;
    length += tokens.length * field.weight;
    const fieldCounts = countTokens(tokens);
    for (const [token, count] of fieldCounts) {
      termCounts.set(token, (termCounts.get(token) || 0) + count * field.weight);
      const fields = matchedFields.get(token) || new Set();
      fields.add(field.name);
      matchedFields.set(token, fields);
    }
  }

  return {
    record,
    termCounts,
    matchedFields,
    length: Math.max(1, length),
  };
}

function searchQuestionBank(bank, query, options = {}) {
  const queryTokens = extractSearchTokens(query);
  const normalizedQuery = normalizeSearchText(query);
  if (!queryTokens.length && normalizedQuery.length < 6) return [];

  const documents = bank
    .filter((record) => options.includeUnknownYear || record?.metadata?.year)
    .filter((record) => !options.excludeId || record.id !== options.excludeId)
    .map(buildSearchDocument);
  if (!documents.length) return [];

  const documentFrequency = new Map();
  for (const token of queryTokens) {
    let count = 0;
    for (const document of documents) {
      if (document.termCounts.has(token)) count += 1;
    }
    if (count > 0) documentFrequency.set(token, count);
  }

  const totalDocuments = documents.length;
  const averageLength = documents.reduce((sum, document) => sum + document.length, 0) / totalDocuments;
  const k1 = 1.25;
  const b = 0.72;
  const results = [];

  for (const document of documents) {
    let score = 0;
    const reasons = [];

    for (const token of queryTokens) {
      const termFrequency = document.termCounts.get(token) || 0;
      if (!termFrequency) continue;

      const df = documentFrequency.get(token) || 0;
      const idf = Math.log(1 + (totalDocuments - df + 0.5) / (df + 0.5));
      const normalizedTf = (termFrequency * (k1 + 1))
        / (termFrequency + k1 * (1 - b + b * document.length / averageLength));
      score += idf * normalizedTf;

      const fields = [...(document.matchedFields.get(token) || [])].slice(0, 2).join("/");
      reasons.push(fields ? `${token} · ${fields}` : token);
    }

    const haystack = buildRecordSearchText(document.record);
    if (normalizedQuery.length >= 6 && haystack.includes(normalizedQuery)) {
      score += 2.5;
      reasons.unshift("完整提问匹配");
    }

    if (score > 0) {
      results.push({
        record: document.record,
        score,
        reasons: [...new Set(reasons)].slice(0, 6),
      });
    }
  }

  return results.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    const leftYear = Number(left.record?.metadata?.year || 0);
    const rightYear = Number(right.record?.metadata?.year || 0);
    return rightYear - leftYear;
  });
}

function buildRecordSearchText(record) {
  const metadata = record?.metadata || {};
  return normalizeSearchText([
    record?.id,
    metadata.year ? `${metadata.year}年` : "",
    metadata.subject,
    metadata.question_no ? `第${metadata.question_no}题` : "",
    metadata.type,
    record?.problem_text,
    record?.answers?.gpt?.sections?.intro,
    record?.answers?.gpt?.sections?.knowledge_points,
    ...(record?.knowledge_points || []),
  ].filter(Boolean).join("\n"));
}

function findByTextSearch(bank, query) {
  const best = searchQuestionBank(bank, query, { includeUnknownYear: false })[0];
  if (!best || best.score < 2) return null;
  return {
    record: best.record,
    method: "weighted_text_search",
    distance: Number(best.score.toFixed(2)),
  };
}

function recordTitle(record) {
  const metadata = record?.metadata || {};
  return [
    metadata.year ? `${metadata.year}年` : "",
    metadata.subject || "",
    metadata.question_no ? `第${metadata.question_no}题` : "",
    metadata.type ? ` · ${metadata.type}` : "",
  ].filter(Boolean).join("");
}

function firstNonEmpty(...values) {
  return values.map((value) => String(value || "").trim()).find(Boolean) || "";
}

function clipText(text, limit = 140) {
  const value = normalizeSpace(text);
  if (value.length <= limit) return value;
  return `${value.slice(0, limit)}...`;
}

function summarizeRecord(record) {
  const sections = record?.answers?.gpt?.sections || {};
  return {
    id: record.id,
    title: recordTitle(record) || record.id,
    metadata: record.metadata || {},
    knowledgePoints: record.knowledge_points || [],
    problemText: clipText(firstNonEmpty(record.problem_text, sections.intro), 180),
    idea: clipText(sections.idea, 160),
    pitfalls: clipText(sections.pitfalls, 120),
  };
}

function findSimilarQuestions(payload) {
  const bank = loadQuestionBank();
  if (!bank.length) return [];

  const query = String(payload?.query || payload?.searchText || "").trim();
  const sourceId = String(payload?.sourceId || "").trim();
  const sourceRecord = sourceId ? bank.find((item) => item.id === sourceId) : null;
  const inferred = inferYearAndQuestionNo(query);
  const localMatch = query && inferred.questionNo ? findLocalAnswer({ searchText: query }) : null;
  const anchorRecord = sourceRecord || (localMatch?.source?.id ? bank.find((item) => item.id === localMatch.source.id) : null);
  const anchorKnowledge = anchorRecord?.knowledge_points || [];
  const searchText = [
    query,
    ...anchorKnowledge,
    anchorRecord?.metadata?.type || "",
  ].filter(Boolean).join("\n");
  const results = searchQuestionBank(bank, searchText, {
    includeUnknownYear: false,
    excludeId: anchorRecord?.id || "",
  });

  return results
    .slice(0, Math.min(Number(payload?.limit || 6), 12))
    .map((result) => ({
      ...summarizeRecord(result.record),
      score: Number(result.score.toFixed(2)),
      reasons: result.reasons,
    }));
}

function getQuestionBankStats() {
  const bank = loadQuestionBank();
  const processedChunksPath = path.resolve(__dirname, "..", "data", "processed", "rag_chunks.jsonl");
  const demoChunksPath = path.resolve(__dirname, "..", "data", "processed-demo", "rag_chunks.jsonl");
  const chunksPath = fs.existsSync(processedChunksPath) ? processedChunksPath : demoChunksPath;
  const chunkCount = fs.existsSync(chunksPath)
    ? fs.readFileSync(chunksPath, "utf8").split(/\r?\n/).filter(Boolean).length
    : 0;

  const byYear = {};
  const byType = {};
  const knowledge = {};
  let reviewNeeded = 0;

  for (const item of bank) {
    const metadata = item?.metadata || {};
    const year = metadata.year || "未知";
    const type = metadata.type || "未分类";
    byYear[year] = (byYear[year] || 0) + 1;
    byType[type] = (byType[type] || 0) + 1;
    if (item.review_needed) reviewNeeded += 1;
    for (const point of item.knowledge_points || []) {
      knowledge[point] = (knowledge[point] || 0) + 1;
    }
  }

  const topKnowledge = Object.entries(knowledge)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 8)
    .map(([name, count]) => ({ name, count }));

  return {
    totalQuestions: bank.length,
    totalChunks: chunkCount,
    reviewNeeded,
    byYear,
    byType,
    topKnowledge,
    updatedAt: new Date().toISOString(),
  };
}

function findLocalAnswer(payload) {
  const fileName = normalizeFileName(payload?.fileName);
  const imageHash = normalizeHash(payload?.imageHash);
  const textInferred = inferYearAndQuestionNo(payload?.searchText || "");
  const fileInferred = inferYearAndQuestionNo(payload?.fileName || "");
  const inferred = {
    year: textInferred.year || fileInferred.year,
    questionNo: textInferred.questionNo || Number(payload?.questionNo || 0) || fileInferred.questionNo,
  };
  const bank = loadQuestionBank();
  if (!bank.length) return null;

  let record = null;
  let match = null;

  if (textInferred.questionNo) {
    const candidates = bank.filter((item) => Number(item?.metadata?.question_no) === textInferred.questionNo);
    record = candidates.find((item) => inferred.year && Number(item?.metadata?.year) === inferred.year)
      || candidates.find((item) => item?.metadata?.subject === "数一")
      || candidates[0]
      || null;
    if (record) match = { record, method: "search_text_question_no", distance: 0 };
  }

  if (!record && imageHash) {
    for (const item of bank) {
      const hashes = [
        item?.metadata?.image_hash,
        item?.metadata?.imageHash,
        item?.image_hash,
      ].filter(Boolean);

      for (const candidateHash of hashes) {
        const distance = hammingDistanceHex(imageHash, candidateHash);
        if (distance <= 8 && (!match || distance < match.distance)) {
          match = {
            record: item,
            distance,
            method: "image_hash"
          };
        }
      }
    }
    record = match?.record || null;
  }

  if (!record && fileName) {
    record = record || bank.find((item) => {
      const metaFile = normalizeFileName(item?.metadata?.image_file);
      const imagePath = normalizeFileName(item?.image_path);
      return metaFile === fileName || imagePath === fileName;
    });
    if (record && !match) match = { record, method: "file_name", distance: 0 };
  }

  if (!record && payload?.searchText) {
    match = findByTextSearch(bank, payload.searchText);
    record = match?.record || null;
  }

  if (!record) {
    const questionNo = Number(inferred.questionNo || 0);
    const candidates = bank.filter((item) => questionNo && Number(item?.metadata?.question_no) === questionNo);
    record = candidates.find((item) => inferred.year && Number(item?.metadata?.year) === inferred.year)
      || candidates.find((item) => item?.metadata?.subject === "数一")
      || candidates[0];
    if (record && !match) match = { record, method: "question_no", distance: 0 };
  }

  if (!record) return null;

  const answer = record.answers?.gpt?.raw || record.answers?.gemini?.raw;
  if (!answer) return null;

  return {
    content: answer,
    model: "local-question-bank",
    createdAt: new Date().toISOString(),
    source: {
      id: record.id,
      metadata: record.metadata,
      reviewNeeded: record.review_needed,
      knowledgePoints: record.knowledge_points || [],
      matchMethod: match?.method || "unknown",
      imageHashDistance: match?.distance ?? null,
    }
  };
}

function compactText(text, limit = 9000) {
  const value = String(text || "").trim();
  if (value.length <= limit) return value;
  return `${value.slice(0, Math.floor(limit * 0.65))}\n\n...[中间内容已省略]...\n\n${value.slice(-Math.floor(limit * 0.35))}`;
}

function classifyLearningIntent(text, hasImage = false) {
  const value = String(text || "");
  if (/同类|类似|推荐.*题|练习|变式/.test(value)) return "similar_practice";
  if (/易错|错在哪|陷阱|误区/.test(value)) return "pitfall";
  if (/为什么|这一步|变形|怎么想到|能不能|换一种|推导/.test(value)) return "explain_step";
  if (/复习|知识点|考点|公式|定理|概念|讲一下|总结/.test(value)) return "knowledge";
  if (hasImage || /完整|解析|解答|证明|求/.test(value)) return "full_solve";
  return "general_learning";
}

function hasLearningQuestion(text) {
  const value = String(text || "")
    .replace(/(19|20)\d{2}/g, "")
    .replace(/第\s*[\d一二三四五六七八九十两〇零]{1,4}\s*(题|道|问|小题)/g, "")
    .replace(/[\d一二三四五六七八九十两〇零]{1,4}\s*(题|道|问|小题)/g, "")
    .trim();
  return value.length >= 2;
}

function findRecordById(id) {
  if (!id) return null;
  return loadQuestionBank().find((item) => item.id === id) || null;
}

function buildLeanLocalContext(record, intent) {
  if (!record) return "";
  const metadata = record.metadata || {};
  const sections = record.answers?.gpt?.sections || {};
  const title = recordTitle(record) || record.id;
  const shared = [
    `题目标识：${title}`,
    `题型：${metadata.type || "未知"}`,
    `知识点：${(record.knowledge_points || []).join("、") || "暂无"}`,
    "",
    "## 题目识别",
    compactText(firstNonEmpty(record.problem_text, sections.intro), 900),
  ];

  const sectionMap = {
    knowledge: [
      ["涉及知识点", sections.knowledge_points, 900],
      ["解题思路", sections.idea, 900],
      ["复习卡片", sections.review_card, 700],
    ],
    explain_step: [
      ["解题思路", sections.idea, 1100],
      ["完整解答片段", sections.solution, 2200],
      ["易错提醒", sections.pitfalls, 700],
    ],
    pitfall: [
      ["易错提醒", sections.pitfalls, 1100],
      ["解题思路", sections.idea, 700],
      ["关键解答片段", sections.solution, 1400],
    ],
    similar_practice: [
      ["涉及知识点", sections.knowledge_points, 700],
      ["解题思路", sections.idea, 700],
      ["复习卡片", sections.review_card, 700],
    ],
    general_learning: [
      ["涉及知识点", sections.knowledge_points, 800],
      ["解题思路", sections.idea, 900],
      ["复习卡片", sections.review_card, 700],
    ],
    full_solve: [
      ["涉及知识点", sections.knowledge_points, 900],
      ["解题思路", sections.idea, 900],
      ["完整解答", sections.solution, 2600],
      ["易错提醒", sections.pitfalls, 800],
    ],
  };

  const selected = sectionMap[intent] || sectionMap.general_learning;
  for (const [heading, content, limit] of selected) {
    if (!content) continue;
    shared.push("", `## ${heading}`, compactText(content, limit));
  }

  return compactText(shared.join("\n"), 5200);
}

function buildSimilarQuestionsMarkdown(items) {
  if (!items?.length) return "";
  return items.map((item, index) => [
    `${index + 1}. ${item.title || item.id}`,
    item.problemText ? `题干摘要：${item.problemText}` : "",
    item.knowledgePoints?.length ? `知识点：${item.knowledgePoints.slice(0, 5).join("、")}` : "",
    item.idea ? `思路摘要：${item.idea}` : "",
  ].filter(Boolean).join("\n")).join("\n\n");
}

function buildAgentSystemPrompt(mode) {
  const base = [
    "你是考研数学学习 Agent，必须节省 token，并优先使用本地资料。",
    "本地资料来自用户题库或个人阶段资料，优先级高于你重新生成的答案。",
    "不要重新解整题，除非没有本地资料或用户明确要求完整解答。",
    "输出中文，公式使用合法 LaTeX。行内公式用 \\(...\\)，独立公式用 \\[...\\]。",
  ];

  if (mode === "local_enhance") {
    return [
      ...base,
      "你会收到本地解析的相关切片。只回答用户问到的局部问题。",
      "严格控制篇幅：默认 600 字以内；若必须列步骤，最多 5 步。",
      "结构：直接回答、对应本题位置、关键步骤、易错提醒、迁移复习。"
    ].join("\n");
  }

  return [
    ...base,
    "如果用户没有上传完整题目，只是在问知识点，请不要硬编题干。",
    "结构：问题定位、核心知识、例题/方法、易错点、下一步练习。"
  ].join("\n");
}

function buildAgentUserPrompt({ intent, userQuestion, localContext, similarMarkdown, hasImage }) {
  return [
    `任务类型：${intent}`,
    `是否上传图片：${hasImage ? "是" : "否"}`,
    "",
    "本地资料切片：",
    localContext || "无",
    "",
    similarMarkdown ? `同类题候选：\n${similarMarkdown}\n` : "",
    "用户问题：",
    userQuestion || "请解析这道题并生成学习卡片。",
    "",
    "要求：优先依据本地资料；如果本地资料足够，不要补充无关推导；回答要适合学生复习。"
  ].join("\n");
}

async function callChatCompletion({ apiKey, baseUrl, model, temperature, maxTokens, messages }) {
  if (!apiKey || !apiKey.trim()) {
    throw new Error("需要调用模型时，请先填写你的大模型 API Key。");
  }

  const targetUrl = normalizeBaseUrl(baseUrl);
  const chosenModel = (model || "deepseek-v4-flash").trim();
  const response = await fetch(targetUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey.trim()}`
    },
    body: JSON.stringify({
      model: chosenModel,
      temperature: Number.isFinite(Number(temperature)) ? Number(temperature) : 0.2,
      max_tokens: maxTokens,
      messages
    })
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = data?.error?.message || data?.message || response.statusText;
    throw new Error(`模型请求失败：${detail}`);
  }

  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("模型没有返回可展示的内容。");
  return { content, model: chosenModel, usage: data?.usage || null };
}

let learningAgentGraphPromise = null;

async function getLearningAgentGraph() {
  if (learningAgentGraphPromise) return learningAgentGraphPromise;

  learningAgentGraphPromise = (async () => {
    const { Annotation, StateGraph, START, END } = await import("@langchain/langgraph");
    const WorkflowState = Annotation.Root({
      payload: Annotation({ reducer: (_left, right) => right, default: () => ({}) }),
      intent: Annotation({ reducer: (_left, right) => right, default: () => "general_learning" }),
      userQuestion: Annotation({ reducer: (_left, right) => right, default: () => "" }),
      hasImage: Annotation({ reducer: (_left, right) => right, default: () => false }),
      localAnswer: Annotation({ reducer: (_left, right) => right, default: () => null }),
      localRecord: Annotation({ reducer: (_left, right) => right, default: () => null }),
      similarQuestions: Annotation({ reducer: (_left, right) => right, default: () => [] }),
      route: Annotation({ reducer: (_left, right) => right, default: () => "model_solve" }),
      result: Annotation({ reducer: (_left, right) => right, default: () => null }),
      debug: Annotation({ reducer: (_left, right) => right, default: () => ({}) }),
    });

    const parseIntentNode = async (state) => {
      const payload = state.payload || {};
      const userQuestion = String(payload.extraQuestion || "").trim();
      const hasImage = Boolean(payload.imageDataUrl);
      return {
        userQuestion,
        hasImage,
        intent: classifyLearningIntent(userQuestion, hasImage),
      };
    };

    const retrieveNode = async (state) => {
      const payload = state.payload || {};
      const searchPayload = {
        ...payload,
        searchText: state.userQuestion,
      };
      const localAnswer = findLocalAnswer(searchPayload);
      const localRecord = findRecordById(localAnswer?.source?.id);
      const similarQuestions = findSimilarQuestions({
        query: state.userQuestion,
        sourceId: localRecord?.id || "",
        limit: state.intent === "similar_practice" ? 6 : 4,
      });
      return {
        localAnswer,
        localRecord,
        similarQuestions,
      };
    };

    const decideNode = async (state) => {
      if (state.localAnswer && !hasLearningQuestion(state.userQuestion)) {
        return { route: "direct_local" };
      }
      if (state.intent === "similar_practice" && state.similarQuestions?.length) {
        return { route: "direct_similar" };
      }
      if (state.localAnswer && state.localRecord) {
        return { route: "local_enhance" };
      }
      return { route: "model_solve" };
    };

    const directLocalNode = async (state) => ({
      result: {
        ...state.localAnswer,
        model: "langgraph-local-question-bank",
        agentTrace: {
          graph: "learning-agent",
          route: "direct_local",
          intent: state.intent,
          tokenPolicy: "0-token local hit",
        },
      }
    });

    const directSimilarNode = async (state) => {
      const items = state.similarQuestions || [];
      const content = [
        "# 同类题推荐",
        "",
        `根据你的问题「${state.userQuestion || "同类题"}」，我先从本地题库中找到了这些练习：`,
        "",
        ...items.map((item, index) => [
          `${index + 1}. **${item.title || item.id}**`,
          item.problemText ? `   - 题干摘要：${item.problemText}` : "",
          item.knowledgePoints?.length ? `   - 知识点：${item.knowledgePoints.slice(0, 5).join("、")}` : "",
          item.idea ? `   - 思路提示：${item.idea}` : "",
        ].filter(Boolean).join("\n")),
        "",
        "建议先选第 1 题独立做一遍，再回来看解析；如果卡住，可以追问“这题第一步为什么这样做”。"
      ].join("\n");
      return {
        result: {
          content,
          model: "langgraph-local-similar-search",
          createdAt: new Date().toISOString(),
          source: null,
          agentTrace: {
            graph: "learning-agent",
            route: "direct_similar",
            intent: state.intent,
            tokenPolicy: "0-token similar retrieval",
          },
        }
      };
    };

    const localEnhanceNode = async (state) => {
      const payload = state.payload || {};
      const localContext = buildLeanLocalContext(state.localRecord, state.intent);
      const similarMarkdown = state.intent === "similar_practice"
        ? buildSimilarQuestionsMarkdown(state.similarQuestions)
        : "";
      const modelResult = await callChatCompletion({
        apiKey: payload.apiKey,
        baseUrl: payload.baseUrl,
        model: payload.model || "deepseek-v4-flash",
        temperature: payload.temperature,
        maxTokens: 1200,
        messages: [
          { role: "system", content: buildAgentSystemPrompt("local_enhance") },
          {
            role: "user",
            content: buildAgentUserPrompt({
              intent: state.intent,
              userQuestion: state.userQuestion,
              localContext,
              similarMarkdown,
              hasImage: state.hasImage,
            })
          }
        ]
      });

      return {
        result: {
          content: modelResult.content,
          model: `${modelResult.model} + langgraph-local-context`,
          createdAt: new Date().toISOString(),
          source: state.localAnswer?.source || null,
          usage: modelResult.usage,
          agentTrace: {
            graph: "learning-agent",
            route: "local_enhance",
            intent: state.intent,
            tokenPolicy: "lean local sections only",
          },
        }
      };
    };

    const modelSolveNode = async (state) => {
      const payload = state.payload || {};
      if (!state.hasImage && !state.userQuestion) {
        throw new Error("请先拖入题目图片，或输入你想问的数学问题。");
      }

      const similarMarkdown = buildSimilarQuestionsMarkdown(state.similarQuestions);
      const userContent = state.hasImage
        ? [
            {
              type: "text",
              text: [
                "请解析这道考研数学题。",
                state.userQuestion ? `用户补充问题：${state.userQuestion}` : "",
                "请先识别题目，再给知识点和完整解答。"
              ].filter(Boolean).join("\n")
            },
            {
              type: "image_url",
              image_url: {
                url: payload.imageDataUrl,
                detail: "low"
              }
            }
          ]
        : buildAgentUserPrompt({
            intent: state.intent,
            userQuestion: state.userQuestion,
            localContext: "",
            similarMarkdown,
            hasImage: false,
          });

      const modelResult = await callChatCompletion({
        apiKey: payload.apiKey,
        baseUrl: payload.baseUrl,
        model: payload.model || "deepseek-v4-flash",
        temperature: payload.temperature,
        maxTokens: state.hasImage ? 1800 : 1200,
        messages: [
          { role: "system", content: state.hasImage ? buildSystemPrompt() : buildAgentSystemPrompt("general") },
          { role: "user", content: userContent }
        ]
      });

      return {
        result: {
          content: modelResult.content,
          model: `${modelResult.model} + langgraph`,
          createdAt: new Date().toISOString(),
          usage: modelResult.usage,
          agentTrace: {
            graph: "learning-agent",
            route: "model_solve",
            intent: state.intent,
            tokenPolicy: state.hasImage ? "image solve" : "text learning prompt",
          },
        }
      };
    };

    return new StateGraph(WorkflowState)
      .addNode("parse_intent", parseIntentNode)
      .addNode("retrieve", retrieveNode)
      .addNode("decide", decideNode)
      .addNode("direct_local", directLocalNode)
      .addNode("direct_similar", directSimilarNode)
      .addNode("local_enhance", localEnhanceNode)
      .addNode("model_solve", modelSolveNode)
      .addEdge(START, "parse_intent")
      .addEdge("parse_intent", "retrieve")
      .addEdge("retrieve", "decide")
      .addConditionalEdges("decide", (state) => state.route, {
        direct_local: "direct_local",
        direct_similar: "direct_similar",
        local_enhance: "local_enhance",
        model_solve: "model_solve",
      })
      .addEdge("direct_local", END)
      .addEdge("direct_similar", END)
      .addEdge("local_enhance", END)
      .addEdge("model_solve", END)
      .compile();
  })();

  return learningAgentGraphPromise;
}

async function invokeLearningAgent(payload) {
  const graph = await getLearningAgentGraph();
  const finalState = await graph.invoke({ payload });
  if (!finalState.result) throw new Error("学习 Agent 没有生成结果。");
  return finalState.result;
}

function buildEnhanceUserPrompt(localAnswer, userQuestion) {
  const metadata = localAnswer.source?.metadata || {};
  const title = [
    metadata.year ? `${metadata.year}年` : "",
    metadata.subject || "",
    metadata.question_no ? `第${metadata.question_no}题` : "",
  ].filter(Boolean).join("");

  return [
    `用户短问题：${userQuestion || "请基于本地解析进行导学式拓展。"}`,
    "",
    "重要：请以本地解析为主资料，只解释和拓展，不要重新生成完整答案。",
    "",
    `题目标识：${title || localAnswer.source?.id || "本地题库题目"}`,
    `知识点标签：${(localAnswer.source?.knowledgePoints || []).join("、") || "暂无"}`,
    "",
    "下面是本地题库已有解析。请把它当作参考资料，而不是最终权威答案：",
    "",
    compactText(localAnswer.content),
  ].join("\n");
}

async function enhanceLocalAnswer(payload) {
  const {
    apiKey,
    baseUrl,
    model,
    extraQuestion,
    temperature
  } = payload || {};

  if (!apiKey || !apiKey.trim()) {
    throw new Error("本地题库已命中，但要拓展回答需要先填写 API Key。");
  }

  const localAnswer = findLocalAnswer(payload);
  if (!localAnswer) {
    throw new Error("本地题库没有匹配到可拓展的题目。");
  }

  const targetUrl = normalizeBaseUrl(baseUrl);
  const chosenModel = (model || "gpt-4o-mini").trim();
  const response = await fetch(targetUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey.trim()}`
    },
    body: JSON.stringify({
      model: chosenModel,
      temperature: Number.isFinite(Number(temperature)) ? Number(temperature) : 0.25,
      max_tokens: 2200,
      messages: [
        {
          role: "system",
          content: buildEnhanceSystemPrompt()
        },
        {
          role: "user",
          content: buildEnhanceUserPrompt(localAnswer, extraQuestion)
        }
      ]
    })
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const detail = data?.error?.message || data?.message || response.statusText;
    throw new Error(`模型拓展失败：${detail}`);
  }

  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("模型没有返回可展示的拓展内容。");
  }

  return {
    content,
    model: `${chosenModel} + local-question-bank`,
    createdAt: new Date().toISOString(),
    source: localAnswer.source,
  };
}


function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];

    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_SIZE) {
        reject(new Error("图片太大了，请换一张更清晰但体积更小的截图。"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function solveMathProblem(payload) {
  return invokeLearningAgent(payload || {});
}

function serveStatic(req, res) {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  const safePath = path.normalize(decodeURIComponent(requestUrl.pathname)).replace(/^(\.\.[/\\])+/, "");
  const relativePath = safePath === "/" ? "index.html" : safePath.replace(/^[/\\]/, "");
  let filePath = path.join(PUBLIC_DIR, relativePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (!path.extname(relativePath)) {
        filePath = path.join(PUBLIC_DIR, "index.html");
        fs.readFile(filePath, (indexError, indexContent) => {
          if (indexError) {
            res.writeHead(500, {
              "Content-Type": "text/plain; charset=utf-8"
            });
            res.end(`Cannot find app page at ${filePath}`);
            return;
          }

          res.writeHead(200, {
            "Content-Type": MIME_TYPES[".html"],
            "Cache-Control": "no-store"
          });
          res.end(indexContent);
        });
        return;
      }

      res.writeHead(404, {
        "Content-Type": "text/plain; charset=utf-8"
      });
      res.end(`Not found: ${relativePath}`);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/api/bank-stats") {
    try {
      sendJson(res, 200, getQuestionBankStats());
    } catch (error) {
      sendJson(res, 500, {
        error: error.message || String(error)
      });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/api/similar-questions") {
    try {
      const rawBody = await readRequestBody(req);
      const payload = JSON.parse(rawBody);
      const results = findSimilarQuestions(payload);
      sendJson(res, 200, {
        results,
        count: results.length,
        createdAt: new Date().toISOString()
      });
    } catch (error) {
      sendJson(res, 400, {
        error: error.message || String(error)
      });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/api/enhance-local-answer") {
    try {
      const rawBody = await readRequestBody(req);
      const payload = JSON.parse(rawBody);
      const result = await enhanceLocalAnswer(payload);
      sendJson(res, 200, result);
    } catch (error) {
      sendJson(res, 400, {
        error: error.message || String(error)
      });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/api/local-answer") {
    try {
      const rawBody = await readRequestBody(req);
      const payload = JSON.parse(rawBody);
      const result = findLocalAnswer(payload);
      if (!result) {
        sendJson(res, 404, {
          error: "本地题库没有匹配到这道题。"
        });
        return;
      }
      sendJson(res, 200, result);
    } catch (error) {
      sendJson(res, 400, {
        error: error.message || String(error)
      });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/api/solve") {
    try {
      const rawBody = await readRequestBody(req);
      const payload = JSON.parse(rawBody);
      const result = await solveMathProblem(payload);
      sendJson(res, 200, result);
    } catch (error) {
      sendJson(res, 400, {
        error: error.message || String(error)
      });
    }
    return;
  }

  if (req.method === "GET") {
    serveStatic(req, res);
    return;
  }

  if (req.method === "HEAD") {
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store"
    });
    res.end();
    return;
  }

  res.writeHead(405);
  res.end("Method not allowed");
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Math Tutor Agent is running at http://127.0.0.1:${PORT}`);
  console.log(`Serving files from ${PUBLIC_DIR}`);
  console.log("Press Ctrl+C to stop.");
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use. Please close the old launcher window and try again.`);
  } else {
    console.error(error);
  }
  process.exit(1);
});
