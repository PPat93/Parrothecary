import {Page, Locator} from "@playwright/test"

export const PRODUCTS_PAGE_TEXTS = {
    title: `Products`,
    newProductBtn: `New product`,
    switchActive: `Active`,
    switchArchived: `Archived`
} as const;


export class ProductsPage {
    readonly page: Page;
    readonly pageTitle: Locator;
    readonly newProductBtn: Locator;
    readonly productStatsListSwitch: Locator;
    readonly mainSearchField: Locator;
    readonly productsList: Locator;
    readonly productsListItem: Locator;

    constructor(page: Page) {
        this.page = page;
        this.pageTitle = page.getByTestId(`products-title`);
        this.newProductBtn = page.getByTestId(`add-product-btn`);
        this.productStatsListSwitch = page.getByTestId(`product-status-list-switch`);
        this.mainSearchField = page.getByPlaceholder(`Name, brand, substance or symptom…`);
        this.productsList = page.getByTestId(`main-products-list`);
        this.productsListItem = page.getByTestId(`main-products-list-item`);
    }

    async goToPage() {
        await this.page.goto(`/products`);
    }
}