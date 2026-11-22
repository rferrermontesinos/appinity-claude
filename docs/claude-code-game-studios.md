# Claude Code Game Studios en este repositorio

Kit de agentes, skills (slash commands) y reglas para Claude Code, instalado en `.claude/` para que cualquier sesión
de Claude Code abierta sobre este repositorio lo tenga disponible. **Es una herramienta de trabajo, no código de la
app**: no lo importa ni lo ejecuta nada de `apps/`, `packages/` ni `workers/`.

- Origen: <https://github.com/Donchitos/Claude-Code-Game-Studios> (licencia MIT, copia en `.claude/CCGS-LICENSE`).
- Versión: 1.3.0, commit `abc0de79d6ceb0b5d7aa693945849b3937afbe6a` (2026-11-09).
- Instalado el 2026-11-22.

## Qué se ha copiado

| Carpeta | Contenido |
|---|---|
| `.claude/skills/` | 78 skills, invocables como `/nombre` |
| `.claude/agents/` | 49 subagentes (producer, ux-designer, qa-lead, security-engineer…) |
| `.claude/rules/` | 14 reglas con `paths:`; solo se cargan en rutas de motor de juego (`src/ui/**`, `Assets/**`, `design/gdd/**`, `tests/**`…). Ninguna coincide hoy con `apps/`, `packages/`, `workers/` ni `test/` |
| `.claude/docs/`, `engines/`, `genres/` | Plantillas y referencias que leen las skills |
| `.claude/scripts/`, `.claude/hooks/` | Scripts bash que las skills invocan a petición (`bash .claude/scripts/…`) |
| `.claude/statusline.sh` | Copiado, **no activado** |

No se ha copiado: `CLAUDE.md` del kit (sustituiría el nuestro), `project.yaml`, `design/`, `production/`, `src/`,
`studio-tests/`, `.github/`. `/start` o `/onboard` crean `project.yaml` y las carpetas que necesiten cuando se usen.

## Revisión de seguridad y qué se ha desactivado

`.claude/settings.json` del kit registraba 15 hooks automáticos (SessionStart, PreToolUse en Bash/Write/Edit/Read,
PostToolUse, Notification, PreCompact, Stop, SubagentStart/Stop). **Se han dejado sin registrar**; nuestro
`settings.json` solo conserva los permisos del kit (lista `allow` de sus scripts de lectura y lista `deny` de
`rm -rf`, `git push --force`, `git reset --hard`, `git clean -f`, `sudo`, lectura de `.env`).

Motivos, tras revisar los scripts (≈22.800 líneas de bash, búsqueda dirigida de red, `eval`, `curl`, `powershell`):

- `hooks/update-check.sh`: en cada inicio de sesión lanzaba en segundo plano una consulta a `api.github.com`
  (releases del kit). Inocua, pero es tráfico de red no pedido.
- `hooks/notify.sh`: ejecuta `powershell.exe` para mostrar una notificación de Windows.
- `validate-commit.sh` / `validate-push.sh`: pueden **bloquear** commits con criterios de juego (JSON de datos,
  valores «hardcoded» en la carpeta de código del motor, TODO sin dueño) y exigen Python.
- `validate-read.sh`: rechaza lecturas completas de documentos de diseño de más de 40 KB.
- `session-stop.sh`, `log-agent*.sh`, `pre-compact.sh`: escriben registros en `production/session-logs/`.

No se ha encontrado código ofuscado ni envío de datos a terceros. El único otro acceso a red está en
`scripts/vendor-three.sh` (descarga three.js de jsDelivr) y solo se ejecuta si se usa `/prototype` con un juego web.

Para activar un hook concreto, copia su bloque desde el `settings.json` del repositorio original. Lo local
(`.claude/settings.local.json`, `.claude/agent-memory/`, `production/session-*`) está en `.gitignore`.

## Encaje con APPINITY (una app, no un videojuego)

- **Útiles tal cual**: `/brainstorm`, `/estimate`, `/scope-check`, `/sprint-plan`, `/sprint-status`, `/retrospective`,
  `/bug-report`, `/bug-triage`, `/tech-debt`, `/security-audit`, `/architecture-decision`, `/architecture-review`,
  `/create-architecture`, `/create-epics`, `/create-stories`, `/story-readiness`, `/dev-story`, `/story-done`,
  `/qa-plan`, `/regression-suite`, `/smoke-check`, `/test-flakiness`, `/ux-design`, `/ux-review`, `/design-system`,
  `/localize`, `/release-checklist`, `/launch-checklist`, `/hotfix`, `/changelog`, `/write-changelog`,
  `/patch-notes`, `/reverse-document`, `/consistency-check`, `/help`, `/next-step`, `/onboard`, `/adopt`.
- **Aprovechables con adaptación** (hablan de GDD, jugadores o fases de juego): `/start`, `/gate-check`,
  `/milestone-review`, `/project-stage-detect`, `/design-review`, `/review-all-gdds`, `/map-systems`,
  `/quick-design`, `/propagate-design-change`, `/vertical-slice`, `/content-audit`, `/perf-profile`, `/soak-test`,
  `/team-ui`, `/team-qa`, `/team-release`, `/team-live-ops`, `/team-polish`, `/day-one-patch`, `/code-review`.
- **No encajan** (específicos de videojuegos): `/setup-engine` (Godot/Unity/Unreal), `/prototype`, `/art-bible`,
  `/asset-spec`, `/asset-audit`, `/balance-check`, `/playtest-report`, `/team-combat`, `/team-level`,
  `/team-audio`, `/team-narrative`, `/cut`. Lo mismo para los agentes `godot-*`, `unity-*`, `ue-*`/`unreal-*`,
  `level-designer`, `world-builder`, `sound-designer`, `technical-artist`, `engine-programmer`.

Ojo: la skill `/code-review` del kit tiene el mismo nombre que la revisión de código integrada de Claude Code y la
sustituye en este repositorio. La del kit es una revisión de arquitectura (SOLID, estándares); si se prefiere la
integrada, basta con borrar `.claude/skills/code-review/`.

Las reglas del producto de `CLAUDE.md` (gustos solo de fuentes externas consentidas, afinidad calculada, etc.)
siguen mandando sobre cualquier plantilla del kit.
