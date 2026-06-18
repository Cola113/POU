import manualSource from './工程手册.md?raw';

export type ManualPage = {
  id: string;
  title: string;
  baseTitle?: string;
  level: 1 | 2;
  chapter?: string;
  lines: string[];
  kind?: 'content' | 'directory';
  directoryEntries?: ManualDirectoryEntry[];
  directoryPageNumber?: number;
  directoryPageCount?: number;
};

export type ManualTocEntry = {
  title: string;
  pageIndex: number;
  level: 1 | 2;
  chapter?: string;
  kind?: 'content' | 'directory';
};

export type ManualDirectoryEntry = {
  title: string;
  pageIndex: number;
  level: 1 | 2;
  chapter?: string;
};

export type ManualKeyword = {
  term: string;
  pageIndex: number;
};

const CUSTOM_MANUAL_LINKS: [term: string, target: string][] = [
  ['工程手册', 'POU 深海设施工程手册'],
  ['手册', 'POU 深海设施工程手册'],
  ['子午线站', '1.1 子午线站基本参数'],
  ['Meridian Abyssal Station', '1.1 子午线站基本参数'],
  ['深海站', '1.1 子午线站基本参数'],
  ['热盐噪声带', '1.2 建站目的与任务范围'],
  ['声学异常', '1.2 建站目的与任务范围'],
  ['站体布置', '1.3 站体布置总览'],
  ['水密区', '1.3 站体布置总览'],
  ['低频共振', '1.4 环境条件与设计边界'],
  ['封闭环境', '1.4 环境条件与设计边界'],
  ['对接舱', '2.1 对接舱与减压过渡区'],
  ['减压过渡区', '2.1 对接舱与减压过渡区'],
  ['生活舱', '2.2 生活舱'],
  ['餐舱', '2.3 餐舱与储备区'],
  ['储备区', '2.3 餐舱与储备区'],
  ['热风口', '2.3 餐舱与储备区'],
  ['医疗舱', '2.4 医疗舱'],
  ['通讯室', '2.5 通讯室'],
  ['月窗同步终端', '2.5 通讯室'],
  ['离线缓存阵列', '2.5 通讯室'],
  ['工程舱', '2.6 工程舱'],
  ['动力舱', '2.7 动力舱'],
  ['反应堆', '2.7 动力舱'],
  ['观测穹顶', '2.8 观测穹顶'],
  ['外部作业接口', '2.9 外部作业接口'],
  ['逃生舱', '2.10 逃生舱与应急浮升单元'],
  ['应急浮升单元', '2.10 逃生舱与应急浮升单元'],
  ['站长', '3.1 站长'],
  ['通讯员', '3.2 通讯员'],
  ['工程师', '3.3 工程师'],
  ['医疗官', '3.4 医疗官'],
  ['物资与生活保障员', '3.5 物资与生活保障员'],
  ['科学观察员', '3.6 科学观察员 / 取样员'],
  ['取样员', '3.6 科学观察员 / 取样员'],
  ['标准作息', '4.1 标准作息'],
  ['巡检', '4.2 巡检制度'],
  ['舱门', '4.3 舱门与水密隔离'],
  ['水密隔离', '4.3 舱门与水密隔离'],
  ['氧耗', '4.4 氧耗、湿度与温控管理'],
  ['湿度', '4.4 氧耗、湿度与温控管理'],
  ['温控', '4.4 氧耗、湿度与温控管理'],
  ['噪声', '4.5 噪声与振动记录'],
  ['振动记录', '4.5 噪声与振动记录'],
  ['私人物品', '4.6 私人物品与公共空间'],
  ['动物陪伴项目', '4.7 动物陪伴项目管理'],
  ['陪伴动物', '4.7 动物陪伴项目管理'],
  ['mer', '4.7 动物陪伴项目管理'],
  ['通讯限制', '5.1 通讯限制说明'],
  ['月窗期', '5.2 月窗期定义'],
  ['月窗', '5.2 月窗期定义'],
  ['月报', '5.3 月报格式'],
  ['上传队列', '5.4 上传队列管理'],
  ['离线缓存', '5.6 离线缓存与故障处理'],
  ['生命保障系统', '6.1 生命保障系统'],
  ['动力系统', '6.2 动力系统'],
  ['水循环', '6.3 水循环与废弃物处理'],
  ['废弃物处理', '6.3 水循环与废弃物处理'],
  ['热管理系统', '6.4 热管理系统'],
  ['外壳压力', '6.5 外壳压力监测'],
  ['穹顶维护', '6.6 观测穹顶维护'],
  ['深潜器', '6.7 深潜器对接维护'],
  ['入站适应期', '7.1 入站适应期'],
  ['睡眠监测', '7.2 睡眠监测'],
  ['氧分压', '7.3 氧分压与认知状态'],
  ['认知状态', '7.3 氧分压与认知状态'],
  ['心理稳定', '7.6 心理稳定项目'],
  ['心理稳定项目', '7.6 心理稳定项目'],
  ['轮换周期', '8.1 轮换周期'],
  ['接收确认', '8.2 接收确认流程'],
  ['交接', '8.2 接收确认流程'],
  ['设备交接', '8.3 设备交接'],
  ['库存交接', '8.4 库存交接'],
  ['心理档案', '8.5 医疗与心理档案交接'],
  ['离站前清理', '8.6 离站前清理要求'],
  ['火灾', '9.1 火灾'],
  ['进水', '9.2 进水'],
  ['供氧异常', '9.3 供氧异常'],
  ['通讯中断', '9.4 通讯中断'],
  ['动力降级', '9.5 动力降级'],
  ['人员失能', '9.6 人员失能'],
  ['强制撤离', '9.7 强制撤离'],
  ['标准月报模板', '附录 A：标准月报模板'],
  ['每日巡检表', '附录 B：每日巡检表'],
  ['氧耗记录表', '附录 C：氧耗记录表'],
  ['水密门状态码', '附录 D：水密门状态码'],
  ['月窗时间换算表', '附录 E：月窗时间换算表'],
  ['常用故障码', '附录 F：常用故障码'],
  ['个人物品建议清单', '附录 G：驻站个人物品建议清单'],
  ['陪伴动物管理记录表', '附录 H：陪伴动物管理记录表'],
];

const DIRECTORY_INSERT_INDEX = 2;
const DIRECTORY_ENTRIES_PER_PAGE = 10;
const CONTENT_PAGE_MAX_COST = 17;

function normalizeTitle(title: string) {
  return title.replace(/\s+/g, '').replace(/[《》"“”]/g, '').trim();
}

function stripSectionNumber(title: string) {
  return title
    .replace(/^\d+(?:\.\d+)*\s*/, '')
    .replace(/^附录\s+[A-Z]：\s*/, '')
    .trim();
}

function slugify(title: string, index: number) {
  return `${index + 1}-${normalizeTitle(title).replace(/[^\w\u4e00-\u9fff-]+/g, '-')}`;
}

function headingTitle(line: string) {
  const match = line.match(/^#{1,3}\s+(.+)$/);
  return match?.[1]?.trim() || '';
}

function findLineIndex(lines: string[], predicate: (line: string) => boolean, start = 0) {
  for (let index = start; index < lines.length; index += 1) {
    if (predicate(lines[index])) return index;
  }
  return -1;
}

function pushPage(
  pages: ManualPage[],
  title: string,
  level: 1 | 2,
  lines: string[],
  chapter?: string,
) {
  pages.push({
    id: slugify(title, pages.length),
    title,
    level,
    chapter,
    lines: lines.filter(line => !/^---+$/.test(line.trim())),
  });
}

type ManualBlock = {
  lines: string[];
  cost: number;
};

function estimateLineCost(line: string) {
  const trimmed = line.trim();
  if (!trimmed) return 0.3;
  if (trimmed.startsWith('|') && trimmed.endsWith('|')) return 1.05;
  if (/^#{1,3}\s+/.test(trimmed)) return 1.8;
  if (/^>\s?/.test(trimmed)) return 1.2 + trimmed.length / 72;
  if (/^(\d+\.|-)\s+/.test(trimmed)) return 1 + trimmed.length / 58;
  return Math.max(1.15, Math.ceil(trimmed.length / 34) * 1.05);
}

function estimateBlockCost(lines: string[]) {
  return lines.reduce((sum, line) => sum + estimateLineCost(line), 0);
}

function collectManualBlocks(lines: string[]): ManualBlock[] {
  const blocks: ManualBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      const tableLines: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith('|') && lines[index].trim().endsWith('|')) {
        tableLines.push(lines[index]);
        index += 1;
      }
      blocks.push({ lines: tableLines, cost: estimateBlockCost(tableLines) });
      continue;
    }

    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith('>')) {
        quoteLines.push(lines[index]);
        index += 1;
      }
      blocks.push({ lines: quoteLines, cost: estimateBlockCost(quoteLines) });
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const listLines: string[] = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index].trim())) {
        listLines.push(lines[index]);
        index += 1;
      }
      blocks.push({ lines: listLines, cost: estimateBlockCost(listLines) });
      continue;
    }

    if (/^-\s+/.test(trimmed)) {
      const listLines: string[] = [];
      while (index < lines.length && /^-\s+/.test(lines[index].trim())) {
        listLines.push(lines[index]);
        index += 1;
      }
      blocks.push({ lines: listLines, cost: estimateBlockCost(listLines) });
      continue;
    }

    blocks.push({ lines: [line], cost: estimateLineCost(line) });
    index += 1;
  }

  return blocks;
}

function paginateContentPage(page: ManualPage): ManualPage[] {
  const blocks = collectManualBlocks(page.lines);
  if (blocks.length === 0) return [page];

  const paginated: ManualPage[] = [];
  let currentLines: string[] = [];
  let currentCost = 0;

  const flush = () => {
    if (currentLines.length === 0) return;
    const continuationNumber = paginated.length + 1;
    const isContinuation = paginated.length > 0;
    const title = isContinuation ? `${page.title}（续 ${continuationNumber}）` : page.title;

    paginated.push({
      ...page,
      id: slugify(title, paginated.length),
      title,
      baseTitle: page.baseTitle || page.title,
      lines: currentLines,
    });
    currentLines = [];
    currentCost = 0;
  };

  for (const block of blocks) {
    if (currentLines.length > 0 && currentCost + block.cost > CONTENT_PAGE_MAX_COST) {
      flush();
    }
    currentLines.push(...block.lines);
    currentCost += block.cost;
  }

  flush();
  return paginated;
}

function createManualPages(source: string): ManualPage[] {
  const contentPages = createContentPages(source).flatMap(paginateContentPage);
  const insertIndex = Math.min(DIRECTORY_INSERT_INDEX, contentPages.length);
  const directoryPageCount = Math.max(1, Math.ceil(contentPages.length / DIRECTORY_ENTRIES_PER_PAGE));
  const finalContentPageIndex = (contentPageIndex: number) => (
    contentPageIndex < insertIndex
      ? contentPageIndex
      : contentPageIndex + directoryPageCount
  );
  const directoryEntries = contentPages.map((page, contentPageIndex) => ({
    title: page.title,
    pageIndex: finalContentPageIndex(contentPageIndex),
    level: page.level,
    chapter: page.chapter,
  }));
  const directoryPages: ManualPage[] = [];

  for (let index = 0; index < directoryPageCount; index += 1) {
    const title = index === 0 ? '目录' : `目录 ${index + 1}`;
    directoryPages.push({
      id: slugify(title, insertIndex + index),
      title,
      level: 1,
      lines: [],
      kind: 'directory',
      directoryEntries: directoryEntries.slice(
        index * DIRECTORY_ENTRIES_PER_PAGE,
        (index + 1) * DIRECTORY_ENTRIES_PER_PAGE,
      ),
      directoryPageNumber: index + 1,
      directoryPageCount,
    });
  }

  return [
    ...contentPages.slice(0, insertIndex),
    ...directoryPages,
    ...contentPages.slice(insertIndex),
  ];
}

function createContentPages(source: string): ManualPage[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const registrationStart = findLineIndex(lines, line => /^##\s+发放与登记页/.test(line));
  const tocStart = findLineIndex(lines, line => /^#\s+目录/.test(line));
  const firstChapterStart = findLineIndex(lines, line => /^#\s+第一章/.test(line));
  const pages: ManualPage[] = [];

  if (registrationStart > 0) {
    pushPage(pages, headingTitle(lines[0]) || 'POU 深海设施工程手册', 1, lines.slice(1, registrationStart));
  }

  if (registrationStart >= 0 && tocStart > registrationStart) {
    pushPage(pages, '发放与登记页', 1, lines.slice(registrationStart + 1, tocStart));
  }

  let chapter = '';
  let index = firstChapterStart >= 0 ? firstChapterStart : 0;
  while (index < lines.length) {
    const line = lines[index];

    if (/^#\s+/.test(line)) {
      const title = headingTitle(line);
      if (title.startsWith('附录 ')) {
        const next = findLineIndex(lines, candidate => /^#\s+/.test(candidate), index + 1);
        const end = next === -1 ? lines.length : next;
        pushPage(pages, title, 1, lines.slice(index + 1, end));
        index = end;
        continue;
      }

      chapter = title;
      index += 1;
      continue;
    }

    if (/^##\s+/.test(line)) {
      const title = headingTitle(line);
      const next = findLineIndex(lines, candidate => /^#{1,2}\s+/.test(candidate), index + 1);
      const end = next === -1 ? lines.length : next;
      pushPage(pages, title, 2, lines.slice(index + 1, end), chapter);
      index = end;
      continue;
    }

    index += 1;
  }

  return pages;
}

export const manualPages = createManualPages(manualSource);

const normalizedTitleIndex = new Map<string, number>();
const chapterFirstPageIndex = new Map<string, number>();

manualPages.forEach((page, pageIndex) => {
  const indexTitle = page.baseTitle || page.title;
  const normalizedTitle = normalizeTitle(indexTitle);
  const normalizedPlainTitle = normalizeTitle(stripSectionNumber(indexTitle));
  if (!normalizedTitleIndex.has(normalizedTitle)) {
    normalizedTitleIndex.set(normalizedTitle, pageIndex);
  }
  if (!normalizedTitleIndex.has(normalizedPlainTitle)) {
    normalizedTitleIndex.set(normalizedPlainTitle, pageIndex);
  }
  if (page.chapter && !chapterFirstPageIndex.has(normalizeTitle(page.chapter))) {
    chapterFirstPageIndex.set(normalizeTitle(page.chapter), pageIndex);
  }
});

export function findManualPageByTitle(title: string): number | undefined {
  const normalized = normalizeTitle(title);
  const withoutNumber = normalizeTitle(stripSectionNumber(title));
  const matchedIndex = normalizedTitleIndex.get(normalized)
    ?? normalizedTitleIndex.get(withoutNumber)
    ?? chapterFirstPageIndex.get(normalized);

  if (matchedIndex !== undefined) return matchedIndex;

  const fuzzyIndex = manualPages.findIndex(page => normalizeTitle(page.title).includes(normalized));
  return fuzzyIndex >= 0 ? fuzzyIndex : undefined;
}

export const manualToc: ManualTocEntry[] = manualPages.map((page, pageIndex) => ({
  title: page.title,
  pageIndex,
  level: page.level,
  chapter: page.chapter,
  kind: page.kind,
}));

function addKeyword(keywords: Map<string, number>, term: string, pageIndex: number) {
  const normalizedTerm = term.trim();
  if (normalizedTerm.length < 2) return;
  if (/^\d+(?:\.\d+)*$/.test(normalizedTerm)) return;
  if (!keywords.has(normalizedTerm)) keywords.set(normalizedTerm, pageIndex);
}

function createManualKeywords(): ManualKeyword[] {
  const keywords = new Map<string, number>();

  for (const [term, target] of CUSTOM_MANUAL_LINKS) {
    const pageIndex = findManualPageByTitle(target);
    if (pageIndex !== undefined && pageIndex >= 0) addKeyword(keywords, term, pageIndex);
  }

  manualPages.forEach((page, pageIndex) => {
    if (page.kind === 'directory') return;

    const indexTitle = page.baseTitle || page.title;
    const plainTitle = stripSectionNumber(indexTitle);
    addKeyword(keywords, indexTitle, pageIndex);
    addKeyword(keywords, plainTitle, pageIndex);

    for (const part of plainTitle.split(/[、与及/ ]+/)) {
      addKeyword(keywords, part, pageIndex);
    }
  });

  return [...keywords.entries()]
    .map(([term, pageIndex]) => ({ term, pageIndex }))
    .sort((a, b) => b.term.length - a.term.length || a.term.localeCompare(b.term, 'zh-Hans-CN'));
}

export const manualKeywords = createManualKeywords();

export function findManualTermTarget(term: string): number | undefined {
  return manualKeywords.find(keyword => keyword.term === term)?.pageIndex;
}
