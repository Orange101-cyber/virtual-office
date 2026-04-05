import { useState, useEffect, useRef, useCallback } from 'react';

const GRID = 20;
const CELL = 20;
const INITIAL_SPEED = 150;

export default function SnakeGame({ onComplete }) {
  const canvasRef = useRef(null);
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const snakeRef = useRef([{ x: 10, y: 10 }]);
  const dirRef = useRef({ x: 1, y: 0 });
  const foodRef = useRef({ x: 15, y: 10 });
  const scoreRef = useRef(0);
  const speedRef = useRef(INITIAL_SPEED);
  const gameLoopRef = useRef(null);

  const spawnFood = useCallback(() => {
    let food;
    do {
      food = { x: Math.floor(Math.random() * GRID), y: Math.floor(Math.random() * GRID) };
    } while (snakeRef.current.some(s => s.x === food.x && s.y === food.y));
    foodRef.current = food;
  }, []);

  const gameStep = useCallback(() => {
    const snake = snakeRef.current;
    const dir = dirRef.current;
    const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

    // Wall collision
    if (head.x < 0 || head.x >= GRID || head.y < 0 || head.y >= GRID) {
      setGameOver(true);
      const pts = scoreRef.current;
      const streakBonus = pts >= 10 ? 10 : 0;
      onComplete(pts, pts + streakBonus, { food: pts, streakBonus });
      return;
    }

    // Self collision
    if (snake.some(s => s.x === head.x && s.y === head.y)) {
      setGameOver(true);
      const pts = scoreRef.current;
      onComplete(pts, pts, { food: pts });
      return;
    }

    const newSnake = [head, ...snake];

    // Eat food
    if (head.x === foodRef.current.x && head.y === foodRef.current.y) {
      scoreRef.current++;
      setScore(scoreRef.current);
      spawnFood();
      // Speed up every 5 food
      if (scoreRef.current % 5 === 0) {
        speedRef.current = Math.max(60, speedRef.current - 10);
      }
    } else {
      newSnake.pop();
    }

    snakeRef.current = newSnake;
    draw();
  }, [onComplete, spawnFood]);

  const draw = useCallback(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const w = GRID * CELL;
    ctx.fillStyle = '#0E0E0E';
    ctx.fillRect(0, 0, w, w);

    // Grid lines
    ctx.strokeStyle = '#1A1A1A';
    for (let i = 0; i <= GRID; i++) {
      ctx.beginPath(); ctx.moveTo(i * CELL, 0); ctx.lineTo(i * CELL, w); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * CELL); ctx.lineTo(w, i * CELL); ctx.stroke();
    }

    // Food
    ctx.fillStyle = '#F87171';
    ctx.beginPath();
    ctx.arc(foodRef.current.x * CELL + CELL / 2, foodRef.current.y * CELL + CELL / 2, CELL / 2 - 2, 0, Math.PI * 2);
    ctx.fill();

    // Snake
    snakeRef.current.forEach((seg, i) => {
      ctx.fillStyle = i === 0 ? '#F5C518' : '#C49E10';
      ctx.fillRect(seg.x * CELL + 1, seg.y * CELL + 1, CELL - 2, CELL - 2);
    });
  }, []);

  useEffect(() => {
    draw();
    const loop = () => {
      gameStep();
      gameLoopRef.current = setTimeout(loop, speedRef.current);
    };
    gameLoopRef.current = setTimeout(loop, speedRef.current);
    return () => clearTimeout(gameLoopRef.current);
  }, []);

  useEffect(() => {
    if (gameOver) clearTimeout(gameLoopRef.current);
  }, [gameOver]);

  useEffect(() => {
    const handler = (e) => {
      const d = dirRef.current;
      if (e.key === 'ArrowUp' && d.y !== 1) dirRef.current = { x: 0, y: -1 };
      else if (e.key === 'ArrowDown' && d.y !== -1) dirRef.current = { x: 0, y: 1 };
      else if (e.key === 'ArrowLeft' && d.x !== 1) dirRef.current = { x: -1, y: 0 };
      else if (e.key === 'ArrowRight' && d.x !== -1) dirRef.current = { x: 1, y: 0 };
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) e.preventDefault();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className="flex flex-col items-center py-6">
      <div className="flex justify-between items-center w-full max-w-[400px] mb-4 px-2">
        <div className="text-[#F0EDE6] font-syne font-bold text-xl">{score}</div>
        <div className="text-[#888882] text-xs font-dm">Arrow keys to move</div>
      </div>
      <canvas ref={canvasRef} width={GRID * CELL} height={GRID * CELL}
        className="rounded-xl border border-[#2A2A2A]" />
      {/* Mobile controls */}
      <div className="grid grid-cols-3 gap-1 mt-4 w-36">
        <div />
        <button onClick={() => { if (dirRef.current.y !== 1) dirRef.current = { x: 0, y: -1 }; }} className="bg-[#2A2A2A] text-[#F0EDE6] rounded py-2 border-none cursor-pointer">▲</button>
        <div />
        <button onClick={() => { if (dirRef.current.x !== 1) dirRef.current = { x: -1, y: 0 }; }} className="bg-[#2A2A2A] text-[#F0EDE6] rounded py-2 border-none cursor-pointer">◀</button>
        <button onClick={() => { if (dirRef.current.y !== -1) dirRef.current = { x: 0, y: 1 }; }} className="bg-[#2A2A2A] text-[#F0EDE6] rounded py-2 border-none cursor-pointer">▼</button>
        <button onClick={() => { if (dirRef.current.x !== -1) dirRef.current = { x: 1, y: 0 }; }} className="bg-[#2A2A2A] text-[#F0EDE6] rounded py-2 border-none cursor-pointer">▶</button>
      </div>
    </div>
  );
}
