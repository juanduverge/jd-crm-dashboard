/**
 * BRAND JD Developer
 * Paleta y tipografía extraídas directamente del CSS de https://juanduverge.webflow.io/
 * (cdn.prod.website-files.com/680a3c1f38949058853afc9c/css/juanduverge.webflow.shared.css)
 *
 * Variables originales encontradas en :root del sitio Webflow:
 *   --crema:            #fdf5ef
 *   --dark-grey:        #161616
 *   --naranja-coral:    #ff7448   (CTA principal)
 *   --naranja-mandarina:#f38744
 *   --naranja-quemado:  #ef6820   (hover/activo)
 *   --white:            #ffffff
 *   acento secundario:  #6248ff   (violeta, usado en detalles)
 *
 * Estos valores se reflejan también en tailwind.config.js (theme.extend.colors.brand)
 * y en src/styles/index.css como CSS custom properties para los modos claro/oscuro.
 */

export const brand = {
  // Colores base de la marca
  colors: {
    crema: '#fdf5ef',          // fondo principal (variante clara #fef6f0)
    cremaSoft: '#fef6f0',      // fondo aún más claro
    cremaAlt: '#fff3ef',       // tarjetas sobre crema
    darkGrey: '#161616',       // texto principal
    coral: '#ff7448',          // acento / CTA principal
    mandarina: '#f38744',      // acento secundario cálido
    quemado: '#ef6820',        // hover / estado activo del CTA
    violeta: '#6248ff',        // acento secundario frío
    white: '#ffffff',
    black: '#000000',

    // Grises de apoyo (derivados del sitio)
    grey900: '#0a0a0a',
    grey700: '#222222',
    grey500: '#5d6c7b',
    grey400: '#999999',
    grey300: '#c8c8c8',
    grey200: '#e6e6e6',
    grey100: '#f5f5f5',

    // Estados / semántica
    success: '#16a34a',
    warning: '#f59e0b',
    danger:  '#ff4848',        // rojo presente en la web
    info:    '#0082f3',
  },

  // Escala de score de leads
  score: {
    low:  '#ff4848',   // 0-40
    mid:  '#f59e0b',   // 41-70
    high: '#16a34a',   // 71-100
  },

  // Tipografía (la web usa "Relative", con fallback sans-serif)
  fonts: {
    sans: '"Relative", "Inter", "Helvetica Neue", Helvetica, Arial, sans-serif',
    heading: '"Relative", "Inter", "Helvetica Neue", Helvetica, Arial, sans-serif',
    mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, monospace',
  },

  // Identidad de negocio JD Developer
  business: {
    name: 'JD Developer',
    logo: 'https://cdn.prod.website-files.com/680a3c1f38949058853afc9c/6824de62e60758ee1d3acd4f_Logo%20JD%20Developer%20(256%20x%20256%20px).jpg',
    web: 'https://jddeveloper.com',
    emailMain: 'info@jddeveloper.com',
    emailOutreach: 'sales@jddeveloper.com',
    whatsapp: '+1 849 576 4367',
    instagram: '@jddeveloper_',
    booking: 'https://calendar.app.google/QQ17ujMKjNXePb1a8',
  },

  // Radios y sombras coherentes con el look del sitio
  radius: {
    sm: '0.5rem',
    md: '0.75rem',
    lg: '1rem',
    xl: '1.5rem',
    full: '9999px',
  },
}

export default brand
