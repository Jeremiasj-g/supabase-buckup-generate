# Supabase Backup Manager

Aplicación **local** para generar archivos **.dump** de PostgreSQL (por defecto) y opcionalmente un ZIP con Edge Functions de Supabase. Frontend Vite + React 19 + Tailwind CSS 4; backend Node.js + Express + TypeScript.

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
- **Host y puerto:** copiá de Supabase → Connect. La pantalla utiliza **Transaction Pooler (6543)** de forma predeterminada, como en el comando PowerShell original. También podés configurar Direct/Session Pooler (5432).
- **Usuario:** para Session Pooler usualmente `postgres.PROJECT_REF`.
- **Contraseña:** contraseña de PostgreSQL del proyecto.
- **Supabase Access Token:** token personal de Dashboard → Account → Access Tokens, solo necesario para descargar funciones. **No uses la anon key ni la service_role key.**

**Por defecto solo PostgreSQL está seleccionado**, Edge Functions y el Access Token son opcionales. Con solo PostgreSQL se descarga directamente un `supabase_backup_YYYYMMDD_HHmm.dump` creado con `pg_dump -h ... -p 6543 -U ... -d postgres -Fc --no-owner --file ... --verbose` y `PGSSLMODE=require`. Si activás funciones, se genera un ZIP.

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

## Primera etapa: mismo respaldo que PowerShell

El modo predeterminado no ejecuta Supabase CLI ni solicita un Access Token. Requiere únicamente `pg_dump` en el PATH. `psql` sirve para el botón de prueba y `pg_restore` para la verificación adicional, si están disponibles. La URI `--dbname` redundante se sustituyó por `-d postgres` + `PGSSLMODE=require` para evitar pasar dos veces el nombre de base. El archivo generado se descarga como `.dump` sin comprimirlo en ZIP. Si `pg_dump` funciona, el respaldo no depende de las Edge Functions.

## Descarga de archivos (corrección de noviembre de 2026)

Para evitar errores al descargar desde carpetas sincronizadas, los respaldos se escriben ahora en la **carpeta temporal local del sistema operativo** (`os.tmpdir()/supabase-backup-manager`), fuera del workspace de OneDrive. El servidor valida la existencia y el tamaño del archivo antes de marcar el trabajo al 100% y antes de servir la descarga. El endpoint sirve el archivo mediante un stream HTTP con encabezados de descarga y devuelve un error JSON legible si desapareció.

**Después de actualizar, reiniciá el servidor y generá un respaldo nuevo.** Los trabajos anteriores vivían en memoria y sus archivos pudieron haber desaparecido; no se recuperan automáticamente.

Las animaciones de interfaz y checks duran 200 ms y respetan la preferencia de movimiento reducido del sistema.

## Exportación en formato SQL legible

Tras terminar un respaldo PostgreSQL individual, en **Formato de exportación** podés dejar el archivo `.dump` original o activar **Exportar como SQL legible** y descargar un `.sql`.
La conversión se hace **sobre el respaldo existente**, sin repetir `pg_dump` ni reconectarse a Supabase, usando `pg_restore -f ARCHIVO.sql -F c --no-owner ARCHIVO.dump`. El archivo original se conserva y sigue disponible. Se necesita `pg_restore` en el PATH para convertir. El SQL es útil para inspeccionar definiciones, tablas e inserciones; para restaurar una base completa se recomienda el formato custom original.
El SQL solo se ofrece para backups `.dump` individuales; no para ZIP con Edge Functions.

## Animaciones globales

Las apariciones de página, secciones, formularios, campos condicionales, errores y opciones de descarga tienen transiciones de **200 ms**. Las salidas de componentes dinámicos usan AnimatePresence; con la preferencia de movimiento reducido se evita el movimiento no esencial.
