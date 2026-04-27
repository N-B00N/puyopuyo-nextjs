'use client';

import { useCallback, useEffect, useReducer, useRef } from 'react';
import {
  ROWS, VISIBLE_ROWS, COLS, COLOR_STYLES,
  Board, Cell, Color, ActivePiece, GamePhase,
  createBoard, createPiece, getSatPos, hardDrop,
  applyGravity, calcScore, canPlace, clearGroups,
  countCleared, findGroups, isGameOver, landPiece,
  stepDown, tryMove, tryRotate,
} from '@/lib/puyo';

// ─── State ────────────────────────────────────────────────────────────────────

interface State {
  board: Board;
  current: ActivePiece;
  next: ActivePiece;
  phase: GamePhase;
  score: number;
  chain: number;
  clearKeys: Set<string>; // keys being animated out
  bestScore: number;
  level: number;
  linesCleared: number;
}

type Action =
  | { type: 'MOVE'; dCol: number }
  | { type: 'ROTATE'; clockwise: boolean }
  | { type: 'SOFT_DROP' }
  | { type: 'HARD_DROP' }
  | { type: 'TICK' }
  | { type: 'RESOLVE' }
  | { type: 'RESTART' };

function initialState(): State {
  const board = createBoard();
  const current = createPiece();
  const next = createPiece();
  return { board, current, next, phase: 'falling', score: 0, chain: 0, clearKeys: new Set(), bestScore: 0, level: 1, linesCleared: 0 };
}

function reduce(state: State, action: Action): State {
  switch (action.type) {
    case 'MOVE': {
      if (state.phase !== 'falling') return state;
      return { ...state, current: tryMove(state.board, state.current, action.dCol) };
    }
    case 'ROTATE': {
      if (state.phase !== 'falling') return state;
      return { ...state, current: tryRotate(state.board, state.current, action.clockwise) };
    }
    case 'SOFT_DROP': {
      if (state.phase !== 'falling') return state;
      const { piece, landed } = stepDown(state.board, state.current);
      if (!landed) return { ...state, current: piece };
      return landAndResolve(state, piece);
    }
    case 'HARD_DROP': {
      if (state.phase !== 'falling') return state;
      const dropped = hardDrop(state.board, state.current);
      return landAndResolve(state, dropped);
    }
    case 'TICK': {
      if (state.phase !== 'falling') return state;
      const { piece, landed } = stepDown(state.board, state.current);
      if (!landed) return { ...state, current: piece };
      return landAndResolve(state, piece);
    }
    case 'RESOLVE': {
      if (state.phase !== 'clearing') return state;
      // Actually remove the animated puyos and apply gravity
      const afterClear = applyGravity(clearGroups(state.board, [state.clearKeys]));
      const groups = findGroups(afterClear);
      if (groups.length === 0) {
        // Chain is over — spawn next piece
        const next = createPiece();
        if (isGameOver(afterClear, state.next)) {
          return { ...state, board: afterClear, phase: 'gameover', chain: 0, clearKeys: new Set(), bestScore: Math.max(state.score, state.bestScore) };
        }
        return { ...state, board: afterClear, current: state.next, next, phase: 'falling', chain: 0, clearKeys: new Set() };
      }
      // Chain continues — keep new puyos in board for the next animation round
      const cleared = countCleared(groups);
      const newChain = state.chain + 1;
      const newClearKeys = new Set<string>();
      for (const g of groups) for (const k of g) newClearKeys.add(k);
      return {
        ...state,
        board: afterClear,
        score: state.score + calcScore(newChain, cleared),
        chain: newChain,
        clearKeys: newClearKeys,
        phase: 'clearing',
        linesCleared: state.linesCleared + cleared,
        level: Math.floor((state.linesCleared + cleared) / 20) + 1,
      };
    }
    case 'RESTART':
      return { ...initialState(), bestScore: state.bestScore };
    default:
      return state;
  }
}

function landAndResolve(state: State, piece: ActivePiece): State {
  const landed = applyGravity(landPiece(state.board, piece));
  const groups = findGroups(landed);

  if (groups.length === 0) {
    const next = createPiece();
    if (isGameOver(landed, state.next)) {
      return { ...state, board: landed, phase: 'gameover', bestScore: Math.max(state.score, state.bestScore) };
    }
    return { ...state, board: landed, current: state.next, next, phase: 'falling', chain: 0, clearKeys: new Set() };
  }

  const cleared = countCleared(groups);
  const newScore = state.score + calcScore(1, cleared);
  const newLines = state.linesCleared + cleared;
  const newLevel = Math.floor(newLines / 20) + 1;
  const clearKeys = new Set<string>();
  for (const g of groups) for (const k of g) clearKeys.add(k);

  return {
    ...state,
    board: landed,  // puyos remain in board for the clearing animation
    score: newScore,
    chain: 1,
    clearKeys,
    phase: 'clearing',
    linesCleared: newLines,
    level: newLevel,
  };
}

// ─── Rendering helpers ────────────────────────────────────────────────────────

const CELL_SIZE = 44;
const BOARD_W = COLS * CELL_SIZE;
const BOARD_H = VISIBLE_ROWS * CELL_SIZE;

function PuyoCircle({ color, size = CELL_SIZE, faded = false, clearing = false }: {
  color: Color; size?: number; faded?: boolean; clearing?: boolean;
}) {
  const s = COLOR_STYLES[color];
  return (
    <div
      style={{
        width: size,
        height: size,
        position: 'relative',
        opacity: faded ? 0.35 : 1,
        transform: clearing ? 'scale(1.3)' : 'scale(1)',
        transition: clearing ? 'transform 0.15s ease-out, opacity 0.15s ease-out' : undefined,
      }}
    >
      {/* Puyo body */}
      <div style={{
        position: 'absolute',
        inset: 2,
        borderRadius: '50%',
        background: `radial-gradient(circle at 35% 30%, ${s.light}, ${s.bg})`,
        boxShadow: `0 0 ${size * 0.3}px ${s.glow}, inset 0 -3px 6px rgba(0,0,0,0.3)`,
      }} />
      {/* Eyes */}
      <div style={{
        position: 'absolute',
        top: '32%',
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: size * 0.12,
      }}>
        {[0, 1].map(i => (
          <div key={i} style={{
            width: size * 0.12,
            height: size * 0.16,
            borderRadius: '50%',
            background: '#111',
            boxShadow: `0 0 0 ${size * 0.025}px #fff4`,
          }} />
        ))}
      </div>
      {/* Shine */}
      <div style={{
        position: 'absolute',
        top: '18%',
        left: '28%',
        width: size * 0.2,
        height: size * 0.14,
        borderRadius: '50%',
        background: 'rgba(255,255,255,0.55)',
        transform: 'rotate(-20deg)',
      }} />
    </div>
  );
}

// ─── Board display ────────────────────────────────────────────────────────────

function BoardView({ state }: { state: State }) {
  const { board, current, phase, clearKeys } = state;
  const ghost = phase === 'falling' ? hardDrop(board, current) : null;

  // Build overlay cells for current + ghost pieces
  const overlayCells = new Map<string, { color: Color; isGhost: boolean; isCurrent: boolean }>();
  if (phase === 'falling' && current) {
    const sat = getSatPos(current);
    const ghostSat = ghost ? getSatPos(ghost) : null;

    const addGhost = (r: number, c: number, color: Color) => {
      const key = `${r},${c}`;
      if (!overlayCells.has(key)) overlayCells.set(key, { color, isGhost: true, isCurrent: false });
    };
    if (ghost) {
      const gr = ghost.pivotRow, gc = ghost.pivotCol;
      if (gr >= 1) addGhost(gr, gc, ghost.pivotColor);
      if (ghostSat && ghostSat.row >= 1) addGhost(ghostSat.row, ghostSat.col, ghost.satColor);
    }

    const addCurrent = (r: number, c: number, color: Color) => {
      if (r >= 1) overlayCells.set(`${r},${c}`, { color, isGhost: false, isCurrent: true });
    };
    addCurrent(current.pivotRow, current.pivotCol, current.pivotColor);
    addCurrent(sat.row, sat.col, current.satColor);
  }

  return (
    <div style={{
      position: 'relative',
      width: BOARD_W,
      height: BOARD_H,
      background: 'rgba(10,10,30,0.95)',
      border: '2px solid rgba(100,120,255,0.3)',
      borderRadius: 8,
      overflow: 'hidden',
      boxShadow: '0 0 40px rgba(80,100,255,0.15), inset 0 0 60px rgba(0,0,10,0.5)',
    }}>
      {/* Grid lines */}
      {Array.from({ length: VISIBLE_ROWS }).map((_, ri) =>
        Array.from({ length: COLS }).map((_, ci) => (
          <div key={`g${ri}${ci}`} style={{
            position: 'absolute',
            left: ci * CELL_SIZE,
            top: ri * CELL_SIZE,
            width: CELL_SIZE,
            height: CELL_SIZE,
            border: '1px solid rgba(60,80,160,0.15)',
            boxSizing: 'border-box',
          }} />
        ))
      )}

      {/* Placed puyos (visible rows = board rows 1..12) */}
      {Array.from({ length: VISIBLE_ROWS }).map((_, visRow) => {
        const boardRow = visRow + 1;
        return Array.from({ length: COLS }).map((_, col) => {
          const cell = board[boardRow]?.[col] as Cell;
          const key = `${boardRow},${col}`;
          const isClearing = clearKeys.has(key);
          if (!cell) return null;
          return (
            <div key={`b${visRow}${col}`} style={{
              position: 'absolute',
              left: col * CELL_SIZE,
              top: visRow * CELL_SIZE,
              opacity: isClearing ? 0 : 1,
              transition: isClearing ? 'opacity 0.25s ease-out, transform 0.25s ease-out' : undefined,
              transform: isClearing ? 'scale(1.4)' : 'scale(1)',
            }}>
              <PuyoCircle color={cell} clearing={isClearing} />
            </div>
          );
        });
      })}

      {/* Ghost + current piece */}
      {Array.from(overlayCells.entries()).map(([key, { color, isGhost, isCurrent }]) => {
        const [r, c] = key.split(',').map(Number);
        const visRow = r - 1;
        if (visRow < 0) return null;
        return (
          <div key={`o${key}`} style={{
            position: 'absolute',
            left: c * CELL_SIZE,
            top: visRow * CELL_SIZE,
          }}>
            <PuyoCircle color={color} faded={isGhost && !isCurrent} />
          </div>
        );
      })}
    </div>
  );
}

// ─── Side panel ───────────────────────────────────────────────────────────────

function NextPanel({ piece }: { piece: ActivePiece }) {
  const sat = getSatPos(piece);
  // Normalize for display in a 2×2 grid
  const cells: Array<{ color: Color; row: number; col: number }> = [
    { color: piece.pivotColor, row: piece.pivotRow, col: piece.pivotCol },
    { color: piece.satColor, row: sat.row, col: sat.col },
  ];
  const minRow = Math.min(...cells.map(c => c.row));
  const minCol = Math.min(...cells.map(c => c.col));
  const normalized = cells.map(c => ({ ...c, row: c.row - minRow, col: c.col - minCol }));

  const S = 36;
  return (
    <div style={{
      background: 'rgba(10,10,30,0.8)',
      border: '1px solid rgba(100,120,255,0.3)',
      borderRadius: 8,
      padding: 12,
      width: 100,
    }}>
      <div style={{ color: '#8899cc', fontSize: 11, marginBottom: 8, textAlign: 'center', letterSpacing: 2, textTransform: 'uppercase' }}>Next</div>
      <div style={{ position: 'relative', height: S * 2, width: S * 2, margin: '0 auto' }}>
        {normalized.map((c, i) => (
          <div key={i} style={{ position: 'absolute', left: c.col * S, top: c.row * S }}>
            <PuyoCircle color={c.color} size={S} />
          </div>
        ))}
      </div>
    </div>
  );
}

function ScorePanel({ score, best, level, chain }: { score: number; best: number; level: number; chain: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {[
        { label: 'SCORE', value: score.toLocaleString() },
        { label: 'BEST', value: best.toLocaleString() },
        { label: 'LEVEL', value: level },
        { label: 'CHAIN', value: chain > 0 ? `×${chain}` : '–' },
      ].map(({ label, value }) => (
        <div key={label} style={{
          background: 'rgba(10,10,30,0.8)',
          border: '1px solid rgba(100,120,255,0.3)',
          borderRadius: 8,
          padding: '8px 12px',
          width: 100,
        }}>
          <div style={{ color: '#8899cc', fontSize: 10, letterSpacing: 2, textTransform: 'uppercase' }}>{label}</div>
          <div style={{ color: '#eef', fontSize: 18, fontWeight: 700, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Chain burst overlay ──────────────────────────────────────────────────────

const CHAIN_LABELS = ['', 'Chain!', 'Double!', 'Triple!', 'Quadruple!', 'Quintuple!'];
function chainLabel(n: number) {
  return n <= 5 ? CHAIN_LABELS[n] : `${n} Chain!!`;
}

// ─── Controls help ────────────────────────────────────────────────────────────

function ControlsHelp() {
  const rows = [
    ['←→', 'Move'],
    ['↓', 'Soft drop'],
    ['Space', 'Hard drop'],
    ['Z / X', 'Rotate'],
  ];
  return (
    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
      {rows.map(([key, label]) => (
        <div key={key} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, color: '#667', fontSize: 11 }}>
          <span style={{ color: '#aab', fontWeight: 600 }}>{key}</span>
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Main game ────────────────────────────────────────────────────────────────

export default function PuyoGame() {
  const [state, dispatch] = useReducer(reduce, undefined, initialState);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resolveRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fallInterval = Math.max(150, 800 - (state.level - 1) * 60);

  // Gravity tick
  useEffect(() => {
    if (state.phase !== 'falling') {
      if (tickRef.current) clearInterval(tickRef.current);
      return;
    }
    tickRef.current = setInterval(() => dispatch({ type: 'TICK' }), fallInterval);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [state.phase, fallInterval]);

  // Auto-resolve chains
  useEffect(() => {
    if (state.phase !== 'clearing') return;
    resolveRef.current = setTimeout(() => dispatch({ type: 'RESOLVE' }), 500);
    return () => { if (resolveRef.current) clearTimeout(resolveRef.current); };
  }, [state.phase, state.chain]);

  // Keyboard
  const handleKey = useCallback((e: KeyboardEvent) => {
    switch (e.code) {
      case 'ArrowLeft':  e.preventDefault(); dispatch({ type: 'MOVE', dCol: -1 }); break;
      case 'ArrowRight': e.preventDefault(); dispatch({ type: 'MOVE', dCol: 1 }); break;
      case 'ArrowDown':  e.preventDefault(); dispatch({ type: 'SOFT_DROP' }); break;
      case 'Space':      e.preventDefault(); dispatch({ type: 'HARD_DROP' }); break;
      case 'KeyZ':       e.preventDefault(); dispatch({ type: 'ROTATE', clockwise: false }); break;
      case 'KeyX':       e.preventDefault(); dispatch({ type: 'ROTATE', clockwise: true }); break;
      case 'ArrowUp':    e.preventDefault(); dispatch({ type: 'ROTATE', clockwise: false }); break;
      case 'KeyR':       if (state.phase === 'gameover') dispatch({ type: 'RESTART' }); break;
    }
  }, [state.phase]);

  useEffect(() => {
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(ellipse at 50% 0%, #0d0d2e 0%, #050508 70%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'var(--font-geist-sans, system-ui)',
      padding: 24,
    }}>
      {/* Title */}
      <h1 style={{
        fontSize: 28,
        fontWeight: 800,
        letterSpacing: 6,
        textTransform: 'uppercase',
        marginBottom: 24,
        background: 'linear-gradient(135deg, #7fbfff, #bf7fff, #ff7fbf)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        backgroundClip: 'text',
      }}>
        ぷよぷよ
      </h1>

      {/* Game area */}
      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
        {/* Left: score + controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 4 }}>
          <ScorePanel score={state.score} best={state.bestScore} level={state.level} chain={state.chain} />
          <ControlsHelp />
        </div>

        {/* Center: board */}
        <div style={{ position: 'relative' }}>
          <BoardView state={state} />

          {/* Chain burst */}
          {state.phase === 'clearing' && state.chain > 0 && (
            <div style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
            }}>
              <div style={{
                fontSize: state.chain >= 3 ? 32 : 24,
                fontWeight: 900,
                letterSpacing: 2,
                textTransform: 'uppercase',
                background: 'linear-gradient(135deg, #ffe566, #ff9922)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                textShadow: 'none',
                filter: 'drop-shadow(0 0 12px #ffaa00aa)',
                animation: 'chainPop 0.4s ease-out',
              }}>
                {chainLabel(state.chain)}
              </div>
            </div>
          )}

          {/* Game over overlay */}
          {state.phase === 'gameover' && (
            <div style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(0,0,10,0.85)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 16,
              borderRadius: 8,
            }}>
              <div style={{ fontSize: 28, fontWeight: 900, color: '#ff4466', letterSpacing: 4 }}>GAME OVER</div>
              <div style={{ color: '#aab', fontSize: 14 }}>Score: <span style={{ color: '#eef', fontWeight: 700 }}>{state.score.toLocaleString()}</span></div>
              <button
                onClick={() => dispatch({ type: 'RESTART' })}
                style={{
                  marginTop: 8,
                  padding: '10px 28px',
                  background: 'linear-gradient(135deg, #5566ff, #bb44ff)',
                  border: 'none',
                  borderRadius: 8,
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: 14,
                  letterSpacing: 2,
                  cursor: 'pointer',
                  boxShadow: '0 0 20px #7766ff66',
                }}
              >
                RETRY  [R]
              </button>
            </div>
          )}
        </div>

        {/* Right: next piece */}
        <div style={{ paddingTop: 4 }}>
          <NextPanel piece={state.next} />
        </div>
      </div>

      <style>{`
        @keyframes chainPop {
          0%   { transform: scale(0.5); opacity: 0; }
          60%  { transform: scale(1.15); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
