param(
  [Parameter(Mandatory=$true)][string[]]$Arquivos,
  [Parameter(Mandatory=$true)][string]$CertificadoThumbprint,
  [string]$SignTool = 'signtool.exe',
  [string]$Timestamp = 'http://timestamp.digicert.com'
)
$ErrorActionPreference = 'Stop'
# Uses an existing trusted code-signing identity, including its installed token/provider.
# Never creates a self-signed certificate or modifies the Windows trust store.
$thumb = $CertificadoThumbprint.Replace(' ','')
$cert = Get-Item -LiteralPath "Cert:\CurrentUser\My\$thumb" -ErrorAction Stop
if (!$cert.HasPrivateKey) { throw 'O certificado nao tem uma chave privada acessivel.' }
if ($cert.NotAfter -le (Get-Date)) { throw 'O certificado esta vencido.' }
$signUsage = @($cert.EnhancedKeyUsageList | Where-Object { $_.ObjectId.Value -eq '1.3.6.1.5.5.7.3.3' })
if (!$signUsage.Count) { throw 'O certificado nao permite assinatura de codigo.' }
foreach ($file in $Arquivos) {
  $resolved = (Resolve-Path -LiteralPath $file).Path
  & $SignTool sign /sha1 $thumb /s My /fd SHA256 /tr $Timestamp /td SHA256 /d 'Touca Editor' $resolved
  if ($LASTEXITCODE -ne 0) { throw "Falha ao assinar: $resolved" }
  & $SignTool verify /pa /all /v $resolved
  if ($LASTEXITCODE -ne 0) { throw "A assinatura nao passou na verificacao: $resolved" }
  $result = Get-AuthenticodeSignature -LiteralPath $resolved
  if ($result.Status -ne 'Valid') { throw "Assinatura nao confiavel: $($result.Status)" }
  Write-Host "Assinatura validada: $resolved" -ForegroundColor Green
}
