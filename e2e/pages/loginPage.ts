import {Page, Locator} from '@playwright/test'

export const loginPageTexts = {
    SUBMIT_BTN_TXT: `Unlock`
} as const;

export class LoginPage {
    readonly page: Page;
    readonly logo: Locator;
    readonly pageTitle: Locator;
    readonly pageSubTitle: Locator;
    readonly passwordField: Locator;
    readonly submitBtn: Locator;


    constructor(page: Page) {
        this.page = page;
        this.logo = page.locator(`[src="/icons/icon-512.png"]`);
        this.pageTitle = page.locator(`[test-data="title"]`);
        this.pageSubTitle = page.locator(`[test-data="sub-title"]`);
        this.passwordField = page.locator(`#password`);
        this.submitBtn = page.locator(`[test-data="submit-btn"]`);

    }

    async goToPage() {
        await this.page.goto(`/login`)
    }

    async userLogin(pass?: string) {
        if (!pass) pass = process.env.LOCAL_PASS
        await this.passwordField.fill(pass as string);
        await this.submitBtn.click();
    }
}

