import { useCallback, useEffect, useRef, useState } from 'react';
import { storyNodes } from '../data/story';
import type { Beat, DisplayMessage, GameState, GameTimeInfo, StoryNode } from '../types/game';

const BREATH_CYCLE_MINUTES = 47;
const STORY_START_HOUR = 22;
const TOTAL_ENDINGS = new Set(
  Object.values(storyNodes)
    .map(node => node.endingName)
    .filter((name): name is string => Boolean(name))
).size;

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
  try { return JSON.parse(localStorage.getItem('abyss-endings') || '[]'); } catch { return []; }
}
function saveEndings(endings: string[]) { localStorage.setItem('abyss-endings', JSON.stringify(endings)); }
function loadLoopCount(): number {
  const count = Number.parseInt(localStorage.getItem('abyss-loops') || '0', 10);
  return Number.isFinite(count) ? count : 0;
}
function saveLoopCount(count: number) { localStorage.setItem('abyss-loops', String(count)); }

function createInitialState(): GameState {
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

  useEffect(() => {
    stateRef.current = state;
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
    setState(enterNode(createInitialState(), 'opening'));
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
    const newState = createInitialState();
    newState.loopCount = newLoop;
    setState(newState);
  }, []);

  const timeInfo = calcGameTime(state.gameTime);

  return { state, timeInfo, startGame, advance, makeChoice, restart, totalEndings: TOTAL_ENDINGS };
}
