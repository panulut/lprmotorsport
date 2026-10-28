$ErrorActionPreference='Stop'
$global:LprAzureTestBranch='deploy/azure-test'
$global:LprAzureTestAccountName='Azure for Students'
$global:LprAzureTestCalls=@()
$global:LprAzureTestParameterPaths=@()
function git { if($args[0] -eq 'branch'){return $global:LprAzureTestBranch};return 'test123' }
function az {
    $global:LASTEXITCODE=0
    $global:LprAzureTestCalls+=($args -join ' ')
    if($args[0] -eq 'account'){
        return (@{id='41128d20-bcb4-4799-80ce-ac23952b4bdd';name=$global:LprAzureTestAccountName;tenantId='9d97530e-8f27-4137-a2a9-5cb4dcf26f2e';state='Enabled'}|ConvertTo-Json)
    }
    if($args[0] -eq 'group'){return '{"location":"swedencentral"}'}
    if($args[0] -eq 'containerapp'){return 'lpr-verification-test.example.azurecontainerapps.io'}
    if($args[0] -ne 'deployment'){throw 'Unexpected Azure operation'}
    $parameterArgument=$args[[array]::IndexOf($args,'--parameters')+1]
    if(-not $parameterArgument.StartsWith('@')){throw 'Secrets must use a parameter file'}
    $file=$parameterArgument.Substring(1)
    $global:LprAzureTestParameterPaths+=$file
    $data=Get-Content -LiteralPath $file -Raw|ConvertFrom-Json
    if($data.parameters.verificationSecret.value -ne $env:AZURE_VERIFICATION_TEST_SECRET){throw 'Missing test signer'}
    if($data.parameters.maxVerifiedSessions.value -ne 2){throw 'Unexpected admission limit'}
    if(-not (Get-Acl -LiteralPath (Split-Path $file)).AreAccessRulesProtected){throw 'Secret directory inherits permissions'}
}
$names=@('AZURE_VERIFICATION_TEST_SECRET','AZURE_METRICS_TOKEN','GHCR_PULL_TOKEN','GHCR_PULL_USER','CAPACITY_REPORT_URL','CHAT_STORAGE_URL')
$saved=@{}
foreach($name in $names){$saved[$name]=[Environment]::GetEnvironmentVariable($name)}
try{
    $env:AZURE_VERIFICATION_TEST_SECRET='synthetic-script-test-signing-secret-only-123'
    $env:AZURE_METRICS_TOKEN='synthetic-script-test-metrics-secret-only-123'
    $env:GHCR_PULL_TOKEN='synthetic-script-test-registry-token'
    $env:GHCR_PULL_USER='panulut'
    Remove-Item Env:CAPACITY_REPORT_URL,Env:CHAT_STORAGE_URL -ErrorAction SilentlyContinue
    $image='ghcr.io/panulut/lprmotorsport/verification@sha256:'+('0'*64)
    $origin='https://lpr-game-test.azurestaticapps.net'
    & "$PSScriptRoot/../scripts/deploy-azure-verification.ps1" -Image $image -TestGameOrigin $origin
    if($global:LprAzureTestCalls -match '^deployment group create'){throw 'Default invocation must never deploy'}
    & "$PSScriptRoot/../scripts/deploy-azure-verification.ps1" -Image $image -TestGameOrigin $origin -ApproveTestResourceCosts
    if(@($global:LprAzureTestCalls -match '^deployment group create').Count -ne 1){throw 'Approved path must deploy exactly once'}
    foreach($file in $global:LprAzureTestParameterPaths){if(Test-Path -LiteralPath $file){throw 'Secret parameter file survived cleanup'}}
    foreach($value in @($env:AZURE_VERIFICATION_TEST_SECRET,$env:AZURE_METRICS_TOKEN,$env:GHCR_PULL_TOKEN)){
        if(($global:LprAzureTestCalls -join ' ').Contains($value)){throw 'Secret entered command arguments'}
    }
    $global:LprAzureTestBranch='main'
    $rejected=$false
    try{& "$PSScriptRoot/../scripts/deploy-azure-verification.ps1" -Image $image -TestGameOrigin $origin}catch{$rejected=$_.Exception.Message -match 'Only deploy/azure-test'}
    if(-not $rejected){throw 'main was not rejected'}
    $global:LprAzureTestBranch='deploy/azure-test';$global:LprAzureTestAccountName='Production'
    $rejected=$false
    try{& "$PSScriptRoot/../scripts/deploy-azure-verification.ps1" -Image $image -TestGameOrigin $origin}catch{$rejected=$_.Exception.Message -match 'Select the intended'}
    if(-not $rejected){throw 'Wrong subscription was not rejected'}
    Write-Output 'PASS: mocked deployment approval, branch/subscription guards, secret-file ACL, argv and cleanup; no Azure writes'
}finally{foreach($name in $saved.Keys){[Environment]::SetEnvironmentVariable($name,$saved[$name])}}
