import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useGame } from './hooks/useGame';
import type { DisplayMessage, GameTimeInfo, StoryChoice, StoryNode } from './types/game';

const DYNAMIC_NUMBER_PATTERN = /(\d{1,3}(?:,\d{3})+|\d{4,})/g;

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

function DynamicText({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(DYNAMIC_NUMBER_PATTERN)) {
    const valueText = match[0];
    const index = match.index ?? 0;
    const value = Number(valueText.replace(/,/g, ''));
    if (index > lastIndex) parts.push(text.slice(lastIndex, index));
    parts.push(
      <AnimatedNumber
        key={`${index}-${valueText}`}
        value={value}
        grouped={valueText.includes(',')}
        className="dynamic-number"
      />
    );
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
function StatusBar({ timeInfo, location, depth, loopCount }: {
  timeInfo: GameTimeInfo;
  location: string;
  depth: number;
  loopCount: number;
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
        <span className="status-day">DAY {timeInfo.storyDay}</span>
        {loopCount > 0 && <span className="status-loop">LOOP {loopCount + 1}</span>}
      </div>
    </div>
  );
}

// ===== Message Renderer =====
function MessageItem({ message, isLast, isStreaming }: {
  message: DisplayMessage;
  isLast: boolean;
  isStreaming: boolean;
}) {
  if (message.type === 'scene') {
    return (
      <div className="msg-scene">
        <span className="scene-text"><DynamicText text={message.text} /></span>
      </div>
    );
  }

  if (message.type === 'system') {
    return (
      <div className="msg-system">
        <span className="system-text"><DynamicText text={message.text} /></span>
      </div>
    );
  }

  if (message.type === 'narration') {
    return (
      <div className="msg-narration">
        <p className="narration-text"><DynamicText text={message.text} /></p>
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
          <p><DynamicText text={message.text} /></p>
          {isLast && isStreaming && <span className="cursor-blink">|</span>}
        </div>
      </div>
    );
  }

  if (message.type === 'inner') {
    return (
      <div className="msg-inner">
        <p className="inner-text"><DynamicText text={message.text} /></p>
        {isLast && isStreaming && <span className="cursor-blink">|</span>}
      </div>
    );
  }

  return null;
}

// ===== Title Screen =====
function TitleScreen({ onStart, endingsUnlocked, totalEndings, loopCount }: {
  onStart: () => void;
  endingsUnlocked: string[];
  totalEndings: number;
  loopCount: number;
}) {
  return (
    <div className="title-screen">
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
  return (
    <div className="ending-screen">
      <div className="ending-label">— 结局 —</div>
      <h2 className="ending-name">{endingName}</h2>
      <div className="personality-analysis">
        <span className="analysis-label">回声室人格回写</span>
        <p>{personalitySummary}</p>
      </div>
      <p className="ending-stats">已解锁 {endingsUnlocked.length}/{totalEndings} 个结局</p>
      <button className="btn-restart" onClick={onRestart}>
        回到深潜器
      </button>
    </div>
  );
}

// ===== Main App =====
export default function App() {
  const { state, timeInfo, startGame, advance, makeChoice, restart, totalEndings } = useGame();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [actionText, setActionText] = useState('');
  const [isResolvingAction, setIsResolvingAction] = useState(false);
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.messages]);

  const handleClick = () => {
    if (!isResolvingAction) advance();
  };

  if (state.phase === 'title') {
    return (
      <TitleScreen
        onStart={startGame}
        endingsUnlocked={state.endingsUnlocked}
        totalEndings={totalEndings}
        loopCount={state.loopCount}
      />
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
      <StatusBar
        timeInfo={timeInfo}
        location={currentNode?.location || '子午线站'}
        depth={currentDepth}
        loopCount={state.loopCount}
      />

      <main className="messages-container">
        {state.messages.map((msg, i) => (
          <MessageItem
            key={msg.id}
            message={msg}
            isLast={i === state.messages.length - 1}
            isStreaming={state.isStreaming && msg.isStreaming === true}
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
          onRestart={restart}
          endingsUnlocked={state.endingsUnlocked}
          totalEndings={totalEndings}
        />
      )}
    </div>
  );
}
