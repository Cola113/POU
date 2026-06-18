// ===== Beat Types =====
export type BeatType = 'scene' | 'narration' | 'dialogue' | 'inner' | 'system';

export interface Beat {
  type: BeatType;
  speaker?: string;
  text: string;
  delay?: number; // ms delay before showing this beat (after previous)
}

export interface StoryChoice {
  text: string;
  next: string;
  intent?: string[];
}

export interface StoryNode {
  id: string;
  location: string;
  gameTime: number; // hours since story start (0-based)
  choices: StoryChoice[];
  next?: string; // linear continuation used when there are no choices
  beats: Beat[];
  isEnding?: boolean;
  endingName?: string;
  hardcoded?: boolean; // if true, skip AI generation
  aiPrompt?: string; // prompt for AI content generation
}

// ===== Display Message (rendered in UI) =====
export interface DisplayMessage {
  id: string;
  nodeId: string;
  type: BeatType;
  speaker?: string;
  text: string;
  fullText?: string;
  isStreaming?: boolean;
}

// ===== Time System =====
// 47-minute Breather Cycle system
export interface GameTimeInfo {
  // Standard time
  hour: number; // 0-23
  minute: number; // 0-59
  formatted: string; // "03:17"

  // Breather cycle
  cycleNumber: number; // 1-31
  cycleProgress: number; // 0.0-1.0

  // Shift
  shift: 'WAKE' | 'WORK' | 'REST' | 'DEEP-REST';
  shiftLabel: string;
  shiftHours: string;

  // Story day
  storyDay: number; // 1, 2, 3...

  // Atmospheric
  ambientPhase: 'day-cycle' | 'night-cycle';
}

// ===== Game State =====
export type GamePhase = 'title' | 'playing' | 'transitioning' | 'ending';

export interface GameState {
  phase: GamePhase;
  currentNodeId: string;
  currentNode: StoryNode | null;
  messages: DisplayMessage[];
  currentBeatIndex: number;
  isStreaming: boolean;
  history: string[]; // visited node IDs
  choicesMade: {
    nodeId: string;
    choiceIndex: number;
    choiceText: string;
    resolvedChoiceText?: string;
    resolutionText?: string;
  }[];
  gameTime: number; // hours since story start
  loopCount: number; // how many loops (for 2nd playthrough)
  endingsUnlocked: string[];
}
