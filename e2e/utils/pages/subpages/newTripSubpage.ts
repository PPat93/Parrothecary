import {Locator, Page} from "@playwright/test";

export const NEW_TRIP_TEXTS = {
    title: `New trip`,
    cancelBtn: `Cancel`,
    addTripBtn: `Add trip`,
    nameFieldLabel: `Name`,
    nameFieldDescription: `Whatever you call it — “October 2026” is enough.`,
    tripTypeSelectorLabel: `What kind`,
    tripTypeSelectorDescription: `A restock brings stock in. Ordinary travel takes a kit out and mostly brings it back.`,
    collectionDateLabel: `Collection date`,
    collectionDateDescription: `When it all gets picked up.`,
    orderDeadlineFieldLabel: `Order by`,
    orderDeadlineDescription: `Leave blank to use the midpoint since the last trip — the same date the cabinet audit falls on.`,
    notesFieldLabel: `Notes`,
    newTripUrl: `/trips/new`,
}

export class NewTripSubpage {
    readonly page: Page;
    readonly pageTitle: Locator;
    readonly nameField: Locator;
    readonly tripTypeField: Locator;
    readonly collectionDateField: Locator;
    readonly orderByDateField: Locator;
    readonly notesField: Locator;
    readonly cancelBtn: Locator;
    readonly addTripBtn: Locator;

    constructor(page: Page) {
        this.page = page;
        this.pageTitle = page.getByTestId(`new-trip-title`);
        this.nameField = page.getByLabel(NEW_TRIP_TEXTS.nameFieldLabel);
        this.tripTypeField = page.getByLabel(NEW_TRIP_TEXTS.tripTypeSelectorLabel);
        this.collectionDateField = page.getByLabel(NEW_TRIP_TEXTS.collectionDateLabel);
        this.orderByDateField = page.getByLabel(NEW_TRIP_TEXTS.orderDeadlineFieldLabel);
        this.notesField = page.getByLabel(NEW_TRIP_TEXTS.notesFieldLabel);
        this.cancelBtn = page.getByRole(`link`, {name: NEW_TRIP_TEXTS.cancelBtn});
        this.addTripBtn = page.getByRole(`button`, {name: NEW_TRIP_TEXTS.addTripBtn})
    }

    async goToPage() {
        await this.page.goto(NEW_TRIP_TEXTS.newTripUrl);
    }

    async clickCancelBtn() {
        await this.cancelBtn.click();
    }

    async clickAddTripBtn() {
        await this.addTripBtn.click();
    }
}

