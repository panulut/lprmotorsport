# Windows deployment fallback while workflow_dispatch is unavailable on main.
# Default: validate only. Resource creation requires explicit approval and the switch.
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$Image,
    [Parameter(Mandatory=$true)][string]$TestGameOrigin,
    [ValidateRange(1,100)][int]$MaxSessions=2,
    [switch]$ApproveTestResourceCosts
)
$ErrorActionPreference='Stop'
$subscription='41128d20-bcb4-4799-80ce-ac23952b4bdd'
$tenant='9d97530e-8f27-4137-a2a9-5cb4dcf26f2e'
if([Environment]::OSVersion.Platform -ne 'Win32NT'){throw 'Use this fallback from Windows PowerShell.'}
if((git branch --show-current) -ne 'deploy/azure-test'){throw 'Only deploy/azure-test is allowed.'}
if($Image -cnotmatch '^ghcr\.io/panulut/lprmotorsport/verification@sha256:[a-f0-9]{64}$'){throw 'Supply the scanned verification GHCR image digest.'}
$account=az account show --output json | ConvertFrom-Json
if($LASTEXITCODE -ne 0 -or $account.id -ne $subscription -or $account.name -ne 'Azure for Students' -or $account.tenantId -ne $tenant -or $account.state -ne 'Enabled'){throw 'Select the intended enabled Azure for Students subscription first.'}
$group=az group show --subscription $subscription --name rg-lpr-test --output json | ConvertFrom-Json
if($LASTEXITCODE -ne 0 -or $group.location -ne 'swedencentral'){throw 'The isolated Sweden Central test resource group is required.'}
foreach($name in @('AZURE_VERIFICATION_TEST_SECRET','AZURE_METRICS_TOKEN','GHCR_PULL_TOKEN','GHCR_PULL_USER')){
    if(-not [Environment]::GetEnvironmentVariable($name)){throw "Missing environment variable: $name"}
}
if($env:AZURE_VERIFICATION_TEST_SECRET -eq $env:AZURE_METRICS_TOKEN){throw 'Use independent signing and metrics secrets.'}
$settings=@{VERIFICATION_ENVIRONMENT='azure-test';VERIFICATION_PUBLIC='1';PORT='8081';GAME_ORIGINS=$TestGameOrigin;MAX_VERIFIED_SESSIONS="$MaxSessions";MAX_VERIFIED_STARTS_PER_MINUTE='100';VERIFICATION_SECRET=$env:AZURE_VERIFICATION_TEST_SECRET;VERIFICATION_METRICS_TOKEN=$env:AZURE_METRICS_TOKEN}
$previous=@{}
$tempDirectory=$null
try{
    foreach($name in $settings.Keys){$previous[$name]=[Environment]::GetEnvironmentVariable($name);[Environment]::SetEnvironmentVariable($name,$settings[$name])}
    node -e "require('./verification/server.cjs').createServer().then(async s=>{await s.sessions.close();await s.capacityReporter.close()}).catch(e=>{console.error(e.message);process.exitCode=1})"
    if($LASTEXITCODE -ne 0){throw 'Test startup validation failed.'}
    # Restrict the directory before writing parameters; secret values never enter argv.
    $tempDirectory=Join-Path ([IO.Path]::GetTempPath()) ('lpr-azure-test-'+[guid]::NewGuid())
    New-Item -ItemType Directory -Path $tempDirectory | Out-Null
    $acl=New-Object System.Security.AccessControl.DirectorySecurity
    $sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User
    $acl.SetOwner($sid)
    $acl.SetAccessRuleProtection($true,$false)
    $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow')))
    Set-Acl -LiteralPath $tempDirectory -AclObject $acl
    $values=@{image=$Image;testGameOrigin=$TestGameOrigin;maxVerifiedSessions=$MaxSessions;maxVerifiedStartsPerMinute=100;ghcrUser=$env:GHCR_PULL_USER;ghcrPullToken=$env:GHCR_PULL_TOKEN;verificationSecret=$env:AZURE_VERIFICATION_TEST_SECRET;metricsToken=$env:AZURE_METRICS_TOKEN}
    $parameters=@{}
    foreach($name in $values.Keys){$parameters[$name]=@{value=$values[$name]}}
    $parameterFile=Join-Path $tempDirectory 'parameters.json'
    [IO.File]::WriteAllText($parameterFile,(@{parameters=$parameters}|ConvertTo-Json -Depth 5))
    $arguments=@('--subscription',$subscription,'--resource-group','rg-lpr-test','--template-file','infra/azure/verification.bicep','--parameters',"@$parameterFile",'--only-show-errors','--output','none')
    az deployment group validate @arguments
    if($LASTEXITCODE -ne 0){throw 'Azure template validation failed; no deployment was attempted.'}
    if(-not $ApproveTestResourceCosts){Write-Output 'Validation passed. No resources deployed. Obtain explicit cost approval before using -ApproveTestResourceCosts.';return}
    az deployment group create --name ('verification-'+(git rev-parse --short HEAD)) @arguments
    if($LASTEXITCODE -ne 0){throw 'Test deployment failed; inspect rg-lpr-test before retrying.'}
    $fqdn=az containerapp show --subscription $subscription --resource-group rg-lpr-test --name lpr-verification-test --query properties.configuration.ingress.fqdn --output tsv
    if($LASTEXITCODE -ne 0 -or $fqdn -notmatch '^lpr-verification-test\.[a-z0-9.-]+\.azurecontainerapps\.io$'){throw 'Could not confirm the test endpoint.'}
    Write-Output "Test endpoint: https://$fqdn"
    Write-Output 'Run the documented health, metrics and two-player smoke checks before increasing load.'
}finally{
    foreach($name in $previous.Keys){[Environment]::SetEnvironmentVariable($name,$previous[$name])}
    if($tempDirectory -and (Test-Path -LiteralPath $tempDirectory)){
        # Delete only the exact file/directory created above; no recursive removal.
        $file=Join-Path $tempDirectory 'parameters.json'
        if(Test-Path -LiteralPath $file){Remove-Item -LiteralPath $file -Force}
        Remove-Item -LiteralPath $tempDirectory -Force
    }
}
