import {Page, Locator} from "@playwright/test"

export const TRIPS_PAGE_TEXTS = {
    title: `Trips`
} as const;


export class TripsPage {
    readonly page: Page;
    readonly pageTitle: Locator;
    readonly newTripBtn: Locator;
    readonly mainTripsGroup: Locator;

    constructor(page: Page) {
        this.page = page;
        this.pageTitle = page.getByTestId(`trips-title`);
        this.newTripBtn = page.getByTestId(`new-trip-btn`);
        this.mainTripsGroup = page.getByTestId(`main-trips-groups`);

    }

    async goToPage() {
        await this.page.goto(`/trips`);
    }
}