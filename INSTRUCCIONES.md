# Progreso Fit — guía de puesta en marcha

Esta guía tiene 3 partes: crear la base de datos gratuita (Supabase), publicar la app en una dirección web, e instalarla en tu móvil. Se hace una vez y ya queda funcionando.

## 1. Crear la base de datos en Supabase (gratis)

1. Ve a [supabase.com](https://supabase.com) y crea una cuenta gratuita (con email o con Google).
2. Pulsa **New project**. Ponle un nombre (p. ej. "progreso-fit"), elige una contraseña para la base de datos (guárdala, no la necesitarás en el día a día) y una región cercana (Europe).
3. Espera 1-2 minutos a que el proyecto se cree.
4. En el menú lateral, ve a **SQL Editor** → **New query**, pega todo el contenido del archivo `supabase_schema.sql` que te he preparado, y pulsa **Run**. Esto crea las tablas y la seguridad para que solo tú veas tus datos.
5. Ve a **Authentication → Providers → Email** y desactiva la opción **Confirm email** (así puedes registrarte y entrar directamente sin tener que confirmar por correo). Si prefieres dejarla activada, funciona igual, solo que tendrás que confirmar tu email la primera vez.
6. Ve a **Project Settings → API**. Copia dos datos que te pedirá la app la primera vez que la abras:
   - **Project URL**
   - **anon public key**

Importante: tu proyecto gratuito de Supabase se "duerme" si pasa una semana entera sin usarse (es normal en el plan gratuito). Basta con entrar de nuevo al panel de Supabase y pulsar "Restore/Resume" si eso pasara alguna vez; como vas a usar la app casi a diario, no debería darte problemas.

## 2. Publicar la app (para tener una dirección web)

La forma más sencilla y estable, sin coste, es GitHub Pages:

1. Crea una cuenta gratuita en [github.com](https://github.com) si no tienes una.
2. Crea un repositorio nuevo, público, por ejemplo llamado `progreso-fit`.
3. Sube todos los archivos que te he entregado (`index.html`, `styles.css`, `app.js`, `sw.js`, `manifest.json`, la carpeta `icons`) a ese repositorio. Puedes arrastrarlos directamente desde la web de GitHub ("Add file → Upload files").
4. Ve a **Settings → Pages** del repositorio. En "Source" elige la rama `main` y la carpeta `/ (root)`, guarda.
5. En 1-2 minutos tu app estará disponible en una dirección tipo `https://tu-usuario.github.io/progreso-fit/`.

Alternativa igual de válida: Netlify o Vercel (ambos con plan gratuito) si ya los conoces — el resultado es el mismo, una URL pública para tu app.

## 3. Instalar la app en tu móvil

1. Abre la dirección web del paso anterior con el navegador de tu móvil (Chrome en Android, Safari en iPhone).
2. La primera vez, la app te pedirá el **Project URL** y la **anon public key** de Supabase (los del paso 1.6). Pégalos y pulsa "Guardar y continuar". Esto solo hay que hacerlo una vez por dispositivo.
3. Crea tu cuenta de entrenador/a (pestaña "Crear cuenta", con tu email y una contraseña). A partir de ahí, siempre que abras la app entrarás con ese email y contraseña.
4. Para tener un icono en tu pantalla de inicio como una app normal:
   - **Android (Chrome):** menú (⋮) → "Añadir a pantalla de inicio" / "Instalar app".
   - **iPhone (Safari):** botón compartir (□↑) → "Añadir a pantalla de inicio".

Y listo — a partir de ahí abres el icono como cualquier otra app, y todos los datos se guardan en tu base de datos en la nube, para que no los pierdas y algún día puedas usarlos también desde una tablet.

## Notas

- Solo tú (con tu email/contraseña) puedes ver los datos de tus clientas y clientes: la seguridad de la base de datos (RLS) está configurada para eso.
- Puedes editar los ejercicios de cada categoría en cualquier momento (añadir, renombrar o borrar), y cada registro guarda peso, repeticiones y RIR con fecha.
- "Desactivar" una clienta/cliente no borra su historial, solo la oculta de la lista de activas — puedes reactivarla cuando quieras desde el filtro "Inactivas".
- Si algún día quieres cambiar de cuenta de Supabase en un dispositivo, hay un botón "Cambiar configuración de Supabase" en la pantalla de inicio de sesión.
