import {test as base} from '@playwright/test';
import {LoginPage} from '../pages/loginPage';
import {StockPage} from '../pages/stockPage';

type MainFixtures = {
    loginPage: LoginPage;
    stockPage: StockPage;
}

export const test = base.extend<MainFixtures>({
    loginPage: async ({page}, use) => {
        await use(new LoginPage(page));
    },

    stockPage: async ({page}, use) => {
        await use(new StockPage(page));
    }
})
export {expect} from '@playwright/test';