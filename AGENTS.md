# Reglas para agentes de IA · CRM de JD Developer

Este archivo lo leen ChatGPT (Codex), Antigravity y cualquier otro agente. Claude Code también.
Si una tarea contradice estas reglas, gana este archivo: para y pregunta.

## Qué es esto
CRM interno de JD Developer. React 18 + Vite + TypeScript + Tailwind, datos en Supabase.
Se publica en el servidor de casa con `bash deploy/publicar.sh` (lo hace Claude o Juan, nunca un agente).
Se usa mucho desde el móvil: toda pantalla nueva tiene que funcionar en el teléfono.

## Lo que está prohibido
- **La base de datos es producción.** No hay copia de pruebas. No ejecutes SQL contra Supabase,
  no apliques migraciones y no uses claves de Supabase. Si tu tarea necesita una tabla o columna,
  escribe la migración en `supabase/migrations/` y déjala sin aplicar: la aplica Claude tras la revisión.
- **No despliegues** nada (ni el CRM, ni la web, ni Edge Functions).
- **No toques n8n** (`n8n/`, `n8n-migracion/`) ni el verificador de WhatsApp (`verificador-whatsapp/`).
  Tienen dependencias que no se ven desde el código.
- **No toques archivos modificados que no son tuyos.** Si `git status` muestra cambios antes de
  empezar, no los incluyas en tus commits ni los deshagas.
- No hagas commit en `main`, ni `push --force`, ni `git reset --hard`, ni borres ramas.
- No toques `.env*` ni pongas claves en el código.

## Cómo se trabaja
1. Cada tarea está en `docs/cms/tareas/` (u otra carpeta que te indiquen). Léela entera.
2. Crea la rama que diga la tarea (por ejemplo `cms/T06`) desde `main` actualizado.
3. Toca solo los archivos que la tarea permite.
4. Antes de entregar: `npx tsc -b`, `npm run lint` y `npm run build` sin errores.
5. Al final del archivo de la tarea, rellena **Informe del agente**: qué hiciste, qué no, qué dudas
   quedan y cómo lo probaste. No marques la tarea como aprobada: eso lo hace la revisión.

## Estilo
- Textos de la interfaz y comentarios en español, como el resto del código.
- Sigue los patrones que ya existen: `src/features/<módulo>/`, servicios en `src/services/`,
  cliente en `src/lib/supabaseClient.ts`, datos con TanStack Query.
- Comentarios para explicar el porqué, no el qué.
