# ⚡ Supabase Backup Manager

Herramienta **local** para generar, descargar y restaurar respaldos de proyectos Supabase. Permite trabajar con **PostgreSQL**, convertir archivos `.dump` a SQL legible y copiar **Edge Functions** entre proyectos mediante Supabase CLI.

> **Estado del proyecto:** uso local. No está preparado para publicarse como aplicación administrativa en internet. No es una clonación completa de todos los servicios administrados de Supabase.

## Funcionalidades

| Operación | Qué hace | Resultado |
| --- | --- | --- |
| Respaldar PostgreSQL | Exporta estructura y datos con `pg_dump` en formato custom | `.dump` |
| Exportar SQL legible | Convierte un respaldo custom existente con `pg_restore`, sin repetir la descarga | `.sql` |
| Respaldar Edge Functions | Descarga las funciones desplegadas mediante Supabase CLI | `.zip` |
| Respaldo combinado | Incluye PostgreSQL y Edge Functions | `.zip` con `database.dump` y `supabase/functions/` |
| Restaurar PostgreSQL | Ejecuta `pg_restore` contra la base de destino | Modifica la base seleccionada |
| Restaurar Edge Functions | Despliega el código del ZIP en otro proyecto mediante Supabase CLI | Funciones desplegadas en destino |

**Respaldo parcial:** si se marca PostgreSQL + Edge Functions y falla la descarga de funciones después de exportar PostgreSQL, la aplicación ofrece un ZIP **parcial**, con el dump, un manifiesto y una advertencia. No se presenta como respaldo completo.

### Interfaz

- Sidebar con **Nuevo respaldo**, **Restaurar respaldo** y enlace a **Documentación**.
- En **Nuevo respaldo** se elige PostgreSQL, Edge Functions o ambos mediante checks.
- En **Restaurar respaldo** se alterna entre **Base de datos (.dump)** y **Edge Functions (.zip)**, sin secciones adicionales en el sidebar.
- Seguimiento en vivo de la salida de los procesos, tiempo transcurrido, mensajes recientes y estados finales; animación indeterminada cuando PostgreSQL no informa un porcentaje real.
- Modo claro/oscuro con preferencia persistida, verde Supabase `#3ECF8E`, favicon de rayito SVG, header sticky, animaciones de 200 ms y pesos tipográficos de 400 a 600.

## Tecnologías

| Capa | Tecnologías |
| --- | --- |
| Frontend | Vite, React 19, TypeScript, Tailwind CSS 4, Motion, Lucide React |
| Backend local | Node.js, Express 5, TypeScript, Zod |
| Exportar/restaurar PostgreSQL | `pg_dump`, `pg_restore`, `psql` |
| Edge Functions | Supabase CLI (dependencia npm del repositorio) |
| Archivos | Archiver, Multer, Unzipper |

El repositorio usa **npm workspaces** para `client/` y `server/`. No utiliza Next.js.

## Requisitos

1. **Node.js 22+** y npm.
2. Herramientas cliente PostgreSQL instaladas y accesibles desde la terminal: `pg_dump`, `pg_restore` y `psql`. Usá una versión de PostgreSQL compatible con el servidor de Supabase; para exportar se recomienda una versión igual o más nueva que la del servidor.
3. Acceso al proyecto Supabase correspondiente y su contraseña PostgreSQL para operaciones de base de datos.
4. Un **Supabase Personal Access Token** con los permisos necesarios si vas a descargar o desplegar Edge Functions. No sirve una `anon key` ni una `service_role key` como sustituto del token de gestión.
5. Conectividad con Supabase. En **Connect** podés obtener host, usuario y puerto de PostgreSQL.

La **Supabase CLI está declarada como dependencia del repositorio**; se instala mediante `npm install` y el backend intenta resolver el ejecutable local. No necesitás instalarla globalmente si esa instalación funciona.

## Instalación y ejecución local

```powershell
git clone https://github.com/Jeremiasj-g/supabase-buckup-generate.git
cd supabase-buckup-generate
npm install
npm run dev
```

Abrí **http://127.0.0.1:5173**.

| Servicio | Dirección |
| --- | --- |
| Interfaz Vite | `http://127.0.0.1:5173` |
| API Express | `http://127.0.0.1:4174` |

Ambos servidores escuchan solamente en `127.0.0.1`. Vite reenvía las solicitudes `/api` al backend de Express.

Para comprobar el entorno:

```powershell
pg_dump --version
pg_restore --version
psql --version
npx --no-install supabase --version
Invoke-RestMethod http://127.0.0.1:4174/api/health
```

Si actualizás dependencias o cambian servicios del backend, detené la aplicación con `Ctrl + C`, ejecutá `npm install` si corresponde y volvé a iniciar `npm run dev`.

## Guía: generar un respaldo

Abrí **Nuevo respaldo** y completá los datos del **proyecto de origen**:

- **Project Ref:** identificador de 20 letras del proyecto.
- **Host PostgreSQL:** copialo de **Supabase Dashboard → Connect**.
- **Puerto:** por defecto `6543` (Transaction Pooler, como el comando original probado). También podés usar Direct Connection o Session Pooler con los valores reales que informe Supabase.
- **Usuario PostgreSQL:** normalmente `postgres.PROJECT_REF` para los poolers.
- **Contraseña PostgreSQL:** contraseña de la base del proyecto.
- **Access Token:** aparece y es obligatorio **solo cuando está activado Edge Functions**.

Marcá los componentes a incluir y seleccioná **Generar backup**. Los datos PostgreSQL solo se requieren cuando marcás PostgreSQL; un respaldo de solo funciones no necesita la contraseña de la base de datos.

### Respaldo PostgreSQL

La exportación usa los parámetros de la versión PowerShell que se venía utilizando:

```powershell
$env:PGPASSWORD = 'CONTRASEÑA_DE_TU_BD'
$env:PGSSLMODE = 'require'

pg_dump `
  -h HOST `
  -p 6543 `
  -U postgres.PROJECT_REF `
  -d postgres `
  -Fc --no-owner `
  --file "supabase_backup_YYYYMMDD_HHmm.dump" `
  --verbose
```

En la aplicación las credenciales se pasan al proceso mediante variables de entorno, no como argumentos de la línea de comandos. La conexión y el nombre del archivo se construyen con los valores ingresados.

Con **solo PostgreSQL** se descarga directamente un `.dump`. Después de generarlo, podés tildar **Exportar como SQL legible**:

```powershell
pg_restore -f backup.sql -F c --no-owner backup.dump
```

Esta conversión utiliza el respaldo ya creado, no vuelve a consultar Supabase y **conserva el `.dump` original**. El `.sql` es útil para inspeccionar la estructura y los datos; para restaurar se recomienda el `.dump` custom.

### Respaldo de Edge Functions

Cuando marcás **Edge Functions**, el backend utiliza la CLI de Supabase y el token personal:

```powershell
supabase functions download --remote=PROJECT_REF_ORIGEN --use-api
```

Podés seleccionar **solo Edge Functions** o **PostgreSQL + Edge Functions**. Si se incluyen funciones, el resultado se empaqueta en un ZIP, con un manifiesto que describe los componentes incluidos. El contenido esperado es similar a:

```text
supabase_backup_PROJECT_REF_FECHA.zip
├── database.dump                 # Si se seleccionó PostgreSQL
├── manifest.json
└── supabase/
    ├── config.toml
    └── functions/
        ├── funcion-a/
        │   └── index.ts
        └── funcion-b/
            └── index.ts
```

La estructura de cada función puede variar. **Los secrets, los archivos de Storage y ciertas configuraciones auxiliares de funciones no se incluyen automáticamente.**

## Guía: restaurar un respaldo

Entrá a **Restaurar respaldo** y elegí el tipo de archivo.

### Restaurar PostgreSQL (.dump)

1. Seleccioná **Base de datos (.dump)** y adjuntá el archivo custom exportado (límite de carga configurado: **2 GB**).
2. Completá **Project Ref, host, puerto, usuario y contraseña del proyecto de destino**.
3. Seleccioná **Restaurar respaldo** y confirmá escribiendo exactamente el Project Ref del destino.
4. El servidor valida el archivo con `pg_restore --list` y ejecuta la restauración:

```powershell
$env:PGPASSWORD = 'CONTRASEÑA_DE_LA_BD_DESTINO'
$env:PGSSLMODE = 'require'

pg_restore `
  -h HOST_DESTINO `
  -p 6543 `
  -U postgres.PROJECT_REF_DESTINO `
  -d postgres `
  --clean --if-exists `
  --no-owner --no-privileges `
  --jobs 4 `
  --verbose `
  "respaldo.dump"
```

**Atención:** `--clean --if-exists` puede eliminar y recrear objetos existentes. Probalo primero en un **proyecto nuevo o descartable**. No es una operación transaccional reversible y un error puede dejar cambios parciales.

Las restauraciones en Supabase pueden mostrar errores de permisos sobre extensiones, event triggers u objetos administrados que requieren superusuario. Si `pg_restore` devuelve un código distinto de cero, la aplicación señala **error**, aunque algunas tablas y usuarios ya estén presentes. **No des por verificada una restauración solo porque aparecen tablas:** revisá filas, funciones SQL, relaciones, RLS, Auth y el funcionamiento real de la aplicación.

### Restaurar Edge Functions (.zip)

1. Seleccioná **Edge Functions (.zip)** dentro de **Restaurar respaldo**.
2. Adjuntá el ZIP generado por esta herramienta (límite de carga configurado: **120 MB**).
3. Ingresá Project Ref y un Access Token con permisos de despliegue en el proyecto de destino.
4. Confirmá el Project Ref antes de publicar las funciones.

El backend extrae las funciones, valida el archivo y ejecuta un despliegue equivalente a:

```powershell
supabase functions deploy --remote=PROJECT_REF_DESTINO --use-api --yes
```

El despliegue **puede actualizar funciones existentes del mismo nombre**. No utiliza `--prune`, por lo que no intenta borrar las demás funciones del proyecto de destino. Después deberás configurar manualmente los secrets y verificar las opciones de autenticación/JWT y demás dependencias del código.

## Estados y archivos temporales

- Los trabajos muestran actividad real de `pg_dump --verbose`, `pg_restore --verbose` y, cuando corresponde, Supabase CLI.
- Los estados de respaldo pueden ser **en curso**, **completado**, **parcial** o **fallido**; el porcentaje exacto durante las operaciones de PostgreSQL es desconocido, así que se utiliza un loader indeterminado.
- Los archivos de respaldo se crean bajo el directorio temporal del sistema operativo: `os.tmpdir()/supabase-backup-manager` (en Windows, habitualmente bajo `%TEMP%`), **fuera del repositorio y de carpetas sincronizadas con OneDrive**.
- El servidor comprueba el archivo final antes de ofrecer su descarga y lo transmite por HTTP.
- Al iniciar, se eliminan respaldos temporales `.dump`, `.zip` y `.sql` de más de **24 horas**. Los trabajos se almacenan en memoria: no hay historial persistente ni recuperación de trabajos al reiniciar.

## Estructura del repositorio

```text
supabase-buckup-generate/
├── client/
│   ├── public/
│   │   └── favicon.svg
│   ├── src/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── pages/
│   │   │   ├── RestoreWorkspace.tsx
│   │   │   ├── RestorePage.tsx
│   │   │   └── FunctionsPage.tsx
│   │   ├── services/
│   │   ├── App.tsx
│   │   └── index.css
│   └── package.json
├── server/
│   ├── src/
│   │   ├── routes/
│   │   │   ├── backups.ts
│   │   │   ├── restore.ts
│   │   │   └── functions-deploy.ts
│   │   ├── services/
│   │   │   ├── database.ts
│   │   │   ├── backup.ts
│   │   │   ├── restore.ts
│   │   │   ├── edge-functions.ts
│   │   │   ├── functions-deploy.ts
│   │   │   └── supabase-cli.ts
│   │   └── index.ts
│   └── package.json
├── package.json
└── README.md
```

## Solución de problemas frecuentes

| Problema | Qué comprobar |
| --- | --- |
| `spawn supabase ENOENT` | Ejecutá `npm install` desde la raíz, verificá `npx --no-install supabase --version` y reiniciá `npm run dev`. |
| `Failed to fetch` o errores JSON | Comprobá que Express responde en `http://127.0.0.1:4174/api/health` y revisá la terminal del backend. |
| `pg_dump` o `pg_restore` no encontrados | Instalá las herramientas cliente PostgreSQL y agregalas al `PATH` de Windows. |
| No conecta a Supabase | Revisá la contraseña, host, usuario, puerto y método de conexión en **Connect**. |
| Restauración con errores de superusuario | Algunos objetos administrados por Supabase no son restaurables con privilegios de usuario normal; verificá la copia y utilizá un proyecto de pruebas. |
| ZIP parcial | PostgreSQL terminó, pero falló Edge Functions. Leé `manifest.json` y el aviso del panel antes de usarlo. |
| Despliegue en Vercel con `STATIC_BUILD_NO_OUT_DIR` | Vite genera `client/dist`, no `dist` en la raíz; corregir eso solo publica el frontend, **no habilita el backend local**. |

## Seguridad y limitaciones

- **Uso local exclusivamente.** La API no dispone de un sistema de autenticación para exponerse públicamente, y ejecuta operaciones privilegiadas y potencialmente destructivas. No publiques el backend tal como está en Vercel ni lo abras a internet.
- Las contraseñas y tokens se reciben temporalmente en el proceso Node.js para ejecutar las operaciones. **No se guardan intencionadamente en GitHub ni se incluyen en los respaldos.**
- El ZIP y el dump **no representan una copia 1:1 de toda la plataforma Supabase**: faltan, entre otros, archivos físicos de Storage, secrets, ajustes externos de Auth/SMTP y determinadas configuraciones de Edge Functions.
- No envíes tokens, contraseñas, dumps ni ZIPs a repositorios públicos. Tratá los backups como información sensible.
- Verificá las restauraciones en un proyecto de pruebas y comprobá que la aplicación funciona antes de utilizar una base migrada.
- Esta herramienta no reemplaza una estrategia de backups automatizados, retención segura, cifrado y pruebas periódicas de recuperación.

## Documentación oficial

- [Supabase: migración, backup y restore](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)
- [Supabase: métodos de conexión a PostgreSQL](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Supabase CLI](https://supabase.com/docs/reference/cli/introduction)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [Vite](https://vite.dev/guide/)

---

Desarrollado como herramienta local de respaldo y restauración de proyectos Supabase. ⚡
