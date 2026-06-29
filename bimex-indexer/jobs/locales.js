// i18n strings for monthly report emails
// Keys: 'es' (Spanish) and 'en' (English)

const LOCALES = {
  es: {
    subject: 'Tu reporte mensual Bimex — {{mes}} {{ano}}',
    header: 'Tu Reporte Mensual',
    headerSub: 'Resumen de tu impacto en',
    greeting: 'Hola,',
    summaryTitle: 'Resumen de Contribuciones',
    totalContribuido: 'Total Contribuido',
    yieldEsteMes: 'Rendimiento este mes',
    yieldAcumulado: 'Rendimiento Acumulado',
    proyectosApoyados: 'Proyectos Apoyados',
    proyectoApoyado: 'Proyecto Apoyado',
    proyectosTitle: 'Tus Proyectos',
    progreso: 'Progreso',
    completado: 'completado',
    tuAportacion: 'Tu aportación',
    estado: 'Estado',
    // Project statuses
    estadoEnRevision: 'En Revisión',
    estadoEtapaInicial: 'Etapa Inicial',
    estadoEnProgreso: 'En Progreso',
    estadoAbandonado: 'Abandonado',
    estadoLiberado: 'Meta Alcanzada',
    estadoRechazado: 'Rechazado',
    // Trust box
    trustTitle: 'Tu capital está protegido',
    trustMessage: 'Tu capital permanece 100% recuperable. En cualquier momento puedes retirar tu aportación íntegra.',
    // CTA section
    ctaExplorar: 'Explorar nuevos proyectos',
    ctaCompartir: 'Compartir Bimex',
    // Footer
    footerSent: 'Recibiste este correo porque tienes notificaciones activas en Bimex.',
    footerUnsubscribe: 'Desuscribirse',
    footerTerms: 'Términos',
    footerPrivacy: 'Privacidad',
    footerRights: 'Bimex. Todos los derechos reservados.',
    // Month names
    meses: [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
    ],
    // Number formatting locale
    numberLocale: 'es-MX',
    // MXNe label
    mxneLabel: 'MXNe',
  },

  en: {
    subject: 'Your Bimex Monthly Report — {{month}} {{year}}',
    header: 'Your Monthly Report',
    headerSub: 'Summary of your impact in',
    greeting: 'Hello,',
    summaryTitle: 'Contribution Summary',
    totalContribuido: 'Total Contributed',
    yieldEsteMes: 'Yield This Month',
    yieldAcumulado: 'Total Yield',
    proyectosApoyados: 'Projects Supported',
    proyectoApoyado: 'Project Supported',
    proyectosTitle: 'Your Projects',
    progreso: 'Progress',
    completado: 'complete',
    tuAportacion: 'Your contribution',
    estado: 'Status',
    estadoEnRevision: 'In Review',
    estadoEtapaInicial: 'Initial Stage',
    estadoEnProgreso: 'In Progress',
    estadoAbandonado: 'Abandoned',
    estadoLiberado: 'Goal Reached',
    estadoRechazado: 'Rejected',
    trustTitle: 'Your Capital Is Protected',
    trustMessage: 'Your capital remains 100% recoverable. You can withdraw your full contribution at any time.',
    ctaExplorar: 'Explore new projects',
    ctaCompartir: 'Share Bimex',
    footerSent: 'You received this email because you have notifications enabled on Bimex.',
    footerUnsubscribe: 'Unsubscribe',
    footerTerms: 'Terms',
    footerPrivacy: 'Privacy',
    footerRights: 'Bimex. All rights reserved.',
    meses: [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ],
    numberLocale: 'en-US',
    mxneLabel: 'MXNe',
  },
};

/**
 * Get localized string for a given locale and key.
 * Falls back to Spanish if the key is missing in the requested locale.
 */
export function t(locale, key, replacements = {}) {
  const lang = locale === 'en' ? LOCALES.en : LOCALES.es;
  let str = lang[key];
  if (str == null) {
    // Fallback to Spanish
    str = LOCALES.es[key];
  }
  if (str == null) return `{{${key}}}`;

  for (const [k, v] of Object.entries(replacements)) {
    str = str.replace(new RegExp(`{{${k}}}`, 'g'), String(v));
  }
  return str;
}

/**
 * Get the localized month name.
 */
export function mesNombre(locale, monthIndex) {
  const lang = locale === 'en' ? LOCALES.en : LOCALES.es;
  return lang.meses[monthIndex] ?? LOCALES.es.meses[monthIndex] ?? '';
}

/**
 * Get number formatting locale string.
 */
export function numberLocale(locale) {
  return locale === 'en' ? LOCALES.en.numberLocale : LOCALES.es.numberLocale;
}

export default LOCALES;
