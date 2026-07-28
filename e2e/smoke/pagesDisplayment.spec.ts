import {test, expect} from '@playwright/test';
import {TEXTS} from "../shared/shared";
import {LoginPage, loginPageTexts} from "../pages/loginPage";


test('Login page is displayed', async ({page}) => {

    //  Arrange
    const loginPage = new LoginPage(page);

    //  Act
    await page.goto('/login');

    //  Asserts
    await expect(page).toHaveTitle(TEXTS.appName);
    await expect(loginPage.pageTitle).toHaveText(TEXTS.appName);
    await expect(loginPage.pageSubTitle).toHaveText(TEXTS.subtitle);
    await expect(loginPage.logo).toBeVisible();
    await expect(loginPage.passwordField).toBeVisible();
    await expect(loginPage.submitBtn).toHaveText(loginPageTexts.SUBMIT_BTN_TXT);
})