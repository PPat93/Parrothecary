import {test, expect} from "@playwright/test";
import {TEXTS} from "../shared/shared";
import {LoginPage, loginPageTexts} from "../pages/loginPage";
import {log} from "next/dist/server/typescript/utils";

test.describe(`Login Page displayment`, async () => {

    test(`Login page is displayed`, async ({page}) => {

        //  Arrange
        const loginPage = new LoginPage(page);

        //  Act
        await loginPage.goToLoginPage();

        //  Asserts
        await expect(page).toHaveTitle(TEXTS.appName);
        await expect(loginPage.pageTitle).toHaveText(TEXTS.appName);
        await expect(loginPage.pageSubTitle).toHaveText(TEXTS.subtitle);
        await expect(loginPage.logo).toBeVisible();
        await expect(loginPage.passwordField).toBeVisible();
        await expect(loginPage.submitBtn).toHaveText(loginPageTexts.SUBMIT_BTN_TXT);
    })
})

test.describe(`Main page displayments`, async () => {

    test(`Stock page is displayed`, async ({page}) => {

        //  Arrange
        const loginPage = new LoginPage(page);

        //  Act
        await loginPage.goToLoginPage();
        await loginPage.userLogin()

        //  Asserts
        // await expect(loginPage.submitBtn).toHaveText(`Checking...`)
        // await expect(`body > div.flex.min-h-dvh.flex-col > main > div > header`).toMatch(`Stock`);
    })
})