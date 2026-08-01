import {test, expect} from "../fixtures/fixtures";
import {TEXTS} from "../shared/shared";
import {loginPageTexts} from "../pages/loginPage";

test.describe(`Login Page displayment`, async () => {

    test(`Login page is displayed`, async ({loginPage, page}) => {

        //  Arrange & Act
        await loginPage.goToLoginPage();

        //  Assert
        await expect(page).toHaveTitle(TEXTS.appName);
        await expect(loginPage.pageTitle).toHaveText(TEXTS.appName);
        await expect(loginPage.pageSubTitle).toHaveText(TEXTS.subtitle);
        await expect(loginPage.logo).toBeVisible();
        await expect(loginPage.passwordField).toBeVisible();
        await expect(loginPage.submitBtn).toHaveText(loginPageTexts.SUBMIT_BTN_TXT);
    })
})

test.describe(`Main page displayments`, async () => {

    test(`Stock page is displayed`, async ({loginPage, stockPage, page}) => {

        //  Arrange & Act
        await loginPage.goToLoginPage();
        await loginPage.userLogin()

        //  Assert
        await expect(stockPage.pageTitle).toHaveText(`Stock`);
    })
})