export default defineNuxtConfig({
  compatibilityDate: '2026-10-15',
  ssr: false,
  devtools: { enabled: false },
  modules: ['@nuxt/eslint'],
  css: ['~/assets/main.css'],
  runtimeConfig: {
    apiBase: 'http://127.0.0.1:8080',
    public: { demo: false, discordUrl: '' },
  },
  app: { head: {
    htmlAttrs: { lang: 'fr' },
    title: 'Le Hub · Votre espace multimédia',
    meta: [{ name: 'description', content: 'Vos films, séries et lectures. Tous vos services, au même endroit.' }, { name: 'theme-color', content: '#11121b' }],
  } },
  routeRules: { '/**': { headers: { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY' } } },
  typescript: { strict: true },
})
