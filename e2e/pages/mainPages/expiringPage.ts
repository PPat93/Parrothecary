import {Page, Locator} from "@playwright/test"

export const EXPIRING_PAGE_TEXTS = {
    title: `Expiring`
} as const;


export class ExpiringPage {
    readonly page: Page;
    readonly pageTitle: Locator;
    readonly expiringGroup: Locator;
    readonly binnedSection: Locator;

    constructor(page: Page) {
        this.page = page;
        this.pageTitle = page.getByTestId(`expiring-title`);
        this.expiringGroup = page.getByTestId(`main-expiring-groups`);
        this.binnedSection = page.getByTestId(`binned-summary`);

    }

    async goToPage() {
        await this.page.goto(`/expiring`);
    }
}