<#
  installa-servizio.ps1 - installa il connettore come servizio Windows con NSSM.

  Da PowerShell AMMINISTRATORE, nella cartella del connettore:
    powershell -ExecutionPolicy Bypass -File .\installa-servizio.ps1 -Nssm C:\nssm\win64\nssm.exe

  Il servizio si chiama ShopDavConnettoreNts, parte con Windows e riparte da solo se cade.
  Il registro lo scrive il connettore stesso in .\logs\connettore.log, ruotato ogni giorno
  (connettore-AAAA-MM-GG.log) e conservato 30 giorni. In .\logs\servizio.log finisce solo
  quello che il programma scrive a video fuori dal registro (es. un crash all'avvio).
  Rilanciarlo aggiorna la configurazione del servizio senza perdere niente.
#>
param(
  [Parameter(Mandatory = $true)][string]$Nssm,
  [string]$Nome = 'ShopDavConnettoreNts'
)
$ErrorActionPreference = 'Stop'
$cartella = $PSScriptRoot

if (-not (Test-Path $Nssm)) { throw "nssm.exe non trovato in $Nssm" }
if (-not (Test-Path (Join-Path $cartella '.env'))) { throw 'Manca il file .env: copiare .env.example in .env e compilarlo (vedi README).' }
if (-not (Test-Path (Join-Path $cartella 'dist\index.js'))) { throw 'Manca dist\index.js: eseguire prima "npm ci" e "npm run build".' }
$node = (Get-Command node -ErrorAction Stop).Source
New-Item -ItemType Directory -Force (Join-Path $cartella 'logs') | Out-Null
$log = Join-Path $cartella 'logs\servizio.log'

$esiste = $null -ne (Get-Service -Name $Nome -ErrorAction SilentlyContinue)
if (-not $esiste) {
  & $Nssm install $Nome $node 'dist\index.js'
} else {
  & $Nssm stop $Nome | Out-Null
  & $Nssm set $Nome Application $node
  & $Nssm set $Nome AppParameters 'dist\index.js'
}
& $Nssm set $Nome AppDirectory $cartella
& $Nssm set $Nome DisplayName 'Shop DAV - Connettore NTS'
& $Nssm set $Nome Description 'Porta gli ordini dello shop B2B DAV nelle tabelle di frontiera NTS (NTS_FRONTIERA).'
& $Nssm set $Nome Start SERVICE_AUTO_START
& $Nssm set $Nome AppStdout $log
& $Nssm set $Nome AppStderr $log
& $Nssm set $Nome AppRotateFiles 0
# Rotazione di NSSM spenta: la fa il connettore. Azzera eventuali impostazioni di versioni precedenti.
foreach ($opz in 'AppRotateOnline', 'AppRotateSeconds', 'AppRotateBytes') { & $Nssm reset $Nome $opz 2>$null | Out-Null }
& $Nssm set $Nome AppEnvironmentExtra CONNETTORE_SERVIZIO=1
& $Nssm set $Nome AppExit Default Restart
& $Nssm set $Nome AppRestartDelay 10000
& $Nssm set $Nome AppStopMethodConsole 15000
& $Nssm start $Nome

Start-Sleep -Seconds 3
Get-Service -Name $Nome | Format-Table Name, Status, StartType -AutoSize
Write-Host ("Registro: " + (Join-Path $cartella 'logs\connettore.log') + " (ruotato ogni giorno, 30 giorni)") -ForegroundColor Green
