# Sevenly · Panel de pendientes (versión real)

## Paso 1 — Base de datos en Supabase
1. Entra a tu proyecto en supabase.com
2. Ve a **SQL Editor** (menú izquierdo) → **New query**
3. Abre el archivo `supabase-schema.sql` de esta carpeta, copia TODO el contenido, pégalo ahí y dale **Run**
4. Ve a **Authentication → Providers** y confirma que "Email" esté activado (lo está por default)
5. (Opcional, para pruebas rápidas) En **Authentication → Settings**, puedes desactivar "Confirm email" para no tener que confirmar cada cuenta por correo mientras prueban. Recomendado volver a activarlo antes de usarlo en serio.
6. Ve a **Settings → API** y copia dos valores: **Project URL** y **anon public key** — los vas a necesitar en el paso 3.

## Paso 2 — Sube el código a GitHub
1. Ve a github.com y crea una cuenta si no tienes
2. Crea un repositorio nuevo (botón verde "New")
3. Nómbralo `sevenly-pendientes`, déjalo público o privado (como prefieras), no marques ninguna opción extra
4. Dentro del repo recién creado, usa "uploading an existing file" y arrastra **todos** los archivos y carpetas de este proyecto (respetando la estructura de carpetas — arrastra la carpeta completa)
5. Dale commit

## Paso 3 — Despliega en Vercel
1. Ve a vercel.com → Add New → Project
2. Conecta tu cuenta de GitHub y elige el repositorio `sevenly-pendientes`
3. Antes de darle Deploy, abre "Environment Variables" y agrega:
   - `NEXT_PUBLIC_SUPABASE_URL` = el Project URL que copiaste de Supabase
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = el anon public key que copiaste de Supabase
4. Dale **Deploy** y espera 1-2 minutos
5. Listo — te da una URL tipo `sevenly-pendientes.vercel.app`, esa es la que le compartes a tu equipo

## Paso 4 — Prueba
1. Abre la URL, crea tu cuenta (nombre, celular, correo, contraseña)
2. Si dejaste "Confirm email" activado, revisa tu correo y confirma antes de iniciar sesión
3. Crea un pendiente de prueba y ábrelo desde otra sesión/navegador para confirmar que se actualiza para todos

## Qué falta (próxima fase)
- Board (fotos de la semana, links, avisos)
- FYI (biblioteca de recursos)
- PWA instalable + push notifications
- Correos automáticos por deadline (hoy el botón de correo es manual)

Cuando confirmes que esta base funciona, seguimos con eso.
