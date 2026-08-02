import {expect, test} from "../fixtures/fixtures";


test.describe(`Login functionality`, async () => {

    test.use({storageState: {cookies: [], origins: []}});

    test(`User logs in with correct password`, async ({loginPage, stockPage, page}) => {

        //  Arrange & Act
        await loginPage.goToPage();
        await loginPage.userLogin()

        //  Asserts
        await expect(loginPage.submitBtn).toHaveText(`Checking…`)
        await expect(loginPage.submitBtn).toBeHidden();
    })
})