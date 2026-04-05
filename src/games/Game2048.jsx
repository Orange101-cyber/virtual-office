import { useState, useEffect, useCallback } from 'react';

const SIZE = 4;
const empty = () => Array(SIZE).fill(null).map(() => Array(SIZE).fill(0));

function addRandom(grid) {
  const g = grid.map(r => [...r]);
  const emptyCells = [];
  g.forEach((row, r) => row.forEach((v, c) => { if (!v) emptyCells.push([r, c]); }));
  if (!emptyCells.length) return g;
  const [r, c] = emptyCells[Math.floor(Math.random() * emptyCells.length)];
  g[r][c] = Math.random() < 0.9 ? 2 : 4;
  return g;
}

function slide(row) {
  const filtered = row.filter(x => x);
  const merged = [];
  let i = 0;
  while (i < filtered.length) {
    if (i + 1 < filtered.length && filtered[i] === filtered[i + 1]) {
      merged.push(filtered[i] * 2);
      i += 2;
    } else {
      merged.push(filtered[i]);
      i++;
    }
  }
  while (merged.length < SIZE) merged.push(0);
  return merged;
}

function move(grid, dir) {
  let g = grid.map(r => [...r]);
  let moved = false;

  if (dir === 'left') {
    g = g.map((row, ri) => {
      const s = slide(row);
      if (s.some((v, i) => v !== row[i])) moved = true;
      return s;
    });
  } else if (dir === 'right') {
    g = g.map(row => {
      const s = slide([...row].reverse()).reverse();
      if (s.some((v, i) => v !== row[i])) moved = true;
      return s;
    });
  } else if (dir === 'up') {
    for (let c = 0; c < SIZE; c++) {
      const col = g.map(r => r[c]);
      const s = slide(col);
      if (s.some((v, i) => v !== col[i])) moved = true;
      s.forEach((v, r) => { g[r][c] = v; });
    }
  } else if (dir === 'down') {
    for (let c = 0; c < SIZE; c++) {
      const col = g.map(r => r[c]).reverse();
      const s = slide(col).reverse();
      const origCol = g.map(r => r[c]);
      if (s.some((v, i) => v !== origCol[i])) moved = true;
      s.forEach((v, r) => { g[r][c] = v; });
    }
  }
  return { grid: g, moved };
}

function canMove(grid) {
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++) {
      if (!grid[r][c]) return true;
      if (c + 1 < SIZE && grid[r][c] === grid[r][c + 1]) return true;
      if (r + 1 < SIZE && grid[r][c] === grid[r + 1][c]) return true;
    }
  return false;
}

function highestTile(grid) {
  return Math.max(...grid.flat());
}

const TILE_COLORS = {
  0: '#1A1A1A', 2: '#2A2A2A', 4: '#333330', 8: '#4A4530', 16: '#5A5020',
  32: '#6A5A15', 64: '#7A650A', 128: '#8A7000', 256: '#9A7A00',
  512: '#AA8500', 1024: '#C49E10', 2048: '#F5C518', 4096: '#FFD700',
};

export default function Game2048({ onComplete }) {
  const [grid, setGrid] = useState(() => addRandom(addRandom(empty())));
  const [gameOver, setGameOver] = useState(false);

  const handleMove = useCallback((dir) => {
    if (gameOver) return;
    const result = move(grid, dir);
    if (result.moved) {
      const newGrid = addRandom(result.grid);
      setGrid(newGrid);
      if (!canMove(newGrid)) {
        setGameOver(true);
        const highest = highestTile(newGrid);
        const pts = Math.round(highest / 10);
        onComplete(highest, pts, { highestTile: highest });
      }
    }
  }, [grid, gameOver, onComplete]);

  useEffect(() => {
    const handler = (e) => {
      const map = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
      if (map[e.key]) { e.preventDefault(); handleMove(map[e.key]); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleMove]);

  const highest = highestTile(grid);

  return (
    <div className="max-w-sm mx-auto py-6">
      <div className="flex justify-between items-center mb-4 px-2">
        <div className="text-[#888882] text-sm font-dm">Highest: <span className="text-[#F5C518] font-syne font-bold text-lg">{highest}</span></div>
        <div className="text-[#888882] text-xs font-dm">Use arrow keys</div>
      </div>
      <div className="bg-[#1A1A1A] rounded-xl p-2 border border-[#2A2A2A]">
        <div className="grid grid-cols-4 gap-1.5">
          {grid.flat().map((val, i) => (
            <div key={i} className="aspect-square rounded-lg flex items-center justify-center font-syne font-bold transition-colors"
              style={{
                backgroundColor: TILE_COLORS[val] || '#F5C518',
                color: val >= 8 ? '#F0EDE6' : val ? '#888882' : 'transparent',
                fontSize: val >= 1024 ? '14px' : val >= 128 ? '18px' : '22px',
              }}>
              {val || ''}
            </div>
          ))}
        </div>
      </div>
      {gameOver && <div className="text-center mt-4 text-[#F87171] font-syne font-bold">Game Over</div>}
    </div>
  );
}
