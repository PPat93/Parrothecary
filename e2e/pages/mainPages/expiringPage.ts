import {Page, Locator} from "@playwright/test"

export const EXPIRING_PAGE_TEXTS = {
    title: `Expiring`,
    expiredSubgroup: `Expired`,
    expiredSubgroupDesc: `Past its date and past what it tolerates — bin it and record the waste.`,
    stillInUseSubgroup: `Past date, still in use`,
    stillInUseSubgroupDesc: `Doses are still being taken from these. Bin one early whenever you would rather not use it.`,
    goingSoonSubgroup: `Going soon`,
    goingSoonSubgroupDesc: `Will not survive until the next restock trip.`,
    watchSubgroup: `Watch`,
    watchSubgroupDesc: `Use these before buying more..`,
    binnedSectionTitle: `Binned so far`,
    binnedSectionWasted: `Nothing has been binned unopened. That is the figure that would mean money wasted, and it is zero.`,
    binnedSectionNotWasted: `Not really waste: they were opened because they were needed, and you cannot buy half a bottle.`,
    binnedSectionNotWastedAlt: `never opened — bought and binned without being used. This is the number worth pushing down.`
} as const;


export class ExpiringPage {
    readonly page: Page;
    readonly pageTitle: Locator;
    readonly expiringGroup: Locator;
    readonly subgroupDesc: Locator;
    readonly subgroupTitle: Locator;
    readonly expiredSubgroup: Locator;
    readonly stillInUseSubgroup: Locator;
    readonly goingSoonSubgroup: Locator;
    readonly watchSubgroup: Locator;
    readonly binnedSection: Locator;
    readonly binnedSummaryTitle: Locator;
    readonly binnedSectionWasted: Locator;
    readonly binnedSectionNotWasted: Locator;

    constructor(page: Page) {
        this.page = page;
        this.pageTitle = page.getByTestId(`expiring-title`);
        this.expiringGroup = page.getByTestId(`main-expiring-groups`);
        this.subgroupDesc = page.getByTestId(`section-description`);
        this.subgroupTitle = page.getByTestId(`section-title`);
        this.expiredSubgroup = page.getByTestId(`expired`);
        this.stillInUseSubgroup = page.getByTestId(`pastdate,stillinuse`);
        this.goingSoonSubgroup = page.getByTestId(`goingsoon`);
        this.watchSubgroup = page.getByTestId(`watch`);
        this.binnedSection = page.getByTestId(`binned-summary`);
        this.binnedSummaryTitle = page.getByTestId(`binned-summary-title`);
        this.binnedSectionWasted = page.getByTestId(`money-wasted`);
        this.binnedSectionNotWasted = page.getByTestId(`not-wasted`);
    }

    async goToPage() {
        await this.page.goto(`/expiring`);
    }
}