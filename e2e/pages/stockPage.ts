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

    constructor(page: Page){
        this.page = page;
        this.pageTitle = page.locator(`[test-data="stock-title"]`);
        this.addNewBoxBtn = page.locator(`[test-data="add-box-btn"]`);
        this.mainSearchField =  page.getByPlaceholder(`Name, brand, `, {exact: false});
        this.stockList = page.locator(`[test-data="main-box-list"]`);

    }

}