// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import UpdateModal from './UpdateModal.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('UpdateModal component', () => {
  let container = null
  let root = null

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  const sampleUpdate = {
    hasUpdate: true,
    latestVersion: '1.5.0',
    tagName: 'v1.5.0',
    releaseNotes: '• Beta 20 kullanıcı testi için yeni arayüz\n• Performans iyileştirmeleri',
    apkUrl: 'https://github.com/myuser/myrepo/releases/download/v1.5.0/app.apk',
    apkName: 'openGym-v1.5.0.apk',
    apkSize: 25000000,
  }

  it('renders modal with title, version badge, release notes and action buttons', () => {
    act(() => {
      root.render(<UpdateModal updateInfo={sampleUpdate} close={() => {}} />)
    })

    expect(container.textContent).toContain('Yeni Güncelleme Mevcut!')
    expect(container.textContent).toContain('v1.5.0 sürümüne yükseltilebilir')
    expect(container.textContent).toContain('Beta 20 kullanıcı testi için yeni arayüz')
    expect(container.textContent).toContain('Daha Sonra')
    expect(container.textContent).toContain('Şimdi Güncelle')
  })

  it('calls close callback when "Daha Sonra" button is clicked', () => {
    const handleClose = vi.fn()
    act(() => {
      root.render(<UpdateModal updateInfo={sampleUpdate} close={handleClose} />)
    })

    const laterBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Daha Sonra'))
    expect(laterBtn).toBeTruthy()

    act(() => {
      laterBtn.click()
    })

    expect(handleClose).toHaveBeenCalledTimes(1)
  })
})
