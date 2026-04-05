import { useState, useCallback } from 'react';

const CONFIGS = {
  easy: { rows: 9, cols: 9, mines: 10, pts: 20 },
  medium: { rows: 16, cols: 16, mines: 40, pts: 50 },
  hard: { rows: 16, cols: 30, mines: 99, pts: 100 },
};

function createBoard(rows, cols, mines, safeR, safeC) {
  const board = Array(rows).fill(null).map(() => Array(cols).fill(null).map(() => ({
    mine: false, revealed: false, flagged: false, count: 0,
  })));

  let placed = 0;
  while (placed < mines) {
    const r = Math.floor(Math.random() * rows);
    const c = Math.floor(Math.random() * cols);
    if (board[r][c].mine || (Math.abs(r - safeR) <= 1 && Math.abs(c - safeC) <= 1)) continue;
    board[r][c].mine = true;
    placed++;
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (board[r][c].mine) continue;
      let count = 0;
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) {
          const nr = r + dr, nc = c + dc;
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && board[nr][nc].mine) count++;
        }
      board[r][c].count = count;
    }
  }
  return board;
}

export default function Minesweeper({ onComplete }) {
  const [difficulty, setDifficulty] = useState(null);
  const [board, setBoard] = useState(null);
  const [gameOver, setGameOver] = useState(false);
  const [won, setWon] = useState(false);
  const [firstClick, setFirstClick] = useState(true);
  const [startTime, setStartTime] = useState(null);

  const config = difficulty ? CONFIGS[difficulty] : null;

  const reveal = useCallback((b, r, c) => {
    if (r < 0 || r >= b.length || c < 0 || c >= b[0].length) return;
    if (b[r][c].revealed || b[r][c].flagged) return;
    b[r][c].revealed = true;
    if (b[r][c].count === 0 && !b[r][c].mine) {
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) reveal(b, r + dr, c + dc);
    }
  }, []);

  const handleClick = (r, c) => {
    if (gameOver || won) return;
    let b;
    if (firstClick) {
      b = createBoard(config.rows, config.cols, config.mines, r, c);
      setFirstClick(false);
      setStartTime(Date.now());
    } else {
      b = board.map(row => row.map(cell => ({ ...cell })));
    }

    if (b[r][c].flagged) return;
    if (b[r][c].mine) {
      // Game over - reveal all mines
      b.forEach(row => row.forEach(cell => { if (cell.mine) cell.revealed = true; }));
      setBoard(b);
      setGameOver(true);
      onComplete(0, 0, { won: false, difficulty });
      return;
    }

    reveal(b, r, c);
    setBoard(b);

    // Check win
    const totalNonMine = config.rows * config.cols - config.mines;
    const revealed = b.flat().filter(c => c.revealed && !c.mine).length;
    if (revealed === totalNonMine) {
      setWon(true);
      const time = Math.round((Date.now() - startTime) / 1000);
      onComplete(time, config.pts, { won: true, difficulty, time });
    }
  };

  const handleFlag = (e, r, c) => {
    e.preventDefault();
    if (gameOver || won || firstClick) return;
    const b = board.map(row => row.map(cell => ({ ...cell })));
    if (!b[r][c].revealed) b[r][c].flagged = !b[r][c].flagged;
    setBoard(b);
  };

  if (!difficulty) {
    return (
      <div className="max-w-md mx-auto py-12 text-center">
        <div className="text-[#F0EDE6] font-syne text-xl font-bold mb-6">Select Difficulty</div>
        {Object.entries(CONFIGS).map(([key, cfg]) => (
          <button key={key} onClick={() => setDifficulty(key)}
            className="block w-full bg-[#1A1A1A] border border-[#2A2A2A] text-[#F0EDE6] font-dm text-sm py-4 px-6 rounded-xl cursor-pointer hover:border-[#F5C518] transition-colors mb-3 text-left">
            <span className="font-syne font-bold capitalize">{key}</span>
            <span className="text-[#888882] ml-2">{cfg.rows}x{cfg.cols} · {cfg.mines} mines · {cfg.pts}pts</span>
          </button>
        ))}
      </div>
    );
  }

  const displayBoard = board || Array(config.rows).fill(null).map(() => Array(config.cols).fill({ mine: false, revealed: false, flagged: false, count: 0 }));
  const flagCount = displayBoard.flat().filter(c => c.flagged).length;

  const COUNT_COLORS = ['', '#4ADE80', '#60A5FA', '#F87171', '#A78BFA', '#F59E0B', '#06B6D4', '#F0EDE6', '#888882'];

  return (
    <div className="flex flex-col items-center py-4 overflow-x-auto">
      <div className="flex justify-between items-center w-full max-w-lg mb-3 px-2">
        <div className="text-[#888882] text-sm font-dm">Mines: {config.mines - flagCount}</div>
        <div className="text-[#888882] text-xs font-dm">Left-click reveal · Right-click flag</div>
      </div>
      <div className="inline-block border border-[#2A2A2A] rounded-lg overflow-hidden">
        {displayBoard.map((row, r) => (
          <div key={r} className="flex">
            {row.map((cell, c) => (
              <button key={c} onClick={() => handleClick(r, c)} onContextMenu={e => handleFlag(e, r, c)}
                className={`w-6 h-6 border border-[#1A1A1A] text-xs font-bold flex items-center justify-center cursor-pointer transition-colors ${
                  cell.revealed
                    ? cell.mine ? 'bg-[#F87171]/20' : 'bg-[#0E0E0E]'
                    : 'bg-[#2A2A2A] hover:bg-[#333]'
                }`}
                style={{ color: cell.revealed && !cell.mine ? COUNT_COLORS[cell.count] : '' }}>
                {cell.revealed ? (cell.mine ? '💣' : cell.count || '') : cell.flagged ? '🚩' : ''}
              </button>
            ))}
          </div>
        ))}
      </div>
      {(gameOver || won) && (
        <div className={`mt-4 font-syne font-bold ${won ? 'text-[#4ADE80]' : 'text-[#F87171]'}`}>
          {won ? 'You Win!' : 'Game Over'}
        </div>
      )}
    </div>
  );
}
