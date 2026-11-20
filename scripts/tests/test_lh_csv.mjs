// Export CSV = Tengku's Prosp format (21 Nov 2026). Real fund names / headlines from the live list.
import assert from 'node:assert/strict';
globalThis.window = { supabase: { createClient: () => ({}) }, location: { search: '', hostname: 'x', hash: '' }, addEventListener() {} };
globalThis.localStorage = { getItem: () => null, setItem() {} };
globalThis.document = { documentElement: { dataset: {} }, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] };
const { toCsv, firmOf, cleanHeadline, CSV_HEAD } = await import('../../hq/linkedhelper.js');
assert.equal(CSV_HEAD.join(','), 'name,email,phoneNumber,headline,jobTitle,location,company,websiteUrl,linkedin_url,Custom Column');
for (const [n, f] of [['VamosVentures Fund II, L.P.', 'VamosVentures'], ['BFF II US Feeder LP', 'BFF'], ['82VS QP Seed Fund I, LP', '82VS'], ['IMB PARTNERS SBIC I, L.P.', 'IMB Partners'],
  ['EVENT CAPITAL STRATEGIES FUND I, LP', 'Event Capital'], ['Embedded Ventures 2025-I LLC', 'Embedded Ventures'], ['Tamarind Hill Fund III, L.P.', 'Tamarind Hill']]) assert.equal(firmOf(n), f, n);
assert.equal(cleanHeadline('New York, New York, United States - Professional Profile', 'X'), '');
assert.equal(cleanHeadline('Executive Officer, Director', 'X'), '');
assert.equal(cleanHeadline('Founder & Managing Partner, YK ...', 'YK Bioventures'), 'Founder & Managing Partner at YK Bioventures');
assert.equal(cleanHeadline('Fanatic of Amazing Products and ...', 'X'), '');
const csv = toCsv([{ kind: 'fund', s: { company_name: 'Tamarind Hill Fund III, L.P.' }, p: { name: 'Mark Shary', title: 'Managing Partner at Tamarind Hill Fund', linkedin: 'https://www.linkedin.com/in/markdshary' }, loc: 'WORTHINGTON, OH' }]);
assert.equal(csv.split('\n')[1], 'Mark Shary,,,Managing Partner at Tamarind Hill Fund,Managing Partner,"Worthington, OH",Tamarind Hill,,https://www.linkedin.com/in/markdshary,');
console.log('lh csv ok');
