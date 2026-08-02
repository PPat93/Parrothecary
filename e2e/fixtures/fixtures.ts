import {test as base} from '@playwright/test';
import {LoginPage} from '../pages/mainPages/loginPage';
import {StockPage} from '../pages/mainPages/stockPage';
import {Shared} from "../shared/shared";
import {DosesPage} from "../pages/mainPages/dosesPage";
import {ExpiringPage} from "../pages/mainPages/expiringPage";
import {ShoppingPage} from "../pages/mainPages/shoppingPage";
import {TripsPage} from "../pages/mainPages/tripsPage";

type MainFixtures = {
    loginPage: LoginPage;
    stockPage: StockPage;
    dosesPage: DosesPage;
    expiringPage: ExpiringPage;
    shoppingPage: ShoppingPage;
    tripsPage: TripsPage;
    shared: Shared;
}

export const test = base.extend<MainFixtures>({
    loginPage: async ({page}, use) => {
        await use(new LoginPage(page));
    },

    stockPage: async ({page}, use) => {
        await use(new StockPage(page));
    },

    dosesPage: async ({page}, use) => {
        await use(new DosesPage(page));
    },

    expiringPage: async ({page}, use) => {
        await use(new ExpiringPage(page));
    },

    shoppingPage: async ({page}, use) => {
        await use(new ShoppingPage(page));
    },

    tripsPage: async ({page}, use) => {
        await use(new TripsPage(page));
    },

    shared: async ({page}, use) => {
        await use(new Shared(page));
    }
})
export {expect} from '@playwright/test';