import {Page, Locator} from "@playwright/test"

export const DOSES_PAGE_TEXTS = {
    title: `Doses`
} as const;


export class DosesPage {
    readonly page: Page;
    readonly pageTitle: Locator;
    readonly managePeopleBtn: Locator;
    readonly dosesList: Locator;

    constructor(page: Page) {
        this.page = page;
        this.pageTitle = page.getByTestId(`doses-title`);
        this.managePeopleBtn = page.getByTestId(`manage-people-btn`);
        this.dosesList = page.getByTestId(`main-doses-list`);
    }

    async goToPage() {
        await this.page.goto(`/doses`);
    }
}