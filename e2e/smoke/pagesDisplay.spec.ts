import {test, expect} from "../fixtures/fixtures";
import {TEXTS} from "../shared/shared";
import {loginPageTexts} from "../pages/mainPages/loginPage";
import {STOCK_PAGE_TEXTS} from "../pages/mainPages/stockPage";
import {DOSES_PAGE_TEXTS} from "../pages/mainPages/dosesPage";

test.describe(`Login page display`, async () => {

    test.use({storageState: {cookies: [], origins: []}});

    test(`Login page is displayed`, async ({loginPage, page}) => {

        //  Arrange & Act
        await loginPage.goToPage();

        //  Assert
        await expect(page).toHaveTitle(TEXTS.appName);
        await expect(loginPage.pageTitle).toHaveText(TEXTS.appName);
        await expect(loginPage.pageSubTitle).toHaveText(TEXTS.subtitle);
        await expect(loginPage.logo).toBeVisible();
        await expect(loginPage.passwordField).toBeVisible();
        await expect(loginPage.submitBtn).toHaveText(loginPageTexts.SUBMIT_BTN_TXT);
    })
})

test.describe(`Stock page display`, async () => {
    test(`Stock page is displayed`, async ({stockPage}) => {

        //  Arrange & Act
        await stockPage.goToPage();

        //  Assert
        await expect(stockPage.pageTitle).toHaveText(STOCK_PAGE_TEXTS.title);
        await expect(stockPage.newBoxBtn).toBeVisible();
        await expect(stockPage.newBoxBtn).toHaveText(STOCK_PAGE_TEXTS.newBoxBtn);
        await expect(stockPage.mainSearchField).toBeVisible();
        await expect(stockPage.stockList).toBeVisible();
        const listItems = await stockPage.stockListItem.count();
        expect(listItems).toBeGreaterThan(3);
    })

    test(`Doses page is displayed`, async ({dosesPage}) => {

        //  Arrange & Act
        await dosesPage.goToPage();

        //  Assert
        await expect(dosesPage.pageTitle).toHaveText(DOSES_PAGE_TEXTS.title);
        await expect(dosesPage.managePeopleBtn).toBeVisible();
        await expect(dosesPage.managePeopleBtn).toHaveText(DOSES_PAGE_TEXTS.managePeopleBtn);
        await expect(dosesPage.dosesList).toBeVisible();
        const listItems = await dosesPage.dosesList.locator(`> li`).count();
        expect(listItems).toBeGreaterThanOrEqual(2);
    })
})