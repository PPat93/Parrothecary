import {test, expect} from "../utils/fixtures/fixtures";
import {ACTIVATION_VALS, Shared, TEXTS} from "../utils/shared/shared";
import {loginPageTexts} from "../utils/pages/mainPages/loginPage";
import {STOCK_PAGE_TEXTS} from "../utils/pages/mainPages/stockPage";
import {DOSES_PAGE_TEXTS} from "../utils/pages/mainPages/dosesPage";
import {EXPIRING_PAGE_TEXTS} from "../utils/pages/mainPages/expiringPage";
import {SHOPPING_PAGE_TEXTS} from "../utils/pages/mainPages/shoppingPage";
import {TRIPS_PAGE_TEXTS} from "../utils/pages/mainPages/tripsPage";
import {PRODUCTS_PAGE_TEXTS} from "../utils/pages/mainPages/productsPage";
import {ADD_BOX_TEXTS, AddBoxSubpage} from "../utils/pages/subpages/addBoxSubpage";
import {HOUSEHOLD_TEXTS, HouseholdSubpage} from "../utils/pages/subpages/householdSubpage";
import {NEW_PERSON_TEXTS} from "../utils/pages/subpages/newPersonSubpage";
import {NEW_TRIP_TEXTS, TRIP_TYPE_SELECTOR_VALUES} from "../utils/pages/subpages/newTripSubpage";

test.describe(`Login page display`, {tag: `@smoke`}, async () => {

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

test.describe(`Main pages display - empty DB`, {tag: `@smoke`}, async () => {
    test(`Stock page is displayed`, async ({stockPage}) => {

        //  Arrange & Act
        await stockPage.goToPage();

        //  Assert
        await expect(stockPage.pageTitle).toHaveText(STOCK_PAGE_TEXTS.title);
        await expect(stockPage.newBoxBtn).toBeVisible();
        await expect(stockPage.newBoxBtn).toHaveText(STOCK_PAGE_TEXTS.newBoxBtn);
        await expect(stockPage.auditBtn).toBeVisible();
        await expect(stockPage.auditBtn).toHaveText(STOCK_PAGE_TEXTS.auditBtn);
        await expect(stockPage.mainSearchField).toBeVisible();
        await expect(stockPage.emptyPageDescription).toBeVisible();
        await expect(stockPage.emptyPageDescription).toHaveText(STOCK_PAGE_TEXTS.emptyPage + STOCK_PAGE_TEXTS.startExplainer);

        // TODO - move to normal flow tests
        // await expect(stockPage.stockList).toBeVisible();
        // const listItems = await stockPage.stockListItem.count();
        // expect(listItems).toBeGreaterThan(3);
    })

    test(`Doses page is displayed`, async ({dosesPage}) => {

        //  Arrange & Act
        await dosesPage.goToPage();

        //  Assert
        await expect(dosesPage.pageTitle).toHaveText(DOSES_PAGE_TEXTS.title);
        await expect(dosesPage.managePeopleBtn).toBeVisible();
        await expect(dosesPage.managePeopleBtn).toHaveText(DOSES_PAGE_TEXTS.managePeopleBtn);
        await expect(dosesPage.emptyPageDescription).toBeVisible();
        await expect(dosesPage.emptyPageDescription).toHaveText(DOSES_PAGE_TEXTS.emptyPage + DOSES_PAGE_TEXTS.startExplainer);

        // TODO -move to flows testing
        // await expect(dosesPage.dosesList).toBeVisible();
        // const listItems = await dosesPage.dosesList.getByTitle(`Main doses list item`).count();
        // expect(listItems).toBeGreaterThanOrEqual(2);
    })

    test(`Expiring page is displayed`, async ({expiringPage}) => {

        //  Arrange & Act
        await expiringPage.goToPage();

        //  Assert
        await expect(expiringPage.pageTitle).toHaveText(EXPIRING_PAGE_TEXTS.title);
        await expect(expiringPage.emptyPageDescription).toHaveText(EXPIRING_PAGE_TEXTS.emptyPage);

        // TODO - move to flow testing
        // await expect(expiringPage.expiringGroup).toBeVisible();
        // await expect(expiringPage.expiredSubgroup).toBeVisible();
        // await expect(expiringPage.expiredSubgroup.locator(expiringPage.subgroupTitle)).toHaveText(EXPIRING_PAGE_TEXTS.expiredSubgroup)
        // await expect(expiringPage.expiredSubgroup.locator(expiringPage.subgroupDesc)).toHaveText(EXPIRING_PAGE_TEXTS.expiredSubgroupDesc)
        // await expect(expiringPage.binnedSection).toBeVisible();
        // await expect(expiringPage.binnedSummaryTitle).toHaveText(EXPIRING_PAGE_TEXTS.binnedSectionTitle)
        // await expect(expiringPage.binnedSectionWasted).toHaveText(EXPIRING_PAGE_TEXTS.binnedSectionWasted)
        // await expect(expiringPage.binnedSectionNotWasted).toContainText(EXPIRING_PAGE_TEXTS.binnedSectionNotWasted)
    })

    test(`Shopping page is displayed`, async ({shoppingPage}) => {

        //  Arrange & Act
        await shoppingPage.goToPage();

        //  Assert
        await expect(shoppingPage.pageTitle).toHaveText(SHOPPING_PAGE_TEXTS.title);
        await expect(shoppingPage.emptyPageDescription).toBeVisible();
        await expect(shoppingPage.emptyPageDescription).toHaveText(SHOPPING_PAGE_TEXTS.emptyPage);
        await expect(shoppingPage.explainerSection).toBeVisible();
        await expect(shoppingPage.explainerSection).toHaveText(SHOPPING_PAGE_TEXTS.startExplainer);

        //  TODO - move to flow verifications
        // await expect(shoppingPage.addItemSection).toBeVisible();
        // await expect(shoppingPage.addItemSection.locator(`summary`)).toHaveText(SHOPPING_PAGE_TEXTS.addItem);
        // await expect(shoppingPage.shoppingGroups).toBeVisible();
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
        await expect(tripsPage.emptyPageDescription).toBeVisible();
        await expect(tripsPage.emptyPageDescription).toHaveText(TRIPS_PAGE_TEXTS.emptyPage + TRIPS_PAGE_TEXTS.startExplainer);


        //  TODO - move to flow verifications
        // await expect(tripsPage.mainTripsGroup).toBeVisible();
        // const listItems = await tripsPage.mainTripsGroup.getByTitle(`Trips section`).count();
        // expect(listItems).toBe(2);
        // await expect(tripsPage.plannedSection).toBeVisible();
        // await expect(tripsPage.plannedSection.locator(tripsPage.sectionTitle)).toHaveText(TRIPS_PAGE_TEXTS.planedSectionTitle);
        // await expect(tripsPage.doneSection).toBeVisible();
        // await expect(tripsPage.doneSection.locator(tripsPage.sectionTitle)).toHaveText(TRIPS_PAGE_TEXTS.doneSectionTitle);
    })

    test(`Products page is displayed - Active`, async ({productsPage}) => {

        //  Arrange & Act
        await productsPage.goToPage();

        //  Assert
        //  Active list
        await expect(productsPage.pageTitle).toHaveText(PRODUCTS_PAGE_TEXTS.title);
        await expect(productsPage.newProductBtn).toBeVisible();
        await expect(productsPage.newProductBtn).toHaveText(PRODUCTS_PAGE_TEXTS.newProductBtn);
        await expect(productsPage.productStatsListSwitch).toBeVisible();
        await expect(productsPage.productStatsListSwitch.getByText(PRODUCTS_PAGE_TEXTS.switchActive)).toBeVisible();
        await expect(productsPage.productStatsListSwitch.getByText(PRODUCTS_PAGE_TEXTS.switchActive)).toHaveAttribute(`style`, ACTIVATION_VALS.regBtnActive);
        await expect(productsPage.productStatsListSwitch.getByText(PRODUCTS_PAGE_TEXTS.switchArchived)).toBeVisible();
        await expect(productsPage.productStatsListSwitch.getByText(PRODUCTS_PAGE_TEXTS.switchArchived)).toHaveAttribute(`style`, ACTIVATION_VALS.regBtnInactive);
        await expect(productsPage.mainSearchField).toBeVisible();
        await expect(productsPage.emptyPageDescription).toBeVisible();
        await expect(productsPage.emptyPageDescription).toHaveText(PRODUCTS_PAGE_TEXTS.emptyPageActive);
    })

    test(`Products page is displayed - Archived`, async ({productsPage}) => {

        //  Arrange
        await productsPage.goToPage();
        //  Act
        await productsPage.productStatsListSwitch.getByText(PRODUCTS_PAGE_TEXTS.switchArchived).click();

        //  Assert
        //  Archived list
        await expect(productsPage.productStatsListSwitch.getByText(PRODUCTS_PAGE_TEXTS.switchActive)).toBeVisible();
        await expect(productsPage.productStatsListSwitch.getByText(PRODUCTS_PAGE_TEXTS.switchActive)).toHaveAttribute(`style`, ACTIVATION_VALS.regBtnInactive);
        await expect(productsPage.productStatsListSwitch.getByText(PRODUCTS_PAGE_TEXTS.switchArchived)).toBeVisible();
        await expect(productsPage.productStatsListSwitch.getByText(PRODUCTS_PAGE_TEXTS.switchArchived)).toHaveAttribute(`style`, ACTIVATION_VALS.regBtnActive);
        await expect(productsPage.emptyPageDescription).toBeVisible();
        await expect(productsPage.emptyPageDescription).toHaveText(PRODUCTS_PAGE_TEXTS.emptyPageArchived);
    })
})

test.describe(`Subpages display`, {tag: `@smoke`}, async () => {

    test(`Add box subpage display - empty DB`, async ({stockPage, addBoxSubpage}) => {

        // Arrange
        await stockPage.goToPage();

        // Act
        await stockPage.clickAddBox();

        // Assert
        await expect(addBoxSubpage.pageTitle).toHaveText(ADD_BOX_TEXTS.title);
        await expect(addBoxSubpage.cancelBtn).toBeVisible();
        await expect(addBoxSubpage.emptyPageDescription).toHaveText(ADD_BOX_TEXTS.emptyPage + ADD_BOX_TEXTS.startExplainer);

    })
    test(`Household subpage display - Active - empty DB`, async ({dosesPage, householdSubpage}) => {

        // Arrange
        await dosesPage.goToPage();

        // Act
        await dosesPage.clickManagePeopleBtn();

        // Assert
        await expect(householdSubpage.pageTitle).toHaveText(HOUSEHOLD_TEXTS.title);
        await expect(householdSubpage.newPersonBtn).toBeVisible();
        await expect(householdSubpage.emptyPageDescription).toHaveText(HOUSEHOLD_TEXTS.emptyPageActive);
        await expect(householdSubpage.householdListSwitch.getByText(HOUSEHOLD_TEXTS.switchActive)).toHaveAttribute(`style`, ACTIVATION_VALS.regBtnActive);
        await expect(householdSubpage.householdListSwitch.getByText(HOUSEHOLD_TEXTS.switchArchived)).toBeVisible();
        await expect(householdSubpage.householdListSwitch.getByText(HOUSEHOLD_TEXTS.switchArchived)).toHaveAttribute(`style`, ACTIVATION_VALS.regBtnInactive);
    })

    test(`Household subpage display - Archived - empty DB`, async ({dosesPage, householdSubpage}) => {

        // Arrange
        await dosesPage.goToPage();

        // Act
        await dosesPage.clickManagePeopleBtn();
        await householdSubpage.householdListSwitch.getByText(HOUSEHOLD_TEXTS.switchArchived).click();

        // Assert
        await expect(householdSubpage.emptyPageDescription).toHaveText(HOUSEHOLD_TEXTS.emptyPageArchived);
        await expect(householdSubpage.householdListSwitch.getByText(HOUSEHOLD_TEXTS.switchArchived)).toHaveAttribute(`style`, ACTIVATION_VALS.regBtnActive);
        await expect(householdSubpage.householdListSwitch.getByText(HOUSEHOLD_TEXTS.switchActive)).toBeVisible();
        await expect(householdSubpage.householdListSwitch.getByText(HOUSEHOLD_TEXTS.switchActive)).toHaveAttribute(`style`, ACTIVATION_VALS.regBtnInactive);
    })

    test(`New Person subpage display - empty DB`, async ({newPersonSubpage}) => {

        // Arrange & Act
        await newPersonSubpage.goToPage();

        // Assert
        await expect(newPersonSubpage.pageTitle).toHaveText(NEW_PERSON_TEXTS.title);
        await expect(newPersonSubpage.cancelBtn).toBeVisible();
        await expect(newPersonSubpage.addPersonBtn).toBeVisible();
        await expect(newPersonSubpage.nameField).toBeVisible();
        await expect(newPersonSubpage.notesField).toBeVisible();
        await expect(newPersonSubpage.notesDescription).toBeVisible();
    })

    test(`New Trip subpage display - basic elements and default restock trip option 
        - empty DB`, async ({newTripSubpage, shared}) => {

        // Arrange & Act
        await newTripSubpage.goToPage();

        // Assert
        await expect(newTripSubpage.pageTitle).toHaveText(NEW_TRIP_TEXTS.title);
        await expect(newTripSubpage.cancelBtn).toBeVisible();
        await expect(newTripSubpage.addTripBtn).toBeVisible();
        await expect(newTripSubpage.nameField).toBeVisible();
        await shared.assertFieldDescription(NEW_TRIP_TEXTS.nameFieldLabel, NEW_TRIP_TEXTS.nameFieldDescription);

        //  Default trip type: Restock
        await expect(newTripSubpage.tripTypeField).toBeVisible();
        await expect(newTripSubpage.tripTypeField).toHaveValue(TRIP_TYPE_SELECTOR_VALUES.restockOption);
        await shared.assertFieldDescription(NEW_TRIP_TEXTS.tripTypeSelectorLabel, NEW_TRIP_TEXTS.tripTypeSelectorDescription);
        await expect(newTripSubpage.collectionDateField).toBeVisible();
        await shared.assertFieldDescription(NEW_TRIP_TEXTS.collectionDateLabel, NEW_TRIP_TEXTS.collectionDateDescription);
        await expect(newTripSubpage.orderByDateField).toBeVisible();
        await shared.assertFieldDescription(NEW_TRIP_TEXTS.orderDeadlineFieldLabel, NEW_TRIP_TEXTS.orderDeadlineDescription);
        await expect(newTripSubpage.notesField).toBeVisible();
    })

    test(`New Trip subpage display - ordinary travel trip option - empty DB`, async ({newTripSubpage, shared}) => {

        // Arrange & Act
        await newTripSubpage.goToPage();
        await newTripSubpage.tripTypeField.selectOption(TRIP_TYPE_SELECTOR_VALUES.ordinaryTravelOption)

        // Assert - trip type: Ordinary Travel
        await expect(newTripSubpage.tripTypeField).toBeVisible();
        await expect(newTripSubpage.tripTypeField).toHaveValue(TRIP_TYPE_SELECTOR_VALUES.ordinaryTravelOption);
        await expect(newTripSubpage.leavingDateField).toBeVisible();
        await shared.assertFieldDescription(NEW_TRIP_TEXTS.leavingDateLabel, NEW_TRIP_TEXTS.leavingDateDescription);
        await expect(newTripSubpage.returnDateField).toBeVisible();
        await shared.assertFieldDescription(NEW_TRIP_TEXTS.returnDateLabel, NEW_TRIP_TEXTS.returnDateDescription);
    })

    test(`New product subpage display - empty DB`, async ({newProductSubpage, shared}) => {

        // Arrange & Act
        await newProductSubpage.goToPage();
        await newTripSubpage.tripTypeField.selectOption(TRIP_TYPE_SELECTOR_VALUES.ordinaryTravelOption)

        // Assert - trip type: Ordinary Travel
        await expect(newTripSubpage.tripTypeField).toBeVisible();
        await expect(newTripSubpage.tripTypeField).toHaveValue(TRIP_TYPE_SELECTOR_VALUES.ordinaryTravelOption);
        await expect(newTripSubpage.leavingDateField).toBeVisible();
        await shared.assertFieldDescription(NEW_TRIP_TEXTS.leavingDateLabel, NEW_TRIP_TEXTS.leavingDateDescription);
        await expect(newTripSubpage.returnDateField).toBeVisible();
        await shared.assertFieldDescription(NEW_TRIP_TEXTS.returnDateLabel, NEW_TRIP_TEXTS.returnDateDescription);
    })

})