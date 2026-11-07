// @ori-generated scenario:tauri-smoke-e2e
// tauri-scenario-smoke: SKILL template の wdio.conf.ts で
// WDIO → tauri-driver (:4444) → WebKitWebDriver → ビルド済み binary が実際に繋がることの実在性チェック。
import { browser, $, expect } from '@wdio/globals';

describe('scenario:tauri-smoke-e2e', () => {
  it('step 1 — validation#tauri-smoke-window-text', async () => {
    const message = await $('[data-testid="text.smoke.message"]');
    await message.waitForExist({ timeout: 30000 });
    await expect(message).toHaveText('myapp is up');
  });

  it('step 2 — validation#tauri-smoke-storage-isolation', async () => {
    // onPrepare (G4) が per-run temp root を採番し、XDG_* をその配下に向けて worker に継承させている
    const tmp = process.env.ORI_SCENARIO_TMP;
    expect(tmp).toBeTruthy();
    for (const env of ['XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME', 'XDG_STATE_HOME']) {
      expect(process.env[env]?.startsWith(`${tmp}/`)).toBe(true);
    }
    await browser.saveScreenshot(`${process.env.ORI_SMOKE_ARTIFACTS ?? tmp}/tauri-window.png`);
  });
});
