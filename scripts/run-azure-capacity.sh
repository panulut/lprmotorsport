#!/usr/bin/env bash
# Only this new test resource is mutable. No production-app command is issued.
set -euo pipefail
set +x
task_root=$(git rev-parse --show-toplevel)
cd "$task_root"
subscription=41128d20-bcb4-4799-80ce-ac23952b4bdd
resource_group=rg-lpr-prod
environment=aca-lpr-prod
test_app=lpr-verification-capacity-test
source_commit=7788a00a04dc3abd47918f27a93dd4d0a469b45c
: "${LPR_AZURE_TEST_IMAGE:?Set an immutable GHCR repository@sha256 digest from build-azure-test-image.sh}"
[[ "$LPR_AZURE_TEST_IMAGE" =~ ^ghcr\.io/panulut/lprmotorsport/verification@sha256:[a-f0-9]{64}$ ]] || { echo 'Expected isolated test image digest'; exit 1; }
command -v az >/dev/null
command -v node >/dev/null
az extension add --name containerapp --upgrade --only-show-errors --output none
environment_id=$(az containerapp env show --subscription "$subscription" --resource-group "$resource_group" --name "$environment" --query id --output tsv)
if az containerapp show --subscription "$subscription" --resource-group "$resource_group" --name "$test_app" --output none 2>/dev/null; then
 echo 'Test app already exists. Inspect it explicitly before another run; this script will not overwrite it.'; exit 1
fi
read -rs -p 'Existing TEST Worker VERIFICATION_SECRET (not production): ' LPR_AZURE_TEST_SIGNING_KEY
printf '\n'
export LPR_AZURE_TEST_SIGNING_KEY
registry_args=()
registry_secret=()
if [[ -n "${LPR_GHCR_READ_TOKEN:-}" ]]; then
 registry_args=(--registry-server ghcr.io --registry-username panulut --registry-password secretref:test-registry-key)
 registry_secret=("test-registry-key=$LPR_GHCR_READ_TOKEN")
fi
LPR_AZURE_TEST_METRICS_TOKEN=$(node -p 'require("node:crypto").randomBytes(32).toString("hex")')
export LPR_AZURE_TEST_METRICS_TOKEN
wrapper_sha=$(sha256sum verification/azure-test-bootstrap.cjs | cut -d' ' -f1)
LPR_AZURE_TEST_OUTPUT_DIR="artifacts/verification/azure-ten-player/$(date -u +%Y%m%dT%H%M%SZ)-$(node -p 'require("node:crypto").randomBytes(3).toString("hex")')"
export LPR_AZURE_TEST_OUTPUT_DIR
mkdir -p "$LPR_AZURE_TEST_OUTPUT_DIR"
private_config=$(mktemp)
chmod 600 "$private_config"
app_id="/subscriptions/$subscription/resourceGroups/$resource_group/providers/Microsoft.App/containerApps/$test_app"
create_attempted=0
cleanup(){
 original_status=$?
 trap - EXIT INT TERM
 set +e
 cleanup_status=0
 if [[ "$create_attempted" == 1 ]] && az containerapp show --subscription "$subscription" --resource-group "$resource_group" --name "$test_app" --output none 2>/dev/null; then
  # ACA documents maxReplicas >= 1. Stop the app; min=0 alone can wake on ingress.
  az containerapp update --subscription "$subscription" --resource-group "$resource_group" --name "$test_app" --min-replicas 0 --max-replicas 1 --only-show-errors --output none
  az rest --method post --url "https://management.azure.com$app_id/stop?api-version=2025-07-01" --only-show-errors --output none || cleanup_status=2
  state=''
  for attempt in {1..12}; do
   state=$(az containerapp show --subscription "$subscription" --resource-group "$resource_group" --name "$test_app" --query properties.runningStatus --output tsv 2>/dev/null)
   [[ "$state" == Stopped ]] && break
   sleep 5
  done
  az containerapp show --subscription "$subscription" --resource-group "$resource_group" --name "$test_app" --query '{id:id,runningStatus:properties.runningStatus,minReplicas:properties.template.scale.minReplicas,maxReplicas:properties.template.scale.maxReplicas}' --output json > "$LPR_AZURE_TEST_OUTPUT_DIR/stop-proof.json"
  [[ "$state" == Stopped ]] || { echo 'STOP NOT CONFIRMED: stop the isolated test app manually now.'; cleanup_status=2; }
 elif [[ "$create_attempted" == 1 ]]; then
  echo 'Cannot confirm whether the test app was created/stopped. Check the test-only Stop command in AZURE-TEST.md.'
  printf '{"status":"unconfirmed","app":"lpr-verification-capacity-test"}\n' > "$LPR_AZURE_TEST_OUTPUT_DIR/stop-proof.json"
  cleanup_status=2
 fi
 if [[ -f "$LPR_AZURE_TEST_OUTPUT_DIR/summary.json" && -f "$LPR_AZURE_TEST_OUTPUT_DIR/stop-proof.json" ]]; then
  node scripts/report-azure-capacity.cjs "$LPR_AZURE_TEST_OUTPUT_DIR" || cleanup_status=2
 fi
 rm -f "$private_config"
 unset LPR_AZURE_TEST_SIGNING_KEY LPR_AZURE_TEST_METRICS_TOKEN LPR_GHCR_READ_TOKEN
 [[ "$cleanup_status" == 0 ]] || exit "$cleanup_status"
 exit "$original_status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
create_attempted=1
az containerapp create --subscription "$subscription" --resource-group "$resource_group" --name "$test_app" \
 --environment "$environment_id" --workload-profile-name Consumption --image "$LPR_AZURE_TEST_IMAGE" \
 --cpu 0.5 --memory 1Gi --min-replicas 1 --max-replicas 1 --revisions-mode single \
 --ingress external --target-port 8081 --transport auto \
 --secrets "test-signing-key=$LPR_AZURE_TEST_SIGNING_KEY" "test-metrics-key=$LPR_AZURE_TEST_METRICS_TOKEN" "${registry_secret[@]}" "${registry_args[@]}" \
 --env-vars VERIFICATION_SECRET=secretref:test-signing-key VERIFICATION_METRICS_TOKEN=secretref:test-metrics-key \
 MAX_VERIFIED_SESSIONS=10 MAX_VERIFIED_STARTS_PER_MINUTE=32 VERIFICATION_WORKERS=1 VERIFICATION_WORKER_HEAP_MB=256 VERIFICATION_LAP_LAG_MS=2000 \
 NODE_ENV=production VERIFICATION_ENVIRONMENT=azure-test VERIFICATION_PUBLIC=1 PORT=8081 \
 "LPR_RELEASE_COMMIT=$source_commit" "LPR_TEST_WRAPPER_SHA=$wrapper_sha" \
 LPR_TEST_WORKER_URL=https://lpr-verified-test.panu-musakka-0bf.workers.dev GAME_ORIGINS=https://lpr-motorsport-test-a1gg.onrender.com \
 --only-show-errors --output none
az containerapp show --subscription "$subscription" --resource-group "$resource_group" --name "$test_app" --output json > "$private_config"
node - "$private_config" <<'JS'
const fs=require('node:fs');
const a=JSON.parse(fs.readFileSync(process.argv[2])),c=a.properties.template.containers[0],p=a.properties;
const env=name=>c.env.find(e=>e.name===name)?.value;
const proof={id:a.id,name:a.name,resources:c.resources,image:c.image,service:'https://'+p.configuration.ingress.fqdn,
 worker:env('LPR_TEST_WORKER_URL'),commit:env('LPR_RELEASE_COMMIT'),wrapperHash:env('LPR_TEST_WRAPPER_SHA'),
 minReplicas:p.template.scale.minReplicas,maxReplicas:p.template.scale.maxReplicas,activeRevisionsMode:p.configuration.activeRevisionsMode,
 workloadProfileName:p.workloadProfileName,environmentId:p.managedEnvironmentId,location:a.location};
require('./scripts/lib/azure-capacity.cjs').validateProof(proof);
fs.writeFileSync('artifacts/verification/azure-test-proof.json',JSON.stringify(proof,null,2)+'\n');
JS
LPR_AZURE_TEST_SERVICE_URL=$(node -p 'require("./artifacts/verification/azure-test-proof.json").service')
export LPR_AZURE_TEST_SERVICE_URL
# Retries only readiness. A failed load run is retained as a failure, never replaced.
node --use-env-proxy - <<'JS'
(async()=>{for(let i=0;i<30;i++){try{const r=await fetch(process.env.LPR_AZURE_TEST_SERVICE_URL+'/health',{signal:AbortSignal.timeout(5000)});if(r.ok)return;}catch{}await new Promise(r=>setTimeout(r,2000));}throw Error('Test service did not become ready');})().catch(()=>{process.exitCode=1;});
JS
node --use-env-proxy scripts/measure-azure-capacity.cjs
