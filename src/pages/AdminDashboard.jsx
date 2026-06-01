import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAdmin } from '../hooks/useAdmin';
import toast from 'react-hot-toast';

const ROLES = [
  { value: 'super_admin', label: 'Super Admin', desc: 'Full control — can manage all users including admins' },
  { value: 'admin', label: 'Admin', desc: 'Can add/remove members but cannot remove super admins' },
  { value: 'member', label: 'Member', desc: 'Standard team member — no admin access' },
];

const ROLE_COLORS = {
  super_admin: 'bg-red-50 text-red-700 border-red-200',
  admin: 'bg-purple-50 text-purple-700 border-purple-200',
  member: 'bg-gray-100 text-gray-600 border-gray-200',
};

export default function AdminDashboard() {
  const { currentUser, isSuperAdmin, isAdmin, refresh } = useAdmin();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({ email: '', password: '', name: '', role: 'member' });
  const [adding, setAdding] = useState(false);

  // Load all app users
  useEffect(() => {
    if (!isAdmin) return;
    supabase.from('app_users')
      .select('*')
      .order('role')
      .order('name')
      .then(({ data, error }) => {
        if (error) console.error(error);
        else setUsers(data || []);
        setLoading(false);
      });
  }, [isAdmin]);

  const handleAddUser = async (e) => {
    e.preventDefault();
    if (!addForm.email || !addForm.password || !addForm.name) return toast.error('Fill in all fields');
    if (addForm.password.length < 6) return toast.error('Password must be at least 6 characters');
    if (addForm.role === 'super_admin' && !isSuperAdmin) return toast.error('Only super admins can create super admins');

    setAdding(true);
    try {
      // Create the auth user
      const { data: authData, error: authErr } = await supabase.auth.signUp({
        email: addForm.email,
        password: addForm.password,
      });
      if (authErr) throw authErr;
      if (!authData.user) throw new Error('User creation failed');

      // Add to app_users table
      const { data: appUser, error: appErr } = await supabase.from('app_users').insert({
        user_id: authData.user.id,
        email: addForm.email,
        name: addForm.name,
        role: addForm.role,
        active: true,
        created_by: currentUser?.name || 'Admin',
      }).select().single();
      if (appErr) throw appErr;

      setUsers(prev => [...prev, appUser]);
      setAddForm({ email: '', password: '', name: '', role: 'member' });
      setShowAddForm(false);
      toast.success(`${addForm.name} added as ${addForm.role}`);
    } catch (err) {
      toast.error('Error: ' + err.message);
    }
    setAdding(false);
  };

  const handleResetPassword = async (email) => {
    if (!confirm(`Send password reset email to ${email}?`)) return;
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + (window.location.pathname.includes('/virtual-office') ? '/virtual-office/login' : '/login'),
      });
      if (error) throw error;
      toast.success(`Reset email sent to ${email}`);
    } catch (err) {
      toast.error('Error: ' + err.message);
    }
  };

  const handleChangeRole = async (userId, newRole) => {
    const user = users.find(u => u.id === userId);
    if (!user) return;
    // super_admin protection
    if (user.role === 'super_admin' && !isSuperAdmin) return toast.error('Cannot modify a super admin');
    if (newRole === 'super_admin' && !isSuperAdmin) return toast.error('Only super admins can promote to super admin');

    const { error } = await supabase.from('app_users').update({ role: newRole }).eq('id', userId);
    if (error) { toast.error(error.message); return; }
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
    toast.success(`${user.name} is now ${newRole}`);
  };

  const handleToggleActive = async (userId) => {
    const user = users.find(u => u.id === userId);
    if (!user) return;
    if (user.role === 'super_admin' && !isSuperAdmin) return toast.error('Cannot disable a super admin');
    if (user.user_id === currentUser?.user_id) return toast.error('Cannot disable yourself');

    const newActive = !user.active;
    const { error } = await supabase.from('app_users').update({ active: newActive }).eq('id', userId);
    if (error) { toast.error(error.message); return; }
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, active: newActive } : u));
    toast.success(`${user.name} ${newActive ? 'enabled' : 'disabled'}`);
  };

  const handleDeleteUser = async (userId) => {
    const user = users.find(u => u.id === userId);
    if (!user) return;
    if (user.role === 'super_admin' && !isSuperAdmin) return toast.error('Cannot delete a super admin');
    if (user.user_id === currentUser?.user_id) return toast.error('Cannot delete yourself');
    if (!confirm(`Permanently remove ${user.name} (${user.email}) from the system?`)) return;

    const { error } = await supabase.from('app_users').delete().eq('id', userId);
    if (error) { toast.error(error.message); return; }
    setUsers(prev => prev.filter(u => u.id !== userId));
    toast.success(`${user.name} removed`);
  };

  // Not admin — show debug info to help fix setup
  if (!isAdmin) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="text-4xl mb-3">🔒</div>
          <div className="text-sm font-semibold text-[#1a1a1a] mb-2">Admin access required</div>
          <div className="text-[11px] text-gray-500 mb-4">
            Your account wasn't found in the <code className="bg-gray-100 px-1 rounded">app_users</code> table, or the table doesn't exist yet.
          </div>
          <div className="bg-[#f8f8f6] rounded-lg p-4 text-left text-[11px] text-gray-600 space-y-1">
            <div><b>Your auth ID:</b> <code className="bg-gray-100 px-1 rounded text-[10px]">{currentUser?.user_id || 'loading...'}</code></div>
            <div><b>Your email:</b> {currentUser?.email || 'loading...'}</div>
            <div><b>Current role:</b> {currentUser?.role || 'none'}</div>
            <div className="pt-2 text-[10px] text-gray-400">
              Run this SQL in Supabase to grant yourself super admin access:<br/>
              <code className="block bg-gray-100 p-2 rounded mt-1 text-[9px] break-all">
                INSERT INTO app_users (user_id, email, name, role, active) VALUES ('{currentUser?.user_id}', '{currentUser?.email}', 'Cameron', 'super_admin', true) ON CONFLICT DO NOTHING;
              </code>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="bg-white border-b border-gray-200 px-5 py-3 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-[#1a1a1a]">🔐 Admin Dashboard</h1>
            <p className="text-[11px] text-gray-400">
              Logged in as <b>{currentUser?.name}</b> · {isSuperAdmin ? 'Super Admin' : 'Admin'}
              {' · '}{users.filter(u => u.active).length} active user{users.filter(u => u.active).length !== 1 ? 's' : ''}
            </p>
          </div>
          <button onClick={() => setShowAddForm(!showAddForm)}
            className="bg-[#F5C518] text-[#1a1a1a] border-none rounded px-4 py-2 text-[11px] font-bold cursor-pointer hover:bg-[#e6b800]">
            + Add Team Member
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        <div className="max-w-4xl mx-auto">
          {/* Add user form */}
          {showAddForm && (
            <form onSubmit={handleAddUser} className="bg-white border border-[#F5C518] rounded-xl p-5 mb-5">
              <div className="text-[11px] font-bold uppercase text-[#F5C518] mb-3">Add New Team Member</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                <div>
                  <Label>Full Name</Label>
                  <input value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Carlos Martinez" required className="sf" />
                </div>
                <div>
                  <Label>Email</Label>
                  <input type="email" value={addForm.email} onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="carlos@cylglobal.com" required className="sf" />
                </div>
                <div>
                  <Label>Temporary Password</Label>
                  <input value={addForm.password} onChange={e => setAddForm(f => ({ ...f, password: e.target.value }))}
                    placeholder="Min 6 characters" required className="sf" />
                </div>
                <div>
                  <Label>Role</Label>
                  <select value={addForm.role} onChange={e => setAddForm(f => ({ ...f, role: e.target.value }))} className="sf">
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                    {isSuperAdmin && <option value="super_admin">Super Admin</option>}
                  </select>
                </div>
              </div>
              <div className="text-[10px] text-gray-400 mb-3">
                The user will be able to log in immediately with these credentials. Send them a password reset if you want them to set their own.
              </div>
              <div className="flex gap-2">
                <button type="submit" disabled={adding}
                  className="bg-[#F5C518] text-[#1a1a1a] border-none rounded px-4 py-1.5 text-[11px] font-bold cursor-pointer hover:bg-[#e6b800] disabled:opacity-40">
                  {adding ? 'Creating...' : 'Create User'}
                </button>
                <button type="button" onClick={() => setShowAddForm(false)}
                  className="bg-transparent border border-gray-300 text-gray-600 rounded px-4 py-1.5 text-[11px] cursor-pointer hover:border-gray-400">
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* Users table */}
          {loading ? (
            <div className="text-center py-10 text-gray-400">Loading...</div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="bg-[#f8f8f6] border-b border-gray-200 text-left">
                    <th className="px-4 py-2.5 font-semibold text-gray-500">Name</th>
                    <th className="px-3 py-2.5 font-semibold text-gray-500">Email</th>
                    <th className="px-3 py-2.5 font-semibold text-gray-500">Role</th>
                    <th className="px-3 py-2.5 font-semibold text-gray-500">Status</th>
                    <th className="px-3 py-2.5 font-semibold text-gray-500">Added By</th>
                    <th className="px-3 py-2.5 w-40"></th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(user => {
                    const isMe = user.user_id === currentUser?.user_id;
                    const isSA = user.role === 'super_admin';
                    const canModify = isSuperAdmin || (!isSA && !isMe);

                    return (
                      <tr key={user.id} className={`border-b border-gray-100 hover:bg-[#f8f8f6] ${!user.active ? 'opacity-40' : ''}`}>
                        <td className="px-4 py-3 font-semibold text-[#1a1a1a]">
                          {user.name}
                          {isMe && <span className="text-[9px] text-[#F5C518] font-bold ml-1">(you)</span>}
                        </td>
                        <td className="px-3 py-3 text-gray-600">{user.email}</td>
                        <td className="px-3 py-3">
                          {canModify && !isMe ? (
                            <select value={user.role} onChange={e => handleChangeRole(user.id, e.target.value)}
                              className={`text-[10px] font-bold uppercase px-2 py-1 rounded border cursor-pointer ${ROLE_COLORS[user.role]}`}>
                              <option value="member">Member</option>
                              <option value="admin">Admin</option>
                              {isSuperAdmin && <option value="super_admin">Super Admin</option>}
                            </select>
                          ) : (
                            <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded border ${ROLE_COLORS[user.role]}`}>
                              {ROLES.find(r => r.value === user.role)?.label || user.role}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          {user.active ? (
                            <span className="text-[10px] font-bold text-green-600">Active</span>
                          ) : (
                            <span className="text-[10px] font-bold text-gray-400">Disabled</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-[11px] text-gray-400">{user.created_by || '—'}</td>
                        <td className="px-3 py-3 text-right whitespace-nowrap">
                          <button onClick={() => handleResetPassword(user.email)}
                            className="text-[10px] text-blue-500 hover:text-blue-700 bg-transparent border-none cursor-pointer mr-2" title="Send password reset email">
                            🔑 Reset
                          </button>
                          {canModify && !isMe && (
                            <>
                              <button onClick={() => handleToggleActive(user.id)}
                                className={`text-[10px] ${user.active ? 'text-orange-500' : 'text-green-600'} hover:underline bg-transparent border-none cursor-pointer mr-2`}>
                                {user.active ? 'Disable' : 'Enable'}
                              </button>
                              <button onClick={() => handleDeleteUser(user.id)}
                                className="text-[10px] text-red-400 hover:text-red-600 bg-transparent border-none cursor-pointer">
                                Delete
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Role explanation */}
          <div className="mt-5 bg-[#f8f8f6] rounded-xl p-4">
            <div className="text-[10px] font-bold uppercase text-gray-400 mb-2">Role Permissions</div>
            <div className="grid grid-cols-3 gap-3">
              {ROLES.map(r => (
                <div key={r.value} className="text-[11px]">
                  <span className={`font-bold uppercase text-[10px] px-2 py-0.5 rounded border ${ROLE_COLORS[r.value]}`}>{r.label}</span>
                  <div className="text-gray-500 mt-1 leading-relaxed">{r.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* API Keys */}
          {isSuperAdmin && <ApiKeysSection />}
        </div>
      </div>

      <style>{`
        .sf { width:100%; border:1px solid #e5e7eb; border-radius:5px; padding:6px 10px; font-size:12px; background:#f8f8f6; outline:none; }
        .sf:focus { border-color:#F5C518; background:white; }
      `}</style>
    </div>
  );
}

function Label({ children }) {
  return <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">{children}</label>;
}

const API_KEY_FIELDS = [
  { key: 'google_psi_key', label: 'Google PageSpeed Insights API Key', placeholder: 'AIza...', desc: 'Used by Site Health dashboard. Get from console.cloud.google.com' },
  { key: 'dataforseo_login', label: 'DataForSEO Login', placeholder: 'your@email.com', desc: 'Used by SEO tools for keyword data' },
  { key: 'dataforseo_password', label: 'DataForSEO Password', placeholder: 'API password', desc: 'DataForSEO API password (not your account password)' },
  { key: 'anthropic_api_key', label: 'Anthropic API Key', placeholder: 'sk-ant-...', desc: 'Used by AI features (SEO Assistant, fixes, briefs, etc.)' },
  { key: 'fal_api_key', label: 'Fal.ai API Key', placeholder: 'Key ...', desc: 'Used by Ad Remix image generation' },
];

function ApiKeysSection() {
  const [keys, setKeys] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showValues, setShowValues] = useState({});

  useEffect(() => {
    supabase.from('app_settings')
      .select('key, value')
      .then(({ data, error }) => {
        if (error && error.code !== '42P01') console.error(error);
        const map = {};
        (data || []).forEach(d => { map[d.key] = d.value; });
        setKeys(map);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleSave = async (key, value) => {
    setSaving(true);
    try {
      const { data: existing } = await supabase.from('app_settings').select('id').eq('key', key).maybeSingle();
      if (existing) {
        await supabase.from('app_settings').update({ value, updated_at: new Date().toISOString() }).eq('key', key);
      } else {
        await supabase.from('app_settings').insert({ key, value });
      }
      toast.success(`${key} saved`);
    } catch (err) {
      toast.error('Save error: ' + err.message);
    }
    setSaving(false);
  };

  if (loading) return null;

  return (
    <div className="mt-5 bg-white border border-gray-200 rounded-xl p-5">
      <div className="text-[10px] font-bold uppercase text-gray-400 mb-1">🔑 API Keys</div>
      <div className="text-[10px] text-gray-400 mb-4">Only visible to Super Admins. Stored securely in Supabase.</div>
      <div className="space-y-3">
        {API_KEY_FIELDS.map(field => (
          <div key={field.key} className="flex items-end gap-2">
            <div className="flex-1">
              <Label>{field.label}</Label>
              <div className="flex gap-1">
                <input
                  type={showValues[field.key] ? 'text' : 'password'}
                  value={keys[field.key] || ''}
                  onChange={e => setKeys(prev => ({ ...prev, [field.key]: e.target.value }))}
                  placeholder={field.placeholder}
                  className="sf flex-1"
                />
                <button onClick={() => setShowValues(prev => ({ ...prev, [field.key]: !prev[field.key] }))}
                  className="text-[10px] text-gray-400 bg-transparent border border-gray-200 rounded px-2 cursor-pointer hover:text-gray-600 shrink-0">
                  {showValues[field.key] ? '🙈' : '👁'}
                </button>
              </div>
              <div className="text-[9px] text-gray-400 mt-0.5">{field.desc}</div>
            </div>
            <button onClick={() => handleSave(field.key, keys[field.key] || '')} disabled={saving}
              className="bg-[#F5C518] text-[#1a1a1a] border-none rounded px-3 py-1.5 text-[10px] font-bold cursor-pointer hover:bg-[#e6b800] disabled:opacity-40 shrink-0 mb-4">
              Save
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
