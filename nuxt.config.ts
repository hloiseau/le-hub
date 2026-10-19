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
    title: 'Le Hub · Administration multimédia',
    meta: [{ name: 'description', content: 'Demandes, retraits, téléchargements et suivi du serveur multimédia.' }, { name: 'theme-color', content: '#101412' }],
  } },
  routeRules: { '/**': { headers: { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY' } } },
  typescript: { strict: true },
})
