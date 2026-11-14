/**
 * Glosario de Analíticas: cada término técnico explicado como se le
 * explicaría a alguien que no ha usado nunca un CRM.
 *
 *   que:     qué es, en una frase.
 *   calculo: de dónde sale el número.
 *   lectura: cómo interpretarlo y qué hacer con él.
 */
export interface Termino {
  titulo: string
  que: string
  calculo: string
  lectura?: string
}

export const GLOSARIO = {
  leads_nuevos: {
    titulo: 'Leads nuevos',
    que: 'Negocios que entraron al CRM en el periodo: los que buscaste con Apify, los que llegaron por la web o los que añadiste a mano.',
    calculo: 'Se cuentan por la fecha en que se crearon en el CRM.',
    lectura: 'Es la materia prima. Si baja, en unas semanas bajarán también las respuestas y las ventas.',
  },
  toque: {
    titulo: 'Toque',
    que: 'Cada vez que contactas a un lead: un WhatsApp, un correo, una llamada… El primer mensaje es el toque 1, el siguiente seguimiento es el toque 2, y así.',
    calculo: 'Se cuenta un toque por cada seguimiento marcado como hecho.',
  },
  contactos_hechos: {
    titulo: 'Contactos hechos',
    que: 'Todos los toques que diste en el periodo, sean primeros mensajes o seguimientos.',
    calculo: 'Toques completados con fecha dentro del periodo. Debajo aparece cuántos leads contactaste por PRIMERA vez.',
    lectura: 'Mide tu esfuerzo. Compáralo con las respuestas: mucho esfuerzo y pocas respuestas indica que hay que cambiar el mensaje o el canal.',
  },
  tasa_respuesta: {
    titulo: 'Tasa de respuesta',
    que: 'De cada 100 mensajes que mandas, cuántos reciben contestación (buena o mala).',
    calculo: 'Respuestas recibidas ÷ toques dados × 100.',
    lectura: 'En prospección en frío, de 5 a 15 % es normal y más de 20 % es muy bueno. Si un canal está muy por encima de otro, pon más esfuerzo en ese.',
  },
  respondieron: {
    titulo: 'Respondieron',
    que: 'Toques que recibieron contestación del lead, aunque fuera un «no me interesa».',
    calculo: 'Toques con resultado «Respondió» o «No le interesa». También cuenta si el lead pasó a Reunión, Propuesta, Negociación o Ganado.',
  },
  abrio_conversacion: {
    titulo: 'Abrió conversación',
    que: 'Leads cuya PRIMERA respuesta llegó por este canal. Es el canal que consiguió que el lead hablara contigo.',
    calculo: 'Por cada lead se mira el primer toque que tuvo respuesta. Las reuniones, ventas y dinero de ese lead se le apuntan a ese canal.',
    lectura: 'Sirve para saber qué canal trae clientes, no solo respuestas.',
  },
  reuniones: {
    titulo: 'Reuniones',
    que: 'Leads que pasaron a «Reunión agendada» en el periodo.',
    calculo: 'Leads distintos con paso por «Reunión» en el historial del pipeline dentro del periodo.',
  },
  propuestas: {
    titulo: 'Propuestas enviadas',
    que: 'Leads que pasaron a «Propuesta enviada» en el periodo.',
    calculo: 'Leads distintos con paso por «Propuesta» dentro del periodo.',
  },
  ventas: {
    titulo: 'Ventas',
    que: 'Leads que cerraste como «Ganado» en el periodo.',
    calculo: 'Leads en «Cerrado ganado» con fecha de cierre dentro del periodo.',
  },
  dinero_vendido: {
    titulo: 'Dinero vendido',
    que: 'La suma de lo que valen las ventas del periodo.',
    calculo: 'Precio del proyecto de cada venta. Si el proyecto no tiene precio, se usa el valor estimado del lead.',
    lectura: 'Es lo vendido, no lo cobrado: lo cobrado aparece debajo.',
  },
  ticket_medio: {
    titulo: 'Ticket medio',
    que: 'Cuánto te paga, de media, cada cliente que cierras. Es el «precio promedio» de tus ventas.',
    calculo: 'Dinero vendido ÷ número de ventas (las ventas sin precio no cuentan).',
    lectura: 'Si sube, cada cliente vale más: vendes proyectos más grandes o subiste precios. Te dice cuántas ventas necesitas para una meta. Por ejemplo, con un ticket medio de US$500, para facturar US$5,000 al mes necesitas 10 ventas.',
  },
  ciclo_venta: {
    titulo: 'Ciclo de venta',
    que: 'Cuántos días pasan, de media, desde que contactas a un lead por primera vez hasta que lo cierras como ganado.',
    calculo: 'Días entre el primer contacto (o la fecha en que entró, si no hay contacto) y el cierre, promediado entre las ventas del periodo.',
    lectura: 'Cuanto más corto, antes cobras. Si es largo, revisa en qué etapa se quedan parados los leads.',
  },
  cobrado: {
    titulo: 'Cobrado y por cobrar',
    que: 'Lo que ya te pagaron y lo que falta, de los proyectos de las ventas del periodo.',
    calculo: 'Pagos marcados como cobrados en cada proyecto, frente a los que siguen pendientes.',
  },
  embudo: {
    titulo: 'Embudo',
    que: 'El camino de un lead: lo encuentras, lo contactas, responde, tenéis reunión y se convierte en venta. En cada paso se quedan algunos, por eso se dibuja como un embudo.',
    calculo: 'Se toman los leads que ENTRARON en el periodo y se mira hasta qué paso llegó cada uno. El % es sobre el paso anterior.',
    lectura: 'El paso donde más gente se queda es tu cuello de botella. Ahí es donde mejorar rinde más.',
  },
  base: {
    titulo: 'Base, más interés y más contratos',
    que: '«Base» es donde pones más esfuerzo (lo más usado o con más leads). «Más interés» es lo que mejor responde en %. «Más contratos» es lo que más ventas cierra.',
    calculo: 'Para «más interés» se exige una muestra mínima (10 toques o 5 leads contactados): un 100 % sobre un solo mensaje no dice nada.',
    lectura: 'Si la base y el ganador no coinciden, estás trabajando más donde rinde menos. Ahí hay una decisión que tomar.',
  },
  origen: {
    titulo: 'Origen',
    que: 'Por dónde llegó el lead: búsqueda en Google Maps, formulario de la web, recomendación, redes…',
    calculo: 'Leads que entraron en el periodo, agrupados por su origen.',
  },
  primera_respuesta_toque: {
    titulo: 'En qué toque responden',
    que: 'De los leads que contestaron, en qué número de mensaje lo hicieron: al primero, al segundo seguimiento…',
    calculo: 'Por cada lead se busca su primera respuesta y se mira qué número de toque era.',
    lectura: 'Si mucha gente responde en el toque 3 o 4, rendirse en el 2 deja ventas sobre la mesa.',
  },
  tiempo_respuesta: {
    titulo: 'Tiempo de respuesta',
    que: 'Cuántos días tarda un lead en contestar desde que le escribes.',
    calculo: 'Días entre el envío del toque y la respuesta, de media por canal.',
    lectura: 'Te dice cuánto esperar antes del siguiente seguimiento.',
  },
  hora_toque: {
    titulo: 'Día y hora',
    que: 'Cuándo se mandaron los toques y cuántos de ellos tuvieron respuesta.',
    calculo: 'Es la hora en que marcaste el toque como hecho, que casi siempre coincide con el envío.',
    lectura: 'Escribe más en los días y horas con mejor %.',
  },
  motivos_perdida: {
    titulo: 'Por qué se perdieron',
    que: 'Los motivos que pusiste al cerrar leads como perdidos.',
    calculo: 'Leads cerrados como perdidos en el periodo, agrupados por motivo.',
    lectura: 'Si un motivo se repite (precio, no responde, ya tiene web), es lo primero que hay que atacar.',
  },
} satisfies Record<string, Termino>

export type ClaveGlosario = keyof typeof GLOSARIO
