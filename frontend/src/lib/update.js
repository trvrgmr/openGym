// Update check — compares the installed version (__APP_VERSION__) against
// the latest release on GitHub and optionally downloads + installs the APK.
//
// The GitHub releases API is public, so no token is needed (60 requests an hour per address,
// and the check runs once per app session).
// On Android (Capacitor) the APK is downloaded natively into the cache directory, checked
// against its SHA-256 and handed to the Android package installer.

import { MOBILE } from './mobile.js'
import { APK_VARIANTS, APK_VARIANT } from './apk-variant.js'
import { UPDATE_CONFIG } from '../services/updateService.js'

const DEFAULT_REPO = 'trvrgmr/openGym'
export const REPO = (UPDATE_CONFIG?.GITHUB_OWNER && UPDATE_CONFIG?.GITHUB_REPO && UPDATE_CONFIG.GITHUB_OWNER !== 'GITHUB_KULLANICI_ADIN' && UPDATE_CONFIG.GITHUB_REPO !== 'REPO_ADIN')
  ? `${UPDATE_CONFIG.GITHUB_OWNER}/${UPDATE_CONFIG.GITHUB_REPO}`
  : DEFAULT_REPO

export const LATEST_URL = `https://api.github.com/repos/${REPO}/releases/latest`
export const RELEASES_PAGE = `https://github.com/${REPO}/releases/latest`

/**
 * Compares two semver strings (e.g. "1.2.11" vs "1.3.0").
 * Returns  1 if a > b, -1 if a < b, 0 if equal.
 */
function compareSemver(a, b) {
  const pa = a.replace(/^v/, '').split('+')[0].split('.').map(Number)
  const pb = b.replace(/^v/, '').split('+')[0].split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0)
    if (diff > 0) return 1
    if (diff < 0) return -1
  }
  return 0
}

/**
 * Checks GitHub for a newer version.
 * Returns { hasUpdate, latestVersion, tagName, releaseNotes, apkUrl, hashUrl, apkName, apkSize } or throws on network failure.
 */
let cached = null
export function resetUpdateCheck() { cached = null }
export async function checkForUpdate() {
  if (!cached) cached = fetchLatest().catch(e => { cached = null; throw e })
  return cached
}
async function fetchLatest() {
  const url = `https://api.github.com/repos/${REPO}/releases/latest`
  const res = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'OpenGymApp-Updater',
    },
  })
  // 404: the repository has no published release yet
  if (res.status === 404) return { hasUpdate: false, latestVersion: __APP_VERSION__, apkUrl: null, hashUrl: null }
  if (!res.ok) throw new Error(`GitHub API ${res.status}`)
  const latest = await res.json()
  const latestVersion = String(latest.tag_name || '').replace(/^v/, '')
  if (!latestVersion) return { hasUpdate: false, latestVersion: __APP_VERSION__, apkUrl: null, hashUrl: null }
  const hasUpdate = compareSemver(latestVersion, __APP_VERSION__) > 0
  const { apk, hash } = pickApk(latest.assets || [])
  return {
    hasUpdate,
    latestVersion,
    tagName: latest.tag_name || `v${latestVersion}`,
    releaseNotes: latest.body || '',
    apkUrl: apk?.browser_download_url || null,
    hashUrl: hash?.browser_download_url || null,
    apkName: apk?.name || null,
    apkSize: apk?.size || null,
  }
}

/**
 * Pick matching APK variant
 */
export { APK_VARIANTS, APK_VARIANT }
const tagged = (name, tag) => new RegExp(`(^|[-_.])${tag}([-_.]|$)`, 'i').test(name)
/** Which kind an APK file name is: 'hd', 'plus' or 'standard'. */
export const apkKind = name => tagged(name, 'hd') ? 'hd' : tagged(name, 'plus') ? 'plus' : 'standard'
export function pickApk(assets, variant = APK_VARIANT) {
  const apk = assets.find(a => /\.apk$/i.test(a.name) && apkKind(a.name) === variant) || null
  const hash = apk ? assets.find(a => a.name === `${apk.name}.sha256`) || null : null
  return { apk, hash }
}

/**
 * The SHA-256 the release publishes next to its APK, as 64 hex characters, or null.
 */
export async function fetchChecksum(hashUrl) {
  if (!hashUrl) return null
  let text
  if (MOBILE) {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')
    await Filesystem.downloadFile({ url: hashUrl, path: 'opengym-update.apk.sha256', directory: Directory.Cache })
    text = (await Filesystem.readFile({ path: 'opengym-update.apk.sha256', directory: Directory.Cache, encoding: Encoding.UTF8 })).data
  } else {
    const res = await fetch(hashUrl)
    if (!res.ok) return null
    text = await res.text()
  }
  const hex = String(text).trim().split(/\s/)[0]
  return /^[0-9a-f]{64}$/i.test(hex) ? hex.toLowerCase() : null
}

/**
 * Computes the SHA-256 hash of an ArrayBuffer using the Web Crypto API.
 */
export async function sha256(buffer) {
  const hash = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

const UPDATE_FILE = 'opengym-update.apk'

/**
 * Resolves once openGym is the app in front.
 */
export async function whenInForeground(app) {
  const App = app || (await import('@capacitor/app')).App
  try { if ((await App.getState())?.isActive !== false) return } catch { return }
  await new Promise(resolve => {
    let handle = null, done = false
    const finish = () => { if (done) return; done = true; Promise.resolve(handle).then(h => h?.remove?.()).catch(() => {}); resolve() }
    handle = Promise.resolve(App.addListener('appStateChange', st => { if (st?.isActive) finish() })).catch(() => { finish(); return null })
    Promise.resolve(App.getState()).then(st => { if (st?.isActive) finish() }).catch(() => {})
  })
}

const installPlugin = async () => {
  const { registerPlugin } = await import('@capacitor/core')
  return { Install: registerPlugin('Install') }
}

/**
 * Downloads the APK from `url` into the cache directory, and triggers the installer.
 */
export async function downloadAndInstall(url, expectedHash = null, onProgress = null) {
  if (!MOBILE) {
    window.open(RELEASES_PAGE, '_blank', 'noopener')
    return
  }
  const sha256 = expectedHash && /^[0-9a-f]{64}$/i.test(expectedHash) ? expectedHash.toLowerCase() : ''
  const { Install } = await installPlugin()
  
  if (sha256) {
    try {
      await Install.installApk({ fileName: UPDATE_FILE, sha256 })
      return
    } catch { /* download afresh */ }
  }

  const { Filesystem, Directory } = await import('@capacitor/filesystem')
  const listener = onProgress
    ? await Filesystem.addListener('progress', p => onProgress(p.bytes, p.contentLength))
    : null
  try {
    await Filesystem.downloadFile({ url, path: UPDATE_FILE, directory: Directory.Cache, progress: !!onProgress })
  } finally {
    await listener?.remove()
  }
  await whenInForeground()

  // Try AppUpdater first, fall back to Install
  try {
    const { registerPlugin } = await import('@capacitor/core')
    const AppUpdater = registerPlugin('AppUpdater')
    await AppUpdater.installApk({ fileName: UPDATE_FILE, sha256 })
  } catch {
    await Install.installApk({ fileName: UPDATE_FILE, sha256 })
  }
}

/**
 * Deletes a downloaded update once there is nothing newer to install.
 */
export async function forgetDownloadedUpdate() {
  if (!MOBILE) return
  try {
    const { Filesystem, Directory } = await import('@capacitor/filesystem')
    await Filesystem.deleteFile({ path: UPDATE_FILE, directory: Directory.Cache })
  } catch { /* none there */ }
}
