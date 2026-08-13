import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { transform } from 'lightningcss'
import { defineConfig } from 'tsdown'

const platformExternals = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-attachment',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-schema-form',
]

const cssVirtualPrefix = '\0dsh-plugin-installer-css:'
const cssVirtualSuffix = '.mjs'

function sourceAssetPath(source: string, importer: string): string {
  const emitted = resolve(dirname(importer), source)
  if (existsSync(emitted)) return emitted
  return resolve(process.cwd(), source)
}

export default defineConfig([
  {
    entry: ['src/index.ts'],
    outDir: 'lib',
    format: 'esm',
    platform: 'node',
    dts: false,
    clean: true,
    outputOptions: {
      entryFileNames: 'index.js',
    },
  },
  {
    entry: { client: 'src/client/index.tsx' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    dts: false,
    clean: false,
    external: platformExternals,
    noExternal: (id: string) => (platformExternals.includes(id) ? undefined : true),
    plugins: [
      {
        name: 'dsh-plugin-installer-css-modules',
        resolveId(source, importer) {
          if (!source.endsWith('.module.css')) return null
          const path = importer === undefined ? source : sourceAssetPath(source, importer)
          return `${cssVirtualPrefix}${path}${cssVirtualSuffix}`
        },
        async load(virtualId) {
          if (!virtualId.startsWith(cssVirtualPrefix)) return null
          const path = virtualId.slice(cssVirtualPrefix.length, -cssVirtualSuffix.length)
          this.addWatchFile(path)
          const result = transform({
            filename: path,
            code: await readFile(path),
            cssModules: { pattern: '[hash]_[local]' },
            minify: true,
          })
          return {
            code: [
              `const css = ${JSON.stringify(result.code.toString())};`,
              `const tagId = ${JSON.stringify(`dsh-plugin-installer/${basename(path)}`)};`,
              'if (typeof document !== \'undefined\' && document.querySelector(\'style[data-plugin-css=\' + JSON.stringify(tagId) + \']\') === null) {',
              '  const tag = document.createElement(\'style\');',
              '  tag.dataset.plugin = \'dsh-plugin-installer\';',
              '  tag.dataset.pluginCss = tagId;',
              '  tag.textContent = css;',
              '  document.head.appendChild(tag);',
              '}',
              `export default ${JSON.stringify(Object.fromEntries(Object.entries(result.exports ?? {}).map(([key, value]) => [key, value.name])))};`,
            ].join('\n'),
          }
        },
      },
    ],
    outputOptions: {
      entryFileNames: 'client.js',
      banner: 'window.__ModuleLoader__.load({ id: "dsh-plugin-installer", factory: (require) => {',
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  },
])
