const assert=require('node:assert/strict');
const fs=require('node:fs');
const role=JSON.parse(fs.readFileSync('infra/azure/github-oidc-role.json','utf8'));
const federation=JSON.parse(fs.readFileSync('infra/azure/github-oidc-federation.json','utf8'));
assert.equal(role.IsCustom,true);
assert.deepEqual(role.AssignableScopes,['/subscriptions/41128d20-bcb4-4799-80ce-ac23952b4bdd/resourceGroups/rg-lpr-test']);
assert.deepEqual(role.DataActions,[]);
assert.equal(new Set(role.Actions).size,role.Actions.length);
for(const action of role.Actions){
 assert(!/\*|delete|listsecrets|authorization|storage|sql|keyvault/i.test(action),action);
 assert(/^(Microsoft.Resources\/(subscriptions\/resourceGroups\/read|deployments\/)|Microsoft.App\/(managedEnvironments|containerApps)\/)/i.test(action),action);
}
for(const action of ['Microsoft.App/containerApps/write','Microsoft.App/managedEnvironments/write','Microsoft.App/managedEnvironments/join/action','Microsoft.Resources/deployments/validate/action'])assert(role.Actions.includes(action));
assert.equal(federation.issuer,'https://token.actions.githubusercontent.com');
assert.equal(federation.subject,'repo:panulut@328448267/lprmotorsport@1409734658:environment:azure-test');
assert.deepEqual(federation.audiences,['api://AzureADTokenExchange']);
console.log('PASS: test-only OIDC subject, exact RG role scope, no RBAC/data/delete/secret-read permissions');
