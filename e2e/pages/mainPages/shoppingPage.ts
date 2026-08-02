import {Page, Locator} from "@playwright/test"

export const SHOPPING_PAGE_TEXTS = {
    title: `Shopping`
} as const;


export class ShoppingPage {
    readonly page: Page;
    readonly pageTitle: Locator;
    readonly shoppingGroup: Locator;

    constructor(page: Page) {
        this.page = page;
        this.pageTitle = page.getByTestId(`shopping-title`);
        this.shoppingGroup = page.getByTestId(`main-shopping-groups`);

    }

    async goToPage() {
        await this.page.goto(`/shopping`);
    }
}