import {test as setup, expect} from '../fixtures/fixtures';
import {SEEDED_AUTH_PATH} from './shared'

setup(`Global authentication`, async ({loginPage, page}) => {

    await loginPage.goToPage();
    await loginPage.userLogin();
    await expect(loginPage.submitBtn).toBeHidden();

    await page.context().storageState({path: SEEDED_AUTH_PATH})
})