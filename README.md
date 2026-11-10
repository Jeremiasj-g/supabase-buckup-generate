# Supabase Backup Manager

Aplicación **local** para generar ZIP con PostgreSQL y Edge Functions de Supabase. Frontend Vite + React 19 + Tailwind CSS 4; backend Node.js + Express + TypeScript.

## Primer uso

Instalá Node.js 22+ y herramientas de PostgreSQL (`pg_dump`, `pg_restore`, `psql`) con la versión igual o superior a la del servidor. Si querés Edge Functions, instalá **Supabase CLI v3** (verificá `supabase --version`). Luego:

```bash
git clone https://github.com/Jeremiasj-g/supabase-buckup-generate.git
cd supabase-buckup-generate
npm install
npm run dev
```

Abrí **http://127.0.0.1:5173**. La API solo escucha en `127.0.0.1:4174`.

## Formulario

- **Project Ref:** identificador de 20 letras de tu proyecto.
- **Host y puerto:** copiá de Supabase → Connect. Para backups se recomienda Direct o **Session Pooler (5432)**; Transaction Pooler utiliza 6543 pero puede presentar limitaciones.
- **Usuario:** para Session Pooler usualmente `postgres.PROJECT_REF`.
- **Contraseña:** contraseña de PostgreSQL del proyecto.
- **Supabase Access Token:** token personal de Dashboard → Account → Access Tokens, solo necesario para descargar funciones. **No uses la anon key ni la service_role key.**

Podés probar la conexión, seleccionar PostgreSQL y/o Edge Functions y generar un ZIP. Incluye `database.dump`, `supabase/functions/` (según selección) y `manifest.json`.

## Alcance y límites

- El dump es **lógico**, no una clonación exacta de todos los servicios administrados de Supabase. Probá una restauración en un proyecto de prueba.
- **No incluye** objetos físicos de Storage, secrets, configuraciones externas de Auth/SMTP ni historial de despliegues.
- Edge Functions pueden requerir archivos auxiliares como `deno.json` e import maps que la CLI no recupera.
- Los archivos ZIP permanecen temporalmente en `server/.backups` (o `.backups` del directorio de arranque); se purgan al arrancar si superan 24 horas.
- La herramienta funciona **solo localmente**. Nunca expongas esta API a internet ni subas backups, tokens o contraseñas a GitHub.

## Árbol principal

```
client/
  src/
    components/
    hooks/
    services/
    App.tsx
server/
  src/
    routes/
    services/
      database.ts
      edge-functions.ts
      backup.ts
    index.ts
package.json
```

## Referencias

[CLI para migrar Edge Functions](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore) · [Conexiones PostgreSQL](https://supabase.com/docs/guides/database/connecting-to-postgres)

**Importante:** Para instalar las dependencias del workspace en tu equipo, ejecutá `npm install`. El código está preparado para esa instalación; todavía debe validarse en un entorno local con PostgreSQL y CLI configuradas.
