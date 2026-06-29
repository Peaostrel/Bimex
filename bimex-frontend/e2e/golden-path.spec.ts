import { test, expect, type Page } from '@playwright/test'
import { mockFreighterConnected, mockFreighterDisconnected, MOCK_ADDRESS } from './fixtures/freighter'

const MOCK_PROJECT = {
  id: 1,
  nombre: 'Proyecto Solar Comunitario',
  estado: 'EnProgreso',
  dueno: 'GDIFFERENTOWNER1234567890ABCDEF',
  descripcion: 'Instalación de paneles solares en comunidades rurales de Oaxaca.',
  meta: '200000000',
  aportado: '100000000',
  yield_entregado: '500000',
  capital_en_cetes: '50000000',
  capital_en_amm: '50000000',
  yield_cetes_acumulado: '250000',
  yield_amm_acumulado: '250000',
  timestamp_inicio: Math.floor(Date.now() / 1000) - 86400 * 30,
  timestamp_vencimiento: Math.floor(Date.now() / 1000) + 86400 * 335,
  tiempo_meses: 12,
  doc_hash: 'QmSolarDoc1|QmSolarDoc2',
  motivo_rechazo: '',
}

async function seedWalletSession(page: Page) {
  await page.addInitScript(() => {
    sessionStorage.setItem('bimex.wallet.session', '1')
  })
}

async function stubProjectData(page: Page) {
  await page.addInitScript((project: typeof MOCK_PROJECT) => {
    ;(window as any).__BIMEX_MOCK_PROJECTS__ = [project]
    ;(window as any).__BIMEX_MOCK_PROJECT__ = project

    const originalFetch = window.fetch.bind(window)
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (
        url.includes('soroban') || url.includes('stellar') ||
        url.includes('horizon') || url.includes('rpc')
      ) {
        return new Response(
          JSON.stringify({ jsonrpc: '2.0', id: 1, result: { results: [] } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      }
      return originalFetch(input, init)
    }
  }, MOCK_PROJECT)
}

test.describe('Golden Path – flujo completo connect wallet → invertir → yield', () => {

  test('landing muestra botón conectar sin wallet', async ({ page }) => {
    await mockFreighterDisconnected(page)
    await page.addInitScript(() => {
      sessionStorage.clear()
      localStorage.removeItem('bimex.wallet.session')
    })
    await page.goto('/')

    const heroBtn = page.getByRole('button', { name: /freighter/i }).first()
    await expect(heroBtn).toBeVisible({ timeout: 10_000 })

    const navBtn = page.getByRole('button', { name: /^conectar$/i })
    await expect(navBtn).toBeVisible()

    await expect(page).toHaveURL('/')
  })

  test('con wallet conectada redirige a /proyectos', async ({ page }) => {
    await mockFreighterConnected(page)
    await seedWalletSession(page)
    await stubProjectData(page)
    await page.goto('/')
    await expect(page).toHaveURL('/proyectos', { timeout: 10_000 })
  })

  test('lista de proyectos carga y muestra tarjetas (cards)', async ({ page }) => {
    await mockFreighterConnected(page)
    await seedWalletSession(page)
    await stubProjectData(page)
    await page.goto('/proyectos')

    const heading = page.getByRole('heading', { level: 2 })
    await expect(heading).toBeVisible({ timeout: 10_000 })

    const grid = page.locator('[role="list"], .grid-proyectos, .lista-contenedor')
    await expect(grid.first()).toBeVisible({ timeout: 15_000 })
  })

  test('filtro "En Progreso" se activa al hacer clic', async ({ page }) => {
    await mockFreighterConnected(page)
    await seedWalletSession(page)
    await stubProjectData(page)
    await page.goto('/proyectos')

    const enProgresoBtn = page.getByRole('button', { name: /en progreso/i })
    await expect(enProgresoBtn).toBeVisible({ timeout: 15_000 })
    await enProgresoBtn.click()
    await expect(enProgresoBtn).toHaveAttribute('aria-pressed', 'true')
  })

  test('navegar a /proyectos/:id muestra la página de detalle', async ({ page }) => {
    await mockFreighterConnected(page)
    await seedWalletSession(page)
    await stubProjectData(page)
    await page.goto('/proyectos/1')

    const backLink = page.locator('.back-link')
    await expect(backLink).toBeVisible({ timeout: 15_000 })
  })

  test('panel de inversión visible en la página de detalle', async ({ page }) => {
    await mockFreighterConnected(page)
    await seedWalletSession(page)
    await stubProjectData(page)
    await page.goto('/proyectos/1')

    const investPanel = page.locator('.invest-panel')
    await expect(investPanel.first()).toBeVisible({ timeout: 15_000 })
  })

  test('sección de distribución de yield visible en el detalle', async ({ page }) => {
    await mockFreighterConnected(page)
    await seedWalletSession(page)
    await stubProjectData(page)
    await page.goto('/proyectos/1')

    await expect(page.getByText('6.00%').first()).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('5.00%').first()).toBeVisible({ timeout: 15_000 })
  })

  test('botón "Volver" en detalle navega de regreso a /proyectos', async ({ page }) => {
    await mockFreighterConnected(page)
    await seedWalletSession(page)
    await stubProjectData(page)
    await page.goto('/proyectos/1')
    await page.waitForLoadState('networkidle')

    const backBtn = page.locator('.back-link')
    await expect(backBtn).toBeVisible({ timeout: 15_000 })
    await backBtn.click()
    await expect(page).toHaveURL('/proyectos', { timeout: 10_000 })
  })

  test('campo de inversión acepta monto numérico', async ({ page }) => {
    await mockFreighterConnected(page)
    await seedWalletSession(page)
    await stubProjectData(page)
    await page.goto('/proyectos/1')

    const amountInput = page.locator('input[type="number"]')
    await expect(amountInput).toBeVisible({ timeout: 15_000 })
    await amountInput.fill('100')
    await expect(amountInput).toHaveValue('100')
  })

  test('ruta desconocida redirige a la ruta correcta', async ({ page }) => {
    await mockFreighterConnected(page)
    await seedWalletSession(page)
    await page.goto('/ruta-que-no-existe')
    await expect(page).toHaveURL('/proyectos', { timeout: 10_000 })
  })
})
