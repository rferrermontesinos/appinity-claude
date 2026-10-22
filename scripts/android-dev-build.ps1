# Build de desarrollo de Android en este PC (gratis, sin EAS): genera un APK con expo-dev-client que se conecta a Metro.
# Necesita el SDK de Android y el JDK de Android Studio (ya instalados). Uso: pnpm android:build
# Resultado: apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
if (-not $env:ANDROID_HOME) { $env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
if (-not $env:JAVA_HOME) { $env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr' }
if (-not (Test-Path $env:ANDROID_HOME)) { throw "No se encuentra el SDK de Android en $env:ANDROID_HOME" }
if (-not (Test-Path (Join-Path $env:JAVA_HOME 'bin\java.exe'))) { throw "No se encuentra el JDK en $env:JAVA_HOME" }
Set-Location (Join-Path $root 'apps\mobile')
npx expo prebuild --platform android --no-install
if ($LASTEXITCODE -ne 0) { throw 'expo prebuild falló' }
Set-Location android
.\gradlew.bat assembleDebug --no-daemon
if ($LASTEXITCODE -ne 0) { throw 'gradle assembleDebug falló' }
$apk = Join-Path (Get-Location) 'app\build\outputs\apk\debug\app-debug.apk'
Write-Output "APK listo: $apk"
