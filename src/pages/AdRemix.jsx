import { useState, useEffect, useRef, useCallback } from 'react';
import { useClients } from '../hooks/useClients';
import { supabase } from '../lib/supabase';
import * as imageGen from '../lib/imageGen';
import { getClientContext, formatContextForPrompt } from '../lib/clientContext';
import toast from 'react-hot-toast';

const ANTHROPIC_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY;

const STRENGTH_PRESETS = [
  { value: 0.35, label: 'Subtle', desc: 'Keep close to original' },
  { value: 0.55, label: 'Moderate', desc: 'Balanced remix' },
  { value: 0.75, label: 'Creative', desc: 'More AI interpretation' },
  { value: 0.90, label: 'Wild', desc: 'Major transformation' },
];

function Label({ children }) {
  return <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">{children}</label>;
}

export default function AdRemix() {
  const { clients } = useClients();
  const [selectedClient, setSelectedClient] = useState('');
  const [brandVoice, setBrandVoice] = useState(null);
  const [sourceImage, setSourceImage] = useState(null); // { file, dataUrl, name }
  const [ideaText, setIdeaText] = useState('');
  const [platform, setPlatform] = useState('Meta Feed');
  const [strength, setStrength] = useState(0.55);
  const [generating, setGenerating] = useState(false);
  const [results, setResults] = useState([]); // array of generated images
  const [aiSuggestions, setAiSuggestions] = useState(null);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dropRef = useRef(null);
  const fileInputRef = useRef(null);

  // Load brand voice when client changes
  useEffect(() => {
    if (!selectedClient) { setBrandVoice(null); return; }
    supabase.from('client_brand_voice')
      .select('*')
      .eq('client_name', selectedClient)
      .single()
      .then(({ data }) => setBrandVoice(data || null));
  }, [selectedClient]);

  const handleFile = useCallback(async (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file (PNG, JPG, etc.)');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image must be under 10MB');
      return;
    }
    const dataUrl = await imageGen.fileToDataUrl(file);
    setSourceImage({ file, dataUrl, name: file.name });
    toast.success('Image loaded');
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    handleFile(file);
  }, [handleFile]);

  const handlePaste = useCallback((e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        handleFile(file);
        break;
      }
    }
  }, [handleFile]);

  useEffect(() => {
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [handlePaste]);

  // Get AI suggestions for the image + client
  const handleGetSuggestions = async () => {
    if (!sourceImage && !ideaText.trim()) {
      toast.error('Upload an image or type an idea first');
      return;
    }
    setLoadingSuggestions(true);
    setAiSuggestions(null);
    try {
      const ctx = selectedClient ? await getClientContext(selectedClient) : null;
      const contextText = ctx ? formatContextForPrompt(ctx) : '';

      const prompt = `You are a creative director at an Australian digital marketing agency.
${contextText ? `\nCLIENT CONTEXT:\n${contextText}\n` : ''}
${brandVoice ? `BRAND VOICE:
- Tone: ${brandVoice.tone || 'Not set'}
- Services: ${brandVoice.services || 'Not set'}
- USPs: ${brandVoice.key_selling_points || 'Not set'}
- Audience: ${brandVoice.target_personas || 'Not set'}
` : ''}
${ideaText ? `USER'S IDEA: ${ideaText}` : 'The user has uploaded a design/image they want remixed into ad creatives.'}

Generate 4 creative ad concept directions. For each, give:
1. A concept name (2-3 words)
2. A detailed image prompt that would work with image-to-image AI (describe style, mood, colours, composition, text overlays to add)
3. A headline suggestion
4. Why this direction would work for the client

Return ONLY valid JSON:
{
  "concepts": [
    {
      "name": "Concept Name",
      "image_prompt": "Detailed prompt for fal.ai image-to-image...",
      "headline": "Ad headline text",
      "rationale": "Why this works for the client"
    }
  ]
}`;

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5',
          max_tokens: 1500,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      const data = await res.json();
      const text = data.content?.[0]?.text || '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        setAiSuggestions(parsed.concepts || []);
      }
    } catch (err) {
      toast.error('Error: ' + err.message);
    }
    setLoadingSuggestions(false);
  };

  // Generate image from a concept
  const handleGenerate = async (promptText) => {
    if (!imageGen.isConfigured()) {
      toast.error('Fal.ai API key not configured');
      return;
    }

    const spec = imageGen.PLATFORM_SPECS[platform] || { width: 1080, height: 1080 };
    setGenerating(true);

    try {
      let result;
      if (sourceImage) {
        // Image-to-image remix
        toast('Remixing image...');
        result = await imageGen.remixImage(sourceImage.dataUrl, promptText, {
          width: spec.width,
          height: spec.height,
          strength,
        });
      } else {
        // Text-to-image (no source image)
        toast('Generating image...');
        result = await imageGen.generateImage(promptText, {
          width: spec.width,
          height: spec.height,
          model: 'fal-ai/flux/schnell',
        });
      }
      setResults(prev => [{ ...result, concept: promptText, timestamp: Date.now() }, ...prev]);
      toast.success('Image generated!');
    } catch (err) {
      toast.error('Generation error: ' + err.message);
    }
    setGenerating(false);
  };

  // Quick generate with custom prompt
  const handleQuickGenerate = () => {
    if (!ideaText.trim()) {
      toast.error('Type an idea or creative direction first');
      return;
    }
    const clientPrefix = brandVoice
      ? `Professional ad creative for ${selectedClient}. Brand tone: ${brandVoice.tone || 'professional'}. `
      : '';
    handleGenerate(clientPrefix + ideaText);
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-5 py-3 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-[#1a1a1a]">🎨 Ad Remix</h1>
            <p className="text-[11px] text-gray-400">Upload a design, get AI-powered ad variations using fal.ai</p>
          </div>
          <div className="flex items-center gap-2">
            <Label>Client</Label>
            <select value={selectedClient} onChange={e => setSelectedClient(e.target.value)}
              className="border border-gray-200 rounded px-2.5 py-1.5 text-xs bg-[#f8f8f6] min-w-[160px]">
              <option value="">No client</option>
              {clients.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-5">
            {/* Left: Input */}
            <div className="space-y-4">
              {/* Image upload */}
              <div
                ref={dropRef}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => !sourceImage && fileInputRef.current?.click()}
                className={`relative border-2 border-dashed rounded-xl transition-colors cursor-pointer overflow-hidden ${
                  dragging ? 'border-[#F5C518] bg-[#F5C518]/5' :
                  sourceImage ? 'border-green-300 bg-green-50/30' :
                  'border-gray-300 bg-[#f8f8f6] hover:border-[#F5C518]'
                }`}
                style={{ minHeight: sourceImage ? 'auto' : '200px' }}
              >
                {sourceImage ? (
                  <div className="relative">
                    <img src={sourceImage.dataUrl} alt="Source" className="w-full rounded-lg" style={{ maxHeight: '400px', objectFit: 'contain' }} />
                    <div className="absolute top-2 right-2 flex gap-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); setSourceImage(null); }}
                        className="bg-red-500 text-white border-none rounded-full w-6 h-6 text-xs cursor-pointer hover:bg-red-600 flex items-center justify-center"
                        title="Remove image"
                      >✕</button>
                    </div>
                    <div className="absolute bottom-2 left-2 bg-black/60 text-white text-[10px] px-2 py-1 rounded">
                      {sourceImage.name}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 px-4">
                    <div className="text-4xl mb-2 opacity-40">📷</div>
                    <div className="text-sm text-gray-500 font-semibold mb-1">Drop your design here</div>
                    <div className="text-[11px] text-gray-400">PNG, JPG up to 10MB · or paste from clipboard (Ctrl+V)</div>
                    <button
                      onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                      className="mt-3 text-[11px] text-[#F5C518] font-bold bg-transparent border border-[#F5C518] rounded px-3 py-1 cursor-pointer hover:bg-[#F5C518]/10"
                    >
                      Browse files
                    </button>
                  </div>
                )}
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
                  onChange={e => { handleFile(e.target.files[0]); e.target.value = ''; }} />
              </div>

              {/* Idea / direction box */}
              <div>
                <Label>Creative Direction / Idea</Label>
                <textarea
                  value={ideaText}
                  onChange={e => setIdeaText(e.target.value)}
                  rows={3}
                  placeholder="e.g. Turn this into a bold Facebook ad with our brand colours, add urgency — spring sale ending soon. Make it feel premium and modern..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs bg-[#f8f8f6] resize-y focus:outline-none focus:border-[#F5C518]"
                />
              </div>

              {/* Controls row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Platform Format</Label>
                  <select value={platform} onChange={e => setPlatform(e.target.value)}
                    className="w-full border border-gray-200 rounded px-2.5 py-1.5 text-xs bg-[#f8f8f6]">
                    {Object.entries(imageGen.PLATFORM_SPECS).map(([k, v]) => (
                      <option key={k} value={k}>{k} — {v.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>Remix Strength {sourceImage ? '' : '(N/A without image)'}</Label>
                  <div className="flex gap-1">
                    {STRENGTH_PRESETS.map(s => (
                      <button key={s.value}
                        onClick={() => setStrength(s.value)}
                        disabled={!sourceImage}
                        className={`flex-1 text-[10px] font-semibold rounded py-1.5 border cursor-pointer transition-colors ${
                          strength === s.value
                            ? 'bg-[#F5C518] text-[#1a1a1a] border-[#F5C518]'
                            : 'bg-white text-gray-500 border-gray-200 hover:border-[#F5C518] disabled:opacity-30'
                        }`}
                        title={s.desc}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2">
                <button
                  onClick={handleGetSuggestions}
                  disabled={loadingSuggestions || (!sourceImage && !ideaText.trim())}
                  className="flex-1 bg-[#1a1a1a] text-white border-none rounded-lg px-4 py-2.5 text-[11px] font-bold cursor-pointer hover:bg-[#333] disabled:opacity-40"
                >
                  {loadingSuggestions ? 'Thinking...' : '💡 Get AI Concepts'}
                </button>
                <button
                  onClick={handleQuickGenerate}
                  disabled={generating || !ideaText.trim()}
                  className="flex-1 bg-[#F5C518] text-[#1a1a1a] border-none rounded-lg px-4 py-2.5 text-[11px] font-bold cursor-pointer hover:bg-[#e6b800] disabled:opacity-40"
                >
                  {generating ? 'Generating...' : `⚡ Quick ${sourceImage ? 'Remix' : 'Generate'}`}
                </button>
              </div>

              {/* Brand voice context hint */}
              {brandVoice && (
                <div className="bg-gray-50 rounded-lg p-3 text-[10px]">
                  <div className="font-bold uppercase text-gray-400 mb-1">Brand Context Active — {selectedClient}</div>
                  <div className="text-gray-500">
                    {brandVoice.tone && <span>Tone: {brandVoice.tone}. </span>}
                    {brandVoice.key_selling_points && <span>USPs: {brandVoice.key_selling_points.substring(0, 100)}...</span>}
                  </div>
                </div>
              )}
            </div>

            {/* Right: AI Concepts + Results */}
            <div className="space-y-4">
              {/* AI Concepts */}
              {aiSuggestions && aiSuggestions.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <div className="text-[10px] font-bold uppercase text-gray-400 mb-3">💡 AI Concept Directions</div>
                  <div className="space-y-3">
                    {aiSuggestions.map((concept, i) => (
                      <div key={i} className="bg-[#f8f8f6] rounded-lg p-3 hover:bg-gray-100 transition-colors">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <div>
                            <div className="text-[12px] font-bold text-[#1a1a1a]">{concept.name}</div>
                            {concept.headline && (
                              <div className="text-[11px] text-[#F5C518] font-semibold mt-0.5">"{concept.headline}"</div>
                            )}
                          </div>
                          <button
                            onClick={() => handleGenerate(concept.image_prompt)}
                            disabled={generating}
                            className="shrink-0 bg-[#F5C518] text-[#1a1a1a] border-none rounded px-2.5 py-1 text-[10px] font-bold cursor-pointer hover:bg-[#e6b800] disabled:opacity-40"
                          >
                            {generating ? '...' : '⚡ Generate'}
                          </button>
                        </div>
                        <div className="text-[10px] text-gray-500 leading-snug mb-1">{concept.rationale}</div>
                        <div className="text-[9px] text-gray-400 italic leading-snug">{concept.image_prompt.substring(0, 120)}...</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Generated Results */}
              {results.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold uppercase text-gray-400 mb-2">Generated Results</div>
                  <div className="space-y-3">
                    {results.map((result, i) => (
                      <div key={result.timestamp || i} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                        <img src={result.url} alt="Generated" className="w-full" style={{ maxHeight: '500px', objectFit: 'contain' }} />
                        <div className="p-3">
                          <div className="text-[10px] text-gray-500 leading-snug mb-2 line-clamp-2">{result.concept}</div>
                          <div className="flex gap-2">
                            <a href={result.url} target="_blank" rel="noopener noreferrer" download
                              className="text-[10px] font-bold text-blue-600 bg-blue-50 border border-blue-200 rounded px-2 py-1 no-underline hover:bg-blue-100">
                              💾 Download
                            </a>
                            <button
                              onClick={() => {
                                setSourceImage({ file: null, dataUrl: result.url, name: 'Generated image' });
                                toast.success('Set as new source — remix again!');
                              }}
                              className="text-[10px] font-bold text-purple-600 bg-purple-50 border border-purple-200 rounded px-2 py-1 cursor-pointer hover:bg-purple-100"
                            >
                              🔄 Remix This
                            </button>
                            <button
                              onClick={() => {
                                if (navigator.clipboard?.writeText) {
                                  navigator.clipboard.writeText(result.url);
                                  toast.success('URL copied');
                                }
                              }}
                              className="text-[10px] font-bold text-gray-500 bg-gray-50 border border-gray-200 rounded px-2 py-1 cursor-pointer hover:bg-gray-100"
                            >
                              📋 Copy URL
                            </button>
                          </div>
                          <div className="text-[9px] text-gray-400 mt-1">{result.width}×{result.height}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Empty state */}
              {!aiSuggestions && results.length === 0 && (
                <div className="bg-[#f8f8f6] rounded-xl p-8 text-center">
                  <div className="text-3xl mb-3 opacity-30">🎨</div>
                  <div className="text-sm text-gray-500 font-semibold mb-1">Your remixed ads will appear here</div>
                  <div className="text-[11px] text-gray-400 leading-relaxed max-w-sm mx-auto">
                    Upload a Figma design or existing creative on the left, select a client for brand context,
                    type your creative direction, then hit <b>💡 Get AI Concepts</b> for smart suggestions
                    or <b>⚡ Quick Remix</b> to generate immediately.
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
