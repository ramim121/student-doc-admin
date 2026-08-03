import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('admin login exposes its restricted boundary accessibly', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Administrator sign in' })).toBeVisible();
  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page.getByLabel('Password')).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('admin login design has a desktop baseline', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/login');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(200);
  await expect(page).toHaveScreenshot('admin-login-desktop.png', { animations: 'disabled', fullPage: true, maxDiffPixelRatio: 0.005 });
});

test('admin login design has a mobile baseline', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/login');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(200);
  await expect(page).toHaveScreenshot('admin-login-mobile.png', { animations: 'disabled', fullPage: true, maxDiffPixelRatio: 0.005 });
});
