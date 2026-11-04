// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NotificationBell } from './notification-bell'

const mocks = vi.hoisted(() => ({ list: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/server/actions/agenda', () => ({ listNotifications: mocks.list, markNotificationsRead: vi.fn() }))

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Notificaciones sin solicitudes simultáneas ni trabajo en segundo plano', () => {
  it('espera a terminar una lectura lenta antes de programar la siguiente y se detiene al desmontar', async () => {
    let resolve!: (items: []) => void
    mocks.list
      .mockReturnValueOnce(
        new Promise<[]>((done) => {
          resolve = done
        }),
      )
      .mockResolvedValue([])
    const { unmount } = render(<NotificationBell initial={[]} />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(45000)
    })
    expect(mocks.list).toHaveBeenCalledTimes(1)
    await act(async () => {
      resolve([])
      await Promise.resolve()
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000)
    })
    expect(mocks.list).toHaveBeenCalledTimes(2)
    unmount()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000)
    })
    expect(mocks.list).toHaveBeenCalledTimes(2)
  })

  it('pausa al ocultar la pestaña y actualiza al regresar', async () => {
    mocks.list.mockResolvedValue([])
    render(<NotificationBell initial={[]} />)
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000)
    })
    expect(mocks.list).not.toHaveBeenCalled()
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(mocks.list).toHaveBeenCalledTimes(1)
  })
})
