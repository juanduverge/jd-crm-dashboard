# Blog CMS por casillas, como Webflow

## Por qué
Hoy todo el artículo es un solo texto en Markdown (`##`, `###`, `**`). Para que la web arme el
resumen, las preguntas y el cierre, esos símbolos tienen que estar exactos, y al editar a mano es
fácil romperlo (Juan, 21-oct). En Webflow cada parte es una casilla: el texto enriquecido solo lleva
el contenido, y las preguntas tienen sus propios campos.

## Cómo queda el editor
| Casilla | Tipo | Se guarda en |
|---|---|---|
| Resumen (TL;DR) | lista de puntos, «+ punto» | `cms_items.tldr text[]` |
| Contenido | editor visual (negrita, H2/H3, enlaces, listas, cita) sin ver símbolos | `cms_items.body` (sigue siendo Markdown por dentro) |
| Preguntas frecuentes | pares Pregunta / Respuesta, «+ pregunta», reordenables | `cms_items.faqs jsonb` `[{q,a}]` |
| Cierre | título + texto (el servicio ya es un campo) | `cms_items.cierre jsonb` `{titulo, texto}` |

El título de las secciones fijas lo pone la web según el idioma («En resumen»/«TL;DR»,
«Preguntas frecuentes»/«FAQ»); Juan no lo escribe.

## Pasos
1. **Migración 0062**: columnas `tldr`, `faqs`, `cierre`; la vista `cms_publicado` las incluye y anon puede leerlas.
2. **Pasar los 5 artículos**: script que lee su Markdown y separa el resumen (lista tras TL;DR,
   o la primera lista en los dos ingleses que perdieron el título), las preguntas (`###` bajo FAQ) y
   la última sección. Comprobar que la web genera el mismo artículo antes y después.
3. **render.mjs** (web + copia CRM): arma el HTML con resumen → contenido → preguntas → cierre;
   índice desde los H2 del contenido + secciones fijas. Lo de hoy (fuentes ¹, desplegables, cajas) se mantiene.
4. **Editor del CRM**: editor visual con TipTap (Markdown dentro, para no cambiar el resto);
   casillas de Resumen, Preguntas y Cierre en la columna principal, bajo el contenido; se quitan los
   botones «+ Resumen/+ Preguntas/+ Cierre» de hoy.
5. **Comprobaciones**: aviso si faltan resumen o preguntas; la vista previa usa lo mismo que la web.
6. **Habilidad redactar-articulo** y plantilla SQL actualizadas a las casillas.
7. Desplegar CRM y «Actualizar la web».

## Bloqueo conocido
Las escrituras de Claude en Supabase se rechazan desde el 20-oct (lecturas sí funcionan). Los pasos 1
y 2 necesitan que Juan acepte el permiso cuando aparezca, o pegar la migración en el SQL Editor.

## Verificación
- Los 5 artículos: mismo texto visible antes y después (comparar HTML sin espacios).
- En el CRM: crear un artículo de prueba solo con casillas, vista previa, borrarlo.
- Web compilada: caja de resumen, índice, preguntas desplegables y cierre en los 5.
