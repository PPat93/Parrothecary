import {Page, Locator} from "@playwright/test"

export const STOCK_PAGE_TEXTS = {
    title: `Stock`,
    newBoxBtn: `Add box`
} as const;


export class StockPage {
    readonly page: Page;
    readonly pageTitle: Locator;
    readonly newBoxBtn: Locator;
    readonly mainSearchField: Locator;
    readonly stockList: Locator;
    readonly stockListItem: Locator;

    constructor(page: Page) {
        this.page = page;
        this.pageTitle = page.getByTestId(`stock-title`);
        this.newBoxBtn = page.getByTestId(`add-box-btn`);
        this.mainSearchField = page.getByPlaceholder(`Name, brand, substance or symptom…`);
        this.stockList = page.getByTestId(`main-box-list`);
        this.stockListItem = page.getByTestId(`main-box-list-item`);
    }

    async goToPage() {
        await this.page.goto(`/`);
    }
}