import {Page, Locator} from "@playwright/test"

export const SHOPPING_PAGE_TEXTS = {
    title: `Shopping`,
    addItem: `Add an item`,
    emptyPage: `Nothing on the list.`,
    startExplainer: `Add a product with a pack size before building a list.`,
    toBuyTitle: `To buy`,
    toBuyDesc: `Not ordered yet.`,
    orderedTitle: `Ordered`,
    orderedDesc: `Placed online, on its way.`,
    arrivedTitle: `Arrived`,
    arrivedDesc: `Waiting at family — collect on the trip.`,
    inCupboardTitle: `In the cupboard`,
    inCupboardDesc: `Added to stock. Clear the line when you no longer need it.`
} as const;


export class ShoppingPage {
    readonly page: Page;
    readonly pageTitle: Locator;
    readonly emptyPageDescription: Locator;
    readonly explainerSection: Locator;
    readonly addItemSection: Locator;
    readonly toBuySection: Locator;
    readonly orderedSection: Locator;
    readonly arrivedSection: Locator;
    readonly inCupboardSection: Locator;
    readonly sectionTitle: Locator;
    readonly sectionDesc: Locator;
    readonly shoppingGroups: Locator;

    constructor(page: Page) {
        this.page = page;
        this.pageTitle = page.getByTestId(`shopping-title`);
        this.emptyPageDescription = page.getByTestId(`empty-page-description`);
        this.explainerSection = page.getByTestId(`explainer-section`);
        this.addItemSection = page.getByTestId(`add-shopping-item`);
        this.toBuySection = page.getByTestId(`tobuy`);
        this.orderedSection = page.getByTestId(`ordered`);
        this.arrivedSection = page.getByTestId(`arrived`);
        this.inCupboardSection = page.getByTestId(`inthecupboard`);
        this.sectionTitle = page.getByTestId(`section-title`);
        this.sectionDesc = page.getByTestId(`section-description`);
        this.shoppingGroups = page.getByTestId(`main-shopping-groups`);

    }

    async goToPage() {
        await this.page.goto(`/shopping`);
    }
}