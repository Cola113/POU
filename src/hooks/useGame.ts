import { useCallback, useEffect, useRef, useState } from 'react';
import { storyNodes } from '../data/story';
import type { Beat, DisplayMessage, GameState, GameTimeInfo, StoryNode } from '../types/game';

const BREATH_CYCLE_MINUTES = 47;
const STORY_START_HOUR = 22;
const SAVE_KEY = 'abyss-save-v1';
const ENDING_NAMES = new Set(
  Object.values(storyNodes)
    .map(node => node.endingName)
    .filter((name): name is string => Boolean(name))
);
const TOTAL_ENDINGS = ENDING_NAMES.size;
const VALID_PHASES = new Set<GameState['phase']>(['title', 'playing', 'transitioning', 'ending']);
const VALID_BEAT_TYPES = new Set<Beat['type']>(['scene', 'narration', 'dialogue', 'inner', 'system']);

type PersistedGameState = Omit<GameState, 'currentNode' | 'isStreaming'>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function readNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function calcGameTime(gameHours: number): GameTimeInfo {
  const totalMinutes = (STORY_START_HOUR * 60) + (gameHours * 60);
  const hour = Math.floor((totalMinutes / 60) % 24);
  const minute = Math.floor(totalMinutes % 60);
  const totalBreathMinutes = totalMinutes % (24 * 60);
  const cycleNumber = Math.floor(totalBreathMinutes / BREATH_CYCLE_MINUTES) + 1;
  const cycleProgress = (totalBreathMinutes % BREATH_CYCLE_MINUTES) / BREATH_CYCLE_MINUTES;
  let shift: GameTimeInfo['shift'];
  let shiftLabel: string;
  let shiftHours: string;
  if (hour >= 6 && hour < 8) { shift = 'WAKE'; shiftLabel = '唤醒期'; shiftHours = '06:00-08:00'; }
  else if (hour >= 8 && hour < 18) { shift = 'WORK'; shiftLabel = '工作期'; shiftHours = '08:00-18:00'; }
  else if (hour >= 18 && hour < 23) { shift = 'REST'; shiftLabel = '休憩期'; shiftHours = '18:00-23:00'; }
  else { shift = 'DEEP-REST'; shiftLabel = '深休期'; shiftHours = '23:00-06:00'; }
  const storyDay = Math.max(1, Math.floor(gameHours / 24) + 1);
  const ambientPhase: GameTimeInfo['ambientPhase'] = hour >= 6 && hour < 18 ? 'day-cycle' : 'night-cycle';
  return { hour, minute, formatted: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`, cycleNumber, cycleProgress, shift, shiftLabel, shiftHours, storyDay, ambientPhase };
}

function loadEndings(): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem('abyss-endings') || '[]');
    return Array.isArray(saved) ? saved.filter(name => ENDING_NAMES.has(name)) : [];
  } catch {
    return [];
  }
}
function saveEndings(endings: string[]) {
  try {
    localStorage.setItem('abyss-endings', JSON.stringify(endings));
  } catch {
    // Persistence is helpful but should never interrupt the story.
  }
}
function loadLoopCount(): number {
  try {
    const count = Number.parseInt(localStorage.getItem('abyss-loops') || '0', 10);
    return Number.isFinite(count) ? count : 0;
  } catch {
    return 0;
  }
}
function saveLoopCount(count: number) {
  try {
    localStorage.setItem('abyss-loops', String(count));
  } catch {
    // Persistence is helpful but should never interrupt the story.
  }
}

function restoreMessages(value: unknown): DisplayMessage[] {
  if (!Array.isArray(value)) return [];

  return value.reduce<DisplayMessage[]>((messages, item, index) => {
    if (!isRecord(item)) return messages;

    const nodeId = readString(item.nodeId);
    const type = readString(item.type);
    const text = readString(item.fullText, readString(item.text));
    if (!nodeId || !VALID_BEAT_TYPES.has(type as Beat['type']) || !text) return messages;

    const fullText = readString(item.fullText);
    messages.push({
      id: readString(item.id, `saved-msg-${index}`),
      nodeId,
      type: type as Beat['type'],
      speaker: typeof item.speaker === 'string' ? item.speaker : undefined,
      text,
      fullText: fullText || undefined,
      isStreaming: false,
    });
    return messages;
  }, []);
}

function restoreChoices(value: unknown): GameState['choicesMade'] {
  if (!Array.isArray(value)) return [];

  return value.reduce<GameState['choicesMade']>((choices, item) => {
    if (!isRecord(item)) return choices;

    const nodeId = readString(item.nodeId);
    const choiceText = readString(item.choiceText);
    const choiceIndex = readNumber(item.choiceIndex, -1);
    if (!nodeId || !choiceText || choiceIndex < 0) return choices;

    choices.push({
      nodeId,
      choiceIndex,
      choiceText,
      resolvedChoiceText: typeof item.resolvedChoiceText === 'string' ? item.resolvedChoiceText : undefined,
      resolutionText: typeof item.resolutionText === 'string' ? item.resolutionText : undefined,
    });
    return choices;
  }, []);
}

function createFreshState(): GameState {
  return {
    phase: 'title',
    currentNodeId: 'opening',
    currentNode: null,
    messages: [],
    currentBeatIndex: 0,
    isStreaming: false,
    history: [],
    choicesMade: [],
    gameTime: 0,
    loopCount: loadLoopCount(),
    endingsUnlocked: loadEndings(),
  };
}

function loadSavedState(): GameState | null {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (!isRecord(parsed)) return null;

    const currentNodeId = readString(parsed.currentNodeId, 'opening');
    const currentNode = storyNodes[currentNodeId];
    const requestedPhase = readString(parsed.phase, 'title') as GameState['phase'];
    if (!VALID_PHASES.has(requestedPhase)) return null;
    if (requestedPhase !== 'title' && !currentNode) return null;

    const fresh = createFreshState();
    const safeHistory = readStringArray(parsed.history).filter(nodeId => Boolean(storyNodes[nodeId]));
    const history = requestedPhase !== 'title' && currentNode && !safeHistory.includes(currentNodeId)
      ? [...safeHistory, currentNodeId]
      : safeHistory;
    const beatLimit = currentNode ? currentNode.beats.length : 0;
    const currentBeatIndex = Math.max(0, Math.min(Math.floor(readNumber(parsed.currentBeatIndex)), beatLimit));
    const restoredPhase = requestedPhase === 'ending' && !currentNode?.isEnding ? 'playing' : requestedPhase;

    return {
      ...fresh,
      phase: restoredPhase,
      currentNodeId,
      currentNode: restoredPhase === 'title' ? null : currentNode,
      messages: restoreMessages(parsed.messages),
      currentBeatIndex,
      isStreaming: false,
      history,
      choicesMade: restoreChoices(parsed.choicesMade),
      gameTime: readNumber(parsed.gameTime, currentNode?.gameTime ?? fresh.gameTime),
      loopCount: readNumber(parsed.loopCount, fresh.loopCount),
      endingsUnlocked: readStringArray(parsed.endingsUnlocked).filter(name => ENDING_NAMES.has(name)),
    };
  } catch {
    return null;
  }
}

function createInitialState(): GameState {
  return loadSavedState() ?? createFreshState();
}

function createPersistedState(state: GameState): PersistedGameState {
  return {
    phase: state.phase,
    currentNodeId: state.currentNodeId,
    messages: state.messages.map(message => ({
      ...message,
      text: message.fullText || message.text,
      isStreaming: false,
    })),
    currentBeatIndex: state.currentBeatIndex,
    history: state.history,
    choicesMade: state.choicesMade,
    gameTime: state.gameTime,
    loopCount: state.loopCount,
    endingsUnlocked: state.endingsUnlocked,
  };
}

function saveGameState(state: GameState) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(createPersistedState(state)));
  } catch {
    // Local storage can be disabled or full; losing persistence should not stop play.
  }
}

function createStreamingMessage(beat: Beat, nodeId: string): DisplayMessage {
  return {
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    nodeId,
    type: beat.type,
    speaker: beat.speaker,
    text: '',
    fullText: beat.text,
    isStreaming: true,
  };
}

function getStreamSpeed(type: Beat['type']): number {
  if (type === 'scene' || type === 'system') return 18;
  if (type === 'dialogue') return 22;
  return 16;
}

function getStreamStep(type: Beat['type']): number {
  if (type === 'scene' || type === 'system') return 2;
  return 1;
}

function completeNode(state: GameState, node: StoryNode): GameState {
  if (!node.isEnding) {
    return { ...state, phase: 'playing', isStreaming: false };
  }

  let endingsUnlocked = state.endingsUnlocked;
  if (node.endingName && !endingsUnlocked.includes(node.endingName)) {
    endingsUnlocked = [...endingsUnlocked, node.endingName];
    saveEndings(endingsUnlocked);
  }

  return {
    ...state,
    phase: 'ending',
    isStreaming: false,
    endingsUnlocked,
  };
}

function revealBeat(state: GameState, node: StoryNode, beatIndex: number): GameState {
  const beat = node.beats[beatIndex];
  if (!beat) {
    return completeNode({ ...state, currentBeatIndex: beatIndex }, node);
  }

  const nextBeatIndex = beatIndex + 1;
  const nextState: GameState = {
    ...state,
    messages: [...state.messages, createStreamingMessage(beat, node.id)],
    currentBeatIndex: nextBeatIndex,
    phase: 'playing',
    isStreaming: true,
  };

  return nextState;
}

function enterNode(state: GameState, nodeId: string): GameState {
  const node = storyNodes[nodeId];
  if (!node) return state;

  const enteredState: GameState = {
    ...state,
    currentNodeId: nodeId,
    currentNode: node,
    currentBeatIndex: 0,
    phase: 'playing',
    isStreaming: false,
    gameTime: node.gameTime >= 0 ? node.gameTime : state.gameTime,
    history: [...state.history, nodeId],
  };

  return revealBeat(enteredState, node, 0);
}

export function useGame() {
  const [state, setState] = useState<GameState>(createInitialState);
  const stateRef = useRef(state);
  const lastSaveKeyRef = useRef('');

  useEffect(() => {
    stateRef.current = state;

    const latestMessage = state.messages[state.messages.length - 1];
    const saveKey = [
      state.phase,
      state.currentNodeId,
      state.currentBeatIndex,
      state.messages.length,
      latestMessage?.id || '',
      state.history.length,
      state.choicesMade.length,
      state.gameTime,
      state.loopCount,
      state.endingsUnlocked.join('|'),
    ].join('::');

    if (saveKey !== lastSaveKeyRef.current) {
      lastSaveKeyRef.current = saveKey;
      saveGameState(state);
    }
  }, [state]);

  useEffect(() => {
    if (!state.isStreaming) return;

    const activeMessage = [...stateRef.current.messages].reverse().find(message => message.isStreaming);
    if (!activeMessage) {
      setState(prev => ({ ...prev, isStreaming: false }));
      return;
    }

    const fullText = activeMessage.fullText || activeMessage.text;
    let charIndex = activeMessage.text.length;
    const streamSpeed = getStreamSpeed(activeMessage.type);
    const streamStep = getStreamStep(activeMessage.type);

    const timer = window.setInterval(() => {
      charIndex = Math.min(fullText.length, charIndex + streamStep);

      setState(prev => {
        const currentMessage = prev.messages.find(message => message.id === activeMessage.id);
        if (!currentMessage?.isStreaming) return prev;

        const isDone = charIndex >= fullText.length;
        const messages = prev.messages.map(message => (
          message.id === activeMessage.id
            ? { ...message, text: fullText.slice(0, charIndex), isStreaming: !isDone }
            : message
        ));

        const nextState: GameState = {
          ...prev,
          messages,
          isStreaming: !isDone,
        };

        if (!isDone) return nextState;

        const node = storyNodes[prev.currentNodeId];
        if (node && prev.currentBeatIndex >= node.beats.length) {
          return completeNode(nextState, node);
        }

        return nextState;
      });

      if (charIndex >= fullText.length) {
        window.clearInterval(timer);
      }
    }, streamSpeed);

    return () => window.clearInterval(timer);
  }, [state.isStreaming]);

  const startGame = useCallback(() => {
    setState(enterNode(createFreshState(), 'opening'));
  }, []);

  const jumpToNode = useCallback((nodeId: string) => {
    setState(prev => {
      if (!storyNodes[nodeId]) return prev;

      return enterNode({
        ...createFreshState(),
        loopCount: prev.loopCount,
        endingsUnlocked: prev.endingsUnlocked,
      }, nodeId);
    });
  }, []);

  const advance = useCallback(() => {
    setState(prev => {
      if (prev.phase === 'title' || prev.phase === 'ending') return prev;
      if (prev.isStreaming) return prev;
      const node = storyNodes[prev.currentNodeId];
      if (!node) return prev;

      if (prev.currentBeatIndex < node.beats.length) {
        return revealBeat(prev, node, prev.currentBeatIndex);
      }

      if (node.next) {
        return enterNode(prev, node.next);
      }

      return prev;
    });
  }, []);

  const makeChoice = useCallback((choiceIndex: number, playerInput?: string, resolutionText?: string) => {
    setState(prev => {
      if (prev.phase !== 'playing') return prev;
      if (prev.isStreaming) return prev;
      const node = storyNodes[prev.currentNodeId];
      if (!node || prev.currentBeatIndex < node.beats.length) return prev;
      const choice = node.choices[choiceIndex];
      if (!choice) return prev;

      const displayedChoice = playerInput?.trim() || choice.text;
      const choiceMsg: DisplayMessage = {
        id: `choice-${Date.now()}`,
        nodeId: prev.currentNodeId,
        type: 'dialogue',
        speaker: '伊恩',
        text: displayedChoice,
      };
      const resolutionMsg: DisplayMessage | null = resolutionText ? {
        id: `resolution-${Date.now()}`,
        nodeId: prev.currentNodeId,
        type: 'system',
        text: `【行动归档：${resolutionText}】`,
      } : null;
      const choiceMessages = resolutionMsg ? [choiceMsg, resolutionMsg] : [choiceMsg];
      const stateWithChoice: GameState = {
        ...prev,
        messages: [...prev.messages, ...choiceMessages],
        choicesMade: [...prev.choicesMade, {
          nodeId: prev.currentNodeId,
          choiceIndex,
          choiceText: displayedChoice,
          resolvedChoiceText: choice.text,
          resolutionText,
        }],
      };

      return enterNode(stateWithChoice, choice.next);
    });
  }, []);

  const restart = useCallback(() => {
    const newLoop = loadLoopCount() + 1;
    saveLoopCount(newLoop);
    const newState = createFreshState();
    newState.loopCount = newLoop;
    setState(newState);
  }, []);

  const timeInfo = calcGameTime(state.gameTime);

  return { state, timeInfo, startGame, jumpToNode, advance, makeChoice, restart, totalEndings: TOTAL_ENDINGS };
}
