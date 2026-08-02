import {test as base} from '@playwright/test';
import {LoginPage} from '../pages/mainPages/loginPage';
import {StockPage} from '../pages/mainPages/stockPage';
import {Shared} from "../shared/shared";
import {DosesPage} from "../pages/mainPages/dosesPage";
import {ExpiringPage} from "../pages/mainPages/expiringPage";

type MainFixtures = {
    loginPage: LoginPage;
    stockPage: StockPage;
    dosesPage: DosesPage;
    expiringPage: ExpiringPage;
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

    shared: async ({page}, use) => {
        await use(new Shared(page));
    }
})
export {expect} from '@playwright/test';