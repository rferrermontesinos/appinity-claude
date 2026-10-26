# APK de prueba para amigos y familiares (gratis, sin EAS): la app va EMPAQUETADA (no necesita Metro) y llama a la API
# pública del túnel. Firmado con la clave de depuración: sirve para instalarlo a mano, no para la Play Store.
# Uso: pnpm android:beta -ApiUrl https://api.tudominio.com
# Resultado: dist/appinity-beta.apk (dist/ está ignorado por Git).
param([Parameter(Mandatory = $true)][string]$ApiUrl)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
if ($ApiUrl -notmatch '^https://[A-Za-z0-9.-]+$') { throw 'ApiUrl debe ser https y sin ruta, p. ej. https://api.tudominio.com' }

if (-not $env:ANDROID_HOME) { $env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
# JDK 17 o 21 (con el JDK 25 de Android Studio falla el CMake de React Native).
if (-not $env:JAVA_HOME) {
  $jdk = Get-ChildItem (Join-Path $env:USERPROFILE '.gradle\jdks') -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match '-(17|21)-' -and (Test-Path (Join-Path $_.FullName 'bin\java.exe')) } |
    Select-Object -First 1
  $env:JAVA_HOME = if ($jdk) { $jdk.FullName } else { 'C:\Program Files\Android\Android Studio\jbr' }
}
Write-Output "JDK: $env:JAVA_HOME · API: $ApiUrl"

# Se fija al empaquetar el JavaScript; tiene prioridad sobre apps/mobile/.env (que apunta al PC por la red local).
$env:EXPO_PUBLIC_API_URL = $ApiUrl
$env:NODE_ENV = 'production'

Set-Location (Join-Path $root 'apps\mobile')
npx expo prebuild --platform android --no-install
if ($LASTEXITCODE -ne 0) { throw 'expo prebuild falló' }
Set-Location android
.\gradlew.bat assembleRelease --no-daemon
if ($LASTEXITCODE -ne 0) { throw 'gradle assembleRelease falló' }

$apk = Join-Path (Get-Location) 'app\build\outputs\apk\release\app-release.apk'
$out = Join-Path $root 'dist'
New-Item -ItemType Directory -Force $out | Out-Null
Copy-Item $apk (Join-Path $out 'appinity-beta.apk') -Force
Write-Output "APK de prueba listo: $(Join-Path $out 'appinity-beta.apk')"
