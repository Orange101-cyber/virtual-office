import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useClients } from '../hooks/useClients';
import toast from 'react-hot-toast';

// Australian city coordinates for common locations (fallback geocoding)
const KNOWN_LOCATIONS = {
  'sydney': { lat: -33.8688, lng: 151.2093 },
  'melbourne': { lat: -37.8136, lng: 144.9631 },
  'brisbane': { lat: -27.4698, lng: 153.0251 },
  'perth': { lat: -31.9505, lng: 115.8605 },
  'adelaide': { lat: -34.9285, lng: 138.6007 },
  'gold coast': { lat: -28.0167, lng: 153.4000 },
  'canberra': { lat: -35.2809, lng: 149.1300 },
  'hobart': { lat: -42.8821, lng: 147.3272 },
  'darwin': { lat: -12.4634, lng: 130.8456 },
  'cairns': { lat: -16.9186, lng: 145.7781 },
  'townsville': { lat: -19.2590, lng: 146.8169 },
  'newcastle': { lat: -32.9283, lng: 151.7817 },
  'wollongong': { lat: -34.4278, lng: 150.8931 },
  'sunshine coast': { lat: -26.6500, lng: 153.0667 },
  'west end': { lat: -27.4800, lng: 153.0100 },
  'south brisbane': { lat: -27.4810, lng: 153.0200 },
  'toowoomba': { lat: -27.5598, lng: 151.9507 },
  'geelong': { lat: -38.1499, lng: 144.3617 },
  'launceston': { lat: -41.4332, lng: 147.1441 },
  'bendigo': { lat: -36.7570, lng: 144.2794 },
  'ballarat': { lat: -37.5622, lng: 143.8503 },
  'rockhampton': { lat: -23.3791, lng: 150.5100 },
  'mackay': { lat: -21.1411, lng: 149.1868 },
  'bundaberg': { lat: -24.8661, lng: 152.3489 },
  'hervey bay': { lat: -25.2882, lng: 152.8531 },
  'ipswich': { lat: -27.6167, lng: 152.7667 },
  'logan': { lat: -27.6389, lng: 153.1089 },
  'redland': { lat: -27.5300, lng: 153.2500 },
  'moreton bay': { lat: -27.1200, lng: 153.0200 },
};

function guessCoordinates(address, locationsServed) {
  const text = `${address || ''} ${locationsServed || ''}`.toLowerCase();
  for (const [city, coords] of Object.entries(KNOWN_LOCATIONS)) {
    if (text.includes(city)) return coords;
  }
  return null;
}

// Convert lat/lng to SVG x/y on our Australia map
// Map bounds: lat -10 to -44, lng 112 to 155
function geoToSvg(lat, lng, width = 800, height = 700) {
  const minLat = -44, maxLat = -10;
  const minLng = 112, maxLng = 155;
  const x = ((lng - minLng) / (maxLng - minLng)) * width;
  const y = ((lat - maxLat) / (minLat - maxLat)) * height;
  return { x, y };
}

export default function ClientMap() {
  const { clients } = useClients();
  const [profiles, setProfiles] = useState([]);
  const [hoveredClient, setHoveredClient] = useState(null);
  const [editingAddress, setEditingAddress] = useState(null);
  const [addressForm, setAddressForm] = useState({ address: '', latitude: '', longitude: '' });

  // Load all brand voice profiles with addresses
  useEffect(() => {
    supabase.from('client_brand_voice')
      .select('client_name, address, latitude, longitude, locations_served, services, business_description, tone')
      .then(({ data }) => setProfiles(data || []));
  }, []);

  // Merge clients with their profile data + compute coordinates
  const markers = useMemo(() => {
    return clients.map(client => {
      const profile = profiles.find(p => p.client_name === client.name);
      let lat = parseFloat(profile?.latitude);
      let lng = parseFloat(profile?.longitude);

      if (isNaN(lat) || isNaN(lng)) {
        const guess = guessCoordinates(profile?.address, profile?.locations_served);
        if (guess) { lat = guess.lat; lng = guess.lng; }
      }

      if (isNaN(lat) || isNaN(lng)) return null;

      const svgPos = geoToSvg(lat, lng);
      return {
        ...client,
        profile,
        lat, lng,
        svgX: svgPos.x,
        svgY: svgPos.y,
      };
    }).filter(Boolean);
  }, [clients, profiles]);

  const unmapped = clients.filter(c => !markers.find(m => m.id === c.id));

  const handleSaveAddress = async () => {
    if (!editingAddress) return;
    try {
      const { data: existing } = await supabase.from('client_brand_voice')
        .select('client_name').eq('client_name', editingAddress).single();

      if (existing) {
        await supabase.from('client_brand_voice')
          .update({
            address: addressForm.address,
            latitude: addressForm.latitude,
            longitude: addressForm.longitude,
            updated_at: new Date().toISOString(),
          })
          .eq('client_name', editingAddress);
      } else {
        await supabase.from('client_brand_voice').insert({
          client_name: editingAddress,
          address: addressForm.address,
          latitude: addressForm.latitude,
          longitude: addressForm.longitude,
        });
      }

      // Refresh profiles
      const { data } = await supabase.from('client_brand_voice')
        .select('client_name, address, latitude, longitude, locations_served, services, business_description, tone');
      setProfiles(data || []);
      toast.success('Location saved');
      setEditingAddress(null);
    } catch (err) {
      toast.error('Save error: ' + err.message);
    }
  };

  const openEdit = (clientName) => {
    const profile = profiles.find(p => p.client_name === clientName);
    setAddressForm({
      address: profile?.address || '',
      latitude: profile?.latitude || '',
      longitude: profile?.longitude || '',
    });
    setEditingAddress(clientName);
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="bg-white border-b border-gray-200 px-5 py-3 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-[#1a1a1a]">🗺️ Client Map</h1>
            <p className="text-[11px] text-gray-400">
              {markers.length} client{markers.length !== 1 ? 's' : ''} mapped
              {unmapped.length > 0 && <span className="text-orange-500"> · {unmapped.length} need an address</span>}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="max-w-6xl mx-auto p-5">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5">
            {/* Map */}
            <div className="bg-white border border-gray-200 rounded-xl p-4 relative" style={{ minHeight: '600px' }}>
              <svg viewBox="0 0 800 700" className="w-full h-auto">
                {/* Australia outline — simplified */}
                <path d="M180,200 L200,180 L260,170 L300,175 L340,155 L380,140 L440,130 L480,120 L520,115 L560,120 L600,135 L640,155 L670,180 L690,210 L700,250 L705,300 L700,350 L690,400 L675,430 L650,460 L620,480 L580,500 L540,515 L500,525 L460,530 L420,528 L380,520 L350,505 L330,490 L315,470 L300,445 L280,430 L250,425 L230,440 L210,460 L195,490 L180,520 L170,560 L165,590 L175,620 L200,640 L240,650 L280,645 L320,630 L360,620 L400,615 L440,620 L480,630 L500,640 L505,650 L490,660 L440,665 L400,660 L350,660 L300,665 L250,670 L200,665 L160,650 L130,625 L110,590 L100,550 L95,510 L100,470 L110,430 L120,400 L125,360 L120,320 L118,280 L125,240 L140,215 L160,200 Z"
                  fill="#f0f0ec" stroke="#d1d5db" strokeWidth="1.5" />
                {/* Tasmania */}
                <path d="M520,610 L540,600 L570,605 L585,620 L580,640 L560,650 L535,645 L520,630 Z"
                  fill="#f0f0ec" stroke="#d1d5db" strokeWidth="1.5" />

                {/* State labels */}
                <text x="180" y="450" fill="#d1d5db" fontSize="14" fontWeight="bold" fontFamily="sans-serif">WA</text>
                <text x="340" y="380" fill="#d1d5db" fontSize="14" fontWeight="bold" fontFamily="sans-serif">SA</text>
                <text x="430" y="310" fill="#d1d5db" fontSize="14" fontWeight="bold" fontFamily="sans-serif">QLD</text>
                <text x="530" y="460" fill="#d1d5db" fontSize="14" fontWeight="bold" fontFamily="sans-serif">NSW</text>
                <text x="530" y="530" fill="#d1d5db" fontSize="14" fontWeight="bold" fontFamily="sans-serif">VIC</text>
                <text x="540" y="620" fill="#d1d5db" fontSize="12" fontWeight="bold" fontFamily="sans-serif">TAS</text>
                <text x="310" y="230" fill="#d1d5db" fontSize="14" fontWeight="bold" fontFamily="sans-serif">NT</text>
                <text x="500" y="400" fill="#d1d5db" fontSize="10" fontWeight="bold" fontFamily="sans-serif">ACT</text>

                {/* Major city dots (reference) */}
                {[
                  { name: 'Sydney', ...geoToSvg(-33.87, 151.21) },
                  { name: 'Melbourne', ...geoToSvg(-37.81, 144.96) },
                  { name: 'Brisbane', ...geoToSvg(-27.47, 153.03) },
                  { name: 'Perth', ...geoToSvg(-31.95, 115.86) },
                  { name: 'Adelaide', ...geoToSvg(-34.93, 138.60) },
                  { name: 'Darwin', ...geoToSvg(-12.46, 130.85) },
                  { name: 'Hobart', ...geoToSvg(-42.88, 147.33) },
                ].map(c => (
                  <g key={c.name}>
                    <circle cx={c.x} cy={c.y} r="2" fill="#d1d5db" />
                    <text x={c.x + 5} y={c.y + 4} fill="#9ca3af" fontSize="9" fontFamily="sans-serif">{c.name}</text>
                  </g>
                ))}

                {/* Client markers — pulsating */}
                {markers.map(m => (
                  <g key={m.id}
                    onMouseEnter={() => setHoveredClient(m)}
                    onMouseLeave={() => setHoveredClient(null)}
                    style={{ cursor: 'pointer' }}
                    onClick={() => openEdit(m.name)}
                  >
                    {/* Pulse ring */}
                    <circle cx={m.svgX} cy={m.svgY} r="12" fill="none" stroke="#F5C518" strokeWidth="2" opacity="0.4">
                      <animate attributeName="r" values="8;18;8" dur="2s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0.6;0;0.6" dur="2s" repeatCount="indefinite" />
                    </circle>
                    <circle cx={m.svgX} cy={m.svgY} r="8" fill="none" stroke="#F5C518" strokeWidth="1.5" opacity="0.3">
                      <animate attributeName="r" values="6;14;6" dur="2s" repeatCount="indefinite" begin="0.5s" />
                      <animate attributeName="opacity" values="0.4;0;0.4" dur="2s" repeatCount="indefinite" begin="0.5s" />
                    </circle>
                    {/* Core dot */}
                    <circle cx={m.svgX} cy={m.svgY} r="6"
                      fill={hoveredClient?.id === m.id ? '#F5C518' : '#1a1a1a'}
                      stroke="#F5C518" strokeWidth="2" />
                    {/* Label */}
                    <text x={m.svgX} y={m.svgY - 12}
                      fill="#1a1a1a" fontSize="10" fontWeight="bold" fontFamily="sans-serif" textAnchor="middle">
                      {m.name.length > 18 ? m.name.substring(0, 16) + '…' : m.name}
                    </text>
                  </g>
                ))}
              </svg>

              {/* Hover popover */}
              {hoveredClient && (
                <div className="absolute bg-white border border-gray-200 rounded-lg shadow-xl p-4 z-20 pointer-events-none"
                  style={{
                    left: Math.min(hoveredClient.svgX * 0.9, 500) + 'px',
                    top: Math.max(hoveredClient.svgY * 0.7, 40) + 'px',
                    minWidth: '220px',
                  }}>
                  <div className="text-[12px] font-bold text-[#1a1a1a] mb-1">{hoveredClient.name}</div>
                  {hoveredClient.profile?.address && (
                    <div className="text-[10px] text-gray-500 mb-1">📍 {hoveredClient.profile.address}</div>
                  )}
                  {hoveredClient.profile?.locations_served && (
                    <div className="text-[10px] text-gray-600 mb-1">
                      <span className="font-bold uppercase text-[9px] text-gray-400">Locations Served: </span>
                      {hoveredClient.profile.locations_served}
                    </div>
                  )}
                  {hoveredClient.profile?.services && (
                    <div className="text-[10px] text-gray-600 mb-1">
                      <span className="font-bold uppercase text-[9px] text-gray-400">Services: </span>
                      {hoveredClient.profile.services.split('\n').slice(0, 3).join(', ')}
                      {hoveredClient.profile.services.split('\n').length > 3 && '...'}
                    </div>
                  )}
                  {hoveredClient.profile?.tone && (
                    <div className="text-[10px] text-gray-500 italic">Tone: {hoveredClient.profile.tone}</div>
                  )}
                  <div className="text-[9px] text-gray-400 mt-2 pt-1 border-t border-gray-100">Click to edit location</div>
                </div>
              )}
            </div>

            {/* Sidebar: client list + unmapped */}
            <div className="space-y-4">
              {/* Mapped clients */}
              <div className="bg-white border border-gray-200 rounded-lg p-3">
                <div className="text-[10px] font-bold uppercase text-gray-400 mb-2">
                  📍 Mapped ({markers.length})
                </div>
                <div className="space-y-1.5 max-h-60 overflow-y-auto">
                  {markers.map(m => (
                    <div key={m.id}
                      className="flex items-center justify-between text-[11px] py-1 px-1.5 rounded hover:bg-[#f8f8f6] cursor-pointer"
                      onMouseEnter={() => setHoveredClient(m)}
                      onMouseLeave={() => setHoveredClient(null)}
                      onClick={() => openEdit(m.name)}>
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#F5C518] shrink-0"></span>
                        <span className="font-semibold text-[#1a1a1a]">{m.name}</span>
                      </div>
                      <span className="text-[9px] text-gray-400">{m.profile?.locations_served?.split(',')[0] || ''}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Unmapped clients */}
              {unmapped.length > 0 && (
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                  <div className="text-[10px] font-bold uppercase text-orange-600 mb-2">
                    ⚠ Needs Location ({unmapped.length})
                  </div>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {unmapped.map(c => (
                      <div key={c.id}
                        className="flex items-center justify-between text-[11px] py-1 px-1.5 rounded hover:bg-orange-100/50 cursor-pointer"
                        onClick={() => openEdit(c.name)}>
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-orange-300 shrink-0"></span>
                          <span className="text-gray-700">{c.name}</span>
                        </div>
                        <span className="text-[9px] text-orange-600 font-semibold">+ Add</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Quick edit address modal inline */}
              {editingAddress && (
                <div className="bg-white border border-[#F5C518] rounded-lg p-3">
                  <div className="text-[10px] font-bold uppercase text-[#F5C518] mb-2">
                    📍 Edit Location — {editingAddress}
                  </div>
                  <div className="space-y-2">
                    <div>
                      <label className="block text-[9px] font-bold uppercase text-gray-400 mb-0.5">Address</label>
                      <input value={addressForm.address} onChange={e => setAddressForm(f => ({ ...f, address: e.target.value }))}
                        placeholder="123 Main St, Gold Coast QLD 4217"
                        className="w-full border border-gray-200 rounded px-2 py-1.5 text-[11px] bg-[#f8f8f6]" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[9px] font-bold uppercase text-gray-400 mb-0.5">Latitude</label>
                        <input value={addressForm.latitude} onChange={e => setAddressForm(f => ({ ...f, latitude: e.target.value }))}
                          placeholder="-27.4698"
                          className="w-full border border-gray-200 rounded px-2 py-1.5 text-[11px] bg-[#f8f8f6]" />
                      </div>
                      <div>
                        <label className="block text-[9px] font-bold uppercase text-gray-400 mb-0.5">Longitude</label>
                        <input value={addressForm.longitude} onChange={e => setAddressForm(f => ({ ...f, longitude: e.target.value }))}
                          placeholder="153.0251"
                          className="w-full border border-gray-200 rounded px-2 py-1.5 text-[11px] bg-[#f8f8f6]" />
                      </div>
                    </div>
                    <div className="text-[9px] text-gray-400">
                      Tip: Google your client's address, right-click on Google Maps → "What's here?" to get lat/lng.
                      Or just type the suburb — we'll match common AU cities automatically.
                    </div>
                    <div className="flex gap-2">
                      <button onClick={handleSaveAddress}
                        className="bg-[#F5C518] text-[#1a1a1a] border-none rounded px-3 py-1.5 text-[10px] font-bold cursor-pointer hover:bg-[#e6b800]">
                        Save Location
                      </button>
                      <button onClick={() => setEditingAddress(null)}
                        className="bg-transparent border border-gray-300 text-gray-600 rounded px-3 py-1.5 text-[10px] cursor-pointer">
                        Cancel
                      </button>
                      <Link to="/brand-voice" className="text-[10px] text-blue-500 hover:underline no-underline self-center ml-auto">
                        Full Profile →
                      </Link>
                    </div>
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
