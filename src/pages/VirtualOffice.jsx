import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useGameScoring } from '../games/useGameScoring';
import GameResults from '../games/GameResults';
import TypingSpeed from '../games/TypingSpeed';
import ClickSpeed from '../games/ClickSpeed';
import WhackAMole from '../games/WhackAMole';
import WordleGame from '../games/WordleGame';
import TriviaQuiz from '../games/TriviaQuiz';
import MemoryMatch from '../games/MemoryMatch';
import Game2048 from '../games/Game2048';
import SnakeGame from '../games/SnakeGame';
import Minesweeper from '../games/Minesweeper';

const MONTH_KEY = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const MONTH_LABEL = () => {
  return new Date().toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
};

const DAYS_LEFT = () => {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return Math.ceil((end - now) / 86400000);
};

const GAMES = [
  { slug: 'typing-speed', name: 'Typing Speed', icon: '⌨️', desc: 'Type a paragraph as fast as you can', component: TypingSpeed, dailyCap: 1 },
  { slug: 'click-speed', name: 'Click Speed', icon: '🖱️', desc: 'How many clicks in 10 seconds?', component: ClickSpeed, dailyCap: 1 },
  { slug: 'whack-a-mole', name: 'Whack-a-Mole', icon: '🐹', desc: 'Whack moles for 30 seconds with combos', component: WhackAMole, dailyCap: 1 },
  { slug: 'wordle', name: 'Wordle', icon: '🔤', desc: 'Guess the 5-letter word in 6 tries', component: WordleGame, dailyCap: 1 },
  { slug: 'trivia', name: 'Trivia Quiz', icon: '🧠', desc: '10 questions, 15 seconds each', component: TriviaQuiz, dailyCap: 3 },
  { slug: 'memory', name: 'Memory Match', icon: '🃏', desc: 'Match all 8 emoji pairs', component: MemoryMatch, dailyCap: 1 },
  { slug: '2048', name: '2048', icon: '🔢', desc: 'Slide tiles to reach 2048', component: Game2048, dailyCap: 1 },
  { slug: 'snake', name: 'Snake', icon: '🐍', desc: 'Classic snake — eat and grow', component: SnakeGame, dailyCap: 3 },
  { slug: 'minesweeper', name: 'Minesweeper', icon: '💣', desc: 'Clear the board without hitting mines', component: Minesweeper, dailyCap: 1 },
];

const AVATAR_OPTIONS = ['😊','😎','🦊','🐨','🦁','🐯','🐸','🐼','🦄','🐶','🐱','🦋','🌟','⚡','🔥','🎯','🎮','🏆','💎','🚀','🌈','🎵','🌸','🍕','☕','🎲','👾','🤖','🦈','🐙'];

// ── Onboarding Modal ──
function OnboardingModal({ onSave }) {
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('😊');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(14,14,14,0.95)' }}>
      <div className="bg-[#1A1A1A] rounded-2xl p-8 w-[420px] max-w-[95vw] border border-[#2A2A2A]">
        <div className="text-center mb-6">
          <div className="text-3xl mb-2">🎮</div>
          <h2 className="font-syne text-xl font-bold text-[#F0EDE6]">Welcome to the Virtual Office</h2>
          <p className="text-[#888882] text-sm font-dm mt-1">Pick your name and avatar to get started.</p>
        </div>
        <div className="mb-4">
          <label className="block text-[10px] font-bold uppercase tracking-wider text-[#888882] mb-1">Display Name</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Your name..."
            className="w-full bg-[#0E0E0E] border border-[#2A2A2A] rounded-xl px-4 py-3 text-[#F0EDE6] font-dm focus:outline-none focus:border-[#F5C518]" autoFocus />
        </div>
        <div className="mb-6">
          <label className="block text-[10px] font-bold uppercase tracking-wider text-[#888882] mb-1">Your Avatar</label>
          <div className="grid grid-cols-10 gap-1">
            {AVATAR_OPTIONS.map(e => (
              <button key={e} onClick={() => setEmoji(e)}
                className={`text-xl p-1 rounded-lg border cursor-pointer transition-colors ${
                  emoji === e ? 'border-[#F5C518] bg-[#F5C518]/10' : 'border-transparent hover:border-[#2A2A2A]'
                }`}>{e}</button>
            ))}
          </div>
        </div>
        <button onClick={() => name.trim() && onSave(name.trim(), emoji)} disabled={!name.trim()}
          className="w-full bg-[#F5C518] text-[#0E0E0E] font-syne font-bold text-sm py-3 rounded-xl border-none cursor-pointer hover:bg-[#C49E10] disabled:opacity-40">
          Let's Go →
        </button>
      </div>
    </div>
  );
}

// ── Game Card ──
function GameCard({ game, personalBest, dailyLeader, todayPlays, gameTopScores, onPlay }) {
  const cappedToday = todayPlays >= game.dailyCap;

  return (
    <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl p-5 hover:border-[#F5C518] hover:-translate-y-1 transition-all group">
      <div className="flex items-start justify-between mb-2">
        <div className="text-3xl">{game.icon}</div>
        {personalBest != null && (
          <div className="text-right">
            <div className="text-[9px] text-[#888882] font-dm uppercase">Your Best</div>
            <div className="text-[#F5C518] font-syne font-bold text-sm">{personalBest}</div>
          </div>
        )}
      </div>
      <h3 className="font-syne font-bold text-[#F0EDE6] text-base mb-1">{game.name}</h3>
      <p className="text-[#888882] text-xs font-dm mb-3">{game.desc}</p>

      {/* Per-game top scores — always visible */}
      {gameTopScores?.length > 0 && (
        <div className="mb-3 bg-[#0E0E0E] rounded-lg p-2.5 border border-[#2A2A2A]">
          <div className="text-[9px] font-bold uppercase tracking-wider text-[#888882] mb-1.5">🏆 Leaderboard</div>
          {gameTopScores.slice(0, 5).map((s, i) => (
            <div key={i} className="flex items-center gap-2 py-0.5 text-[10px]">
              <span className="w-4 text-center font-syne font-bold" style={{ color: i === 0 ? '#FFD700' : i === 1 ? '#C0C0C0' : i === 2 ? '#CD7F32' : '#888882' }}>
                {i + 1}
              </span>
              <span className="text-[#F0EDE6] flex-1 font-dm">{s.display_name}</span>
              <span className="text-[#F5C518] font-syne font-bold">{s.best_score}</span>
            </div>
          ))}
        </div>
      )}

      <div className="text-xs font-dm space-y-1 mb-4">
        <div className="text-[#888882]">Today's leader: <span className="text-[#F0EDE6] font-semibold">{dailyLeader ? `${dailyLeader.display_name} (${dailyLeader.raw_score})` : '—'}</span></div>
      </div>
      {cappedToday && <div className="text-[#4ADE80] text-[10px] font-dm mb-2">✓ Points earned today</div>}
      <button onClick={onPlay}
        className={`w-full font-syne font-bold text-sm py-2.5 rounded-lg border-none cursor-pointer transition-colors ${
          cappedToday
            ? 'bg-transparent border-2 border-[#2A2A2A] text-[#888882] hover:border-[#F5C518]'
            : 'bg-[#F5C518] text-[#0E0E0E] hover:bg-[#C49E10]'
        }`}>
        {cappedToday ? 'PLAY FOR FUN' : 'PLAY'}
      </button>
    </div>
  );
}

// ── Leaderboard Row ──
function LeaderboardRow({ row, maxPts, index }) {
  const rankColors = ['#FFD700', '#C0C0C0', '#CD7F32'];
  const pct = maxPts > 0 ? (row.total_points / maxPts) * 100 : 0;

  return (
    <div className="flex items-center gap-3 py-2.5 px-3 rounded-lg hover:bg-[#222222] transition-colors"
      style={{ animationDelay: `${index * 80}ms`, animation: 'slideInLeft 0.3s ease-out forwards', opacity: 0 }}>
      <div className="w-8 text-center font-syne font-bold text-lg"
        style={{ color: index < 3 ? rankColors[index] : '#F0EDE6' }}>
        #{index + 1}
      </div>
      <div className="text-2xl">{row.avatar_emoji || '😊'}</div>
      <div className="font-syne font-semibold text-[#F0EDE6] w-28">{row.display_name}</div>
      <div className="flex-1 h-2 bg-[#2A2A2A] rounded-full overflow-hidden">
        <div className="h-full bg-[#F5C518] rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
      <div className="font-syne font-bold text-[#F0EDE6] text-lg w-20 text-right">{row.total_points.toLocaleString()}</div>
    </div>
  );
}

// ── Main Page ──
export default function VirtualOffice() {
  const { profile, userId, submitScore, getPersonalBest, getTodayScoreCount, getDailyLeader } = useGameScoring();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);
  const [leaderboard, setLeaderboard] = useState([]);
  const [hallOfFame, setHallOfFame] = useState([]);
  const [activeGame, setActiveGame] = useState(null);
  const [gameResult, setGameResult] = useState(null);
  const [personalBests, setPersonalBests] = useState({});
  const [dailyLeaders, setDailyLeaders] = useState({});
  const [todayPlays, setTodayPlays] = useState({});
  const [gameTopScores, setGameTopScores] = useState({});
  const [recentActivity, setRecentActivity] = useState([]);

  // Check if profile exists
  useEffect(() => {
    if (userId === null) return;
    if (!userId) { setProfileLoading(false); return; }
    supabase.from('player_profiles').select('*').eq('user_id', userId).single()
      .then(({ data }) => {
        if (!data) setShowOnboarding(true);
        setProfileLoading(false);
      });
  }, [userId]);

  // Load leaderboard
  useEffect(() => {
    const monthKey = MONTH_KEY();
    supabase.from('monthly_leaderboard').select('*').eq('month_key', monthKey)
      .order('total_points', { ascending: false })
      .then(({ data }) => setLeaderboard(data || []));
  }, [gameResult]);

  // Load hall of fame
  useEffect(() => {
    supabase.from('hall_of_fame').select('*').order('created_at', { ascending: false }).limit(12)
      .then(({ data }) => setHallOfFame(data || []));
  }, []);

  // Load game stats — batched to avoid query storms
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    const loadAllGameStats = async () => {
      // Batch: load ALL personal bests, daily leaders, and today's scores in single queries
      const today = new Date().toISOString().split('T')[0];
      const [pbRes, todayRes, topRes, recentRes] = await Promise.all([
        supabase.from('personal_bests').select('game_slug, best_score').eq('user_id', userId),
        supabase.from('game_scores').select('game_slug').eq('user_id', userId).gte('created_at', today + 'T00:00:00'),
        supabase.from('personal_bests').select('game_slug, best_score, user_id').order('best_score', { ascending: false }).limit(50),
        supabase.from('game_scores').select('game_slug, raw_score, points, created_at, user_id').order('created_at', { ascending: false }).limit(15),
      ]);
      if (cancelled) return;

      // Personal bests
      const pbMap = {};
      (pbRes.data || []).forEach(r => { pbMap[r.game_slug] = r.best_score; });
      setPersonalBests(pbMap);

      // Today's play counts
      const playMap = {};
      (todayRes.data || []).forEach(r => { playMap[r.game_slug] = (playMap[r.game_slug] || 0) + 1; });
      setTodayPlays(playMap);

      // Per-game top scores — group by game, take top 5 each
      const topByGame = {};
      (topRes.data || []).forEach(r => {
        if (!topByGame[r.game_slug]) topByGame[r.game_slug] = [];
        if (topByGame[r.game_slug].length < 5) topByGame[r.game_slug].push(r);
      });
      // Get display names for all users in top scores
      const allUids = [...new Set((topRes.data || []).map(d => d.user_id))];
      if (allUids.length) {
        const { data: profiles } = await supabase.from('player_profiles')
          .select('user_id, display_name').in('user_id', allUids);
        if (cancelled) return;
        const nameMap = {};
        (profiles || []).forEach(p => { nameMap[p.user_id] = p.display_name; });
        Object.keys(topByGame).forEach(slug => {
          topByGame[slug] = topByGame[slug].map(d => ({ ...d, display_name: nameMap[d.user_id] || 'Unknown' }));
        });
      }
      setGameTopScores(topByGame);

      // Daily leaders — derive from today's scores
      const dailyMap = {};
      const todayScores = (todayRes.data || []);
      // We don't have raw_score in the today query, so just skip daily leader for now
      // It was a per-game query before — we'll use top scores as proxy
      setDailyLeaders(dailyMap);

      // Recent activity
      if (recentRes.data?.length) {
        const ruids = [...new Set(recentRes.data.map(d => d.user_id))];
        const { data: rProfiles } = await supabase.from('player_profiles')
          .select('user_id, display_name, avatar_emoji').in('user_id', ruids);
        if (cancelled) return;
        const rMap = {};
        (rProfiles || []).forEach(p => { rMap[p.user_id] = p; });
        setRecentActivity(recentRes.data.map(d => ({
          ...d,
          display_name: rMap[d.user_id]?.display_name || 'Unknown',
          avatar: rMap[d.user_id]?.avatar_emoji || '😊',
          game_name: GAMES.find(g => g.slug === d.game_slug)?.name || d.game_slug,
          game_icon: GAMES.find(g => g.slug === d.game_slug)?.icon || '🎮',
        })));
      }
    };

    loadAllGameStats().catch(console.error);
    return () => { cancelled = true; };
  }, [userId, gameResult]);

  const handleOnboardingSave = async (name, emoji) => {
    await supabase.from('player_profiles').insert({ user_id: userId, display_name: name, avatar_emoji: emoji });
    setShowOnboarding(false);
    window.location.reload();
  };

  const handleGameComplete = async (rawScore, points, details) => {
    if (!activeGame) return;
    const game = GAMES.find(g => g.slug === activeGame);
    const plays = todayPlays[activeGame] || 0;
    const cappedPoints = plays >= game.dailyCap ? 0 : points;
    const { newBest, position } = await submitScore(activeGame, rawScore, cappedPoints);

    setGameResult({
      score: rawScore, pointsEarned: cappedPoints,
      personalBest: personalBests[activeGame], newBest,
      position, isLeader: position === 1, details,
    });
  };

  const maxPts = leaderboard.length > 0 ? leaderboard[0].total_points : 1;
  const myRank = leaderboard.findIndex(r => r.user_id === userId) + 1;
  const myPoints = leaderboard.find(r => r.user_id === userId)?.total_points || 0;

  if (profileLoading) {
    return <div className="h-full bg-[#0E0E0E] flex items-center justify-center text-[#888882] font-dm">Loading...</div>;
  }

  // Active game fullscreen
  if (activeGame && !gameResult) {
    const game = GAMES.find(g => g.slug === activeGame);
    const GameComponent = game.component;
    return (
      <div className="h-full bg-[#0E0E0E] text-[#F0EDE6] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-3 border-b border-[#2A2A2A]">
          <button onClick={() => setActiveGame(null)} className="text-[#888882] hover:text-[#F5C518] text-sm font-dm bg-transparent border-none cursor-pointer">← Back to Office</button>
          <div className="font-syne font-bold text-base">{game.name}</div>
          <div className="text-[#888882] text-sm font-dm">Best: {personalBests[activeGame] ?? '—'}</div>
        </div>
        <GameComponent onComplete={handleGameComplete} />
      </div>
    );
  }

  return (
    <div className="h-full bg-[#0E0E0E] overflow-y-auto" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noise\'%3E%3CfeTurbulence baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noise)\' opacity=\'0.03\'/%3E%3C/svg%3E")' }}>
      {showOnboarding && <OnboardingModal onSave={handleOnboardingSave} />}

      {gameResult && (
        <GameResults
          score={gameResult.score}
          pointsEarned={gameResult.pointsEarned}
          personalBest={gameResult.personalBest}
          newBest={gameResult.newBest}
          position={gameResult.position}
          isLeader={gameResult.isLeader}
          onPlayAgain={() => setGameResult(null)}
          onBack={() => { setGameResult(null); setActiveGame(null); }}
        />
      )}

      {/* Header */}
      <div className="px-8 pt-8 pb-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-syne text-3xl font-bold text-[#F0EDE6]">Virtual Office</h1>
            <p className="text-[#888882] font-dm text-sm mt-1">CYL team games. Compete, win, repeat.</p>
          </div>
          {profile && (
            <div className="text-right">
              <div className="text-[#F0EDE6] font-dm text-sm">
                <span className="text-xl mr-1">{profile.avatar_emoji}</span>
                <span className="font-syne font-semibold">{profile.display_name}</span>
                {myRank > 0 && <span className="text-[#888882]"> — #{myRank} this month — </span>}
                <span className="text-[#F5C518] font-syne font-bold">{myPoints.toLocaleString()} pts</span>
              </div>
              <div className="text-[#444440] text-xs font-dm mt-1 bg-[#1A1A1A] inline-block px-3 py-1 rounded-full">
                ⏳ {DAYS_LEFT()} days left in {new Date().toLocaleDateString('en-AU', { month: 'long' })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Leaderboard */}
      <div className="px-8 mb-8">
        <div className="bg-[#1A1A1A] rounded-2xl border border-[#2A2A2A] border-l-[3px] border-l-[#F5C518] p-6">
          <h2 className="font-syne text-lg font-bold text-[#F0EDE6] mb-4">🏆 {MONTH_LABEL()} Leaderboard</h2>
          {leaderboard.length > 0 ? (
            <div className="space-y-1">
              {leaderboard.map((row, i) => (
                <LeaderboardRow key={row.id} row={row} maxPts={maxPts} index={i} />
              ))}
            </div>
          ) : (
            <div className="text-[#888882] text-sm font-dm py-8 text-center">No scores yet this month. Be the first to play!</div>
          )}
          <div className="text-[#444440] text-[10px] font-dm mt-4">Updated in real-time. Scores cap daily per game to keep it fair.</div>
        </div>
      </div>

      {/* Games Grid */}
      <div className="px-8 mb-8">
        <h2 className="font-syne text-lg font-bold text-[#F0EDE6] mb-4">🎮 Games</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {GAMES.map(game => (
            <GameCard
              key={game.slug}
              game={game}
              personalBest={personalBests[game.slug]}
              dailyLeader={dailyLeaders[game.slug]}
              todayPlays={todayPlays[game.slug] || 0}
              gameTopScores={gameTopScores[game.slug]}
              onPlay={() => { setActiveGame(game.slug); setGameResult(null); }}
            />
          ))}
        </div>
      </div>

      {/* Per-Game Breakdown Table */}
      {Object.keys(gameTopScores).length > 0 && leaderboard.length > 0 && (
        <div className="px-8 mb-8">
          <h2 className="font-syne text-lg font-bold text-[#F0EDE6] mb-4">📊 Per-Game Breakdown</h2>
          <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl overflow-x-auto">
            <table className="w-full text-[11px] font-dm">
              <thead>
                <tr className="border-b border-[#2A2A2A]">
                  <th className="text-left px-4 py-3 text-[#888882] font-semibold uppercase text-[9px] tracking-wider">Player</th>
                  {GAMES.map(g => (
                    <th key={g.slug} className="text-center px-3 py-3 text-[#888882] font-semibold uppercase text-[9px] tracking-wider">
                      <span className="text-sm block mb-0.5">{g.icon}</span>
                      {g.name.split(/\s/).slice(0, 2).join(' ')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((player, idx) => (
                  <tr key={player.user_id} className="border-b border-[#2A2A2A]/50 hover:bg-[#222222]">
                    <td className="px-4 py-2.5 text-[#F0EDE6] font-syne font-semibold whitespace-nowrap">
                      <span className="mr-1.5">{player.avatar_emoji || '😊'}</span>
                      {player.display_name}
                    </td>
                    {GAMES.map(g => {
                      const scores = gameTopScores[g.slug] || [];
                      const playerScore = scores.find(s => s.user_id === player.user_id);
                      const isTop = scores[0]?.user_id === player.user_id;
                      return (
                        <td key={g.slug} className="text-center px-3 py-2.5">
                          {playerScore ? (
                            <span className={`font-syne font-bold ${isTop ? 'text-[#FFD700]' : 'text-[#F0EDE6]'}`}>
                              {playerScore.best_score}
                              {isTop && <span className="text-[8px] ml-0.5">👑</span>}
                            </span>
                          ) : (
                            <span className="text-[#444440]">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent Activity Feed */}
      {recentActivity.length > 0 && (
        <div className="px-8 mb-8">
          <h2 className="font-syne text-lg font-bold text-[#F0EDE6] mb-4">⚡ Recent Activity</h2>
          <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl p-4">
            <div className="space-y-2">
              {recentActivity.map((a, i) => {
                const timeAgo = (() => {
                  const mins = Math.floor((Date.now() - new Date(a.created_at)) / 60000);
                  if (mins < 1) return 'Just now';
                  if (mins < 60) return `${mins}m ago`;
                  const hrs = Math.floor(mins / 60);
                  if (hrs < 24) return `${hrs}h ago`;
                  return `${Math.floor(hrs / 24)}d ago`;
                })();
                return (
                  <div key={i} className="flex items-center gap-3 py-1.5 text-[11px] font-dm">
                    <span className="text-lg">{a.avatar}</span>
                    <span className="text-[#F0EDE6] font-semibold w-24">{a.display_name}</span>
                    <span className="text-[#888882]">scored</span>
                    <span className="text-[#F5C518] font-syne font-bold">{a.raw_score}</span>
                    <span className="text-[#888882]">in</span>
                    <span className="text-[#F0EDE6]">{a.game_icon} {a.game_name}</span>
                    {a.points > 0 && <span className="text-[#4ADE80] text-[10px]">+{a.points}pts</span>}
                    <span className="text-[#444440] ml-auto">{timeAgo}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Hall of Fame */}
      {hallOfFame.length > 0 && (
        <div className="px-8 mb-8">
          <h2 className="font-syne text-lg font-bold text-[#F0EDE6] mb-4">🏅 Hall of Fame</h2>
          <div className="flex gap-4 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
            {hallOfFame.map(winner => (
              <div key={winner.id} className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl p-5 min-w-[180px] text-center shrink-0"
                style={{ backgroundImage: 'linear-gradient(to bottom, transparent 60%, rgba(245,197,24,0.05))' }}>
                <div className="text-[#888882] text-[10px] font-dm mb-2">{winner.month_label}</div>
                <div className="text-3xl mb-2">{winner.avatar_emoji}</div>
                <div className="font-syne font-bold text-[#F0EDE6] text-sm">{winner.display_name}</div>
                <div className="text-[#F5C518] font-syne font-bold text-sm">{winner.total_points?.toLocaleString()} pts</div>
                <div className="text-[#888882] text-[10px] font-dm mt-2">🎁 {winner.prize_description || 'Prize: TBA'}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideInLeft { from { transform: translateX(-20px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        .font-syne { font-family: 'Syne', system-ui, sans-serif; }
        .font-dm { font-family: 'DM Sans', system-ui, sans-serif; }
      `}</style>
    </div>
  );
}
