import {Locator, Page} from "@playwright/test";

export const STATISTICS_PAGE_TEXTS = {
    title: 'Statistics',
    moneyTab: `Money`,
    usageTab: `Usage`,

    exportSection: `Export`,
    boxesCsvLink: `Boxes.csv`,
    boxesCsvDescription: `Every box ever entered, including used up and binned — quantities, expiry, lot, price.`,
    stockMovementsCsvLink: `Stock Movements.csv`,
    stockMovementsCsvDescription: `The whole ledger. The only one of these that cannot be reconstructed by looking in the cupboard.`,
    productsCsvLink: `Products.csv`,
    productsCsvDescription: `The catalogue: ingredients, symptom tags, barcodes, pack sizes. The part that took an evening to type.`,

    backupSection: `Backup`,
    downloadBackupZipLink: `Download a backup.zip`,
    downloadBackupZipDescription: `The whole cupboard and every box photograph, in one file, with a note inside on how to put it back. Worth doing before a trip, or after an evening of typing.`,

    lastThirtyDaysStats: `30 days`,
    lastNinetyDaysStats: `90 days`,
    lastYearStats: `12 months`,
    allTimeUsageStats: `All time`,

    pageUrl: `/stats/usage`
} as const;

export class StatisticsPage {

    readonly page: Page;
    readonly title: Locator;

    readonly tabSwitcher: Locator;
    readonly moneyTab: Locator;
    readonly exportSection: Locator;
    readonly boxesCsvLink: Locator;
    readonly stockMovementsCsvLink: Locator;
    readonly productsCsvLink: Locator;
    readonly backupSection: Locator;
    readonly downloadBackupZipLink: Locator;

    readonly usageTab: Locator;
    readonly lastThirtyDaysStats: Locator;
    readonly lastNinetyDaysStats: Locator;
    readonly lastYearStats: Locator;
    readonly allTimeUsageStats: Locator;

    constructor(page: Page) {
        this.page = page;
        this.title = page.getByTestId(`stats-title`);

        this.tabSwitcher = page.getByTestId(`stats-tabs`);
        this.moneyTab = page.getByRole(`link`, {name: STATISTICS_PAGE_TEXTS.moneyTab});
        this.exportSection = page.getByTestId(`stats-export`);
        this.boxesCsvLink = page.getByRole(`link`, {name: STATISTICS_PAGE_TEXTS.boxesCsvLink});
        this.stockMovementsCsvLink = page.getByRole(`link`, {name: STATISTICS_PAGE_TEXTS.stockMovementsCsvLink});
        this.productsCsvLink = page.getByRole(`link`, {name: STATISTICS_PAGE_TEXTS.productsCsvLink});
        this.backupSection = page.getByTestId(`stats-backup`);
        this.downloadBackupZipLink = page.getByRole(`link`, {name: STATISTICS_PAGE_TEXTS.downloadBackupZipLink});

        this.usageTab = page.getByRole(`link`, {name: STATISTICS_PAGE_TEXTS.usageTab});
        this.lastThirtyDaysStats = page.getByRole(`link`, {name: STATISTICS_PAGE_TEXTS.lastThirtyDaysStats});
        this.lastNinetyDaysStats = page.getByRole(`link`, {name: STATISTICS_PAGE_TEXTS.lastNinetyDaysStats});
        this.lastYearStats = page.getByRole(`link`, {name: STATISTICS_PAGE_TEXTS.lastYearStats});
        this.allTimeUsageStats = page.getByRole(`link`, {name: STATISTICS_PAGE_TEXTS.allTimeUsageStats});
    }

    async goToPage() {
        await this.page.goto(STATISTICS_PAGE_TEXTS.pageUrl);
    }
}