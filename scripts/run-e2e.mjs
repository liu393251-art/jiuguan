#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tempDir = path.join(root, 'node_modules', '.cache', 'playwright-temp')
const host = '127.0.0.1'
const port = '4173'
const appURL = `http://${host}:${port}/`
mkdirSync(tempDir, { recursive: true })

function detectBrowserChannel() {
  const configured = process.env.PLAYWRIGHT_CHANNEL?.trim()
  if (configured) {
    return configured
  }

  if (process.platform !== 'win32') {
    return undefined
  }

  const roots = [
    process.env.LOCALAPPDATA,
    process.env.ProgramFiles,
    process.env['ProgramFiles(x86)'],
  ].filter(Boolean)
  const candidates = [
    ['chrome', path.join('Google', 'Chrome', 'Application', 'chrome.exe')],
    ['msedge', path.join('Microsoft', 'Edge', 'Application', 'msedge.exe')],
  ]

  for (const [channel, executable] of candidates) {
    if (roots.some((root) => existsSync(path.join(root, executable)))) {
      return channel
    }
  }

  return undefined
}

const browserChannel = detectBrowserChannel()
const env = {
  ...process.env,
  TEMP: tempDir,
  TMP: tempDir,
  TMPDIR: tempDir,
  ...(browserChannel ? { PLAYWRIGHT_CHANNEL: browserChannel } : {}),
}

if (browserChannel) {
  console.log(`[e2e] Using installed browser channel: ${browserChannel}`)
}

const cli = path.join(root, 'node_modules', '@playwright', 'test', 'cli.js')
const viteBin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js')
const requestedWorkers = Number(process.env.PLAYWRIGHT_WORKERS ?? '2')
const workers = Number.isFinite(requestedWorkers)
  ? Math.min(Math.max(Math.trunc(requestedWorkers), 1), 4)
  : 2
const passthroughArgs = process.argv.slice(2).filter((arg, index, all) => {
  if (arg === '--workers' || arg.startsWith('--workers=')) {
    return false
  }
  return all[index - 1] !== '--workers'
})
const args = ['test', ...passthroughArgs, `--workers=${workers}`]

console.log(`[e2e] Using ${workers} worker(s)`)

let server
let shuttingDown = false

function stopServer() {
  if (shuttingDown || !server || !server.pid) {
    return
  }

  shuttingDown = true

  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' })
    return
  }

  server.kill('SIGTERM')
}

function exitWith(code) {
  stopServer()
  process.exit(code)
}

process.on('SIGINT', () => exitWith(130))
process.on('SIGTERM', () => exitWith(143))

async function waitForServer() {
  const deadline = Date.now() + 30_000

  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Vite exited before becoming ready (code ${server.exitCode}).`)
    }

    try {
      const response = await fetch(appURL)
      if (response.ok) {
        return
      }
    } catch {
      // The server is still starting.
    }

    await new Promise((resolve) => setTimeout(resolve, 200))
  }

  throw new Error('Vite did not become ready within 30 seconds.')
}

async function main() {
  let serverError = ''

  server = spawn(
    process.execPath,
    [viteBin, '--host', host, '--port', port, '--strictPort'],
    {
      cwd: root,
      env,
      stdio: ['ignore', 'ignore', 'pipe'],
    },
  )
  server.stderr.on('data', (chunk) => {
    serverError += chunk.toString()
  })

  try {
    await waitForServer()
  } catch (error) {
    const detail = serverError.trim()
    stopServer()
    console.error(`[e2e] ${error.message}${detail ? `\n${detail.slice(-1000)}` : ''}`)
    process.exit(1)
  }

  const child = spawn(process.execPath, [cli, ...args], {
    cwd: root,
    env: { ...env, PLAYWRIGHT_EXTERNAL_SERVER: '1' },
    stdio: 'inherit',
    shell: false,
  })

  child.on('error', (error) => {
    console.error(`Failed to start Playwright: ${error.message}`)
    exitWith(1)
  })

  child.on('exit', (code, signal) => {
    if (signal) {
      console.error(`Playwright exited with signal ${signal}`)
      exitWith(1)
      return
    }

    exitWith(code ?? 1)
  })
}

main().catch((error) => {
  console.error(`[e2e] ${error.message}`)
  exitWith(1)
})
