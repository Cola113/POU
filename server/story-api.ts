import type { IncomingMessage, ServerResponse } from 'http'

const DEFAULT_API_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1'
const API_TIMEOUT_MS = 45000

function getApiConfig() {
  return {
    apiBaseUrl: (process.env.DASHSCOPE_API_BASE_URL || process.env.VITE_LLM_API_BASE || DEFAULT_API_BASE_URL).replace(/\/$/, ''),
    apiKey: process.env.DASHSCOPE_API_KEY || process.env.VITE_LLM_API_KEY || '',
    model: process.env.DASHSCOPE_MODEL || process.env.VITE_LLM_MODEL || 'qwen-plus',
  }
}

interface StoryRequest {
  scene: string
  characters: string[]
  mood: string
  context: string
  previousChoices: string[]
  coreFear?: string
  nodeGoal?: string
}

interface ActionChoice {
  text: string
  next: string
  intent?: string[]
}

interface ActionRequest {
  nodeId: string
  scene: string
  playerInput: string
  choices: ActionChoice[]
  previousChoices: string[]
  recentContext: string
}

interface ActionResponse {
  choiceIndex: number
  resolution: string
  source: 'ai' | 'fallback'
}

const SYSTEM_PROMPT = `你是《子午线 MERIDIAN》的叙事协作者，负责为一个面向成年玩家的深海科幻悬疑心理恐怖互动小说扩写当前节点。

写作原则：
- 一周目固定通向 bad ending“回溯”：结局会回到开头的外溢信号，玩家越以为自己正在逃脱，越是在把自己写回循环。
- 核心设定集中：深海 4,200 米处的“呼吸者”会读取记忆、借用声音、重写叙述；子午线站是 POU 为接触它而建的接口。
- 信息必须通过场景、对话、通讯记录和规则残片逐步显露，不要用说明书式段落一次讲完世界观，不要在开头揭示说话者身份或第一批真相。
- 第一批人员在三年驻守末期已经被改变；他们看起来正常，但动作延迟、措辞过度合规、情绪反应不合时宜。
- 恐怖来自未知、封闭空间、信息缺失、身份混乱、亲密声音被冒用、自由意志被动摇；不要依赖血腥。
- 允许规则怪谈式文本恐怖，例如“不要回答”“不要敲第四下”，但要让规则与真相有关。
- mer 是一只英短蓝白猫：圆脸、胖嘟嘟、白下巴白肚皮白爪。它只在少量相对不恐怖的生活片段出现，始终安全，不做 UI，不推动危险情节。
- 除非当前场景、既定事实或节点目的明确提到 mer、猫、生活舱、餐舱、热风口或安置宠物，否则不要主动写 mer；恐怖、追逐、回声室、深潜和结局片段中不要让 mer 出场。
- 不要新增剧情树分支，不要提前胜利，不要让玩家真正摧毁呼吸者或逃离循环。
- 风格克制、潮湿、低频、有压迫感。禁止使用“像”“仿佛”“似乎”这类解释性比喻，多用具体动作、停顿、物件和对话差异制造不安。`

const ACTION_SYSTEM_PROMPT = `你是《子午线 MERIDIAN》的行动解析器。玩家可以自由输入想做什么，但一周目必须沿既有剧情树推进。

你的任务：
- 只在给定 choices 中选择最贴近玩家意图的一项。
- 不要创造新分支，不要让玩家提前获胜、逃脱循环、伤害 mer 或跳过关键剧情。
- 如果玩家输入很开放，选择最能保留其动机的剧情分支。
- 输出严格 JSON：{"choiceIndex":0,"resolution":"不超过 28 个中文字符的行动归档"}。
- choiceIndex 必须对应“可选剧情分支”的编号，不要使用场景数字、深度数字或倒计时数字。
- resolution 只描述行动如何落到既有分支，不要剧透，不要解释系统规则。`

function buildPrompt(data: StoryRequest): string {
  const characters = data.characters.length > 0 ? data.characters.join('、') : '伊恩'
  const history = data.previousChoices.length > 0
    ? `\n【玩家已做选择】\n${data.previousChoices.map((choice, index) => `${index + 1}. ${choice}`).join('\n')}\n`
    : ''
  const coreFear = data.coreFear || '失去记忆、身份、亲人和自由意志，无法分辨自己是否仍然是自己'
  const nodeGoal = data.nodeGoal || '制造新的不安线索，同时把玩家推向下一次调查或选择'

  return `请扩写当前剧情节点，输出一段可以直接显示给玩家的正文。
【当前场景】${data.scene}
【出场角色】${characters}
【氛围基调】${data.mood}
【核心恐惧】${coreFear}
【节点目的】${nodeGoal}
${history}
【既定场景事实】${data.context}

硬性要求：
- 180-320 字，使用第二人称“你”。
- 可以包含 1-3 句自然对话，但不要写成剧本格式。
- 至少写一个可感知细节：光线、声音、震动、温度、气味、设备读数或身体反应。
- 至少埋一个公平伏笔，让玩家回头看时觉得合理。
- 不要解释设定，不要总结主题，不要输出标题。
- 禁止使用“像”“仿佛”“似乎”。不要写套话式比喻。
- 不要新增 UI 指令、选项编号、Markdown 或注释。
- 不要重复【既定场景事实】的原文，要在不改事实的前提下重新组织叙述。`
}

function buildActionPrompt(data: ActionRequest): string {
  return `当前节点：${data.nodeId}
当前场景：${data.scene}
最近剧情：${data.recentContext}
玩家过往选择：
${data.previousChoices.length > 0 ? data.previousChoices.map((choice, index) => `${index + 1}. ${choice}`).join('\n') : '无'}

玩家自由输入：
${data.playerInput}

可选剧情分支：
${data.choices.map((choice, index) => `${index}. ${choice.text}${choice.intent?.length ? `（意图：${choice.intent.join('、')}）` : ''}`).join('\n')}

请只返回严格 JSON。`
}

async function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
    req.on('error', reject)
  })
}

function fallbackText(data: StoryRequest): string {
  return data.context || '通讯里只剩下细小的电流声。低频震动从脚下传来，舱壁轻轻收紧，又松开。'
}

function scoreActionChoice(input: string, choice: ActionChoice): number {
  const source = `${choice.text} ${(choice.intent || []).join(' ')}`
  let score = 0
  for (const token of choice.intent || []) {
    if (token && input.includes(token)) score += 4
  }

  const keywordGroups = [
    ['通讯', '记录', '日志', '缓存', '月窗', '发送', '解密'],
    ['猫', 'mer', '项圈', '拉尔夫', '热风口', '生活舱'],
    ['苏菲', '穹顶', '玻璃', '手印', '敲击'],
    ['尤里', '医疗', '脑电', '求助', '叫醒'],
    ['监控', '回放', '观察', '房间', '录像'],
    ['艾琳', '结构', '工程', '图纸', '取样', '下潜'],
    ['逃', '撤离', '逃生', '上浮', '离开'],
    ['反应堆', '动力舱', '过载', '炸', '毁掉'],
    ['听', '谈', '停下', '回答', '靠近'],
  ]

  for (const group of keywordGroups) {
    const inputHit = group.some(word => input.includes(word))
    const choiceHit = group.some(word => source.includes(word))
    if (inputHit && choiceHit) score += 2
  }

  for (const char of input) {
    if (char.trim() && source.includes(char)) score += 0.08
  }

  return score
}

function fallbackAction(data: ActionRequest): ActionResponse {
  const input = data.playerInput.trim()
  const scored = data.choices.map((choice, index) => ({
    index,
    score: scoreActionChoice(input, choice),
  })).sort((a, b) => b.score - a.score || a.index - b.index)
  const choiceIndex = scored[0]?.index ?? 0
  return {
    choiceIndex,
    resolution: `落实为：${data.choices[choiceIndex]?.text || '继续调查'}`,
    source: 'fallback',
  }
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim()
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return JSON.parse(trimmed)
  }
  const match = trimmed.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('No JSON object in model response')
  return JSON.parse(match[0])
}

function coerceActionResponse(raw: unknown, data: ActionRequest): ActionResponse {
  if (!raw || typeof raw !== 'object') return fallbackAction(data)

  const fallback = fallbackAction(data)
  const record = raw as Record<string, unknown>
  const parsedIndex = Number(record.choiceIndex)
  let choiceIndex = Number.isInteger(parsedIndex)
    ? Math.max(0, Math.min(data.choices.length - 1, parsedIndex))
    : fallback.choiceIndex
  const localScore = scoreActionChoice(data.playerInput.trim(), data.choices[fallback.choiceIndex])
  const aiScore = scoreActionChoice(data.playerInput.trim(), data.choices[choiceIndex])
  let source: ActionResponse['source'] = 'ai'

  if (fallback.choiceIndex !== choiceIndex && localScore > aiScore + 2) {
    choiceIndex = fallback.choiceIndex
    source = 'fallback'
  }

  const resolutionRaw = typeof record.resolution === 'string' ? record.resolution : ''
  const normalizedResolution = resolutionRaw.trim().replace(/\s+/g, ' ').slice(0, 28)
  const resolution = source === 'ai' && normalizedResolution && !/海拔|胜利|逃脱循环|伤害mer|杀死mer|伤害猫|杀死猫/.test(normalizedResolution)
    ? normalizedResolution
    : `落实为：${data.choices[choiceIndex]?.text || '继续调查'}`.slice(0, 28)

  return { choiceIndex, resolution, source }
}

function writeText(res: ServerResponse, text: string, status = 200) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' })
  res.end(text)
}

function writeJson(res: ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(data))
}

export async function storyMiddleware(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  let data: StoryRequest
  try {
    const bodyRaw = await readBody(req)
    data = JSON.parse(bodyRaw) as StoryRequest
  } catch {
    writeText(res, 'Invalid story request', 400)
    return
  }

  const { apiBaseUrl, apiKey, model } = getApiConfig()

  if (!apiKey) {
    console.warn('[story-api] No DashScope API key configured, using fallback text')
    writeText(res, fallbackText(data))
    return
  }

  const prompt = buildPrompt(data)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS)

  try {
    const response = await fetch(`${apiBaseUrl}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        stream: true,
        enable_thinking: false,
        temperature: 0.82,
        max_tokens: 700,
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error(`[story-api] LLM API error: ${response.status} ${errText}`)
      throw new Error(`LLM API error: ${response.status}`)
    }

    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    })

    const reader = response.body?.getReader()
    if (!reader) throw new Error('No response body')

    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || trimmed === 'data: [DONE]') continue
        if (!trimmed.startsWith('data: ')) continue

        try {
          const json = JSON.parse(trimmed.slice(6))
          const content = json.choices?.[0]?.delta?.content
          if (content) res.write(content)
        } catch {
          // Ignore partial or malformed SSE fragments.
        }
      }
    }

    res.end()
  } catch (err) {
    console.error('[story-api] Error:', err)
    if (res.headersSent) {
      res.end()
      return
    }
    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Story-Fallback': '1',
    })
    res.end(fallbackText(data))
  } finally {
    clearTimeout(timeout)
  }
}

export async function actionMiddleware(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  let data: ActionRequest
  try {
    const bodyRaw = await readBody(req)
    data = JSON.parse(bodyRaw) as ActionRequest
  } catch {
    writeText(res, 'Invalid action request', 400)
    return
  }

  if (!data.playerInput?.trim() || !Array.isArray(data.choices) || data.choices.length === 0) {
    writeJson(res, { choiceIndex: 0, resolution: '继续调查', source: 'fallback' } satisfies ActionResponse)
    return
  }

  const { apiBaseUrl, apiKey, model } = getApiConfig()
  if (!apiKey) {
    writeJson(res, fallbackAction(data))
    return
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS)

  try {
    const response = await fetch(`${apiBaseUrl}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: ACTION_SYSTEM_PROMPT },
          { role: 'user', content: buildActionPrompt(data) },
        ],
        stream: false,
        enable_thinking: false,
        temperature: 0.1,
        max_tokens: 180,
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error(`[action-api] LLM API error: ${response.status} ${errText}`)
      writeJson(res, fallbackAction(data))
      return
    }

    const payload = await response.json() as {
      choices?: Array<{ message?: { content?: unknown } }>
    }
    const content = payload.choices?.[0]?.message?.content
    if (typeof content !== 'string') {
      writeJson(res, fallbackAction(data))
      return
    }

    writeJson(res, coerceActionResponse(extractJsonObject(content), data))
  } catch (err) {
    console.error('[action-api] Error:', err)
    writeJson(res, fallbackAction(data))
  } finally {
    clearTimeout(timeout)
  }
}
