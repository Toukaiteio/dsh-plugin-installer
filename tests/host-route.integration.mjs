import { request } from 'node:http'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import WebServer from '@deepseek-ai/dsh-host-webserver'
import { apply } from '../lib/index.js'

const root = mkdtempSync(join(tmpdir(), 'dsh-plugin-installer-route-'))
const profile = join(root, 'profiles', 'web')
const installedPlugin = join(profile, 'node_modules', 'example-plugin')
mkdirSync(installedPlugin, { recursive: true })
writeFileSync(join(profile, 'package.json'), JSON.stringify({ dependencies: { 'example-plugin': '^1.0.0' }, dsh: { profile: { bundles: ['@deepseek-ai/dsh-web-app'] } } }))
writeFileSync(join(installedPlugin, 'package.json'), JSON.stringify({ repository: 'https://github.com/example/example-plugin.git' }))

const previousHome = process.env.DSH_HOME
process.env.DSH_HOME = root
const ctx = new Context()
ctx.baseUrl = pathToFileURL(profile).href + '/'
try {
  await ctx.plugin(WebServer, { host: '127.0.0.1', port: 0 })
  apply(ctx)

  const response = await new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port: ctx.webServer.port, path: '/dsh-plugin-installer/api/state' }, (res) => {
      let data = ''
      res.setEncoding('utf8')
      res.on('data', chunk => { data += chunk })
      res.on('end', () => resolve({ status: res.statusCode, body: data }))
    })
    req.on('error', reject)
    req.end()
  })

  if (response.status !== 200) throw new Error(`Expected 200, got ${response.status}: ${response.body}`)
  const state = JSON.parse(response.body)
  if (state.currentProfile !== 'web') throw new Error(`Unexpected profile: ${state.currentProfile}`)
  const summary = state.profiles.find(profileSummary => profileSummary.name === 'web')
  if (summary === undefined) throw new Error('Profile list did not include web')
  if (!summary.installedRepositories.includes('example/example-plugin')) throw new Error('Installed GitHub repository was not discovered')
  console.log('host route integration passed')
} finally {
  await ctx.fiber.dispose()
  if (previousHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = previousHome
  rmSync(root, { recursive: true, force: true })
}
