import {Page, Locator} from "@playwright/test"

export const TRIPS_PAGE_TEXTS = {
    title: `Trips`,
    description: `Two or three restocks a year. What matters is the order deadline, not the flight — most of
        it is bought online and shipped ahead, to be collected on arrival.`,
    newTripBtn: `New trip`,
    planedSectionTitle: `Planned`,
    doneSectionTitle: `Done`
} as const;


export class TripsPage {
    readonly page: Page;
    readonly pageTitle: Locator;
    readonly pageDesc: Locator;
    readonly newTripBtn: Locator;
    readonly mainTripsGroup: Locator;
    readonly plannedSection: Locator;
    readonly doneSection: Locator;
    readonly sectionTitle: Locator;

    constructor(page: Page) {
        this.page = page;
        this.pageTitle = page.getByTestId(`trips-title`);
        this.pageDesc = page.getByTestId(`trips-description`);
        this.newTripBtn = page.getByTestId(`new-trip-btn`);
        this.mainTripsGroup = page.getByTestId(`main-trips-groups`);
        this.plannedSection = page.getByTestId(`planned-section`);
        this.doneSection = page.getByTestId(`done-section`);
        this.sectionTitle = page.getByTestId(`trips-section-title`);

    }

    async goToPage() {
        await this.page.goto(`/trips`);
    }
}