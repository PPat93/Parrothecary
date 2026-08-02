import path from "path";
import {Locator, Page} from "@playwright/test";

export const TEXTS = {
    appName: `Parrothecary`,
    subtitle: `Domowa apteczka`
}

enum MenuOption {
    Stock = "stock",
    Doses = "doses",
    Expiring = "expiring",
    Shopping = "shopping",
    Trips = "trips",
    Products = "products"
}

export const GENERAL_AUTH_PATH = path.join(process.cwd(), `e2e/.auth/auth.json`);

export class Shared {

    //  Top bar
    readonly barLogo: Locator;
    readonly aboutBtn: Locator;
    readonly lockBtn: Locator;

    //  Menu
    readonly stockMenuBtn: Locator;
    readonly dosesMenuBtn: Locator;
    readonly expiringMenuBtn: Locator;
    readonly shoppingMenuBtn: Locator;
    readonly tripsMenuBtn: Locator;
    readonly productsMenuBtn: Locator;

    constructor(page: Page) {
        this.barLogo = page.getByAltText(`Mini parrot logo`);
        this.aboutBtn = page.getByTitle(`About Parrothecary`);
        this.lockBtn = page.getByTitle(`Lock Parrothecary`);

        this.stockMenuBtn = page.getByTestId(`menu-${MenuOption.Stock}`);
        this.dosesMenuBtn = page.getByTestId(`menu-${MenuOption.Doses}`);
        this.expiringMenuBtn = page.getByTestId(`menu-${MenuOption.Expiring}`);
        this.shoppingMenuBtn = page.getByTestId(`menu-${MenuOption.Shopping}`);
        this.tripsMenuBtn = page.getByTestId(`menu-${MenuOption.Trips}`);
        this.productsMenuBtn = page.getByTestId(`menu-${MenuOption.Products}`);
    }

    async clickStockMenuBtn(salesMenuBtn: MenuOption, page: Page): Promise<void> {
        await page.getByTestId(`menu-${salesMenuBtn}`).click();
    }

    async logout() {
        await this.lockBtn.click();
    }

    async clickAboutPage() {
        await this.aboutBtn.click();
    }
}