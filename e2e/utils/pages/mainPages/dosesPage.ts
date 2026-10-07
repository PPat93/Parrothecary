import {Page, Locator} from "@playwright/test"
import {expect} from "playwright/test";
import {HOUSEHOLD_TEXTS} from "../subpages/householdSubpage";

export const DOSES_PAGE_TEXTS = {
    title: `Doses`,
    managePeopleBtn: `Manage people`,
    emptyPage: `Nothing scheduled.`,
    startExplainer: `Add someone under Household and give them a dose to track.`,

    pageUrl: `/doses`,
} as const;


export class DosesPage {
    readonly page: Page;
    readonly pageTitle: Locator;
    readonly emptyPageDescription: Locator;
    readonly managePeopleBtn: Locator;
    readonly dosesList: Locator;

    constructor(page: Page) {
        this.page = page;
        this.pageTitle = page.getByTestId(`doses-title`);
        this.emptyPageDescription = page.getByTestId(`empty-page-description`);
        this.managePeopleBtn = page.getByTestId(`manage-people-btn`);
        this.dosesList = page.getByTestId(`main-doses-list`);
    }

    async goToPage() {
        await this.page.goto(DOSES_PAGE_TEXTS.pageUrl);
    }

    async clickManagePeopleBtn() {
        await this.managePeopleBtn.click();
        await expect(this.page).toHaveURL(HOUSEHOLD_TEXTS.pageUrl);
    }
}