export const ROWS = 13; // row 0 = hidden, rows 1-12 = visible
export const VISIBLE_ROWS = 12;
export const COLS = 6;

export const COLORS = ['R', 'G', 'B', 'Y', 'P'] as const;
export type Color = (typeof COLORS)[number];
export type Cell = Color | null;
export type Board = Cell[][];
export type Direction = 0 | 1 | 2 | 3; // N=above, E=right, S=below, W=left

export interface ActivePiece {
  pivotRow: number;
  pivotCol: number;
  pivotColor: Color;
  satColor: Color;
  dir: Direction;
}

export type GamePhase = 'falling' | 'clearing' | 'gameover';

export const COLOR_STYLES: Record<Color, { bg: string; glow: string; light: string }> = {
  R: { bg: '#ff2244', glow: '#ff224488', light: '#ff6688' },
  G: { bg: '#22dd44', glow: '#22dd4488', light: '#66ff88' },
  B: { bg: '#2266ff', glow: '#2266ff88', light: '#6699ff' },
  Y: { bg: '#ffdd00', glow: '#ffdd0088', light: '#ffee66' },
  P: { bg: '#bb33ff', glow: '#bb33ff88', light: '#dd77ff' },
};

export function createBoard(): Board {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

export function randomColor(): Color {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}

export function createPiece(): ActivePiece {
  return {
    pivotRow: 1,
    pivotCol: 2,
    pivotColor: randomColor(),
    satColor: randomColor(),
    dir: 0,
  };
}

export function getSatPos(piece: ActivePiece): { row: number; col: number } {
  const { pivotRow: r, pivotCol: c, dir } = piece;
  switch (dir) {
    case 0: return { row: r - 1, col: c };
    case 1: return { row: r, col: c + 1 };
    case 2: return { row: r + 1, col: c };
    case 3: return { row: r, col: c - 1 };
  }
}

function isValidPos(board: Board, row: number, col: number): boolean {
  if (col < 0 || col >= COLS || row >= ROWS) return false;
  if (row < 0) return true; // above board is fine
  return board[row][col] === null;
}

export function canPlace(board: Board, piece: ActivePiece): boolean {
  const sat = getSatPos(piece);
  return (
    isValidPos(board, piece.pivotRow, piece.pivotCol) &&
    isValidPos(board, sat.row, sat.col)
  );
}

export function tryMove(board: Board, piece: ActivePiece, dCol: number): ActivePiece {
  const next = { ...piece, pivotCol: piece.pivotCol + dCol };
  return canPlace(board, next) ? next : piece;
}

export function tryRotate(board: Board, piece: ActivePiece, clockwise: boolean): ActivePiece {
  const dir = (((piece.dir + (clockwise ? 1 : -1)) % 4) + 4) % 4 as Direction;
  const next = { ...piece, dir };

  if (canPlace(board, next)) return next;
  // Wall kick
  for (const kick of [1, -1, 2, -2]) {
    const kicked = { ...next, pivotCol: next.pivotCol + kick };
    if (canPlace(board, kicked)) return kicked;
  }
  return piece;
}

export function stepDown(board: Board, piece: ActivePiece): { piece: ActivePiece; landed: boolean } {
  const next = { ...piece, pivotRow: piece.pivotRow + 1 };
  if (canPlace(board, next)) return { piece: next, landed: false };
  return { piece, landed: true };
}

export function hardDrop(board: Board, piece: ActivePiece): ActivePiece {
  let cur = piece;
  for (let i = 0; i < ROWS; i++) {
    const next = { ...cur, pivotRow: cur.pivotRow + 1 };
    if (!canPlace(board, next)) break;
    cur = next;
  }
  return cur;
}

export function landPiece(board: Board, piece: ActivePiece): Board {
  const b = board.map((r) => [...r]);
  const sat = getSatPos(piece);
  if (piece.pivotRow >= 0 && piece.pivotRow < ROWS) {
    b[piece.pivotRow][piece.pivotCol] = piece.pivotColor;
  }
  if (sat.row >= 0 && sat.row < ROWS) {
    b[sat.row][sat.col] = piece.satColor;
  }
  return b;
}

export function applyGravity(board: Board): Board {
  const b = createBoard();
  for (let c = 0; c < COLS; c++) {
    const cells: Cell[] = [];
    for (let r = 0; r < ROWS; r++) {
      if (board[r][c] !== null) cells.push(board[r][c]);
    }
    for (let i = 0; i < cells.length; i++) {
      b[ROWS - cells.length + i][c] = cells[i];
    }
  }
  return b;
}

export function findGroups(board: Board): Set<string>[] {
  const visited = new Set<string>();
  const groups: Set<string>[] = [];

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const key = `${r},${c}`;
      if (!board[r][c] || visited.has(key)) continue;
      const color = board[r][c];
      const group = new Set<string>();
      const queue: [number, number][] = [[r, c]];

      while (queue.length) {
        const [cr, cc] = queue.shift()!;
        const k = `${cr},${cc}`;
        if (visited.has(k)) continue;
        visited.add(k);
        group.add(k);
        for (const [dr, dc] of [[-1, 0],[1, 0],[0, -1],[0, 1]]) {
          const nr = cr + dr, nc = cc + dc;
          if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && board[nr][nc] === color)
            queue.push([nr, nc]);
        }
      }
      if (group.size >= 4) groups.push(group);
    }
  }
  return groups;
}

export function clearGroups(board: Board, groups: Set<string>[]): Board {
  const b = board.map((r) => [...r]);
  for (const g of groups) {
    for (const key of g) {
      const [r, c] = key.split(',').map(Number);
      b[r][c] = null;
    }
  }
  return b;
}

export function countCleared(groups: Set<string>[]): number {
  return groups.reduce((acc, g) => acc + g.size, 0);
}

const CHAIN_POWERS = [0, 0, 8, 16, 32, 64, 96, 128, 160, 192, 224, 256];

export function calcScore(chain: number, puyos: number): number {
  const cp = CHAIN_POWERS[Math.min(chain, CHAIN_POWERS.length - 1)];
  return 10 * puyos * Math.max(1, cp);
}

export function isGameOver(board: Board, nextPiece: ActivePiece): boolean {
  return !canPlace(board, nextPiece);
}
