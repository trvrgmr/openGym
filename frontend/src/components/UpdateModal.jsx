import React, { useState } from 'react'
import { useUI } from '../store/useUI.js'
import { downloadAndInstallUpdate } from '../services/updateService.js'

/**
 * OpenGym koyu temasına tam uyumlu "In-App Auto Updater" Modalı.
 * Yeni bir GitHub Release APK'sı bulunduğunda gösterilir.
 */
export default function UpdateModal({ updateInfo, close }) {
  const [downloading, setDownloading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [downloadDetails, setDownloadDetails] = useState('')
  const [errorMessage, setErrorMessage] = useState(null)
  const toast = useUI(s => s.toast)

  const {
    latestVersion,
    tagName = `v${latestVersion}`,
    releaseNotes = '',
    apkUrl,
    apkName,
    apkSize,
    hashUrl,
  } = updateInfo || {}

  const formatBytes = bytes => {
    if (!bytes || bytes <= 0) return ''
    const mb = bytes / (1024 * 1024)
    return `${mb.toFixed(1)} MB`
  }

  const handleStartUpdate = async () => {
    if (!apkUrl) {
      toast('APK indirme linki bulunamadı.')
      return
    }

    setDownloading(true)
    setErrorMessage(null)
    setProgress(0)
    setDownloadDetails('%0 İndiriliyor')

    try {
      await downloadAndInstallUpdate({
        apkUrl,
        apkName,
        hashUrl,
        onProgress: (percent, received, total) => {
          setProgress(percent)
          if (total > 0) {
            setDownloadDetails(`%${percent} İndiriliyor (${formatBytes(received)} / ${formatBytes(total)})`)
          } else if (received > 0) {
            setDownloadDetails(`${formatBytes(received)} indirildi`)
          } else {
            setDownloadDetails(`%${percent} İndiriliyor`)
          }
        },
      })

      // Başarılı indirme ve paket yükleyicisi açıldığında modal kapatılır
      setTimeout(() => {
        if (close) close()
      }, 800)
    } catch (err) {
      console.error('[UpdateModal] İndirme veya kurulum hatası:', err)
      setDownloading(false)
      setErrorMessage(err?.message || 'İndirme sırasında bir hata oluştu.')
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        textAlign: 'center',
        padding: '6px 2px',
        color: 'var(--ink, #ffffff)',
      }}
    >
      {/* İkon Rozeti */}
      <div
        style={{
          width: 52,
          height: 52,
          borderRadius: 26,
          background: 'rgba(48, 209, 88, 0.15)',
          color: 'var(--green, #30d158)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 12px',
          boxShadow: '0 0 20px rgba(48, 209, 88, 0.25)',
        }}
      >
        <svg
          width="26"
          height="26"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
      </div>

      {/* Başlık */}
      <h3
        style={{
          margin: '0 0 6px',
          fontSize: '19px',
          fontWeight: 700,
          letterSpacing: '-0.3px',
          color: '#ffffff',
        }}
      >
        {downloading ? 'Güncelleme İndiriliyor...' : 'Yeni Güncelleme Mevcut!'}
      </h3>

      {/* Versiyon Rozeti */}
      <div style={{ marginBottom: 16 }}>
        <span
          style={{
            display: 'inline-block',
            background: 'var(--surface-2, #2c2c2e)',
            color: 'var(--green, #30d158)',
            padding: '3px 10px',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: 600,
            border: '1px solid rgba(48, 209, 88, 0.25)',
          }}
        >
          {tagName.startsWith('v') ? tagName : `v${tagName}`} sürümüne yükseltilebilir
        </span>
      </div>

      {!downloading ? (
        <>
          {/* Değişiklik Notları */}
          <div
            style={{
              textAlign: 'left',
              marginBottom: 20,
            }}
          >
            <div
              style={{
                fontSize: '11px',
                fontWeight: 600,
                color: 'var(--muted, #8e8e93)',
                textTransform: 'uppercase',
                letterSpacing: '0.6px',
                marginBottom: 6,
                paddingLeft: 2,
              }}
            >
              Yenilikler ve Değişiklikler
            </div>
            <div
              style={{
                background: 'var(--surface-2, #1c1c1e)',
                border: '1px solid var(--surface-3, #2c2c2e)',
                borderRadius: '12px',
                padding: '12px 14px',
                maxHeight: '150px',
                overflowY: 'auto',
                fontSize: '13px',
                lineHeight: '1.5',
                color: 'var(--ink-2, #d1d1d6)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {releaseNotes && releaseNotes.trim() ? (
                releaseNotes.trim()
              ) : (
                <span style={{ color: 'var(--muted, #8e8e93)', fontStyle: 'italic' }}>
                  Bu güncelleme için ek sürüm notu paylaşılmadı.
                </span>
              )}
            </div>
          </div>

          {errorMessage && (
            <div
              style={{
                background: 'rgba(255, 69, 58, 0.15)',
                border: '1px solid rgba(255, 69, 58, 0.3)',
                color: 'var(--red, #ff453a)',
                borderRadius: '10px',
                padding: '10px',
                fontSize: '13px',
                marginBottom: 16,
              }}
            >
              {errorMessage}
            </div>
          )}

          {/* Butonlar */}
          <div
            style={{
              display: 'flex',
              gap: '10px',
              justifyContent: 'flex-end',
              alignItems: 'center',
            }}
          >
            <button
              type="button"
              onClick={close}
              style={{
                flex: 1,
                padding: '12px 14px',
                borderRadius: '12px',
                border: 'none',
                background: 'var(--surface-2, #2c2c2e)',
                color: 'var(--ink-2, #d1d1d6)',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Daha Sonra
            </button>
            <button
              type="button"
              onClick={handleStartUpdate}
              style={{
                flex: 1.4,
                padding: '12px 16px',
                borderRadius: '12px',
                border: 'none',
                background: 'var(--green, #30d158)',
                color: '#000000',
                fontSize: '14px',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(48, 209, 88, 0.35)',
              }}
            >
              Şimdi Güncelle
            </button>
          </div>
        </>
      ) : (
        /* İndirme İlerleme Alanı */
        <div style={{ padding: '8px 0 14px' }}>
          {/* Progress Bar Container */}
          <div
            style={{
              height: 10,
              borderRadius: 5,
              background: 'var(--surface-3, #3a3a3c)',
              overflow: 'hidden',
              margin: '12px 0 10px',
              position: 'relative',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${progress}%`,
                background: 'var(--green, #30d158)',
                borderRadius: 5,
                transition: 'width 0.25s ease-out',
                boxShadow: '0 0 10px rgba(48, 209, 88, 0.5)',
              }}
            />
          </div>

          {/* Durum Metni */}
          <div
            style={{
              fontSize: '14px',
              fontWeight: 600,
              color: 'var(--ink, #ffffff)',
              marginBottom: 4,
            }}
          >
            {progress >= 100 ? 'Yükleyici Başlatılıyor...' : downloadDetails || `%${progress} İndiriliyor`}
          </div>

          <div
            style={{
              fontSize: '12px',
              color: 'var(--muted, #8e8e93)',
              marginTop: 6,
            }}
          >
            İndirme tamamlandığında Android kurulum ekranı otomatik olarak açılacaktır.
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Güncelleme modalını programatik olarak açan yardımcı fonksiyon.
 *
 * @param {Object} updateInfo
 * @returns {void}
 */
export function openUpdateModal(updateInfo) {
  if (!updateInfo?.hasUpdate) return
  useUI.getState().openSheet(
    close => <UpdateModal updateInfo={updateInfo} close={close} />,
    { kind: 'center', wide: true, locked: false }
  )
}
