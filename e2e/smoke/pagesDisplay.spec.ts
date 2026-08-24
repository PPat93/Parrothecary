import {test, expect} from "../fixtures/fixtures";
import {TEXTS} from "../shared/shared";
import {loginPageTexts} from "../pages/mainPages/loginPage";
import {STOCK_PAGE_TEXTS} from "../pages/mainPages/stockPage";
import {DOSES_PAGE_TEXTS} from "../pages/mainPages/dosesPage";
import {EXPIRING_PAGE_TEXTS} from "../pages/mainPages/expiringPage";
import {SHOPPING_PAGE_TEXTS} from "../pages/mainPages/shoppingPage";
import {TRIPS_PAGE_TEXTS} from "../pages/mainPages/tripsPage";
import {PRODUCTS_PAGE_TEXTS} from "../pages/mainPages/productsPage";

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
        const listItems = await dosesPage.dosesList.getByTitle(`Main doses list item`).count();
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

        //  TODO - move to flow verifications
        // const shoppingGroupsCount = await shoppingPage.shoppingGroups.getByTitle(`Shopping section`).count();
        // expect(shoppingGroupsCount).toBeGreaterThanOrEqual(1)
        //
        // await expect(shoppingPage.toBuySection.locator(shoppingPage.sectionTitle)).toContainText(SHOPPING_PAGE_TEXTS.toBuyTitle);
        // await expect(shoppingPage.toBuySection.locator(shoppingPage.sectionDesc)).toHaveText(SHOPPING_PAGE_TEXTS.toBuyDesc);
        // await expect(shoppingPage.orderedSection.locator(shoppingPage.sectionTitle)).toContainText(SHOPPING_PAGE_TEXTS.orderedTitle);
        // await expect(shoppingPage.orderedSection.locator(shoppingPage.sectionDesc)).toHaveText(SHOPPING_PAGE_TEXTS.orderedDesc);
        // await expect(shoppingPage.arrivedSection.locator(shoppingPage.sectionTitle)).toContainText(SHOPPING_PAGE_TEXTS.arrivedTitle);
        // await expect(shoppingPage.arrivedSection.locator(shoppingPage.sectionDesc)).toHaveText(SHOPPING_PAGE_TEXTS.arrivedDesc);
        // await expect(shoppingPage.inCupboardSection.locator(shoppingPage.sectionTitle)).toContainText(SHOPPING_PAGE_TEXTS.inCupboardTitle);
        // await expect(shoppingPage.inCupboardSection.locator(shoppingPage.sectionDesc)).toHaveText(SHOPPING_PAGE_TEXTS.inCupboardDesc);
    })

    test(`Trips page is displayed`, async ({tripsPage}) => {

        //  Arrange & Act
        await tripsPage.goToPage();

        //  Assert
        await expect(tripsPage.pageTitle).toHaveText(TRIPS_PAGE_TEXTS.title);
        await expect(tripsPage.pageDesc).toHaveText(TRIPS_PAGE_TEXTS.description);
        await expect(tripsPage.newTripBtn).toBeVisible();
        await expect(tripsPage.newTripBtn).toHaveText(TRIPS_PAGE_TEXTS.newTripBtn);
        await expect(tripsPage.mainTripsGroup).toBeVisible();


        //  TODO - move to flow verifications
        // const listItems = await tripsPage.mainTripsGroup.getByTitle(`Trips section`).count();
        // expect(listItems).toBe(2);
        // await expect(tripsPage.plannedSection).toBeVisible();
        // await expect(tripsPage.plannedSection.locator(tripsPage.sectionTitle)).toHaveText(TRIPS_PAGE_TEXTS.planedSectionTitle);
        // await expect(tripsPage.doneSection).toBeVisible();
        // await expect(tripsPage.doneSection.locator(tripsPage.sectionTitle)).toHaveText(TRIPS_PAGE_TEXTS.doneSectionTitle);
    })

    test(`Products page is displayed`, async ({productsPage}) => {

        const regBtnActive = /\(--text\)/
        const regBtnInactive = /\(--muted\)/

        //  Arrange & Act
        await productsPage.goToPage();

        //  Assert
        //  Active list
        await expect(productsPage.pageTitle).toHaveText(PRODUCTS_PAGE_TEXTS.title);
        await expect(productsPage.newProductBtn).toBeVisible();
        await expect(productsPage.newProductBtn).toHaveText(PRODUCTS_PAGE_TEXTS.newProductBtn);
        await expect(productsPage.productStatsListSwitch).toBeVisible();
        await expect(productsPage.productStatsListSwitch.getByText(PRODUCTS_PAGE_TEXTS.switchActive)).toBeVisible();
        await expect(productsPage.productStatsListSwitch.getByText(PRODUCTS_PAGE_TEXTS.switchActive)).toHaveAttribute(`style`, regBtnActive);
        await expect(productsPage.productStatsListSwitch.getByText(PRODUCTS_PAGE_TEXTS.switchArchived)).toBeVisible();
        await expect(productsPage.productStatsListSwitch.getByText(PRODUCTS_PAGE_TEXTS.switchArchived)).toHaveAttribute(`style`, regBtnInactive);
        await expect(productsPage.mainSearchField).toBeVisible();


        //  TODO - move to flow verifications
        // await expect(productsPage.productsList).toBeVisible()
        //
        // const productListItemsActive = await productsPage.productsListItem.filter({visible: true}).count();
        // expect(productListItemsActive).toBeGreaterThanOrEqual(4);

        //  Archived list
        await productsPage.productStatsListSwitch.getByText(PRODUCTS_PAGE_TEXTS.switchArchived).click();
        await expect(productsPage.productStatsListSwitch.getByText(PRODUCTS_PAGE_TEXTS.switchActive)).toBeVisible();
        await expect(productsPage.productStatsListSwitch.getByText(PRODUCTS_PAGE_TEXTS.switchActive)).toHaveAttribute(`style`, regBtnInactive);
        await expect(productsPage.productStatsListSwitch.getByText(PRODUCTS_PAGE_TEXTS.switchArchived)).toBeVisible();
        await expect(productsPage.productStatsListSwitch.getByText(PRODUCTS_PAGE_TEXTS.switchArchived)).toHaveAttribute(`style`, regBtnActive);


        //  TODO - move to flow verifications
        // const productListItemsArchived = await productsPage.productsListItem.filter({visible: true}).count();
        // expect(productListItemsArchived).toBe(2);
    })
})