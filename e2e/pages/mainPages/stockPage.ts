import {Page, Locator} from "@playwright/test"

export const STOCK_PAGE_TEXTS = {
    title: `Stock`
} as const;


export class StockPage {
    readonly page: Page;
    readonly pageTitle: Locator;
    readonly addNewBoxBtn: Locator;
    readonly mainSearchField: Locator;
    readonly stockList: Locator;

    constructor(page: Page) {
        this.page = page;
        this.pageTitle = page.getByTestId(`stock-title`);
        this.addNewBoxBtn = page.getByTestId(`add-box-btn`);
        this.mainSearchField = page.getByPlaceholder(`Name, brand, substance or symptom…`);
        this.stockList = page.getByTestId(`main-box-list`);
    }

    async goToPage() {
        await this.page.goto(`/`);
    }
}