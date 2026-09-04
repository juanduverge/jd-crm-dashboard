/**
 * Workflow «CRM API - Leer Inbox» (XILkBXfc2Y6ol4VL) — nodo «Combinar y Formatear».
 *
 * Reemplaza el codigo del nodo por este. Arregla tres cosas:
 *
 *  1. NUESTROS PROPIOS ENVIOS ENTRABAN COMO CORREO RECIBIDO.
 *     El nodo insertaba en `inbox_messages` todo lo que hubiera en INBOX, sin
 *     mirar quien firmaba. Como el buzon guarda ahi copia de lo que sale, el
 *     outreach propio aparecia en la Bandeja del CRM como si nos lo hubieran
 *     escrito. La Bandeja es para lo que NOS escriben; lo que mandamos ya vive
 *     en `outreach_messages`.
 *
 *  2. LOS CORREOS CON DISENO SE GUARDABAN VACIOS.
 *     `email.textPlain || email.text` deja fuera todo correo que solo trae
 *     HTML — boletines, avisos de Hostinger, recibos. Se guardaba cuerpo vacio
 *     y en el CRM salia un correo en blanco. Ahora se guarda el HTML, que es
 *     lo que el visor de la Bandeja sabe pintar.
 *
 *  3. EL CUERPO SE CORTABA A 3000 CARACTERES.
 *     Media conversacion desaparecia. La columna es `text`: no necesita ese
 *     recorte. Queda un tope alto solo por prudencia.
 */

const stored = $('Guardar Emails').first().json.emails;
const leads = $input.all().map(item => item.json);

/** Nuestras direcciones. Lo que sale de aqui no es correo entrante. */
const DOMINIOS_PROPIOS = ['jddeveloper.com'];

/**
 * Rebotes y avisos automaticos. Son notificaciones sobre NUESTROS envios, no
 * mensajes de nadie: llenaban la Bandeja de «Undelivered Mail Returned to
 * Sender». Si algun dia quieres verlos otra vez, vacia esta lista.
 */
const REMITENTES_AUTOMATICOS = ['mailer-daemon', 'postmaster', 'no-reply@', 'noreply@'];

function direccion(fromRaw) {
  const m = (fromRaw || '').match(/<([^>]+)>/);
  return (m ? m[1] : (fromRaw || '')).trim().toLowerCase();
}

function esPropio(fromRaw) {
  const d = direccion(fromRaw);
  if (!d) return false;
  return DOMINIOS_PROPIOS.some((dom) => d.endsWith('@' + dom));
}

function esAutomatico(fromRaw) {
  const d = direccion(fromRaw);
  return REMITENTES_AUTOMATICOS.some((p) => d.includes(p));
}

function matchLead(fromRaw) {
  const fromEmail = direccion(fromRaw);
  if (!fromEmail) return '';
  for (const lead of leads) {
    const candidates = [(lead.email_contacto || ''), (lead.email || '')]
      .join(',').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
    if (candidates.includes(fromEmail)) return lead.id;
  }
  return '';
}

return stored
  .filter((email) => {
    const from = email.from || '';
    return from && !esPropio(from) && !esAutomatico(from);
  })
  .map((email) => {
    const fromRaw = email.from || '';
    // El HTML manda: es lo que el remitente compuso. El texto plano es el
    // repuesto para los correos que llegan sin version HTML.
    const cuerpo = (email.textHtml || email.textPlain || email.text || '').slice(0, 100000);
    return { json: {
      lead_id: matchLead(fromRaw) || null,
      remitente: fromRaw.trim(),
      asunto: email.subject || '',
      cuerpo,
      leido: false,
    } };
  });
