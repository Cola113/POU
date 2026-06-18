# 子午线 MERIDIAN

深海科幻、悬疑、心理恐怖互动小说原型。一周目固定通向 bad ending「回溯」：结尾回到开头的月窗外溢信号，玩家的选择会被记录为人格回写，但无法真正逃出循环。

## 当前状态

- Vite + React + TypeScript + Tailwind CSS。
- 点击主画面推进下一条完整气泡，文字以流式方式出现。
- 剧情树在 `src/data/story.ts`，线性节点使用 `next`，分支节点使用 `choices`。
- 玩家可以点选固定选项，也可以输入自由行动；`POST /api/action` 会把自由行动解析到现有剧情分支。
- `POST /api/story` 保留为 AI 扩写当前节点的接口，适合后续把部分节点从硬编码改成 AI 辅助文本。
- mer 是一只英短蓝白猫，只在少量生活片段中作为现实锚点出现；没有专属 UI。

## 脚本

```bash
npm run dev
npm run build
npm run lint
npm run check:story
```

## Qwen/DashScope 配置

默认使用阿里云百炼 OpenAI 兼容模式：

```env
DASHSCOPE_API_KEY=sk-...
DASHSCOPE_MODEL=qwen-plus
DASHSCOPE_API_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
```

也兼容旧变量名：

```env
VITE_LLM_API_KEY=sk-...
VITE_LLM_MODEL=qwen-plus
VITE_LLM_API_BASE=https://dashscope.aliyuncs.com/compatible-mode/v1
```

如果使用 `qwen3.7-plus` 这类带 thinking 的模型，服务端会传 `enable_thinking: false`，避免游戏流式文本长时间等待推理内容。

## API

### `POST /api/story`

用于扩写当前剧情节点，响应为 `text/plain` 流式文本。

```ts
{
  scene: string;
  characters: string[];
  mood: string;
  context: string;
  previousChoices: string[];
  coreFear?: string;
  nodeGoal?: string;
}
```

### `POST /api/action`

用于把玩家自由输入映射到现有剧情树分支，响应为 JSON。

```ts
{
  nodeId: string;
  scene: string;
  playerInput: string;
  choices: {
    text: string;
    next: string;
    intent?: string[];
  }[];
  previousChoices: string[];
  recentContext: string;
}
```

```ts
{
  choiceIndex: number;
  resolution: string;
  source: 'ai' | 'fallback';
}
```

AI 只负责解析意图，不允许新增分支、提前胜利、跳过关键剧情或伤害 mer。服务端会用本地关键词评分兜底，避免模型误选明显不匹配的分支。
