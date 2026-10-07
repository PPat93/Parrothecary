import {Locator, Page} from "@playwright/test";

export const HOUSEHOLD_TEXTS = {
    title: `Household`,
    newPersonBtn: `New person`,
    emptyPageActive: `Add whoever takes something regularly.`,
    emptyPageArchived: `Nothing archived.`,
    switchActive: `Active`,
    switchArchived: `Archived`,
    pageUrl: `/household`
} as const;


export class HouseholdSubpage {
    readonly page: Page;
    readonly pageTitle: Locator;
    readonly newPersonBtn: Locator;
    readonly emptyPageDescription: Locator;
    readonly householdListSwitch: Locator

    constructor(page: Page) {
        this.page = page;
        this.pageTitle = page.getByTestId(`household-title`);
        this.newPersonBtn = page.getByRole(`link`, {name: HOUSEHOLD_TEXTS.newPersonBtn});
        this.emptyPageDescription = page.getByTestId(`empty-page-description`);
        this.householdListSwitch = page.getByTestId(`household-list-switch`);
    }
}