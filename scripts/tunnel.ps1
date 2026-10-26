# Túnel de Cloudflare para la prueba con amigos: publica la API de este PC (localhost:3100) en https://api.<dominio>.
# Gratis (solo cuesta el dominio). El PC tiene que estar encendido, con pnpm api y pnpm worker en marcha.
#
# Una vez (en TU terminal, tras comprar el dominio en Cloudflare e instalar cloudflared):
#   cloudflared tunnel login                    → abre el navegador; elige tu dominio
#   pnpm tunnel:setup -Domain tudominio.com  → crea el túnel, su DNS (api.tudominio.com) y apunta la API a él
# Cada vez que quieras que tus amigos entren:
#   pnpm tunnel                                 → deja esta ventana abierta mientras dure la prueba
param(
  [ValidateSet('setup', 'run')][string]$Action = 'run',
  [string]$Domain
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$name = 'appinity-claude'
$dir = Join-Path $env:USERPROFILE '.cloudflared'
$config = Join-Path $dir "$name.yml"

if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
  throw 'No se encuentra cloudflared. Instálalo con: winget install --id Cloudflare.cloudflared  (y abre una terminal nueva)'
}

if ($Action -eq 'run') {
  if (-not (Test-Path $config)) { throw "Falta la configuración del túnel ($config): ejecuta antes pnpm tunnel:setup -Domain tudominio.com" }
  Write-Output "Túnel $name en marcha (Ctrl+C para pararlo). La API tiene que estar en localhost:3100."
  cloudflared tunnel --config $config run $name
  exit $LASTEXITCODE
}

# ---- setup ----
if (-not $Domain -or $Domain -notmatch '^(?=.{4,253}$)([a-z0-9-]+\.)+[a-z]{2,}$') { throw 'Indica tu dominio: pnpm tunnel:setup -Domain tudominio.com' }
if (-not (Test-Path (Join-Path $dir 'cert.pem'))) { throw 'Antes inicia sesión en Cloudflare: cloudflared tunnel login' }
$hostname = "api.$Domain"

# Crear el túnel si no existe (sus credenciales quedan en ~/.cloudflared, fuera del repositorio).
$existing = cloudflared tunnel list --name $name --output json | ConvertFrom-Json
if (-not $existing) {
  cloudflared tunnel create $name
  if ($LASTEXITCODE -ne 0) { throw 'cloudflared tunnel create falló' }
  $existing = cloudflared tunnel list --name $name --output json | ConvertFrom-Json
}
$id = @($existing)[0].id
$credentials = Join-Path $dir "$id.json"
if (-not (Test-Path $credentials)) { throw "No están las credenciales del túnel ($credentials). Bórralo con «cloudflared tunnel delete $name» y repite." }

# Reglas: el acceso de desarrollo (/v1/dev, modo demo) NUNCA se publica; el resto va a la API local.
$yaml = @"
tunnel: $id
credentials-file: $credentials
ingress:
  - hostname: $hostname
    path: ^/v1/dev(/.*)?$
    service: http_status:404
  - hostname: $hostname
    service: http://localhost:3100
  - service: http_status:404
"@
# UTF-8 sin BOM (Set-Content de PowerShell 5.1 añade BOM).
[IO.File]::WriteAllText($config, $yaml, (New-Object Text.UTF8Encoding $false))
Write-Output "Configuración escrita en $config"

cloudflared tunnel route dns $name $hostname
if ($LASTEXITCODE -ne 0) { Write-Warning "No se pudo crear el DNS de $hostname (si ya existía, no pasa nada)." }

Set-Location $root
node scripts/set-public-url.mjs "https://$hostname"
Write-Output ''
Write-Output "Listo. Siguiente: pnpm tunnel, y compila el APK con: pnpm android:beta -ApiUrl https://$hostname"
