import {Locator, Page} from "@playwright/test";

export const ADD_BOX_TEXTS = {
    title: `Add box`,
    cancelBtn: `Cancel`,
    emptyPage: `No packs defined yet.`,
    startExplainer: `Add a product with a pack size first — a box has to be a box of something.`,
    pageUrl: `/stock/new`
}

export class AddBoxSubpage {
    readonly page: Page;
    readonly pageTitle: Locator;
    readonly cancelBtn: Locator;
    readonly emptyPageDescription: Locator;

    constructor(page: Page) {
        this.page = page;
        this.pageTitle = page.getByTestId(`add-box-title`);
        this.cancelBtn = page.getByRole(`link`, {name: ADD_BOX_TEXTS.cancelBtn});
        this.emptyPageDescription = page.getByTestId(`empty-page-description`);
    }
}