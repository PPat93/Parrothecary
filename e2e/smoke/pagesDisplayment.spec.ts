import {test, expect} from '@playwright/test';
import {TEXTS} from "../shared/shared";
import {LoginPage} from "../pages/loginPage";


test('is displayed', async ({page}) => {
    const loginPage = new LoginPage(page);
    await page.goto('/login');
    await expect(page).toHaveTitle(TEXTS.appName);
    await expect(loginPage.pageTitle).toHaveText(TEXTS.appName);
})