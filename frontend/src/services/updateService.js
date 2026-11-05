import pkg from '../../package.json'
import { MOBILE } from '../lib/mobile.js'

/**
 * =========================================================================
 * GITHUB RELEASES IN-APP AUTO UPDATER YAPILANDIRMASI
 * =========================================================================
 * Beta test grubunuz için GitHub kullanıcı adınızı ve deponuzu buraya yazabilirsiniz:
 * - GITHUB_OWNER: GitHub kullanıcı adınız / organizasyon adınız
 * - GITHUB_REPO:  GitHub depo (repository) adınız
 *
 * Alternatif olarak frontend/.env dosyanıza şunları ekleyebilirsiniz:
 * VITE_GITHUB_OWNER=kullanici_adiniz
 * VITE_GITHUB_REPO=repo_adiniz
 * =========================================================================
 */
export const UPDATE_CONFIG = {
  GITHUB_OWNER: import.meta.env?.VITE_GITHUB_OWNER || 'trvrgmr',
  GITHUB_REPO: import.meta.env?.VITE_GITHUB_REPO || 'openGym',
}

/**
 * Uygulamanın mevcut sürüm numarası:
 * Vite derlemesi sırasında package.json'dan enjekte edilen __APP_VERSION__ veya package.json versiyonu.
 */
export const CURRENT_VERSION = typeof __APP_VERSION__ !== 'undefined'
  ? __APP_VERSION__
  : (pkg?.version || '1.0.0')

/**
 * Semantik versiyonlama (semver) karşılaştırma mantığı.
 * Örn: "v1.0.1" veya "1.0.1+build2" ile "1.0.0" karşılaştırılır.
 * Returns:
 *   1  -> a > b (yeni sürüm var)
 *  -1  -> a < b (mevcut sürüm daha yeni)
 *   0  -> a === b (aynı sürüm)
 */
export function compareSemver(a, b) {
  if (!a || !b) return 0
  const clean = v => String(v).replace(/^v/i, '').split('+')[0].split('-')[0].trim()
  const pa = clean(a).split('.').map(n => parseInt(n, 10) || 0)
  const pb = clean(b).split('.').map(n => parseInt(n, 10) || 0)
  const len = Math.max(pa.length, pb.length, 3)
  for (let i = 0; i < len; i++) {
    const na = pa[i] || 0
    const nb = pb[i] || 0
    if (na > nb) return 1
    if (na < nb) return -1
  }
  return 0
}

/**
 * GitHub Releases API üzerinden en son yayınlanan sürümü sorgular.
 * İnternet yoksa veya rate limit oluşursa sessizce normal çalışmaya devam eder.
 *
 * @param {Object} options
 * @param {string} [options.owner]
 * @param {string} [options.repo]
 * @param {string} [options.currentVersion]
 * @param {boolean} [options.silent=true]
 * @returns {Promise<{
 *   hasUpdate: boolean,
 *   currentVersion: string,
 *   latestVersion: string,
 *   tagName?: string,
 *   releaseNotes?: string,
 *   apkUrl?: string|null,
 *   apkName?: string|null,
 *   apkSize?: number|null,
 *   hashUrl?: string|null,
 *   releaseUrl?: string,
 *   error?: string
 * }>}
 */
export async function checkForUpdate(options = {}) {
  const owner = options.owner || UPDATE_CONFIG.GITHUB_OWNER
  const repo = options.repo || UPDATE_CONFIG.GITHUB_REPO
  const currentVersion = options.currentVersion || CURRENT_VERSION
  const silent = options.silent !== false

  // Değişkenler henüz yapılandırılmamışsa akışı kitlemeden sessizce çık
  if (!owner || !repo || owner === 'GITHUB_KULLANICI_ADIN' || repo === 'REPO_ADIN') {
    return {
      hasUpdate: false,
      reason: 'config_not_set',
      currentVersion,
      latestVersion: currentVersion,
    }
  }

  const url = `https://api.github.com/repos/${owner}/${repo}/releases/latest`

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'OpenGymApp-Updater',
      },
    })

    if (res.status === 404) {
      // Henüz yayınlanmış release yok
      return { hasUpdate: false, currentVersion, latestVersion: currentVersion }
    }

    if (!res.ok) {
      if (!silent) {
        console.warn(`[updateService] GitHub API yanıtı: ${res.status}`)
      }
      return {
        hasUpdate: false,
        error: `HTTP ${res.status}`,
        currentVersion,
        latestVersion: currentVersion,
      }
    }

    const release = await res.json()
    const tagName = release.tag_name || ''
    const latestVersion = tagName.replace(/^v/i, '').trim()
    const body = release.body || ''

    if (!latestVersion) {
      return { hasUpdate: false, currentVersion, latestVersion: currentVersion }
    }

    // Semver karşılaştırma: latestVersion > currentVersion
    const hasUpdate = compareSemver(latestVersion, currentVersion) > 0

    // Assets dizisi içindeki .apk dosyasını ve varsa .sha256 dosyasını yakala
    const assets = Array.isArray(release.assets) ? release.assets : []
    const apkAsset = assets.find(a => /\.apk$/i.test(a.name || '')) || null
    const hashAsset = apkAsset
      ? assets.find(a => a.name === `${apkAsset.name}.sha256` || /\.sha256$/i.test(a.name || ''))
      : null

    return {
      hasUpdate,
      currentVersion,
      latestVersion,
      tagName,
      releaseNotes: body,
      releaseUrl: release.html_url || `https://github.com/${owner}/${repo}/releases/latest`,
      apkUrl: apkAsset?.browser_download_url || null,
      apkName: apkAsset?.name || 'opengym-update.apk',
      apkSize: apkAsset?.size || null,
      hashUrl: hashAsset?.browser_download_url || null,
    }
  } catch (err) {
    // Çevrimdışı / internet bağlantı hatası: sessizce yakala
    if (!silent) {
      console.warn('[updateService] Güncelleme sorgusu başarısız (çevrimdışı/ağ hatası):', err?.message)
    }
    return {
      hasUpdate: false,
      error: err?.message || 'Network error',
      currentVersion,
      latestVersion: currentVersion,
    }
  }
}

/**
 * APK dosyasını indirir ve tamamlandığında Android sistem paket yükleyicisini otomatik açar.
 *
 * @param {Object} params
 * @param {string} params.apkUrl - APK dosyasının indirme bağlantısı
 * @param {string} [params.apkName] - APK dosya adı
 * @param {string} [params.hashUrl] - İsteğe bağlı .sha256 doğrulama linki
 * @param {function} [params.onProgress] - İlerleme bildirim fonksiyonu (percent, receivedBytes, totalBytes)
 */
export async function downloadAndInstallUpdate({ apkUrl, apkName = 'opengym-update.apk', hashUrl = null, onProgress = null }) {
  if (!apkUrl) throw new Error('APK indirme bağlantısı bulunamadı.')

  // Web tarayıcısında çalışıyorsa release linkine yönlendir
  if (!MOBILE) {
    window.open(apkUrl, '_blank', 'noopener')
    return { method: 'browser' }
  }

  // 1. Varsa SHA-256 hash'i indir
  let expectedHash = null
  if (hashUrl) {
    try {
      const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')
      await Filesystem.downloadFile({
        url: hashUrl,
        path: 'opengym-update.apk.sha256',
        directory: Directory.Cache,
      })
      const readRes = await Filesystem.readFile({
        path: 'opengym-update.apk.sha256',
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
      })
      const hex = String(readRes.data).trim().split(/\s/)[0]
      if (/^[0-9a-f]{64}$/i.test(hex)) {
        expectedHash = hex.toLowerCase()
      }
    } catch {
      // Hash bulunamazsa da kuruluma devam edilebilir
    }
  }

  // 2. APK dosyasını uygulamanın geçici indirme dizinine (Directory.Cache) kaydet
  const { Filesystem, Directory } = await import('@capacitor/filesystem')
  const fileName = 'opengym-update.apk'

  let progressListener = null
  if (onProgress) {
    progressListener = await Filesystem.addListener('progress', p => {
      const received = p.bytes || 0
      const total = p.contentLength || 0
      const percent = total > 0 ? Math.min(100, Math.round((received / total) * 100)) : 0
      onProgress(percent, received, total)
    })
  }

  try {
    await Filesystem.downloadFile({
      url: apkUrl,
      path: fileName,
      directory: Directory.Cache,
      progress: !!onProgress,
    })
  } finally {
    if (progressListener) {
      await progressListener.remove()
    }
  }

  if (onProgress) {
    onProgress(100, 1, 1)
  }

  // 3. Android sistem paket yükleyicisini otomatik aç
  const { registerPlugin } = await import('@capacitor/core')

  try {
    const AppUpdater = registerPlugin('AppUpdater')
    await AppUpdater.installApk({ fileName, sha256: expectedHash })
    return { success: true }
  } catch (err) {
    // Geriye dönük uyumluluk: Install eklentisini dene
    try {
      const Install = registerPlugin('Install')
      await Install.installApk({ fileName, sha256: expectedHash || '' })
      return { success: true }
    } catch (installErr) {
      throw new Error(`Paket yükleyici açılamadı: ${installErr?.message || err?.message}`)
    }
  }
}
