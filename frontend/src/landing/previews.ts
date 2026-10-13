// What a shared link shows before it is opened (Telegram, V2_PLAN W2): a title, one sentence and a
// picture, in each language. The build writes them into `uz.html`, `ru.html` and `en.html`; the
// plain address shows the Uzbek one, because the page is for banks in Uzbekistan first (D-044).

export const PREVIEW_LANGS = ['uz', 'ru', 'en'] as const
export type PreviewLang = (typeof PREVIEW_LANGS)[number]

export const PREVIEWS: Record<PreviewLang, { htmlLang: string; locale: string; title: string; description: string }> = {
  uz: {
    htmlLang: 'uz-Latn',
    locale: 'uz_UZ',
    title: 'FeeGuard: shikoyatni bankning oʻz yozuvlari bilan tekshiring',
    description: 'Mijoz kredit toʻlovi ikki marta yechilganini aytadi. FeeGuard bankning oʻz yozuvlarini tekshiradi va xuddi shu xato tekkan boshqa har bir mijozni topadi.',
  },
  ru: {
    htmlLang: 'ru',
    locale: 'ru_RU',
    title: 'FeeGuard: проверьте жалобу по записям самого банка',
    description: 'Клиент пишет, что платёж по кредиту списали дважды. FeeGuard проверяет записи самого банка и находит всех остальных клиентов с той же ошибкой.',
  },
  en: {
    htmlLang: 'en',
    locale: 'en_US',
    title: 'FeeGuard: check a complaint against the bank’s own records',
    description: 'A customer says a loan payment was taken twice. FeeGuard checks the bank’s own records, then finds every other customer the same mistake hit.',
  },
}

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

/** The tags between `<!-- preview -->` and `<!-- /preview -->` of index.html. */
export function previewTags(lang: PreviewLang, site: string): string {
  const p = PREVIEWS[lang]
  const url = lang === 'uz' ? `${site}/` : `${site}/${lang}`
  return [
    `<title>${escape(p.title)}</title>`,
    `<meta name="description" content="${escape(p.description)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="FeeGuard" />`,
    `<meta property="og:title" content="${escape(p.title)}" />`,
    `<meta property="og:description" content="${escape(p.description)}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:locale" content="${p.locale}" />`,
    `<meta property="og:image" content="${site}/og/landing-${lang}.png" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    ...PREVIEW_LANGS.map((other) => `<link rel="alternate" hreflang="${PREVIEWS[other].htmlLang}" href="${other === 'uz' ? `${site}/` : `${site}/${other}`}" />`),
  ].join('\n    ')
}
