import {Page, Locator} from "@playwright/test"

export const STOCK_PAGE_TEXTS = {
    title: `Stock`,
    newBoxBtn: `Add box`,
    auditBtn: `Audit`,
    emptyPage: `Nothing in stock yet.`,
    searchPlaceholder: `Name, brand, substance or symptom…`,
    newProdUrl: `/products/new`,
    startExplainer: `Start by adding a product, then add the boxes you actually have.`,
} as const;


export class StockPage {
    readonly page: Page;
    readonly pageTitle: Locator;
    readonly newBoxBtn: Locator;
    readonly auditBtn: Locator;
    readonly mainSearchField: Locator;
    readonly stockList: Locator;
    readonly stockListItem: Locator;
    readonly emptyPageDescription: Locator;

    constructor(page: Page) {
        this.page = page;
        this.pageTitle = page.getByTestId(`stock-title`);
        this.newBoxBtn = page.getByTestId(`add-box-btn`);
        this.auditBtn = page.getByTestId(`audit-btn`);
        this.mainSearchField = page.getByPlaceholder(STOCK_PAGE_TEXTS.searchPlaceholder);
        this.stockList = page.getByTestId(`main-box-list`);
        this.stockListItem = page.getByTestId(`main-box-list-item`);
        this.emptyPageDescription = page.getByTestId(`empty-page-description`);
    }

    async goToPage() {
        await this.page.goto(`/`);
    }
}