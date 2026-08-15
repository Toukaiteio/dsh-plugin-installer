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
const originalFetch = globalThis.fetch
const searchCalls = []
process.env.DSH_HOME = root
delete process.env.GITHUB_TOKEN
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url)
  if (url.origin === 'https://api.github.com' && url.pathname === '/search/repositories') {
    searchCalls.push(url)
    const isPluginTopic = url.searchParams.get('q')?.includes('topic:dsh-plugin') === true
    return Response.json({ items: catalogItems(Number(url.searchParams.get('page') ?? '1'), isPluginTopic ? 0 : 100) })
  }
  if (url.origin === 'https://api.github.com' && /\/repos\/example\/example-plugin\/(releases|commits)$/.test(url.pathname)) {
    return Response.json([])
  }
  return await originalFetch(input, init)
}
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

  const starsPageOne = await requestJson(ctx.webServer.port, '/dsh-plugin-installer/api/plugins?query=cache%20test&sort=stars&order=desc&page=1')
  if (starsPageOne.status !== 200 || starsPageOne.body.sort !== 'stars' || starsPageOne.body.direction !== 'desc' || starsPageOne.body.page !== 1 || starsPageOne.body.plugins.length !== 59 || starsPageOne.body.hasMore !== true || starsPageOne.body.plugins.some(plugin => plugin.fullName === 'deepseek-ai/deepseek-harness')) {
    throw new Error(`Unexpected first stars page: ${JSON.stringify(starsPageOne.body)}`)
  }
  if (searchCalls.length !== 2) throw new Error(`Expected two GitHub topic requests, got ${searchCalls.length}`)

  await requestJson(ctx.webServer.port, '/dsh-plugin-installer/api/plugins?query=cache%20test&sort=stars&order=desc&page=1')
  if (searchCalls.length !== 2) throw new Error('The same sort and page should reuse the server cache')

  const updatedPageOne = await requestJson(ctx.webServer.port, '/dsh-plugin-installer/api/plugins?query=cache%20test&sort=updated&order=desc&page=1')
  if (updatedPageOne.status !== 200 || updatedPageOne.body.sort !== 'updated' || updatedPageOne.body.plugins.length !== 59 || searchCalls.length !== 4) {
    throw new Error('A different sort should have an independent cached GitHub page')
  }

  const starsPageTwo = await requestJson(ctx.webServer.port, '/dsh-plugin-installer/api/plugins?query=cache%20test&sort=stars&order=desc&page=2')
  if (starsPageTwo.status !== 200 || starsPageTwo.body.page !== 2 || starsPageTwo.body.plugins.length !== 4 || starsPageTwo.body.hasMore !== false || searchCalls.length !== 6) {
    throw new Error('The next page should request and cache its own GitHub result')
  }

  const refreshedStarsPageOne = await requestJson(ctx.webServer.port, '/dsh-plugin-installer/api/plugins?query=cache%20test&sort=stars&order=desc&page=1&refresh=1')
  if (refreshedStarsPageOne.status !== 200 || searchCalls.length !== 8) {
    throw new Error('Refreshing the first page should re-fetch the active sort')
  }
  await requestJson(ctx.webServer.port, '/dsh-plugin-installer/api/plugins?query=cache%20test&sort=stars&order=desc&page=2')
  if (searchCalls.length !== 10) throw new Error('Refreshing the first page should invalidate cached later pages for the same sort')

  const harnessInspection = await requestJson(ctx.webServer.port, '/dsh-plugin-installer/api/plugin/deepseek-ai/deepseek-harness')
  if (harnessInspection.status !== 400 || harnessInspection.body.error?.code !== 'not-a-plugin') {
    throw new Error(`DeepSeek Harness should be rejected as a marketplace plugin: ${JSON.stringify(harnessInspection.body)}`)
  }

  globalThis.fetch = async () => {
    const certificateError = Object.assign(new Error('unable to verify the first certificate'), { code: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' })
    throw Object.assign(new TypeError('fetch failed'), { cause: certificateError })
  }
  const tlsFailure = await requestJson(ctx.webServer.port, '/dsh-plugin-installer/api/plugins?query=tls-error&sort=updated&order=desc&page=1')
  if (tlsFailure.status !== 502 || tlsFailure.body.error?.code !== 'github-tls-certificate' || tlsFailure.body.error?.command !== 'set "NODE_OPTIONS=%NODE_OPTIONS% --use-system-ca" && npx @deepseek-ai/dsh web') {
    throw new Error(`TLS recovery guidance was missing: ${JSON.stringify(tlsFailure.body)}`)
  }
  console.log('host route integration passed')
} finally {
  await ctx.fiber.dispose()
  if (previousHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = previousHome
  if (previousGithubToken === undefined) delete process.env.GITHUB_TOKEN
  else process.env.GITHUB_TOKEN = previousGithubToken
  globalThis.fetch = originalFetch
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

function catalogItems(page, topicOffset) {
  const count = page === 1 ? 30 : page === 2 ? 2 : 0
  return Array.from({ length: count }, (_, index) => {
    const id = topicOffset + (page - 1) * 30 + index + 1
    const isHarness = page === 1 && topicOffset === 0 && index === 0
    return {
      id,
      full_name: isHarness ? 'deepseek-ai/deepseek-harness' : `example-${topicOffset}/plugin-${id}`,
      name: isHarness ? 'deepseek-harness' : `plugin-${id}`,
      owner: { login: isHarness ? 'deepseek-ai' : `example-${topicOffset}` },
      description: `Catalog plugin ${id}`,
      html_url: isHarness ? 'https://github.com/deepseek-ai/deepseek-harness' : `https://github.com/example-${topicOffset}/plugin-${id}`,
      default_branch: 'main',
      stargazers_count: id,
      updated_at: new Date(Date.UTC(2026, 0, 1, 0, 0, id)).toISOString(),
      pushed_at: null,
      topics: ['dsh-plugin'],
      language: 'TypeScript',
    }
  })
}
