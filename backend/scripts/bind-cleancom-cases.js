/** Build-time tenant binding. Names are resolved once to immutable numeric IDs. */
const fs = require('node:fs');
const path = require('node:path');
const d = require('../infrastructure/atlasDocuments');
const { cases } = require('../cleancom/data/catalog.json');

async function bindCases() {
  const bindings = {};
  for (const entry of cases) {
    if (entry.accessScope === 'shared_authenticated') {
      console.log('[clean-com binding]', JSON.stringify({ caseId: entry.id, accessScope: entry.accessScope }));
      continue;
    }
    const all = await d.find('identity_organizations',{status:'active'});
    const result = { rows: all.filter(org => org.name.trim().toLowerCase() === entry.ownerOrganizationName.trim().toLowerCase()) };
    if (result.rows.length !== 1) {
      bindings[entry.id] = [];
      console.warn('[clean-com binding]', JSON.stringify({ caseId: entry.id, state: 'disabled', matchingOrganizations: result.rows.length }));
      continue;
    }
    bindings[entry.id] = [Number(result.rows[0].organization_id)];
    console.log('[clean-com binding]', JSON.stringify({ caseId: entry.id, organizationId: result.rows[0].organization_id, slug: result.rows[0].slug }));
  }
  fs.writeFileSync(path.join(__dirname, '../cleancom/data/bindings.json'), JSON.stringify(bindings, null, 2));
}

if (require.main === module) bindCases().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(() => process.exit(process.exitCode || 0));
module.exports = { bindCases };
