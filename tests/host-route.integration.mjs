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
writeFileSync(join(profile, 'package.json'), JSON.stringify({ dependencies: { 'example-plugin': 'github:example/example-plugin#0123456789abcdef' }, dsh: { profile: { bundles: ['@deepseek-ai/dsh-web-app', 'example-plugin'] } } }))
writeFileSync(join(installedPlugin, 'package.json'), JSON.stringify({ version: '1.0.0', repository: 'https://github.com/example/example-plugin.git', dsh: { bundle: { patch: './cordis.patch.yml' } } }))

const previousHome = process.env.DSH_HOME
const previousGithubToken = process.env.GITHUB_TOKEN
process.env.DSH_HOME = root
delete process.env.GITHUB_TOKEN
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
  const plugin = summary.installedPlugins.find(installed => installed.packageName === 'example-plugin')
  if (plugin?.updateStatus !== 'unknown') throw new Error('A failed remote check should not report a false update status')

  const configBefore = await requestJson(ctx.webServer.port, '/dsh-plugin-installer/api/config')
  if (configBefore.status !== 200 || configBefore.body.configured !== false || configBefore.body.source !== 'none') {
    throw new Error(`Unexpected initial GitHub config: ${JSON.stringify(configBefore.body)}`)
  }
  const configSaved = await requestJson(ctx.webServer.port, '/dsh-plugin-installer/api/config', {
    method: 'POST',
    body: JSON.stringify({ githubToken: 'test-token' }),
    headers: { 'content-type': 'application/json' },
  })
  if (configSaved.status !== 200 || configSaved.body.configured !== true || configSaved.body.source !== 'saved') {
    throw new Error(`Unexpected saved GitHub config: ${JSON.stringify(configSaved.body)}`)
  }
  const configFile = JSON.parse(await (await import('node:fs/promises')).readFile(join(root, 'config', 'dsh-plugin-installer.json'), 'utf8'))
  if (configFile.githubToken !== 'test-token') throw new Error('GitHub Token was not persisted')

  const configCleared = await requestJson(ctx.webServer.port, '/dsh-plugin-installer/api/config', {
    method: 'POST',
    body: JSON.stringify({ githubToken: '' }),
    headers: { 'content-type': 'application/json' },
  })
  if (configCleared.status !== 200 || configCleared.body.configured !== false || configCleared.body.source !== 'none') {
    throw new Error(`Unexpected cleared GitHub config: ${JSON.stringify(configCleared.body)}`)
  }
  console.log('host route integration passed')
} finally {
  await ctx.fiber.dispose()
  if (previousHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = previousHome
  if (previousGithubToken === undefined) delete process.env.GITHUB_TOKEN
  else process.env.GITHUB_TOKEN = previousGithubToken
  rmSync(root, { recursive: true, force: true })
}

function requestJson(port, path, options = {}) {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method: options.method ?? 'GET', headers: options.headers }, (res) => {
      let data = ''
      res.setEncoding('utf8')
      res.on('data', chunk => { data += chunk })
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }))
    })
    req.on('error', reject)
    if (options.body !== undefined) req.write(options.body)
    req.end()
  })
}
