import {test, expect} from "../fixtures/fixtures";
import {TEXTS} from "../shared/shared";
import {loginPageTexts} from "../pages/mainPages/loginPage";
import {STOCK_PAGE_TEXTS} from "../pages/mainPages/stockPage";
import {DOSES_PAGE_TEXTS} from "../pages/mainPages/dosesPage";
import {EXPIRING_PAGE_TEXTS} from "../pages/mainPages/expiringPage";
import {SHOPPING_PAGE_TEXTS} from "../pages/mainPages/shoppingPage";

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

    test(`Expiring page is displayed`, async ({expiringPage}) => {

        //  Arrange & Act
        await expiringPage.goToPage();

        //  Assert
        await expect(expiringPage.pageTitle).toHaveText(EXPIRING_PAGE_TEXTS.title);
        await expect(expiringPage.expiringGroup).toBeVisible();
        await expect(expiringPage.expiredSubgroup).toBeVisible();
        await expect(expiringPage.expiredSubgroup.locator(expiringPage.subgroupTitle)).toHaveText(EXPIRING_PAGE_TEXTS.expiredSubgroup)
        await expect(expiringPage.expiredSubgroup.locator(expiringPage.subgroupDesc)).toHaveText(EXPIRING_PAGE_TEXTS.expiredSubgroupDesc)
        await expect(expiringPage.binnedSection).toBeVisible();
        await expect(expiringPage.binnedSummaryTitle).toHaveText(EXPIRING_PAGE_TEXTS.binnedSectionTitle)
        await expect(expiringPage.binnedSectionWasted).toHaveText(EXPIRING_PAGE_TEXTS.binnedSectionWasted)
        await expect(expiringPage.binnedSectionNotWasted).toContainText(EXPIRING_PAGE_TEXTS.binnedSectionNotWasted)
    })

    test(`Shopping page is displayed`, async ({shoppingPage}) => {

        //  Arrange & Act
        await shoppingPage.goToPage();

        //  Assert
        await expect(shoppingPage.pageTitle).toHaveText(SHOPPING_PAGE_TEXTS.title);
        await expect(shoppingPage.addItemSection).toBeVisible();
        await expect(shoppingPage.addItemSection.locator(`summary`)).toHaveText(SHOPPING_PAGE_TEXTS.addItem);
        await expect(shoppingPage.shoppingGroups).toBeVisible();

        const shoppingGroupsCount = await shoppingPage.shoppingGroups.locator(`> section`).count();
        expect(shoppingGroupsCount).toBe(4);

        await expect(shoppingPage.toBuySection.locator(shoppingPage.sectionTitle)).toContainText(SHOPPING_PAGE_TEXTS.toBuyTitle);
        await expect(shoppingPage.toBuySection.locator(shoppingPage.sectionDesc)).toHaveText(SHOPPING_PAGE_TEXTS.toBuyDesc);
        await expect(shoppingPage.orderedSection.locator(shoppingPage.sectionTitle)).toContainText(SHOPPING_PAGE_TEXTS.orderedTitle);
        await expect(shoppingPage.orderedSection.locator(shoppingPage.sectionDesc)).toHaveText(SHOPPING_PAGE_TEXTS.orderedDesc);
        await expect(shoppingPage.arrivedSection.locator(shoppingPage.sectionTitle)).toContainText(SHOPPING_PAGE_TEXTS.arrivedTitle);
        await expect(shoppingPage.arrivedSection.locator(shoppingPage.sectionDesc)).toHaveText(SHOPPING_PAGE_TEXTS.arrivedDesc);
        await expect(shoppingPage.inCupboardSection.locator(shoppingPage.sectionTitle)).toContainText(SHOPPING_PAGE_TEXTS.inCupboardTitle);
        await expect(shoppingPage.inCupboardSection.locator(shoppingPage.sectionDesc)).toHaveText(SHOPPING_PAGE_TEXTS.inCupboardDesc);
    })

})