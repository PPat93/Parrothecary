import {Page, Locator} from '@playwright/test'

export const loginPageTexts = {
    SUBMIT_BTN_TXT: `Unlock`
}


export class LoginPage {
    readonly page: Page;
    readonly logo: Locator;
    readonly pageTitle: Locator;
    readonly pageSubTitle: Locator;
    readonly passwordField: Locator;
    readonly submitBtn: Locator;


    constructor(page: Page) {
        this.page = page;
        this.logo = page.locator(`[src="/parrot-256.png"]`);
        this.pageTitle = page.locator(`[test-data="title"]`);
        this.pageSubTitle = page.locator(`[test-data="sub-title"]`);
        this.passwordField = page.locator(`#password`);
        this.submitBtn = page.locator(`[test-data="submit-btn"]`);

    }

}

