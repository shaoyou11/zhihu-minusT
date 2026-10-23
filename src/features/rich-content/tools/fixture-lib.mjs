import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const OPEN_TAG_PATTERN = /<([a-z][a-z0-9-]*)(?:\s|\/?>)/gi;
const JSON_FIXTURE_EXTENSION = '.json';
const MISSING_VALUE = Symbol('missing-fixture-value');

function countMatches(value, pattern) {
  return Array.from(value.matchAll(pattern)).length;
}

function getOpeningTags(html) {
  const tags = {};
  for (const match of html.matchAll(OPEN_TAG_PATTERN)) {
    const tag = match[1].toLowerCase();
    tags[tag] = (tags[tag] ?? 0) + 1;
  }
  return tags;
}

export function normalizeFixtureHtml(rawBlock) {
  const trimmed = rawBlock.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === 'string') return parsed;
    } catch {
      // Some captured API values only escape attribute quotes and are not a
      // complete JSON string. Fall through to the conservative normalization.
    }
  }
  return trimmed.replaceAll('\\"', '"').replaceAll('\\/', '/');
}

function getFixtureValue(value, selector) {
  if (!selector) return value;

  return selector.split('.').reduce((current, segment) => {
    if (
      current === null ||
      current === undefined ||
      !(segment in Object(current))
    ) {
      return MISSING_VALUE;
    }
    return current[segment];
  }, value);
}

function formatFixtureValue(value) {
  if (value === MISSING_VALUE) return '<missing>';
  if (value === undefined) return '<undefined>';
  return JSON.stringify(value);
}

function fixtureValuesEqual(left, right) {
  if (Object.is(left, right)) return true;
  if (
    left === null ||
    right === null ||
    typeof left !== 'object' ||
    typeof right !== 'object'
  ) {
    return false;
  }

  if (Array.isArray(left) !== Array.isArray(right)) return false;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;

  return leftKeys.every(
    (key) =>
      Object.hasOwn(right, key) && fixtureValuesEqual(left[key], right[key]),
  );
}

export function compareExpectedMetadata(document, expected = {}) {
  return Object.entries(expected).flatMap(([selector, expectedValue]) => {
    const actualValue = getFixtureValue(document, selector);
    return fixtureValuesEqual(actualValue, expectedValue)
      ? []
      : [
          `metadata.${selector}: expected ${formatFixtureValue(expectedValue)}, received ${formatFixtureValue(actualValue)}`,
        ];
  });
}

async function loadFixtureSource(
  filePath,
  contentPath,
  allowStructuredPages = false,
  expectStructuredContent = false,
) {
  const raw = await readFile(filePath, 'utf8');
  if (path.extname(filePath).toLowerCase() !== JSON_FIXTURE_EXTENSION) {
    throw new Error(`Fixture must be a JSON API envelope: ${filePath}`);
  }

  let document;
  try {
    document = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `Invalid JSON fixture ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (
    allowStructuredPages &&
    isRecord(document) &&
    ['synthetic', 'capture-derived'].includes(document.source) &&
    Array.isArray(document.pages)
  ) {
    return { document, structuredPages: document.pages };
  }

  if (
    allowStructuredPages &&
    isRecord(document) &&
    document.source === 'capture-derived' &&
    Array.isArray(document.data)
  ) {
    return {
      document,
      structuredPages: document.data
        .filter((entry) => isRecord(entry) && entry.type === 'answer')
        .map((entry) => entry.structured_content),
    };
  }

  const selectedContentPath =
    contentPath ??
    (getFixtureValue(document, 'type') === 'question_feed_card'
      ? 'target.content'
      : 'content');
  const selectedContent = getFixtureValue(document, selectedContentPath);
  if (expectStructuredContent) {
    if (!isRecord(selectedContent)) {
      throw new Error(
        `JSON fixture ${filePath} must contain structured content at ${selectedContentPath}`,
      );
    }
    return { document, structuredPages: [selectedContent] };
  }
  if (typeof selectedContent !== 'string') {
    throw new Error(
      `JSON fixture ${filePath} must contain string content at ${selectedContentPath}`,
    );
  }

  return { content: normalizeFixtureHtml(selectedContent), document };
}

export function analyzeHtml(html) {
  const tags = getOpeningTags(html);
  const activeHtml = html.replace(
    /<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi,
    '',
  );
  const activeTags = getOpeningTags(activeHtml);
  const formulaImages = Array.from(
    activeHtml.matchAll(/<img\b[^>]*>/gi),
  ).filter(
    ([tag]) =>
      /\beeimg=(?:"|')?[12](?:"|')?/i.test(tag) ||
      /zhihu\.com\/equation\?/i.test(tag),
  ).length;

  return {
    characters: html.length,
    bytes: Buffer.byteLength(html),
    paragraphs: activeTags.p ?? 0,
    headings: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].reduce(
      (total, tag) => total + (activeTags[tag] ?? 0),
      0,
    ),
    figures: activeTags.figure ?? 0,
    figcaptions: activeTags.figcaption ?? 0,
    lists: (activeTags.ul ?? 0) + (activeTags.ol ?? 0),
    totalImages: tags.img ?? 0,
    activeImages: activeTags.img ?? 0,
    avatarImages: countMatches(
      activeHtml,
      /<img\b[^>]*class=(?:"|')[^"']*\bavatar\b[^"']*(?:"|')[^>]*>/gi,
    ),
    formulaImages,
    noscripts: tags.noscript ?? 0,
    videoBoxes: countMatches(
      activeHtml,
      /<a\b[^>]*class=(?:"|')[^"']*\bvideo-box\b[^"']*(?:"|')[^>]*>/gi,
    ),
    linkCards: countMatches(
      activeHtml,
      /<a\b[^>]*(?:data-draft-type=(?:"|')link-card(?:"|')|class=(?:"|')[^"']*\bLinkCard\b[^"']*(?:"|'))[^>]*>/gi,
    ),
    memberMentions: countMatches(
      activeHtml,
      /<a\b[^>]*class=(?:"|')[^"']*\bmember_mention\b[^"']*(?:"|')[^>]*>/gi,
    ),
    topicTags: countMatches(
      activeHtml,
      /<a\b[^>]*class=(?:"|')[^"']*\bhash_tag\b[^"']*(?:"|')[^>]*>/gi,
    ),
  };
}

/** Count bundled structured input directly; no HTML serialization or parsing. */
export function analyzeStructuredContentPages(pages) {
  const serialized = JSON.stringify(pages);
  /** @type {Array<{is_end: boolean, is_start: boolean, totals: number, hasNext: boolean, hasPrevious: boolean}>} */
  const pagingStates = [];
  const stats = {
    characters: serialized.length,
    bytes: Buffer.byteLength(serialized),
    paragraphs: 0,
    headings: 0,
    figures: 0,
    figcaptions: 0,
    lists: 0,
    totalImages: 0,
    activeImages: 0,
    avatarImages: 0,
    formulaImages: 0,
    noscripts: 0,
    videoBoxes: 0,
    linkCards: 0,
    memberMentions: 0,
    topicTags: 0,
    segmentInfos: 0,
    structuredPages: pages.length,
    structuredSegments: 0,
    mergedStructuredSegments: 0,
    horizontalRules: 0,
    listItems: 0,
    marks: 0,
    markTypes: { bold: 0, link: 0, entity_word: 0, formula: 0 },
    paging: pagingStates,
  };
  const errors = [];
  const mergedIds = new Set();

  function analyzeText(payload, location) {
    if (
      !isRecord(payload) ||
      typeof payload.text !== 'string' ||
      !Array.isArray(payload.marks)
    ) {
      errors.push(`${location} must contain text and marks`);
      return;
    }
    for (const mark of payload.marks) {
      stats.marks += 1;
      if (
        !isRecord(mark) ||
        (mark.type !== 'seg_like' && !Object.hasOwn(stats.markTypes, mark.type))
      ) {
        errors.push(`${location} contains an unsupported mark`);
        continue;
      }
      stats.markTypes[mark.type] = (stats.markTypes[mark.type] ?? 0) + 1;
      if (
        !Number.isSafeInteger(mark.start_index) ||
        !Number.isSafeInteger(mark.end_index) ||
        mark.start_index < 0 ||
        mark.end_index < mark.start_index ||
        mark.end_index > payload.text.length
      ) {
        errors.push(`${location} contains an invalid mark range`);
      }
      if (mark.type === 'formula') stats.formulaImages += 1;
      if (mark.type === 'link' && mark.link?.link_type === 'member_mention')
        stats.memberMentions += 1;
    }
  }

  pages.forEach((page, pageIndex) => {
    const location = `pages.${pageIndex}`;
    if (!isRecord(page) || !Array.isArray(page.segments)) {
      errors.push(`${location} must contain segments`);
      return;
    }
    let paging;
    try {
      paging = typeof page.paging === 'string' ? JSON.parse(page.paging) : null;
    } catch {
      paging = null;
    }
    if (
      !isRecord(paging) ||
      typeof paging.is_end !== 'boolean' ||
      typeof paging.is_start !== 'boolean' ||
      typeof paging.next !== 'string' ||
      typeof paging.previous !== 'string' ||
      !Number.isFinite(paging.totals) ||
      (!paging.is_end && !paging.next.trim())
    ) {
      errors.push(`${location} contains invalid serialized paging`);
    } else {
      // Never include continuation URLs, opaque IDs or original prose in output.
      stats.paging.push({
        is_end: paging.is_end,
        is_start: paging.is_start,
        totals: paging.totals,
        hasNext: Boolean(paging.next),
        hasPrevious: Boolean(paging.previous),
      });
    }
    const pageIds = new Set();
    page.segments.forEach((segment, segmentIndex) => {
      const segmentLocation = `${location}.segments.${segmentIndex}`;
      if (!isRecord(segment) || typeof segment.id !== 'string' || !segment.id) {
        errors.push(`${segmentLocation} must contain an ID`);
        return;
      }
      if (pageIds.has(segment.id))
        errors.push(`${segmentLocation} repeats an ID within one page`);
      pageIds.add(segment.id);
      mergedIds.add(segment.id);
      stats.structuredSegments += 1;
      switch (segment.type) {
        case 'paragraph':
          stats.paragraphs += 1;
          analyzeText(segment.paragraph, segmentLocation);
          break;
        case 'heading':
          stats.headings += 1;
          analyzeText(segment.heading, segmentLocation);
          break;
        case 'list_node':
          stats.lists += 1;
          if (
            !isRecord(segment.list_node) ||
            !Array.isArray(segment.list_node.items)
          ) {
            errors.push(`${segmentLocation} must contain list items`);
          } else {
            stats.listItems += segment.list_node.items.length;
            segment.list_node.items.forEach((item, itemIndex) => {
              analyzeText(item, `${segmentLocation}.items.${itemIndex}`);
            });
          }
          break;
        case 'image':
          stats.activeImages += 1;
          stats.totalImages += 1;
          if (!isRecord(segment.image))
            errors.push(`${segmentLocation} must contain an image payload`);
          break;
        case 'hr':
          stats.horizontalRules += 1;
          break;
        case 'card':
          stats.linkCards += 1;
          if (!isRecord(segment.card))
            errors.push(`${segmentLocation} must contain a card payload`);
          break;
        default:
          errors.push(`${segmentLocation} contains an unsupported segment`);
      }
    });
  });
  stats.mergedStructuredSegments = mergedIds.size;
  return { stats, errors };
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function getFixtureEntity(document, sourceType) {
  if (!isRecord(document)) return null;
  if (sourceType === 'question_feed_card') {
    return isRecord(document.target) ? document.target : null;
  }
  return document;
}

function getParagraphIds(html) {
  return new Set(
    Array.from(
      html.matchAll(/<p\b[^>]*\bdata-pid=(?:"([^"]+)"|'([^']+)')[^>]*>/gi),
      (match) => match[1] ?? match[2],
    ),
  );
}

export function analyzeSegmentInfos(document, sourceType, html) {
  const entity = getFixtureEntity(document, sourceType);
  const segmentInfos = entity?.segment_infos;
  if (segmentInfos === undefined) return { count: 0, errors: [] };
  if (!Array.isArray(segmentInfos)) {
    return { count: 0, errors: ['segment_infos must be an array'] };
  }

  const paragraphIds = getParagraphIds(html);
  const seenPids = new Set();
  const errors = [];

  segmentInfos.forEach((segment, segmentIndex) => {
    const segmentPath = `segment_infos.${segmentIndex}`;
    if (!isRecord(segment)) {
      errors.push(`${segmentPath} must be an object`);
      return;
    }

    if (typeof segment.pid !== 'string' || !segment.pid) {
      errors.push(`${segmentPath}.pid must be a non-empty string`);
    } else {
      if (seenPids.has(segment.pid)) {
        errors.push(`${segmentPath}.pid duplicates ${segment.pid}`);
      }
      seenPids.add(segment.pid);
      if (!paragraphIds.has(segment.pid)) {
        errors.push(`${segmentPath}.pid ${segment.pid} is absent from content`);
      }
    }

    if (typeof segment.text !== 'string') {
      errors.push(`${segmentPath}.text must be a string`);
      return;
    }
    if (!Array.isArray(segment.marks)) {
      errors.push(`${segmentPath}.marks must be an array`);
      return;
    }

    segment.marks.forEach((mark, markIndex) => {
      const markPath = `${segmentPath}.marks.${markIndex}`;
      if (!isRecord(mark)) {
        errors.push(`${markPath} must be an object`);
        return;
      }

      if (
        !Number.isInteger(mark.start_index) ||
        !Number.isInteger(mark.end_index) ||
        mark.start_index < 0 ||
        mark.end_index < mark.start_index ||
        mark.end_index > segment.text.length
      ) {
        errors.push(
          `${markPath} range ${mark.start_index}:${mark.end_index} is invalid for text length ${segment.text.length}`,
        );
      }

      const interaction = mark.seg_info ?? mark.master_seg_info;
      if (!isRecord(interaction)) {
        errors.push(`${markPath} must contain seg_info or master_seg_info`);
        return;
      }
      if (
        typeof interaction.like_count !== 'number' ||
        typeof interaction.comment_count !== 'number' ||
        typeof interaction.is_like !== 'boolean'
      ) {
        errors.push(`${markPath} contains invalid interaction counters`);
      }
      if (
        interaction.seg_ids !== undefined &&
        (!Array.isArray(interaction.seg_ids) ||
          !interaction.seg_ids.every(
            (segmentId) => typeof segmentId === 'string' && segmentId,
          ))
      ) {
        errors.push(`${markPath}.seg_ids must contain non-empty strings`);
      }
    });
  });

  return { count: segmentInfos.length, errors };
}

export function compareExpected(actual, expected = {}) {
  return Object.entries(expected).flatMap(([key, expectedValue]) => {
    const actualValue = actual[key];
    return actualValue === expectedValue
      ? []
      : [`${key}: expected ${expectedValue}, received ${actualValue}`];
  });
}

export async function loadManifest(manifestPath) {
  const raw = await readFile(manifestPath, 'utf8');
  const manifest = JSON.parse(raw);
  if (manifest.version !== 2 || !Array.isArray(manifest.cases)) {
    throw new Error(`Unsupported fixture manifest: ${manifestPath}`);
  }
  return manifest;
}

export async function analyzeFixtureCase(fixtureCase, manifestPath) {
  const filePath = path.resolve(path.dirname(manifestPath), fixtureCase.file);
  const { content, document, structuredPages } = await loadFixtureSource(
    filePath,
    fixtureCase.contentPath,
    false,
    fixtureCase.sourceType === 'structured_content',
  );
  let stats;
  let analysisErrors;
  if (structuredPages) {
    ({ stats, errors: analysisErrors } =
      analyzeStructuredContentPages(structuredPages));
  } else {
    const segmentAnalysis = analyzeSegmentInfos(
      document,
      fixtureCase.sourceType,
      content,
    );
    stats = {
      ...analyzeHtml(content),
      segmentInfos: segmentAnalysis.count,
    };
    analysisErrors = segmentAnalysis.errors;
  }
  return {
    ...fixtureCase,
    filePath,
    stats,
    errors: [
      ...compareExpected(stats, fixtureCase.expected),
      ...(document
        ? compareExpectedMetadata(document, fixtureCase.expectedMetadata)
        : []),
      ...analysisErrors,
    ],
  };
}

async function listFixtureFiles(directoryPath) {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const nestedFiles = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directoryPath, entry.name);
      if (entry.isDirectory()) return listFixtureFiles(entryPath);
      if (entry.name.toLowerCase() === 'readme.md') return [];
      return entry.name.toLowerCase().endsWith(JSON_FIXTURE_EXTENSION)
        ? [entryPath]
        : [];
    }),
  );
  return nestedFiles.flat().sort();
}

export async function analyzeFixtureDirectory(directoryPath) {
  const filePaths = await listFixtureFiles(directoryPath);
  const results = [];

  for (const filePath of filePaths) {
    const { content, document, structuredPages } = await loadFixtureSource(
      filePath,
      undefined,
      true,
    );
    const relativePath = path.relative(directoryPath, filePath);
    if (structuredPages) {
      const analysis = analyzeStructuredContentPages(structuredPages);
      results.push({
        id: `inbox:${relativePath}`,
        filePath,
        sourceType: 'structured_content',
        traits: [document.source, 'structured-content'],
        ...analysis,
      });
      continue;
    }
    const segmentAnalysis = analyzeSegmentInfos(
      document,
      document?.type,
      content,
    );
    results.push({
      id: `inbox:${relativePath}`,
      filePath,
      sourceType: 'unregistered',
      traits: [],
      stats: {
        ...analyzeHtml(content),
        segmentInfos: segmentAnalysis.count,
      },
      errors: segmentAnalysis.errors,
    });
  }

  return results;
}
