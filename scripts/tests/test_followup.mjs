import assert from 'node:assert/strict';
globalThis.window = { supabase: { createClient: () => ({}) }, location: { search: '', hostname: 'x' } }; globalThis.localStorage = { getItem: () => null, setItem() {} }; globalThis.document = { documentElement: { dataset: {} }, addEventListener() {}, querySelector: () => null };
const { followUpMsg } = await import('../../hq/leadowner.js');
const a = followUpMsg({ name: 'Herbert Drayton', sender: 'Anaz', owner: 'Tengku', met: true, channel: 'linkedin' });
assert.match(a.text, /^Hi Herbert, Anaz here from OuterHaven, I work alongside Tengku\./);
const b = followUpMsg({ name: 'Jane Doe', sender: 'Tengku', owner: 'Tengku', met: false, channel: 'email' });
assert.ok(b.subject && b.text.endsWith('Regards,\nTengku\nOuterHaven') && !/alongside/.test(b.text));
console.log('followup ok');
