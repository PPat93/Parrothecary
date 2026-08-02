import {test as base} from '@playwright/test';
import {LoginPage} from '../pages/loginPage';
import {StockPage} from '../pages/stockPage';
import {Shared} from "../shared/shared";

type MainFixtures = {
    loginPage: LoginPage;
    stockPage: StockPage;
    shared: Shared;
}

export const test = base.extend<MainFixtures>({
    loginPage: async ({page}, use) => {
        await use(new LoginPage(page));
    },

    stockPage: async ({page}, use) => {
        await use(new StockPage(page));
    },

    shared: async ({page}, use) => {
        await use(new Shared(page));
    }
})
export {expect} from '@playwright/test';