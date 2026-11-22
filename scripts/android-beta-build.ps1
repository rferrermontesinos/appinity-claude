# APK de prueba para amigos y familiares (gratis, sin EAS): la app va EMPAQUETADA (no necesita Metro) y llama a la API
# pública del túnel. Firmado con la clave de depuración: sirve para instalarlo a mano, no para la Play Store.
# Uso: pnpm android:beta -ApiUrl https://api.tudominio.com
# Resultado: dist/appinity-beta.apk (dist/ está ignorado por Git).
#
# Compila lo ÚLTIMO CON COMMIT, desde una copia de trabajo de git en una ruta corta (por defecto C:\appb): la
# compilación release (CMake «RelWithDebInfo») supera el límite de 260 caracteres de Windows con la ruta de este proyecto.
# Una unidad virtual (subst) no basta: pnpm resuelve sus enlaces a la ruta real y Gradle mezcla dos raíces.
param(
  [Parameter(Mandatory = $true)][string]$ApiUrl,
  [string]$BuildDir = 'C:\appb'
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
if ($ApiUrl -notmatch '^https://[A-Za-z0-9.-]+$') { throw 'ApiUrl debe ser https y sin ruta, p. ej. https://api.tudominio.com' }
if ($BuildDir.Length -gt 12) { throw 'BuildDir tiene que ser una ruta corta (p. ej. C:\appb)' }

if (-not $env:ANDROID_HOME) { $env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
# JDK 17 o 21 (con el JDK 25 de Android Studio falla el CMake de React Native).
if (-not $env:JAVA_HOME) {
  $jdk = Get-ChildItem (Join-Path $env:USERPROFILE '.gradle\jdks') -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match '-(17|21)-' -and (Test-Path (Join-Path $_.FullName 'bin\java.exe')) } |
    Select-Object -First 1
  $env:JAVA_HOME = if ($jdk) { $jdk.FullName } else { 'C:\Program Files\Android\Android Studio\jbr' }
}

# Copia de trabajo en la ruta corta, en el último commit de la rama actual (sin tocar la carpeta del proyecto).
Set-Location $root
$commit = (git rev-parse HEAD).Trim()
if (Test-Path (Join-Path $BuildDir '.git')) {
  git -C $BuildDir checkout --detach --force $commit
} else {
  git worktree add --detach $BuildDir $commit
}
if ($LASTEXITCODE -ne 0) { throw "No se pudo preparar la copia de trabajo en $BuildDir" }
Write-Output "JDK: $env:JAVA_HOME · API: $ApiUrl · commit $($commit.Substring(0, 7)) en $BuildDir"

Set-Location $BuildDir
pnpm install --frozen-lockfile
if ($LASTEXITCODE -ne 0) { throw 'pnpm install falló' }
# La app importa los paquetes del monorepo compilados (dist).
pnpm build
if ($LASTEXITCODE -ne 0) { throw 'pnpm build falló' }

# Se fija al empaquetar el JavaScript; tiene prioridad sobre apps/mobile/.env.
$env:EXPO_PUBLIC_API_URL = $ApiUrl
$env:NODE_ENV = 'production'
Set-Location (Join-Path $BuildDir 'apps\mobile')
npx expo prebuild --platform android --no-install
if ($LASTEXITCODE -ne 0) { throw 'expo prebuild falló' }
Set-Location android
# Solo arm64-v8a: la de prácticamente todos los Android actuales (más rápido y un APK más pequeño).
.\gradlew.bat assembleRelease --no-daemon -PreactNativeArchitectures=arm64-v8a
if ($LASTEXITCODE -ne 0) { throw 'gradle assembleRelease falló' }

$apk = Join-Path $BuildDir 'apps\mobile\android\app\build\outputs\apk\release\app-release.apk'
$out = Join-Path $root 'dist'
New-Item -ItemType Directory -Force $out | Out-Null
Copy-Item $apk (Join-Path $out 'appinity-beta.apk') -Force
Set-Location $root
Write-Output "APK de prueba listo: $(Join-Path $out 'appinity-beta.apk') (commit $($commit.Substring(0, 7)))"
