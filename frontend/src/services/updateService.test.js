// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { compareSemver, checkForUpdate, downloadAndInstallUpdate, CURRENT_VERSION } from './updateService.js'

describe('updateService — semver comparison', () => {
  it('correctly compares version numbers', () => {
    expect(compareSemver('v1.0.1', '1.0.0')).toBe(1)
    expect(compareSemver('1.0.0', '1.0.1')).toBe(-1)
    expect(compareSemver('1.0.0', '1.0.0')).toBe(0)
    expect(compareSemver('v2.0.0', 'v1.9.9')).toBe(1)
    expect(compareSemver('1.4.5', '1.4.4')).toBe(1)
    expect(compareSemver('1.4.4', '1.4.5')).toBe(-1)
    expect(compareSemver('1.4.4+build.2', '1.4.4')).toBe(0)
  })
})

describe('updateService — checkForUpdate', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('silently returns hasUpdate: false when default placeholder config is used', async () => {
    const result = await checkForUpdate({
      owner: 'GITHUB_KULLANICI_ADIN',
      repo: 'REPO_ADIN',
    })
    expect(result.hasUpdate).toBe(false)
    expect(result.reason).toBe('config_not_set')
  })

  it('fetches latest release from GitHub API with User-Agent and detects update', async () => {
    let capturedUrl = ''
    let capturedHeaders = null

    globalThis.fetch = vi.fn(async (url, opts) => {
      capturedUrl = url
      capturedHeaders = opts?.headers
      return {
        ok: true,
        status: 200,
        json: async () => ({
          tag_name: 'v2.0.0',
          body: 'Beta Test 2.0 Notes:\n- New updater\n- Bugfixes',
          html_url: 'https://github.com/myuser/myrepo/releases/tag/v2.0.0',
          assets: [
            {
              name: 'openGym-v2.0.0.apk',
              browser_download_url: 'https://github.com/myuser/myrepo/releases/download/v2.0.0/openGym-v2.0.0.apk',
              size: 45000000,
            },
            {
              name: 'openGym-v2.0.0.apk.sha256',
              browser_download_url: 'https://github.com/myuser/myrepo/releases/download/v2.0.0/openGym-v2.0.0.apk.sha256',
            },
          ],
        }),
      }
    })

    const res = await checkForUpdate({
      owner: 'myuser',
      repo: 'myrepo',
      currentVersion: '1.4.4',
      silent: false,
    })

    expect(capturedUrl).toBe('https://api.github.com/repos/myuser/myrepo/releases/latest')
    expect(capturedHeaders['User-Agent']).toBe('OpenGymApp-Updater')
    expect(capturedHeaders['Accept']).toBe('application/vnd.github+json')

    expect(res.hasUpdate).toBe(true)
    expect(res.latestVersion).toBe('2.0.0')
    expect(res.tagName).toBe('v2.0.0')
    expect(res.releaseNotes).toContain('Beta Test 2.0 Notes')
    expect(res.apkUrl).toBe('https://github.com/myuser/myrepo/releases/download/v2.0.0/openGym-v2.0.0.apk')
    expect(res.apkName).toBe('openGym-v2.0.0.apk')
    expect(res.hashUrl).toBe('https://github.com/myuser/myrepo/releases/download/v2.0.0/openGym-v2.0.0.apk.sha256')
  })

  it('returns hasUpdate: false if latest release is not newer than current', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        tag_name: 'v1.0.0',
        body: 'Old release',
        assets: [{ name: 'app.apk', browser_download_url: 'https://x/app.apk' }],
      }),
    }))

    const res = await checkForUpdate({
      owner: 'myuser',
      repo: 'myrepo',
      currentVersion: '1.0.0',
    })

    expect(res.hasUpdate).toBe(false)
  })

  it('handles 404 (no releases) gracefully without throwing', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 404,
    }))

    const res = await checkForUpdate({
      owner: 'myuser',
      repo: 'myrepo',
      currentVersion: '1.0.0',
    })

    expect(res.hasUpdate).toBe(false)
  })

  it('handles rate limit (403/429) silently and does not crash app', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 403,
    }))

    const res = await checkForUpdate({
      owner: 'myuser',
      repo: 'myrepo',
      currentVersion: '1.0.0',
      silent: true,
    })

    expect(res.hasUpdate).toBe(false)
    expect(res.error).toBe('HTTP 403')
  })

  it('handles offline / network error silently without crashing', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('Network request failed')
    })

    const res = await checkForUpdate({
      owner: 'myuser',
      repo: 'myrepo',
      currentVersion: '1.0.0',
      silent: true,
    })

    expect(res.hasUpdate).toBe(false)
    expect(res.error).toBe('Network request failed')
  })
})

describe('updateService — downloadAndInstallUpdate', () => {
  it('throws error if apkUrl is missing', async () => {
    await expect(downloadAndInstallUpdate({ apkUrl: null })).rejects.toThrow('APK indirme bağlantısı bulunamadı.')
  })

  it('opens in browser when not running in native mobile environment', async () => {
    const originalOpen = window.open
    window.open = vi.fn()

    const res = await downloadAndInstallUpdate({ apkUrl: 'https://github.com/myuser/myrepo/releases/download/v2/app.apk' })
    expect(window.open).toHaveBeenCalledWith('https://github.com/myuser/myrepo/releases/download/v2/app.apk', '_blank', 'noopener')
    expect(res.method).toBe('browser')

    window.open = originalOpen
  })
})
