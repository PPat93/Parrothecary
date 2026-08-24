import {expect, test} from "../fixtures/fixtures";


test.describe(`Login functionality`, async () => {

    test.use({storageState: {cookies: [], origins: []}});

    test(`User logs in with correct password`, async ({loginPage, stockPage}) => {

        //  Arrange & Act
        await loginPage.goToPage();
        await loginPage.userLogin()

        //  Asserts
        await expect(loginPage.submitBtn).toBeHidden();
        await expect(stockPage.pageTitle).toBeVisible();
    })

    test(`User cannot log in with incorrect password`, async ({loginPage}) => {

        //  Arrange & Act
        await loginPage.goToPage();
        await loginPage.userLogin(`invalidPass`)

        //  Asserts
        await expect(loginPage.errorMessage).toBeVisible();
        await expect(loginPage.errorMessage).toHaveText(`Wrong password.`);
    })

    test(`User cannot log in with empty password`, async ({loginPage}) => {

        //  Arrange & Act
        await loginPage.goToPage();
        await loginPage.userLogin(` `)

        //  Asserts
        await expect(loginPage.errorMessage).toBeVisible();
        await expect(loginPage.errorMessage).toHaveText(`Wrong password.`);
    })
})