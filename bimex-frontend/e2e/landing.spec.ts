import { test, expect } from '@playwright/test'
import { mockFreighterDisconnected } from './fixtures/freighter'

test.describe('Landing – sin wallet', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      sessionStorage.clear()
      localStorage.removeItem('bimex.wallet.session')
    })
    await mockFreighterDisconnected(page)
    await page.goto('/')
  })

  test('muestra el botón "Freighter" en el hero', async ({ page }) => {
    const heroBtn = page.getByRole('button', { name: /freighter/i }).first()
    await expect(heroBtn).toBeVisible()
  })

  test('muestra el botón "Conectar" en la navbar del landing', async ({ page }) => {
    const navBtn = page.getByRole('button', { name: /^conectar$/i })
    await expect(navBtn).toBeVisible()
  })

  test('renderiza el h1 principal del hero', async ({ page }) => {
    const h1 = page.getByRole('heading', { level: 1 })
    await expect(h1).toBeVisible()
    await expect(h1).toContainText(/invierte/i)
  })

  test('muestra la tarjeta de distribución del rendimiento', async ({ page }) => {
    await expect(page.getByText('Distribución del rendimiento')).toBeVisible()
    await expect(page.getByText('13.45%', { exact: true }).first()).toBeVisible()
  })

  test('muestra los pasos de cómo funciona Bimex', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Conecta tu wallet' })).toBeVisible()
    await expect(page.getByText(/deposita mxne/i)).toBeVisible()
  })

  test('muestra el enlace de Transparencia', async ({ page }) => {
    const transparenciaBtn = page.getByRole('button', { name: /transparencia/i })
    await expect(transparenciaBtn).toBeVisible()
  })

  test('permanece en "/" sin redirigir a /proyectos sin wallet', async ({ page }) => {
    await expect(page).toHaveURL('/')
  })

  test('el título de la página está configurado', async ({ page }) => {
    await expect(page).toHaveTitle(/.+/)
  })
})
