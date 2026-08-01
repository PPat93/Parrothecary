import {expect, test} from "../fixtures/fixtures";


test.describe(`Login functionality`, async () => {

    test(`User logs in with correct password`, async ({loginPage, stockPage, page}) => {

        //  Arrange & Act
        await loginPage.goToLoginPage();
        await loginPage.userLogin()

        //  Asserts
        await expect(loginPage.submitBtn).toHaveText(`Checking…`)
        await expect(loginPage.submitBtn).toBeHidden();
    })
})