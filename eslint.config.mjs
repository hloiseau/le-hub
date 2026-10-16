import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt({
  ignores: ['.env.node24/**', '.cache/**', 'test-results/**', 'playwright-report/**', 'app/types/generated.d.ts'],
}, {
  // Keep the project's existing Vue template style without rewriting void elements.
  rules: { 'vue/html-self-closing': ['warn', { html: { void: 'any' } }] },
})
