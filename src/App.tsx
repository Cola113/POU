import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { storyNodes } from './data/story';
import { useGame } from './hooks/useGame';
import {
  findManualPageByTitle,
  findManualTermTarget,
  manualKeywords,
  manualPages,
  manualToc,
} from './manual';
import type { ManualDirectoryEntry } from './manual';
import type { DisplayMessage, GameTimeInfo, StoryChoice, StoryNode } from './types/game';

const DYNAMIC_NUMBER_PATTERN = /(\d{1,3}(?:,\d{3})+|\d{4,})/g;
const DYNAMIC_NUMBER_EXACT_PATTERN = new RegExp(`^${DYNAMIC_NUMBER_PATTERN.source}$`);
const DEV_NODE_OPTIONS = Object.values(storyNodes).map(node => ({
  id: node.id,
  label: `${node.id} · ${node.location}`,
}));

type PouDevWindow = Window & {
  POU_DEV?: {
    nodes: string[];
    jumpToNode: (nodeId: string) => void;
  };
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const MANUAL_TEXT_PATTERN = manualKeywords.length > 0
  ? new RegExp(`${DYNAMIC_NUMBER_PATTERN.source}|${manualKeywords.map(keyword => escapeRegExp(keyword.term)).join('|')}`, 'g')
  : DYNAMIC_NUMBER_PATTERN;
const MANUAL_TOC_PAGE_INDEX = findManualPageByTitle('目录') ?? 0;

type ChoiceRecord = {
  nodeId: string;
  choiceIndex: number;
  choiceText: string;
  resolvedChoiceText?: string;
  resolutionText?: string;
};

type PersonalityTrait = 'empathy' | 'control' | 'caution' | 'curiosity' | 'survival';

type ActionResolution = {
  choiceIndex: number;
  resolution: string;
};

type BriefingInfo = {
  objective: string;
  clue?: string;
};

type TaskEventKind = 'started' | 'updated' | 'completed' | 'interrupted' | 'final';

type TaskEvent = {
  kind: TaskEventKind;
  title: string;
  detail: string;
};

type TaskInfo = {
  title: string;
  objective: string;
  event?: TaskEvent;
};

type BriefingUpdate = {
  id: string;
  title: string;
  text: string;
  triggerText: string;
};

type CharacterGroup = 'second' | 'first' | 'animal';

type RevealCondition = {
  always?: boolean;
  nodeId?: string;
  triggerText?: string;
};

type CharacterFact = {
  id: string;
  text: string;
  reveal?: RevealCondition;
};

type CharacterProfile = {
  id: string;
  name: string;
  group: CharacterGroup;
  groupLabel: string;
  reveal: RevealCondition;
  facts: CharacterFact[];
};

type RevealedCharacterProfile = Omit<CharacterProfile, 'reveal' | 'facts'> & {
  facts: CharacterFact[];
};

const STORY_BRIEFING_UPDATES: BriefingUpdate[] = [
  {
    id: 'mission',
    title: '身份与任务',
    text: '你是伊恩，POU 第二批接收成员。本轮任务是抵达子午线站，完成三年轮换交接、设备确认与后续值守。',
    triggerText: '【任务简报：你是伊恩',
  },
  {
    id: 'first-crew',
    title: '第一批人员',
    text: '第一批人员仍能执行交接，但他们的反应过度规整，像在遵守某套被反复训练过的规则。',
    triggerText: '【观察记录：第一批人员仍能执行交接',
  },
  {
    id: 'breathing-cycle',
    title: '47 分钟共振',
    text: '站体每 47 分钟出现一次低频共振。工程手册称其为潮汐共振，但它发生前，人会异常惊醒。',
    triggerText: '工程手册上管这叫"潮汐共振"',
  },
  {
    id: 'learned-breath',
    title: '回应风险',
    text: '异常会模仿人的呼吸和声音。越主动回应，它越容易借你的记忆补全下一句话。',
    triggerText: '后来你发现，它比你慢了半拍。',
  },
  {
    id: 'plates',
    title: '餐盘警告',
    text: '破损频道提到“数餐盘”。第一批四个人的餐具都摆着，食物却没有被碰过。',
    triggerText: '第一批四个人的餐具都摆着',
  },
  {
    id: 'mer-route',
    title: 'mer 的路线',
    text: 'mer 比人更早避开观测穹顶。它的反应可能比站控记录更可靠。',
    triggerText: '直到第 15 个月，它开始刻意绕开那条走廊。',
  },
  {
    id: 'built-in',
    title: '建站目的',
    text: '取样流程从建站设计阶段就存在。子午线站可能不是偶然发现异常，而是被设计成接触它的接口。',
    triggerText: '取样流程不是后来补的。',
  },
  {
    id: 'monthly-reports',
    title: '月报异常',
    text: '第 14 个月后，月报被改写得过分稳定。真正的异常记录可能被拦截、覆盖或发回站内。',
    triggerText: '从第 14 个月之后的所有月报',
  },
  {
    id: 'echo-chamber',
    title: '回声室',
    text: '动力舱下方存在图纸上没有的回声室，里面有八套固定架，像是为两批人员准备的流程终点。',
    triggerText: '八套连着粗大管线的固定架',
  },
];

const NODE_TASKS: Record<string, TaskInfo> = {
  opening: {
    title: '接收异常信号',
    objective: '确认外溢信号的内容，弄清它为什么会指向子午线站。',
    event: {
      kind: 'started',
      title: '接收异常信号',
      detail: '外溢信号已接入。先听完破损频道留下的警告。',
    },
  },
  arrival: {
    title: '完成深潜对接',
    objective: '抵达子午线站，完成深潜器对接和第二批接收确认。',
    event: {
      kind: 'updated',
      title: '任务更新：完成对接',
      detail: '深潜器抵近子午线站。当前目标切换为对接与接收确认。',
    },
  },
  handover_vera: {
    title: '按流程交接',
    objective: '按薇拉要求完成报到，观察生活舱和站长流程是否异常。',
    event: {
      kind: 'completed',
      title: '对接完成',
      detail: '第二批已进入站体。交接任务转入站内流程确认。',
    },
  },
  handover_deck: {
    title: '核对通讯月报',
    objective: '先核对德克的通讯月报，寻找第 14 个月后的记录异常。',
    event: {
      kind: 'completed',
      title: '对接完成',
      detail: '第二批已进入站体。交接任务转入通讯记录核查。',
    },
  },
  handover_mer: {
    title: '安置 mer',
    objective: '帮拉尔夫安置 mer，注意它避开的通道和区域。',
    event: {
      kind: 'completed',
      title: '对接完成',
      detail: '第二批已进入站体。交接任务转入随站动物安置。',
    },
  },
  first_night: {
    title: '继续交接值夜',
    objective: '完成值夜前交接，保持警觉，等待第一晚是否出现异常。',
    event: {
      kind: 'completed',
      title: '交接阶段完成',
      detail: '白天交接告一段落。当前任务切换为首夜值守。',
    },
  },
  first_night_sophie: {
    title: '调查穹顶异响',
    objective: '前往观测穹顶，确认苏菲、敲击声和玻璃掌印的关系。',
    event: {
      kind: 'updated',
      title: '任务更新：调查异响',
      detail: '敲击声与穹顶监控同时异常。优先确认苏菲状态。',
    },
  },
  first_night_yuri: {
    title: '医疗频道求证',
    objective: '通过医疗频道叫醒尤里，判断声音是否影响了其他成员。',
    event: {
      kind: 'updated',
      title: '任务更新：调查异响',
      detail: '敲击声可能影响多人。优先通过医疗频道确认。',
    },
  },
  first_night_watch: {
    title: '回看监控',
    objective: '留在房间复查监控记录，确认敲击是否改写设备时间轴。',
    event: {
      kind: 'updated',
      title: '任务更新：调查异响',
      detail: '敲击声已进入监控记录。优先核对设备回放。',
    },
  },
  morning_ration: {
    title: '核对餐舱异常',
    objective: '在餐舱对照破损频道警告，确认第一批的日常是否真实。',
    event: {
      kind: 'completed',
      title: '首夜调查记录完成',
      detail: '第一晚异常已记录。任务切换为餐舱和第一批日常核查。',
    },
  },
  ralf_mer: {
    title: '追问 mer 的路线',
    objective: '向拉尔夫确认 mer 从什么时候开始避开观测穹顶。',
    event: {
      kind: 'updated',
      title: '任务更新：安置线索',
      detail: 'mer 的反应可能比人类报告更可靠。追问它的行动变化。',
    },
  },
  erin_scan: {
    title: '分析氧耗曲线',
    objective: '让艾琳解释站体氧耗曲线，判断 47 分钟周期是否来自结构系统。',
    event: {
      kind: 'updated',
      title: '任务更新：工程线索',
      detail: '氧耗曲线和站体结构异常相关。转入工程舱分析。',
    },
  },
  collar_log: {
    title: '读取项圈记录',
    objective: '检查 mer 项圈里的旧定位记录，寻找站控无法改写的路线证据。',
    event: {
      kind: 'updated',
      title: '任务更新：定位线索',
      detail: '项圈记录可能保留未被站控修正的行动轨迹。',
    },
  },
  day3_dive: {
    title: '执行外部取样',
    objective: '随艾琳下潜取样，确认海床异常和建站设计是否有关。',
    event: {
      kind: 'started',
      title: '外部取样开始',
      detail: '调查从站内转向站外。目标：确认海床异常是否被预先纳入建站协议。',
    },
  },
  monthly_window: {
    title: '取样中断，改查通讯',
    objective: '取样失败后回站，利用月窗前时间检查通讯缓存和旧月报。',
    event: {
      kind: 'interrupted',
      title: '取样中断',
      detail: '外部取样失败。任务更改为回站检查月窗、通讯缓存与旧月报。',
    },
  },
  comm_decrypt: {
    title: '解密旧月报',
    objective: '解密第 14 个月后的旧月报，寻找第一批失控前的真实记录。',
    event: {
      kind: 'updated',
      title: '任务更新：解密月报',
      detail: '月窗前优先追查第 14 个月后的记录断层。',
    },
  },
  deck_confession: {
    title: '追问德克',
    objective: '当面追问德克，弄清真正月报被发出、拦截或退回的过程。',
    event: {
      kind: 'updated',
      title: '任务更新：追问通讯员',
      detail: '德克可能知道真实月报的去向。优先逼问。',
    },
  },
  hide_copy: {
    title: '隐藏证据副本',
    objective: '把证据藏进即将发送的压缩包，测试系统是否会主动改写。',
    event: {
      kind: 'updated',
      title: '任务更新：尝试外发证据',
      detail: '月窗即将打开。尝试把证据混入上传队列。',
    },
  },
  echo_chamber: {
    title: '确认隐藏回声室',
    objective: '前往动力舱下方，确认公开图纸上不存在的空间。',
    event: {
      kind: 'completed',
      title: '通讯线索完成',
      detail: '月报线索指向动力舱下方。任务切换为确认隐藏回声室。',
    },
  },
  final_siege: {
    title: '撤离或反制',
    objective: '出口被关闭前，选择反制、逃生，或停下来听完。',
    event: {
      kind: 'interrupted',
      title: '撤离路线被封锁',
      detail: '站体关闭出口。常规撤离中断，任务进入最终抉择。',
    },
  },
  ending_reactor: {
    title: '最终任务：过载反应堆',
    objective: '前往动力舱，尝试用反应堆过载摧毁站体协议，并确认最终通信目标。',
    event: {
      kind: 'final',
      title: '最终任务：过载反应堆',
      detail: '选择反制路线。确认反应堆过载后，信号会被送往哪里。',
    },
  },
  ending_escape: {
    title: '最终任务：逃出生天',
    objective: '前往逃生舱，尝试强制上浮，并确认最终通信目标。',
    event: {
      kind: 'final',
      title: '最终任务：逃出生天',
      detail: '选择逃生路线。确认强制上浮后，信号会被送往哪里。',
    },
  },
  ending_listen: {
    title: '最终任务：听它说完',
    objective: '停下来听完那句话，确认回应声音会造成什么后果，并确认最终通信目标。',
    event: {
      kind: 'final',
      title: '最终任务：听它说完',
      detail: '选择倾听路线。确认回应之后，信号会被送往哪里。',
    },
  },
};

const NODE_BRIEFINGS: Record<string, BriefingInfo> = {
  opening: {
    objective: '确认外溢信号的来源，并回到事件开始前。',
    clue: '破损频道反复警告：不要回答，不要接线，不要敲第四下。',
  },
  arrival: {
    objective: '完成接收交接，并从第一批站员身上找出异常。',
    clue: '第一批四个人过分平静，像是在执行某种早已排练好的交接。',
  },
  handover_vera: {
    objective: '观察薇拉的生活舱管理方式，判断她在害怕什么。',
    clue: '生活舱被清理得太干净，个人痕迹几乎被抹掉。',
  },
  handover_deck: {
    objective: '核对通讯记录，寻找月报异常的起点。',
    clue: '第 14 个月后，月报格式变得异常稳定。',
  },
  handover_mer: {
    objective: '安置 mer，并注意它避开的区域。',
    clue: 'mer 对走廊深处有明显警觉，动物比人更早察觉到危险。',
  },
  first_night: {
    objective: '处理第一晚的敲击声，决定先追查哪条线索。',
    clue: '敲击声不是来自门，而是从更远的站体结构里传来。',
  },
  first_night_sophie: {
    objective: '去观测穹顶确认苏菲和掌印的异常。',
    clue: '苏菲认为穹顶不是窗，而像能听见站内声音的耳膜。',
  },
  first_night_yuri: {
    objective: '通过医疗线索判断声音是否影响了所有人。',
    clue: '尤里也听见了已故亲人的声音，异常不是单人幻觉。',
  },
  first_night_watch: {
    objective: '复查监控，确认敲击是否影响设备记录。',
    clue: '监控时间轴会回退，重播行为像是在帮异常校准坐标。',
  },
  morning_ration: {
    objective: '在餐舱对照昨晚警告，确认第一批的日常是否真实。',
    clue: '第一批的餐具摆放整齐，食物却没有被碰过。',
  },
  ralf_mer: {
    objective: '追问拉尔夫和 mer 的驻站记录。',
    clue: 'mer 从第 15 个月开始避开观测穹顶，后来几乎不离开生活舱。',
  },
  erin_scan: {
    objective: '让艾琳解释站体结构和氧耗曲线。',
    clue: '站体氧耗每 47 分钟出现一次周期性波峰。',
  },
  collar_log: {
    objective: '检查 mer 项圈里的旧定位记录。',
    clue: '项圈记录能绕过被篡改的站控叙事，留下生活路线证据。',
  },
  day3_dive: {
    objective: '随艾琳外出取样，确认海床异常和建站设计是否有关。',
    clue: '取样流程从建站设计阶段就被写入，说明 POU 早知道下方有什么。',
  },
  monthly_window: {
    objective: '利用月窗前的时间，决定怎么处理月报和证据。',
    clue: '第 14 个月后的月报没有附件，文本稳定得不正常。',
  },
  comm_decrypt: {
    objective: '解密旧月报，寻找第一批失控前的真实记录。',
    clue: '旧记录显示第一批曾建议撤站，后来语气被改写成继续观察。',
  },
  deck_confession: {
    objective: '逼问德克，弄清真正月报去了哪里。',
    clue: '有些月报被系统拦下，有些甚至被改写后发回站内。',
  },
  hide_copy: {
    objective: '尝试把证据藏进上传队列。',
    clue: '系统会主动把异常证据改写成合理、稳定、无害的叙述。',
  },
  echo_chamber: {
    objective: '进入动力舱下方，确认图纸上不存在的空间。',
    clue: '动力舱下方有回声室和八套固定架，新旧两批人员都被纳入了某种流程。',
  },
  final_siege: {
    objective: '在出口被关闭前做最终选择：反制、逃生，或听它说完。',
    clue: '第一批堵住通道，站体正在把你的选择纳入循环。',
  },
  ending_reactor: {
    objective: '查看结局记录，并理解反应堆过载后信号为什么会指向深潜器。',
    clue: '反应堆过载没有毁掉协议，反而把伊恩接到通讯席，通信目标显示为第二批深潜器。',
  },
  ending_escape: {
    objective: '查看结局记录，并理解强制上浮后信号为什么会指向深潜器。',
    clue: '逃生舱执行了“上浮”的词，却没有抵达真正的海面，最终仍接入通讯席。',
  },
  ending_listen: {
    objective: '查看结局记录，并理解回应声音后信号为什么会指向深潜器。',
    clue: '停下倾听等于替它敲下第四声，让自我边界瓦解，并被接入通讯席。',
  },
};

const CHARACTER_PROFILES: CharacterProfile[] = [
  {
    id: 'ian',
    name: '伊恩',
    group: 'second',
    groupLabel: '第二批 · 接收成员',
    reveal: { triggerText: '【任务简报：你是伊恩' },
    facts: [
      { id: 'role', text: 'POU 第二批接收成员，本轮任务记录的主视角。' },
      { id: 'temperament', text: '熟悉交接流程，习惯先观察，再把异常写成可复查的记录。' },
      { id: 'window', text: '深潜途中很少看舷窗；这个回避动作没有写进公开任务档案。', reveal: { triggerText: '你坐在靠近舷窗的位置' } },
      { id: 'river', text: '“河”相关记忆会被异常精准触发，且从未出现在入职档案里。', reveal: { triggerText: '河……不可能' } },
    ],
  },
  {
    id: 'marco',
    name: '马可',
    group: 'second',
    groupLabel: '第二批 · 工程成员',
    reveal: { triggerText: '推进器还剩 18%' },
    facts: [
      { id: 'role', text: '负责推进器、机械臂和现场硬件判断。' },
      { id: 'temperament', text: '嘴快、爱讽刺，用玩笑压住恐惧；越紧张越想把事情拆成可操作步骤。' },
      { id: 'mechanical-fear', text: '真正害怕的不是机械失灵，而是机械仍正常工作，却在替别的东西完成动作。', reveal: { triggerText: '马可害怕的不是声音' } },
      { id: 'hope', text: '对外发证据仍抱有强烈期待，默认岸上至少还有人愿意看见真相。', reveal: { triggerText: '深海异常原始数据发出去' } },
    ],
  },
  {
    id: 'erin',
    name: '艾琳',
    group: 'second',
    groupLabel: '第二批 · 结构分析',
    reveal: { triggerText: '省点力气。子午线站卡在热盐噪声带上' },
    facts: [
      { id: 'role', text: '负责结构图纸、协议编号和站体曲线分析。' },
      { id: 'temperament', text: '冷静、锋利，讨厌没有工程解释的稳定。' },
      { id: 'cavity', text: '发现动力舱正下方存在公开图纸没有标出的球状空腔。', reveal: { triggerText: '球状空腔' } },
      { id: 'breather', text: '最早把海床异常命名为“呼吸者”。', reveal: { triggerText: '我们可以暂时叫它' } },
      { id: 'mother', text: '外部取样时听见了母亲弥留之际的声音。', reveal: { triggerText: '我听见的是……我母亲弥留之际的声音' } },
    ],
  },
  {
    id: 'yuri',
    name: '尤里',
    group: 'second',
    groupLabel: '第二批 · 医疗成员',
    reveal: { triggerText: '三年轮换。第一批那几位终于熬到头了' },
    facts: [
      { id: 'role', text: '负责睡眠、脑电和生命体征判断。' },
      { id: 'temperament', text: '嘴硬但谨慎，愿意把“医学巧合”撕开来看。' },
      { id: 'father', text: '同样听见已故亲人的声音，来源感像从骨缝里钻出。', reveal: { triggerText: '听见了我父亲叫我小名' } },
      { id: 'rem', text: '确认多人 REM 睡眠峰值出现异常同步。', reveal: { triggerText: 'REM 睡眠峰值' } },
      { id: 'thinking-risk', text: '认为讨论和分析会给异常留下模仿时间。', reveal: { triggerText: '我们一思考，它就有了模仿的时间' } },
    ],
  },
  {
    id: 'vera',
    name: '薇拉',
    group: 'first',
    groupLabel: '第一批 · 公开档案',
    reveal: { triggerText: '通道尽头站着第一批的四个人' },
    facts: [
      { id: 'commander', text: '第一批驻站指挥官。' },
      { id: 'gender', text: '女性。' },
      { id: 'public-role', text: 'POU 深海设施交接规程示范官，内部培训材料里经常被引用。' },
      { id: 'sterile-life', text: '生活舱管理极端去私人化，反复强调情感锚点会增加耗氧。', reveal: { triggerText: '每一件非任务物品都是一个情感锚点' } },
      { id: 'mer-rejects', text: '试图触碰 mer 时，猫出现强烈抗拒。', reveal: { triggerText: '薇拉的手停在半空' } },
      { id: 'month-four', text: '第 4 个月曾建议暂停接触实验并准备撤站。', reveal: { triggerText: '第 4 个月 · 薇拉' } },
      { id: 'month-nine', text: '第 9 个月记录被覆盖，语气从撤站转为继续观察。', reveal: { triggerText: '第 9 个月 · 薇拉' } },
      { id: 'protocol', text: '最终阶段会把反抗解释成协议步骤，像在替系统归档人类选择。', reveal: { triggerText: '可过载程序本来就是协议的一部分' } },
    ],
  },
  {
    id: 'deck',
    name: '德克',
    group: 'first',
    groupLabel: '第一批 · 通讯员',
    reveal: { triggerText: '通道尽头站着第一批的四个人' },
    facts: [
      { id: 'role', text: '第一批通讯员，负责月窗和月报上传。' },
      { id: 'chair', text: '对通讯室椅子、扶手凹坑和未同步草稿极度敏感。', reveal: { triggerText: '如果第二批抵达，别让他们睡在外窗附近' } },
      { id: 'warning', text: '曾反复想警告第二批，又反复亲手删掉。', reveal: { triggerText: '我每天都想' } },
      { id: 'reports', text: '确认真正月报有些发出、有些被拦，有些被改写后退回站内。', reveal: { triggerText: '有些的确发出去了' } },
      { id: 'learning', text: '认为求救也是异常学习人类语言最快的方式。', reveal: { triggerText: '求救，是建立联系的最快方式' } },
      { id: 'not-free', text: '清醒不等于自由，只是能看着自己的手继续开门。', reveal: { triggerText: '清醒不是自由' } },
    ],
  },
  {
    id: 'sophie',
    name: '苏菲',
    group: 'first',
    groupLabel: '第一批 · 职务待核',
    reveal: { triggerText: '通道尽头站着第一批的四个人' },
    facts: [
      { id: 'base', text: '第一批站员，公开职务暂未核实。' },
      { id: 'mouth', text: '交接时麻木地盯着你的嘴唇，像在等你说错某个字。', reveal: { triggerText: '苏菲则麻木地盯着你的嘴唇' } },
      { id: 'dome', text: '第一晚光脚站在观测穹顶前，生命体征不符合低温暴露反应。', reveal: { triggerText: '苏菲依然保持着那个姿势' } },
      { id: 'names', text: '认为名字像门牌，喊出名字就等于把门打开。', reveal: { triggerText: '名字是门牌' } },
      { id: 'ear', text: '认为穹顶不是窗，而像一层会听见站内声音的耳膜。', reveal: { triggerText: '穹顶不是窗' } },
      { id: 'replay', text: '监控回放中能直接对伊恩说话，并警告重播会校准坐标。', reveal: { triggerText: '你的每一次重播' } },
    ],
  },
  {
    id: 'ralf',
    name: '拉尔夫',
    group: 'first',
    groupLabel: '第一批 · 职务待核',
    reveal: { triggerText: '通道尽头站着第一批的四个人' },
    facts: [
      { id: 'base', text: '第一批站员，首次接触时怀里抱着 mer。' },
      { id: 'caretaker', text: '对 mer 有强烈保护倾向，明显避开薇拉的视线。', reveal: { triggerText: '人可以犯蠢，但动物不该替人买单' } },
      { id: 'logistics', text: '负责物资记录，能精确到猫粮少了一克。', reveal: { triggerText: '我是管物资的' } },
      { id: 'evacuation', text: '要求撤离时先带 mer 走，且不要先征求薇拉意见。', reveal: { triggerText: '必须撤离……先带它走' } },
      { id: 'final', text: '最终阶段确认 mer 进入保温箱后，选择不再继续跟随。', reveal: { triggerText: 'mer 进保温箱了' } },
    ],
  },
  {
    id: 'mer',
    name: 'mer',
    group: 'animal',
    groupLabel: '随站动物 · 心理稳定项目',
    reveal: { triggerText: '名牌上写着"mer"' },
    facts: [
      { id: 'appearance', text: '英短蓝白，圆脸胖嘟嘟，白下巴、白肚皮和四只白爪子。' },
      { id: 'name', text: '名字使用小写；拉尔夫说它对语气很敏感。', reveal: { triggerText: '它叫 mer，小写' } },
      { id: 'first-contact', text: '安置时会先嗅地板和袖口，确认气味后才舔白爪。', reveal: { triggerText: '确认完你的气味后' } },
      { id: 'dome-avoid', text: '曾经会去观测穹顶睡觉，后来开始坚决避开。', reveal: { triggerText: '它从来不去观测穹顶' } },
      { id: 'empty-corridor', text: '会突然停止呼噜，警觉地转向空无一人的走廊深处。', reveal: { triggerText: '呼噜声突然掐断' } },
      { id: 'food', text: '早餐时闻到食盆后迅速退开，反应像被烫到。', reveal: { triggerText: '它低头闻了闻自己的食盆' } },
      { id: 'months', text: '第 15 个月避开穹顶，第 19 个月缩在生活舱，第 21 个月开始对空椅子打呼噜。', reveal: { triggerText: '到了第 21 个月' } },
      { id: 'collar', text: '项圈定位记录保留了站控叙事之外的行动证据。', reveal: { triggerText: '定位记录 · mer' } },
      { id: 'warmer', text: '最终阶段进入保温箱，门锁显示绿色。', reveal: { triggerText: 'mer 进保温箱了' } },
    ],
  },
];

const PERSONALITY_SUMMARIES: Record<PersonalityTrait | 'balanced', string> = {
  empathy: '你会先回应受苦的人，再考虑自己是否安全，所以呼吸者只要披上一句求救声，就能把你领到玻璃前。',
  control: '你倾向用行动和代价夺回主动权，可真正困住你的，是无法承认有些东西不会被炸毁，只会记住你。',
  caution: '你习惯把异常拆成记录、证据和流程，可越冷静，越会发现恐惧早已按你的笔迹写好了下一步。',
  curiosity: '你会把恐惧当作通往真相的门，因此最危险的答案总能等到你亲手推开。',
  survival: '你清楚活下去比解释一切更重要，可深海最会利用的，正是你把别人留在身后的那一秒。',
  balanced: '你在恐惧里仍试图保留选择，而呼吸者记住的，正是你每一次犹豫后留下的形状。',
};

function createPersonalityScores(): Record<PersonalityTrait, number> {
  return { empathy: 0, control: 0, caution: 0, curiosity: 0, survival: 0 };
}

function addPersonalityScore(
  scores: Record<PersonalityTrait, number>,
  trait: PersonalityTrait,
  value = 1,
) {
  scores[trait] += value;
}

function getPersonalitySummary(choicesMade: ChoiceRecord[]) {
  const scores = createPersonalityScores();

  for (const choice of choicesMade) {
    const text = `${choice.choiceText} ${choice.resolvedChoiceText || ''} ${choice.resolutionText || ''}`;

    if (choice.nodeId === 'arrival') {
      if (choice.choiceIndex === 0) addPersonalityScore(scores, 'control', 2);
      if (choice.choiceIndex === 1) addPersonalityScore(scores, 'caution', 2);
      if (choice.choiceIndex === 2) addPersonalityScore(scores, 'empathy', 2);
    }
    if (choice.nodeId === 'first_night') {
      if (choice.choiceIndex === 0) addPersonalityScore(scores, 'empathy', 3);
      if (choice.choiceIndex === 1) addPersonalityScore(scores, 'caution', 2);
      if (choice.choiceIndex === 2) addPersonalityScore(scores, 'caution', 3);
    }
    if (choice.nodeId === 'final_siege') {
      if (choice.choiceIndex === 0) addPersonalityScore(scores, 'control', 4);
      if (choice.choiceIndex === 1) addPersonalityScore(scores, 'survival', 4);
      if (choice.choiceIndex === 2) {
        addPersonalityScore(scores, 'curiosity', 2);
        addPersonalityScore(scores, 'empathy', 2);
      }
    }

    if (/观察|监控|记录|检查|确认|解密|日志|项圈|证据/.test(text)) addPersonalityScore(scores, 'caution');
    if (/下潜|缓存|隐藏|听|真相|追问|月窗|回声室/.test(text)) addPersonalityScore(scores, 'curiosity');
    if (/握手|问|找|叫醒|苏菲|尤里|拉尔夫|mer|猫|求救/.test(text)) addPersonalityScore(scores, 'empathy');
    if (/流程|反制|反应堆|过载|动力舱|发送|归档/.test(text)) addPersonalityScore(scores, 'control');
    if (/逃生|撤离|上浮|离开|活下去/.test(text)) addPersonalityScore(scores, 'survival');
  }

  const rankedTraits = (Object.entries(scores) as [PersonalityTrait, number][])
    .sort((a, b) => b[1] - a[1]);
  const [topTrait, topScore] = rankedTraits[0];
  const [, secondScore] = rankedTraits[1];

  if (topScore === 0 || topScore === secondScore) {
    return PERSONALITY_SUMMARIES.balanced;
  }

  return PERSONALITY_SUMMARIES[topTrait];
}

function getBriefingInfo(nodeId?: string) {
  return nodeId ? NODE_BRIEFINGS[nodeId] : undefined;
}

function getTaskInfo(nodeId?: string) {
  return nodeId ? NODE_TASKS[nodeId] : undefined;
}

function getTaskEventLabel(kind: TaskEventKind) {
  if (kind === 'completed') return '任务完成';
  if (kind === 'interrupted') return '任务中断';
  if (kind === 'final') return '最终任务';
  if (kind === 'started') return '任务开始';
  return '任务更新';
}

function getTaskLog(history: string[]) {
  return history
    .map(nodeId => {
      const task = getTaskInfo(nodeId);
      return task?.event ? { nodeId, event: task.event } : null;
    })
    .filter((entry): entry is { nodeId: string; event: TaskEvent } => Boolean(entry))
    .slice(-8);
}

function getKnownClues(
  history: string[],
  currentNode: StoryNode | null,
  currentBeatIndex: number,
) {
  const clues: string[] = [];
  const clueSet = new Set<string>();
  const currentNodeComplete = Boolean(currentNode && currentBeatIndex >= currentNode.beats.length);

  for (const nodeId of history) {
    if (nodeId === currentNode?.id && !currentNodeComplete) continue;
    const clue = getBriefingInfo(nodeId)?.clue;
    if (!clue || clueSet.has(clue)) continue;
    clueSet.add(clue);
    clues.push(clue);
  }

  return clues.slice(-9);
}

function getRevealedBriefingUpdates(messages: DisplayMessage[]) {
  return STORY_BRIEFING_UPDATES.filter(update => (
    messages.some(message => (message.text || message.fullText || '').includes(update.triggerText))
  ));
}

function getVisibleMessageText(messages: DisplayMessage[]) {
  return messages.map(message => message.fullText || message.text || '').join('\n');
}

function isRevealConditionMet(
  condition: RevealCondition | undefined,
  messageText: string,
  historySet: Set<string>,
) {
  if (!condition) return true;
  if (condition.always) return true;
  if (condition.nodeId && !historySet.has(condition.nodeId)) return false;
  if (condition.triggerText && !messageText.includes(condition.triggerText)) return false;
  return Boolean(condition.nodeId || condition.triggerText);
}

function getRevealedCharacterProfiles(
  messages: DisplayMessage[],
  history: string[],
): RevealedCharacterProfile[] {
  const messageText = getVisibleMessageText(messages);
  const historySet = new Set(history);

  return CHARACTER_PROFILES
    .flatMap(profile => {
      if (!isRevealConditionMet(profile.reveal, messageText, historySet)) return [];

      const facts = profile.facts.filter(fact => (
        isRevealConditionMet(fact.reveal, messageText, historySet)
      ));

      if (facts.length === 0) return [];

      return [{
        id: profile.id,
        name: profile.name,
        group: profile.group,
        groupLabel: profile.groupLabel,
        facts,
      }];
    });
}

function formatNumber(value: number, grouped: boolean) {
  return grouped ? value.toLocaleString('en-US') : String(value);
}

function AnimatedNumber({ value, grouped = true, duration = 560, className }: {
  value: number;
  grouped?: boolean;
  duration?: number;
  className?: string;
}) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    let frame = 0;
    const startedAt = performance.now();

    const tick = (now: number) => {
      const progress = Math.min((now - startedAt) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(Math.round(value * eased));
      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [duration, value]);

  return <span className={className}>{formatNumber(displayValue, grouped)}</span>;
}

function getFirstManualLinkTerms(text: string, seenTerms: Set<string>) {
  const linkableTerms = new Set<string>();

  for (const match of text.matchAll(MANUAL_TEXT_PATTERN)) {
    const valueText = match[0];
    if (DYNAMIC_NUMBER_EXACT_PATTERN.test(valueText)) continue;
    if (seenTerms.has(valueText)) continue;

    seenTerms.add(valueText);
    linkableTerms.add(valueText);
  }

  return linkableTerms;
}

function DynamicText({ text, onManualLink, manualLinkTerms }: {
  text: string;
  onManualLink?: (pageIndex: number) => void;
  manualLinkTerms?: Set<string>;
}) {
  const parts: ReactNode[] = [];
  const linkedInThisText = new Set<string>();
  let lastIndex = 0;

  for (const match of text.matchAll(MANUAL_TEXT_PATTERN)) {
    const valueText = match[0];
    const index = match.index ?? 0;
    if (index > lastIndex) parts.push(text.slice(lastIndex, index));

    if (DYNAMIC_NUMBER_EXACT_PATTERN.test(valueText)) {
      const value = Number(valueText.replace(/,/g, ''));
      parts.push(
        <AnimatedNumber
          key={`${index}-${valueText}`}
          value={value}
          grouped={valueText.includes(',')}
          className="dynamic-number"
        />
      );
    } else {
      const pageIndex = findManualTermTarget(valueText);
      const shouldLink = Boolean(
        onManualLink &&
        pageIndex !== undefined &&
        manualLinkTerms?.has(valueText) &&
        !linkedInThisText.has(valueText)
      );

      if (shouldLink && onManualLink && pageIndex !== undefined) {
        linkedInThisText.add(valueText);
        parts.push(
          <button
            key={`${index}-${valueText}`}
            type="button"
            className="manual-inline-link"
            onClick={(event) => {
              event.stopPropagation();
              onManualLink(pageIndex);
            }}
          >
            {valueText}
          </button>
        );
      } else {
        parts.push(valueText);
      }
    }

    lastIndex = index + valueText.length;
  }

  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return <>{parts}</>;
}

function getSpeakerTone(speaker = '') {
  if (speaker.includes('???')) return 'unknown';
  if (speaker.includes('伊恩') && speaker.includes('录音')) return 'recording';
  if (speaker.includes('伊恩')) return 'ian';
  if (speaker.includes('马可')) return 'marco';
  if (speaker.includes('艾琳')) return 'erin';
  if (speaker.includes('薇拉')) return 'vera';
  if (speaker.includes('德克')) return 'deck';
  if (speaker.includes('苏菲')) return 'sophie';
  if (speaker.includes('尤里')) return 'yuri';
  if (speaker.includes('拉尔夫')) return 'ralf';
  return 'default';
}

function getLocationDepth(location?: string) {
  if (!location) return 4200;
  const match = location.match(/深度\s*([\d,]+)\s*m/i) || location.match(/([\d,]+)\s*米/);
  return match ? Number(match[1].replace(/,/g, '')) : 4200;
}

function scoreChoiceLocally(input: string, choice: StoryChoice) {
  const source = `${choice.text} ${(choice.intent || []).join(' ')}`;
  let score = 0;
  for (const token of choice.intent || []) {
    if (input.includes(token)) score += 4;
  }
  for (const char of input) {
    if (char.trim() && source.includes(char)) score += 0.08;
  }
  return score;
}

function resolveActionLocally(input: string, choices: StoryChoice[]): ActionResolution {
  const ranked = choices
    .map((choice, index) => ({ index, score: scoreChoiceLocally(input, choice) }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const choiceIndex = ranked[0]?.index ?? 0;
  return {
    choiceIndex,
    resolution: `落实为：${choices[choiceIndex]?.text || '继续调查'}`,
  };
}

async function resolvePlayerAction(
  node: StoryNode,
  playerInput: string,
  choicesMade: ChoiceRecord[],
  messages: DisplayMessage[],
): Promise<ActionResolution> {
  try {
    const response = await fetch('/api/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nodeId: node.id,
        scene: node.location,
        playerInput,
        choices: node.choices.map(choice => ({
          text: choice.text,
          next: choice.next,
          intent: choice.intent || [],
        })),
        previousChoices: choicesMade.map(choice => choice.choiceText),
        recentContext: messages.slice(-5).map(message => message.text || message.fullText || '').join('\n'),
      }),
    });

    if (!response.ok) throw new Error(`Action API failed: ${response.status}`);
    const data = await response.json() as Partial<ActionResolution>;
    const choiceIndex = Number.isInteger(data.choiceIndex)
      ? Math.max(0, Math.min(node.choices.length - 1, Number(data.choiceIndex)))
      : resolveActionLocally(playerInput, node.choices).choiceIndex;

    return {
      choiceIndex,
      resolution: typeof data.resolution === 'string' && data.resolution.trim()
        ? data.resolution.trim()
        : `落实为：${node.choices[choiceIndex]?.text || '继续调查'}`,
    };
  } catch {
    return resolveActionLocally(playerInput, node.choices);
  }
}

// ===== Breathing Cycle Indicator =====
function BreathingIndicator({ progress, cycleNumber }: { progress: number; cycleNumber: number }) {
  return (
    <div className="breathing-indicator">
      <svg viewBox="0 0 40 40" className="breathing-svg">
        <circle cx="20" cy="20" r="16" className="breathing-bg" />
        <circle
          cx="20" cy="20" r="16"
          className="breathing-progress"
          strokeDasharray={`${progress * 100.5} 100.5`}
          transform="rotate(-90 20 20)"
        />
        <circle cx="20" cy="20" r={4 + progress * 4} className="breathing-core" />
      </svg>
      <span className="breathing-label">C{cycleNumber}</span>
    </div>
  );
}

// ===== Status Bar =====
function StatusBar({ timeInfo, location, depth, loopCount, onOpenManual, onOpenBriefing }: {
  timeInfo: GameTimeInfo;
  location: string;
  depth: number;
  loopCount: number;
  onOpenManual: () => void;
  onOpenBriefing: () => void;
}) {
  return (
    <div className={`status-bar ${timeInfo.ambientPhase}`}>
      <div className="status-left">
        <span className="status-location">{location}</span>
        <span className="status-depth">
          <AnimatedNumber value={depth} className="status-depth-number" />m
        </span>
      </div>
      <div className="status-center">
        <BreathingIndicator progress={timeInfo.cycleProgress} cycleNumber={timeInfo.cycleNumber} />
        <div className="status-time">
          <span className="time-clock">{timeInfo.formatted}</span>
          <span className={`time-shift ${timeInfo.shift.toLowerCase()}`}>{timeInfo.shiftLabel}</span>
        </div>
      </div>
      <div className="status-right">
        <button
          type="button"
          className="btn-briefing"
          onClick={(event) => {
            event.stopPropagation();
            onOpenBriefing();
          }}
        >
          简报
        </button>
        <button
          type="button"
          className="btn-manual"
          onClick={(event) => {
            event.stopPropagation();
            onOpenManual();
          }}
        >
          工程手册
        </button>
        <span className="status-day">DAY {timeInfo.storyDay}</span>
        {loopCount > 0 && <span className="status-loop">LOOP {loopCount + 1}</span>}
      </div>
    </div>
  );
}

// ===== Message Renderer =====
function MessageItem({ message, isLast, isStreaming, onManualLink, manualLinkTerms }: {
  message: DisplayMessage;
  isLast: boolean;
  isStreaming: boolean;
  onManualLink: (pageIndex: number) => void;
  manualLinkTerms: Set<string>;
}) {
  if (message.type === 'scene') {
    return (
      <div className="msg-scene">
        <span className="scene-text">
          <DynamicText text={message.text} onManualLink={onManualLink} manualLinkTerms={manualLinkTerms} />
        </span>
      </div>
    );
  }

  if (message.type === 'system') {
    return (
      <div className="msg-system">
        <span className="system-text">
          <DynamicText text={message.text} onManualLink={onManualLink} manualLinkTerms={manualLinkTerms} />
        </span>
      </div>
    );
  }

  if (message.type === 'narration') {
    return (
      <div className="msg-narration">
        <p className="narration-text">
          <DynamicText text={message.text} onManualLink={onManualLink} manualLinkTerms={manualLinkTerms} />
        </p>
        {isLast && isStreaming && <span className="cursor-blink">|</span>}
      </div>
    );
  }

  if (message.type === 'dialogue') {
    const speakerTone = getSpeakerTone(message.speaker);
    return (
      <div className={`msg-dialogue speaker-${speakerTone}`}>
        {message.speaker && <span className="dialogue-speaker">{message.speaker}</span>}
        <div className="dialogue-bubble">
          <p>
            <DynamicText text={message.text} onManualLink={onManualLink} manualLinkTerms={manualLinkTerms} />
          </p>
          {isLast && isStreaming && <span className="cursor-blink">|</span>}
        </div>
      </div>
    );
  }

  if (message.type === 'inner') {
    return (
      <div className="msg-inner">
        <p className="inner-text">
          <DynamicText text={message.text} onManualLink={onManualLink} manualLinkTerms={manualLinkTerms} />
        </p>
        {isLast && isStreaming && <span className="cursor-blink">|</span>}
      </div>
    );
  }

  return null;
}

// ===== Title Screen =====
function TitleScreen({ onStart, onOpenManual, endingsUnlocked, totalEndings, loopCount }: {
  onStart: () => void;
  onOpenManual: () => void;
  endingsUnlocked: string[];
  totalEndings: number;
  loopCount: number;
}) {
  return (
    <div className="title-screen">
      <button type="button" className="title-manual-btn" onClick={onOpenManual}>
        工程手册
      </button>
      <div className="title-bg">
        <div className="title-particles" />
      </div>
      <div className="title-content">
        <div className="title-depth">— <AnimatedNumber value={4200} className="dynamic-number" />m —</div>
        <h1 className="title-text">子午线</h1>
        <p className="title-sub">MERIDIAN</p>
        <p className="title-tagline">它在呼吸。</p>
        <button className="btn-start" onClick={onStart}>
          {loopCount > 0 ? '再次下潜' : '开始下潜'}
        </button>
        {endingsUnlocked.length > 0 && (
          <div className="endings-gallery">
            <p className="endings-title">已解锁结局 {endingsUnlocked.length}/{totalEndings}</p>
            <div className="endings-list">
              {endingsUnlocked.map(e => (
                <span key={e} className="ending-badge">{e}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ActionComposer({ value, isResolving, error, onChange, onSubmit }: {
  value: string;
  isResolving: boolean;
  error: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onSubmit();
  };

  return (
    <form className="action-composer" onSubmit={handleSubmit} onClick={(event) => event.stopPropagation()}>
      <textarea
        className="action-input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onClick={(event) => event.stopPropagation()}
        placeholder="你想怎么做？"
        rows={2}
        disabled={isResolving}
      />
      <button className="btn-action-submit" type="submit" disabled={isResolving || !value.trim()}>
        {isResolving ? '解析中' : '执行'}
      </button>
      {error && <p className="action-error">{error}</p>}
    </form>
  );
}

// ===== Ending Screen =====
function EndingScreen({ endingName, personalitySummary, onRestart, endingsUnlocked, totalEndings }: {
  endingName: string;
  personalitySummary: string;
  onRestart: () => void;
  endingsUnlocked: string[];
  totalEndings: number;
}) {
  const [merClickCount, setMerClickCount] = useState(0);
  const showMerBubble = merClickCount >= 3;

  return (
    <div className="ending-screen">
      <div className="ending-label">— 结局 —</div>
      <h2 className="ending-name">{endingName}</h2>
      <div className="personality-analysis">
        <span className="analysis-label">回声室人格回写</span>
        <p>{personalitySummary}</p>
      </div>
      <p className="ending-stats">已解锁 {endingsUnlocked.length}/{totalEndings} 个结局</p>

      <button
        type="button"
        className="mer-ending-logo-btn"
        aria-label="mer"
        onClick={() => setMerClickCount(count => Math.min(3, count + 1))}
      >
        <img src="/mer-logo.png" alt="mer" className="mer-ending-logo" />
      </button>

      {showMerBubble && (
        <div className="mer-ending-bubble">
          <p>
            骗你的，其实什么都没有
            <br />
            但是晚安呀！
          </p>
          <button className="btn-restart mer-return-btn" onClick={onRestart}>
            回到深潜器
          </button>
        </div>
      )}
    </div>
  );
}

function ObjectiveStrip({ taskTitle, objective, onOpenBriefing }: {
  taskTitle: string;
  objective: string;
  onOpenBriefing: () => void;
}) {
  return (
    <button
      type="button"
      className="objective-strip"
      onClick={(event) => {
        event.stopPropagation();
        onOpenBriefing();
      }}
    >
      <span>当前目标</span>
      <strong>{taskTitle} · {objective}</strong>
    </button>
  );
}

function BriefingSection({ title, defaultOpen = false, children }: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details className="briefing-section" open={defaultOpen}>
      <summary className="briefing-section-summary">
        <span>{title}</span>
      </summary>
      <div className="briefing-section-body">
        {children}
      </div>
    </details>
  );
}

function BriefingModal({ isOpen, taskTitle, objective, characterProfiles, taskLog, briefingUpdates, knownClues, choicesMade, onClose }: {
  isOpen: boolean;
  taskTitle: string;
  objective: string;
  characterProfiles: RevealedCharacterProfile[];
  taskLog: Array<{ nodeId: string; event: TaskEvent }>;
  briefingUpdates: BriefingUpdate[];
  knownClues: string[];
  choicesMade: ChoiceRecord[];
  onClose: () => void;
}) {
  if (!isOpen) return null;

  return (
    <div
      className="briefing-overlay"
      onClick={(event) => {
        event.stopPropagation();
        onClose();
      }}
    >
      <section className="briefing-panel" onClick={(event) => event.stopPropagation()}>
        <header className="briefing-header">
          <div>
            <span className="briefing-kicker">POU 接收组 · 调查简报</span>
            <h2>当前状况</h2>
          </div>
          <button type="button" className="briefing-close" onClick={onClose}>关闭</button>
        </header>

        <div className="briefing-content">
          <BriefingSection title="你现在要做什么" defaultOpen>
            <span className="briefing-task-title">{taskTitle}</span>
            <p className="briefing-objective">{objective}</p>
          </BriefingSection>

          <BriefingSection title="人物档案" defaultOpen>
            {characterProfiles.length > 0 ? (
              <ul className="briefing-character-list">
                {characterProfiles.map(profile => (
                  <li key={profile.id} className={`briefing-character-card group-${profile.group}`}>
                    <div className="briefing-character-head">
                      <strong>{profile.name}</strong>
                      <span>{profile.groupLabel}</span>
                    </div>
                    <ul>
                      {profile.facts.map(fact => <li key={fact.id}>{fact.text}</li>)}
                    </ul>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="briefing-empty">人物档案尚未建立。完成身份确认后会自动写入。</p>
            )}
          </BriefingSection>

          <BriefingSection title="任务记录">
            {taskLog.length > 0 ? (
              <ul className="briefing-task-list">
                {taskLog.map(entry => (
                  <li key={`${entry.nodeId}-${entry.event.title}`}>
                    <span className={`task-chip ${entry.event.kind}`}>
                      {getTaskEventLabel(entry.event.kind)}
                    </span>
                    <strong>{entry.event.title}</strong>
                    <p>{entry.event.detail}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="briefing-empty">任务记录尚未生成。</p>
            )}
          </BriefingSection>

          <BriefingSection title="已更新简报">
            {briefingUpdates.length > 0 ? (
              <ul className="briefing-update-list">
                {briefingUpdates.map(update => (
                  <li key={update.id}>
                    <strong>{update.title}</strong>
                    <span>{update.text}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="briefing-empty">尚未接收任务简报。继续推进当前场景。</p>
            )}
          </BriefingSection>

          <BriefingSection title="已知线索">
            {knownClues.length > 0 ? (
              <ul className="briefing-list">
                {knownClues.map(clue => <li key={clue}>{clue}</li>)}
              </ul>
            ) : (
              <p className="briefing-empty">还没有稳定线索。继续推进交接流程。</p>
            )}
          </BriefingSection>

          <BriefingSection title="你的选择">
            {choicesMade.length > 0 ? (
              <ol className="briefing-choice-list">
                {choicesMade.slice(-7).map((choice, index) => (
                  <li key={`${choice.nodeId}-${index}-${choice.choiceText}`}>
                    {choice.choiceText}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="briefing-empty">尚未做出分支选择。</p>
            )}
          </BriefingSection>
        </div>
      </section>
    </div>
  );
}

function BriefingToast({ message, onOpen, onDone }: {
  message: string;
  onOpen: () => void;
  onDone: () => void;
}) {
  if (!message) return null;

  return (
    <button
      type="button"
      className="briefing-toast"
      onAnimationEnd={onDone}
      onClick={(event) => {
        event.stopPropagation();
        onOpen();
      }}
    >
      <span>简报更新</span>
      <strong>{message}</strong>
    </button>
  );
}

function TaskToast({ event, onOpen, onDone }: {
  event?: TaskEvent;
  onOpen: () => void;
  onDone: () => void;
}) {
  if (!event) return null;

  return (
    <button
      type="button"
      className={`task-toast ${event.kind}`}
      onAnimationEnd={onDone}
      onClick={(clickEvent) => {
        clickEvent.stopPropagation();
        onOpen();
      }}
    >
      <span>{getTaskEventLabel(event.kind)}</span>
      <strong>{event.title}</strong>
      <em>{event.detail}</em>
    </button>
  );
}

function renderManualInline(text: string) {
  const parts: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(/\*\*(.+?)\*\*/g)) {
    const index = match.index ?? 0;
    if (index > lastIndex) parts.push(text.slice(lastIndex, index));
    parts.push(<strong key={`${index}-${match[1]}`}>{match[1]}</strong>);
    lastIndex = index + match[0].length;
  }

  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

function getManualEntryTarget(text: string) {
  const cleaned = text
    .replace(/^#{1,3}\s+/, '')
    .replace(/^\d+\.\s+/, '')
    .trim();
  const pageIndex = findManualPageByTitle(cleaned);
  return pageIndex !== undefined && pageIndex >= 0 ? pageIndex : undefined;
}

function ManualLineContent({ text, onOpenPage }: {
  text: string;
  onOpenPage: (pageIndex: number) => void;
}) {
  const target = getManualEntryTarget(text);
  if (target === undefined) return <>{renderManualInline(text)}</>;

  return (
    <button
      type="button"
      className="manual-page-link"
      onClick={() => onOpenPage(target)}
    >
      {renderManualInline(text)}
    </button>
  );
}

function isTableLine(line: string) {
  const trimmed = line.trim();
  return trimmed.startsWith('|') && trimmed.endsWith('|');
}

function renderManualTable(lines: string[], key: string) {
  const rows = lines.map(line => line.trim().slice(1, -1).split('|').map(cell => cell.trim()));
  const hasDivider = rows[1]?.every(cell => /^:?-{3,}:?$/.test(cell)) ?? false;
  const bodyRows = rows.slice(hasDivider ? 2 : 1);

  return (
    <table key={key} className="manual-table">
      <thead>
        <tr>
          {rows[0]?.map((cell, index) => <th key={index}>{renderManualInline(cell)}</th>)}
        </tr>
      </thead>
      <tbody>
        {bodyRows.map((row, rowIndex) => (
          <tr key={rowIndex}>
            {row.map((cell, cellIndex) => <td key={cellIndex}>{renderManualInline(cell)}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ManualMarkdown({ lines, onOpenPage }: {
  lines: string[];
  onOpenPage: (pageIndex: number) => void;
}) {
  const blocks: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed) {
      index += 1;
      continue;
    }

    if (/^#{1,3}\s+/.test(trimmed)) {
      const title = trimmed.replace(/^#{1,3}\s+/, '');
      blocks.push(
        <h3 key={`heading-${index}`} className="manual-md-heading">
          <ManualLineContent text={title} onOpenPage={onOpenPage} />
        </h3>
      );
      index += 1;
      continue;
    }

    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith('>')) {
        quoteLines.push(lines[index].trim().replace(/^>\s?/, ''));
        index += 1;
      }
      blocks.push(
        <blockquote key={`quote-${index}`} className="manual-quote">
          {quoteLines.map((quote, quoteIndex) => (
            <p key={quoteIndex}>{renderManualInline(quote)}</p>
          ))}
        </blockquote>
      );
      continue;
    }

    if (isTableLine(trimmed)) {
      const tableLines: string[] = [];
      while (index < lines.length && isTableLine(lines[index])) {
        tableLines.push(lines[index]);
        index += 1;
      }
      blocks.push(renderManualTable(tableLines, `table-${index}`));
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^\d+\.\s+/, ''));
        index += 1;
      }
      blocks.push(
        <ol key={`ordered-${index}`} className="manual-list">
          {items.map((item, itemIndex) => (
            <li key={itemIndex}>
              <ManualLineContent text={item} onOpenPage={onOpenPage} />
            </li>
          ))}
        </ol>
      );
      continue;
    }

    if (/^-\s+/.test(trimmed)) {
      const items: string[] = [];
      while (index < lines.length && /^-\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^-\s+/, ''));
        index += 1;
      }
      blocks.push(
        <ul key={`unordered-${index}`} className="manual-list">
          {items.map((item, itemIndex) => (
            <li key={itemIndex}>
              <ManualLineContent text={item} onOpenPage={onOpenPage} />
            </li>
          ))}
        </ul>
      );
      continue;
    }

    blocks.push(
      <p key={`paragraph-${index}`} className="manual-paragraph">
        <ManualLineContent text={trimmed} onOpenPage={onOpenPage} />
      </p>
    );
    index += 1;
  }

  return <div className="manual-md">{blocks}</div>;
}

function ManualDirectoryPage({ entries, pageNumber, pageCount, onOpenPage }: {
  entries: ManualDirectoryEntry[];
  pageNumber: number;
  pageCount: number;
  onOpenPage: (pageIndex: number) => void;
}) {
  const renderedChapters = new Set<string>();

  return (
    <div className="manual-directory">
      <div className="manual-directory-intro">
        <span>文件目录 {pageNumber}/{pageCount}</span>
        <span>点击条目跳转至对应页</span>
      </div>
      {entries.map(entry => {
          const showChapter = entry.chapter && !renderedChapters.has(entry.chapter);
          if (entry.chapter) renderedChapters.add(entry.chapter);

          return (
            <div key={`${entry.pageIndex}-${entry.title}`}>
              {showChapter && (
                <button
                  type="button"
                  className="manual-directory-row chapter"
                  onClick={() => onOpenPage(entry.pageIndex)}
                >
                  <span>{entry.chapter}</span>
                  <span>{entry.pageIndex + 1}</span>
                </button>
              )}
              <button
                type="button"
                className={`manual-directory-row level-${entry.level}`}
                onClick={() => onOpenPage(entry.pageIndex)}
              >
                <span>{entry.title}</span>
                <span>{entry.pageIndex + 1}</span>
              </button>
            </div>
          );
        })}
    </div>
  );
}

function ManualModal({ isOpen, pageIndex, onChangePage, onClose }: {
  isOpen: boolean;
  pageIndex: number;
  onChangePage: (pageIndex: number) => void;
  onClose: () => void;
}) {
  const pageRef = useRef<HTMLDivElement>(null);
  const jumpInputRef = useRef<HTMLInputElement>(null);
  const safePageIndex = Math.max(0, Math.min(manualPages.length - 1, pageIndex));
  const page = manualPages[safePageIndex];

  useEffect(() => {
    pageRef.current?.scrollTo({ top: 0 });
  }, [safePageIndex]);

  if (!isOpen || !page) return null;

  const changePage = (nextPageIndex: number) => {
    onChangePage(Math.max(0, Math.min(manualPages.length - 1, nextPageIndex)));
  };
  const isDirectoryPage = page.kind === 'directory';
  const isFirstDirectoryPage = safePageIndex === MANUAL_TOC_PAGE_INDEX;

  const handleJump = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const requestedPage = Number.parseInt(jumpInputRef.current?.value || '', 10);
    if (Number.isFinite(requestedPage)) {
      changePage(requestedPage - 1);
    }
  };

  return (
    <div
      className="manual-overlay"
      onClick={(event) => {
        event.stopPropagation();
        onClose();
      }}
    >
      <section className="manual-shell" onClick={(event) => event.stopPropagation()}>
        <aside className="manual-toc-panel">
          <div className="manual-panel-title">目录</div>
          <div className="manual-toc-list">
            {manualToc.map(entry => (
              <button
                key={`${entry.pageIndex}-${entry.title}`}
                type="button"
                className={`manual-toc-button level-${entry.level} ${entry.pageIndex === safePageIndex ? 'active' : ''}`}
                onClick={() => changePage(entry.pageIndex)}
              >
                <span>{entry.title}</span>
                <span>{entry.pageIndex + 1}</span>
              </button>
            ))}
          </div>
        </aside>

        <div className="manual-book">
          <header className="manual-toolbar">
            <div>
              <span className="manual-file-code">POU-DSE-MER-ENG-01</span>
              <h2>{page.title}</h2>
            </div>
            <div className="manual-toolbar-actions">
              <button
                type="button"
                className="manual-toc-return"
                disabled={isFirstDirectoryPage}
                onClick={() => changePage(MANUAL_TOC_PAGE_INDEX)}
              >
                返回目录
              </button>
              <button type="button" className="manual-close" onClick={onClose}>关闭</button>
            </div>
          </header>

          <div className="manual-page" ref={pageRef}>
            <div className="manual-paper">
              {page.chapter && <div className="manual-chapter">{page.chapter}</div>}
              {isDirectoryPage ? (
                <ManualDirectoryPage
                  entries={page.directoryEntries || []}
                  pageNumber={page.directoryPageNumber || 1}
                  pageCount={page.directoryPageCount || 1}
                  onOpenPage={changePage}
                />
              ) : (
                <ManualMarkdown lines={page.lines} onOpenPage={changePage} />
              )}
              <div className="manual-page-number">{safePageIndex + 1}</div>
            </div>
          </div>

          <footer className="manual-controls">
            <button
              type="button"
              className="manual-nav-btn"
              disabled={safePageIndex === 0}
              onClick={() => changePage(safePageIndex - 1)}
            >
              上一页
            </button>
            <form className="manual-jump-form" onSubmit={handleJump}>
              <label htmlFor="manual-page-jump">页码</label>
              <input
                id="manual-page-jump"
                key={safePageIndex}
                ref={jumpInputRef}
                type="number"
                min="1"
                max={manualPages.length}
                defaultValue={safePageIndex + 1}
              />
              <span>/ {manualPages.length}</span>
              <button type="submit" className="manual-jump-btn">跳转</button>
            </form>
            <button
              type="button"
              className="manual-nav-btn"
              disabled={safePageIndex === manualPages.length - 1}
              onClick={() => changePage(safePageIndex + 1)}
            >
              下一页
            </button>
          </footer>
        </div>
      </section>
    </div>
  );
}

function DevNodeJump({ currentNodeId, onJump }: {
  currentNodeId: string;
  onJump: (nodeId: string) => void;
}) {
  const [selectedNodeId, setSelectedNodeId] = useState(currentNodeId || 'opening');

  if (!import.meta.env.DEV) return null;

  return (
    <form
      className="dev-node-jump"
      onClick={(event) => event.stopPropagation()}
      onSubmit={(event) => {
        event.preventDefault();
        onJump(selectedNodeId);
      }}
    >
      <label htmlFor="dev-node-jump-select">DEV 跳转</label>
      <select
        id="dev-node-jump-select"
        value={selectedNodeId}
        onChange={(event) => setSelectedNodeId(event.target.value)}
      >
        {DEV_NODE_OPTIONS.map(node => (
          <option key={node.id} value={node.id}>{node.label}</option>
        ))}
      </select>
      <button type="submit">进入</button>
    </form>
  );
}

// ===== Main App =====
export default function App() {
  const { state, timeInfo, startGame, jumpToNode, advance, makeChoice, restart, totalEndings } = useGame();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [actionText, setActionText] = useState('');
  const [isResolvingAction, setIsResolvingAction] = useState(false);
  const [actionError, setActionError] = useState('');
  const [isManualOpen, setIsManualOpen] = useState(false);
  const [manualPageIndex, setManualPageIndex] = useState(0);
  const [isBriefingOpen, setIsBriefingOpen] = useState(false);
  const [dismissedBriefingToastId, setDismissedBriefingToastId] = useState('');
  const [dismissedTaskToastKey, setDismissedTaskToastKey] = useState('');

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.messages]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;

    const devWindow = window as PouDevWindow;
    devWindow.POU_DEV = {
      nodes: DEV_NODE_OPTIONS.map(node => node.id),
      jumpToNode,
    };

    return () => {
      if (devWindow.POU_DEV?.jumpToNode === jumpToNode) {
        delete devWindow.POU_DEV;
      }
    };
  }, [jumpToNode]);

  const handleClick = () => {
    if (!isResolvingAction && !isManualOpen && !isBriefingOpen) advance();
  };

  const openManual = (pageIndex = manualPageIndex) => {
    setManualPageIndex(Math.max(0, Math.min(manualPages.length - 1, pageIndex)));
    setIsManualOpen(true);
  };

  if (state.phase === 'title') {
    return (
      <>
        <TitleScreen
          onStart={() => {
            setDismissedBriefingToastId('');
            setDismissedTaskToastKey('');
            startGame();
          }}
          onOpenManual={() => openManual(0)}
          endingsUnlocked={state.endingsUnlocked}
          totalEndings={totalEndings}
          loopCount={state.loopCount}
        />
        <DevNodeJump currentNodeId={state.currentNodeId} onJump={jumpToNode} />
        <ManualModal
          isOpen={isManualOpen}
          pageIndex={manualPageIndex}
          onChangePage={setManualPageIndex}
          onClose={() => setIsManualOpen(false)}
        />
      </>
    );
  }

  const currentNode = state.currentNode;
  const isEnding = currentNode?.isEnding && state.phase === 'ending' &&
    state.currentBeatIndex >= currentNode.beats.length;
  const showChoices = Boolean(!state.isStreaming && currentNode &&
    currentNode.choices.length > 0 &&
    state.currentBeatIndex >= currentNode.beats.length && !isEnding &&
    state.phase === 'playing');
  const canAdvance = !state.isStreaming && state.phase === 'playing' && currentNode && !showChoices &&
    (state.currentBeatIndex < currentNode.beats.length || Boolean(currentNode.next));
  const currentDepth = getLocationDepth(currentNode?.location);
  const currentBriefing = getBriefingInfo(currentNode?.id);
  const currentTask = getTaskInfo(currentNode?.id);
  const currentTaskTitle = currentTask?.title || '现场调查';
  const currentObjective = currentTask?.objective || currentBriefing?.objective || '继续推进当前场景，寻找能解释站体异常的线索。';
  const taskLog = getTaskLog(state.history);
  const currentTaskEvent = currentTask?.event;
  const currentTaskToastKey = currentTaskEvent && currentNode
    ? `${currentNode.id}-${currentTaskEvent.kind}-${currentTaskEvent.title}`
    : '';
  const revealedBriefingUpdates = getRevealedBriefingUpdates(state.messages);
  const latestBriefingUpdate = revealedBriefingUpdates[revealedBriefingUpdates.length - 1];
  const characterProfiles = getRevealedCharacterProfiles(state.messages, state.history);
  const knownClues = getKnownClues(state.history, currentNode, state.currentBeatIndex);
  const seenManualTerms = new Set<string>();
  const manualLinkTermsByMessage = new Map<string, Set<string>>();

  for (const message of state.messages) {
    manualLinkTermsByMessage.set(message.id, getFirstManualLinkTerms(message.text, seenManualTerms));
  }

  const handleActionSubmit = async () => {
    const trimmed = actionText.trim();
    if (!trimmed || !currentNode || !showChoices || isResolvingAction) return;

    setIsResolvingAction(true);
    setActionError('');
    try {
      const resolution = await resolvePlayerAction(currentNode, trimmed, state.choicesMade, state.messages);
      makeChoice(resolution.choiceIndex, trimmed, resolution.resolution);
      setActionText('');
    } catch {
      setActionError('行动没有被记录，请再试一次。');
    } finally {
      setIsResolvingAction(false);
    }
  };

  return (
    <div className="game-container" onClick={handleClick}>
      <DevNodeJump currentNodeId={state.currentNodeId} onJump={jumpToNode} />
      <StatusBar
        timeInfo={timeInfo}
        location={currentNode?.location || '子午线站'}
        depth={currentDepth}
        loopCount={state.loopCount}
        onOpenManual={() => openManual()}
        onOpenBriefing={() => setIsBriefingOpen(true)}
      />
      <ObjectiveStrip
        taskTitle={currentTaskTitle}
        objective={currentObjective}
        onOpenBriefing={() => setIsBriefingOpen(true)}
      />
      <div className="toast-stack" onClick={(event) => event.stopPropagation()}>
        <TaskToast
          key={currentTaskToastKey || 'no-task-toast'}
          event={currentTaskToastKey && currentTaskToastKey !== dismissedTaskToastKey
            ? currentTaskEvent
            : undefined}
          onOpen={() => setIsBriefingOpen(true)}
          onDone={() => setDismissedTaskToastKey(currentTaskToastKey)}
        />
        <BriefingToast
          key={latestBriefingUpdate?.id || 'no-briefing-toast'}
          message={latestBriefingUpdate && latestBriefingUpdate.id !== dismissedBriefingToastId
            ? latestBriefingUpdate.title
            : ''}
          onOpen={() => setIsBriefingOpen(true)}
          onDone={() => setDismissedBriefingToastId(latestBriefingUpdate?.id || '')}
        />
      </div>

      <main className="messages-container">
        {state.messages.map((msg, i) => (
          <MessageItem
            key={msg.id}
            message={msg}
            isLast={i === state.messages.length - 1}
            isStreaming={state.isStreaming && msg.isStreaming === true}
            onManualLink={openManual}
            manualLinkTerms={manualLinkTermsByMessage.get(msg.id) || new Set<string>()}
          />
        ))}
        <div ref={messagesEndRef} />
      </main>

      {state.isStreaming && (
        <div className="skip-hint receiving">信号接收中...</div>
      )}
      {canAdvance && (
        <div className="skip-hint">点击任意位置继续</div>
      )}

      {showChoices && currentNode?.choices && (
        <div className="choices-container" onClick={(event) => event.stopPropagation()}>
          <div className="choices-list">
            {currentNode.choices.map((choice, i) => (
              <button
                key={i}
                className="choice-btn"
                style={{ animationDelay: `${i * 70}ms` }}
                disabled={isResolvingAction}
                onClick={(event) => {
                  event.stopPropagation();
                  setActionText('');
                  setActionError('');
                  makeChoice(i);
                }}
              >
                <span className="choice-marker">{String.fromCharCode(65 + i)}</span>
                <span className="choice-text">{choice.text}</span>
              </button>
            ))}
          </div>
          <ActionComposer
            value={actionText}
            isResolving={isResolvingAction}
            error={actionError}
            onChange={setActionText}
            onSubmit={handleActionSubmit}
          />
        </div>
      )}

      {isEnding && currentNode?.endingName && (
        <EndingScreen
          endingName={currentNode.endingName}
          personalitySummary={getPersonalitySummary(state.choicesMade)}
          onRestart={() => {
            setDismissedBriefingToastId('');
            setDismissedTaskToastKey('');
            restart();
          }}
          endingsUnlocked={state.endingsUnlocked}
          totalEndings={totalEndings}
        />
      )}

      <ManualModal
        isOpen={isManualOpen}
        pageIndex={manualPageIndex}
        onChangePage={setManualPageIndex}
        onClose={() => setIsManualOpen(false)}
      />
      <BriefingModal
        isOpen={isBriefingOpen}
        taskTitle={currentTaskTitle}
        objective={currentObjective}
        characterProfiles={characterProfiles}
        taskLog={taskLog}
        briefingUpdates={revealedBriefingUpdates}
        knownClues={knownClues}
        choicesMade={state.choicesMade}
        onClose={() => setIsBriefingOpen(false)}
      />
    </div>
  );
}
