import { useState } from 'react';

const PHASES = [
  {
    title: 'Capture & Assemble',
    color: 'blue',
    steps: [
      {
        num: 1,
        title: 'Grab the footage',
        detail: 'Pull all the footage from the YoloBox (or directly off the cameras).',
        tool: 'YoloBox / Cameras',
        toolColor: 'bg-gray-700',
        icon: '🎥',
      },
      {
        num: 2,
        title: 'Load everything into CapCut',
        detail: 'Open CapCut and upload all the footage onto the timeline:',
        bullets: ['Front shot', 'Left angle', 'Right angle', 'Audio (on its own separate track/line)'],
        note: 'Line everything up so all the video angles and the audio are perfectly in sync before you touch anything.',
        tool: 'CapCut',
        toolColor: 'bg-purple-600',
        icon: '📐',
      },
    ],
  },
  {
    title: 'Edit & Polish',
    color: 'purple',
    steps: [
      {
        num: 3,
        title: 'Make the cuts',
        detail: 'Go through the timeline and cut each piece. Trim out all the rough bits, mistakes, and dead air. The goal is one clean edit of the full episode.',
        tool: 'CapCut',
        toolColor: 'bg-purple-600',
        icon: '✂️',
      },
      {
        num: 4,
        title: 'Export the audio separately',
        detail: 'While you\'re editing, export the audio as its own separate file. Do this during editing — don\'t wait until the end.',
        tool: 'CapCut',
        toolColor: 'bg-purple-600',
        icon: '🎵',
      },
      {
        num: 5,
        title: 'Enhance the audio',
        detail: 'Take that exported audio file into Adobe Podcast (Enhance Speech) to clean it up and improve the sound quality.',
        tool: 'Adobe Podcast',
        toolColor: 'bg-red-600',
        icon: '🎙️',
      },
      {
        num: 6,
        title: 'Bring the enhanced audio back in',
        detail: 'Import the enhanced audio file back into CapCut and swap it in to replace the original audio track.',
        tool: 'CapCut',
        toolColor: 'bg-purple-600',
        icon: '🔄',
      },
      {
        num: 7,
        title: 'Colour grade',
        detail: 'With the clean edit and the good audio in place, colour grade the footage to finish the look.',
        tool: 'CapCut',
        toolColor: 'bg-purple-600',
        icon: '🎨',
      },
    ],
  },
  {
    title: 'Repurpose & Hand Off',
    color: 'green',
    steps: [
      {
        num: 8,
        title: 'Export the master (no subtitles)',
        detail: 'Once all editing is finished, export the final file without subtitles.',
        tool: 'CapCut',
        toolColor: 'bg-purple-600',
        icon: '📤',
      },
      {
        num: 9,
        title: 'Generate shorts in OpusClip',
        detail: 'Load that no-subtitle master into OpusClip to automatically generate your shorts.',
        tool: 'OpusClip',
        toolColor: 'bg-orange-500',
        icon: '⚡',
      },
      {
        num: 10,
        title: 'Send the best shorts to the comms team',
        detail: 'Pick the strongest shorts and share them with the comms team. They choose which ones work best for that client\'s content and posting.',
        tool: 'Internal hand-off',
        toolColor: 'bg-[#F5C518]',
        toolTextColor: 'text-[#1a1a1a]',
        icon: '📨',
      },
      {
        num: 11,
        title: 'Hunt for extra "best bits"',
        detail: 'Go back through the original full file and look for any other great clips that OpusClip missed.',
        tool: 'CapCut / Review',
        toolColor: 'bg-purple-600',
        icon: '🔍',
      },
      {
        num: 12,
        title: 'Run any found clips back through OpusClip',
        detail: 'For each extra best-bit you find, export it (still without subtitles) and drop it into OpusClip as a single file. Let OpusClip auto-generate the subtitles on those clips for you.',
        tool: 'OpusClip',
        toolColor: 'bg-orange-500',
        icon: '🔁',
      },
    ],
  },
];

const TOOLS_LEGEND = [
  { name: 'YoloBox / Cameras', use: 'Capture', color: 'bg-gray-700' },
  { name: 'CapCut', use: 'Editing, syncing, cutting, colour grading, exporting', color: 'bg-purple-600' },
  { name: 'Adobe Podcast', use: 'Audio enhancement', color: 'bg-red-600' },
  { name: 'OpusClip', use: 'Shorts generation + auto-subtitles', color: 'bg-orange-500' },
];

const PHASE_COLORS = {
  blue: { bg: 'bg-blue-50', border: 'border-blue-200', headerBg: 'bg-blue-600', text: 'text-blue-700', line: 'bg-blue-300', dot: 'bg-blue-500' },
  purple: { bg: 'bg-purple-50', border: 'border-purple-200', headerBg: 'bg-purple-600', text: 'text-purple-700', line: 'bg-purple-300', dot: 'bg-purple-500' },
  green: { bg: 'bg-green-50', border: 'border-green-200', headerBg: 'bg-green-600', text: 'text-green-700', line: 'bg-green-300', dot: 'bg-green-500' },
};

export default function EditWorkflow() {
  const [activeStep, setActiveStep] = useState(null);
  const [showSummary, setShowSummary] = useState(false);

  return (
    <div className="h-full overflow-y-auto bg-[#0E0E0E]">
      <div className="max-w-3xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-block bg-[#F5C518] text-[#0E0E0E] text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full mb-4">
            Video Team Workflow
          </div>
          <h1 className="text-2xl font-bold text-white mb-2" style={{ fontFamily: 'system-ui' }}>
            Podcast Footage → Finished Content
          </h1>
          <p className="text-sm text-gray-400 max-w-lg mx-auto leading-relaxed">
            Start here with any footage that comes off the YoloBox. Follow each step in order.
          </p>

          {/* Quick summary toggle */}
          <button onClick={() => setShowSummary(!showSummary)}
            className="mt-4 text-[11px] text-[#F5C518] bg-transparent border border-[#F5C518]/30 rounded-full px-4 py-1.5 cursor-pointer hover:bg-[#F5C518]/10 transition-colors">
            {showSummary ? 'Hide' : 'Show'} Quick Reference
          </button>
        </div>

        {/* Quick reference summary */}
        {showSummary && (
          <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl p-5 mb-8 animate-in">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#F5C518] mb-3">Quick Reference — All 12 Steps</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
              {PHASES.flatMap(p => p.steps).map(step => (
                <div key={step.num} className="flex items-center gap-2 text-[11px]">
                  <span className="w-5 h-5 rounded-full bg-[#2A2A2A] text-white flex items-center justify-center text-[9px] font-bold shrink-0">{step.num}</span>
                  <span className="text-gray-300">{step.title}</span>
                  <span className={`text-[8px] font-bold text-white px-1.5 py-0.5 rounded ${step.toolColor} ml-auto shrink-0`}>{step.tool}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tools legend */}
        <div className="flex flex-wrap justify-center gap-3 mb-10">
          {TOOLS_LEGEND.map(t => (
            <div key={t.name} className="flex items-center gap-2 bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg px-3 py-1.5">
              <span className={`w-2.5 h-2.5 rounded-full ${t.color} shrink-0`}></span>
              <span className="text-[10px] font-semibold text-white">{t.name}</span>
              <span className="text-[9px] text-gray-500">{t.use}</span>
            </div>
          ))}
        </div>

        {/* Phase flow */}
        <div className="space-y-2">
          {PHASES.map((phase, pi) => {
            const colors = PHASE_COLORS[phase.color];
            return (
              <div key={pi}>
                {/* Phase header */}
                <div className="flex items-center gap-3 mb-4">
                  <div className={`${colors.headerBg} text-white text-[10px] font-bold uppercase tracking-widest px-4 py-2 rounded-lg`}>
                    Phase {pi + 1}
                  </div>
                  <div className="text-sm font-bold text-white">{phase.title}</div>
                  <div className="flex-1 h-px bg-[#2A2A2A]"></div>
                </div>

                {/* Steps */}
                <div className="relative ml-6 mb-8">
                  {/* Vertical connecting line */}
                  <div className={`absolute left-4 top-0 bottom-0 w-0.5 ${colors.line} opacity-30`}></div>

                  {phase.steps.map((step, si) => {
                    const isActive = activeStep === step.num;
                    const isLast = si === phase.steps.length - 1;
                    return (
                      <div key={step.num}
                        className={`relative flex gap-4 ${isLast ? '' : 'mb-4'}`}
                        onMouseEnter={() => setActiveStep(step.num)}
                        onMouseLeave={() => setActiveStep(null)}>

                        {/* Step number dot */}
                        <div className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-sm font-bold transition-all duration-300 ${
                          isActive
                            ? `${colors.headerBg} text-white scale-110 shadow-lg`
                            : 'bg-[#2A2A2A] text-gray-400'
                        }`}>
                          {isActive ? step.icon : step.num}
                        </div>

                        {/* Arrow connector */}
                        {!isLast && (
                          <div className="absolute left-[15px] top-8 w-0 h-4">
                            <svg width="2" height="16" className="text-gray-600">
                              <line x1="1" y1="0" x2="1" y2="12" stroke="currentColor" strokeWidth="1" strokeDasharray="3,3" />
                              <polygon points="0,12 2,12 1,16" fill="currentColor" />
                            </svg>
                          </div>
                        )}

                        {/* Step card */}
                        <div className={`flex-1 rounded-xl p-4 transition-all duration-300 border ${
                          isActive
                            ? `${colors.bg} ${colors.border} shadow-lg -translate-y-0.5`
                            : 'bg-[#1A1A1A] border-[#2A2A2A] hover:border-[#3A3A3A]'
                        }`}>
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <h3 className={`text-[13px] font-bold ${isActive ? colors.text : 'text-white'}`}>
                              {step.title}
                            </h3>
                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0 ${step.toolColor} ${step.toolTextColor || 'text-white'}`}>
                              {step.tool}
                            </span>
                          </div>
                          <p className={`text-[12px] leading-relaxed ${isActive ? 'text-gray-700' : 'text-gray-400'}`}>
                            {step.detail}
                          </p>
                          {step.bullets && (
                            <ul className={`mt-2 space-y-1 ${isActive ? 'text-gray-700' : 'text-gray-500'}`}>
                              {step.bullets.map((b, bi) => (
                                <li key={bi} className="flex items-center gap-2 text-[11px]">
                                  <span className={`w-1.5 h-1.5 rounded-full ${isActive ? colors.dot : 'bg-gray-600'} shrink-0`}></span>
                                  {b}
                                </li>
                              ))}
                            </ul>
                          )}
                          {step.note && (
                            <div className={`mt-2 text-[11px] italic ${isActive ? colors.text : 'text-gray-500'}`}>
                              💡 {step.note}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Phase connector arrow */}
                {pi < PHASES.length - 1 && (
                  <div className="flex justify-center mb-4">
                    <div className="flex flex-col items-center">
                      <div className="w-px h-6 bg-[#F5C518]/30"></div>
                      <div className="w-3 h-3 border-b-2 border-r-2 border-[#F5C518]/50 transform rotate-45 -mt-1.5"></div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Done banner */}
        <div className="mt-8 bg-gradient-to-r from-[#F5C518]/10 to-transparent border border-[#F5C518]/30 rounded-xl p-6 text-center">
          <div className="text-3xl mb-2">✅</div>
          <div className="text-sm font-bold text-white mb-1">Workflow Complete</div>
          <div className="text-[11px] text-gray-400">
            Master episode exported, shorts generated, best bits found, comms team briefed.
          </div>
        </div>

        {/* Footer note */}
        <div className="mt-6 text-center text-[10px] text-gray-600">
          CYL Edit Workflow · Campaigns You Love
        </div>
      </div>

      <style>{`
        .animate-in { animation: fadeSlideIn 0.3s ease-out; }
        @keyframes fadeSlideIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}
